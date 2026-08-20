import { request as httpRequest, type IncomingMessage } from 'node:http';
import type { Readable } from 'node:stream';

/**
 * The seam between the loop and the Docker daemon (task 154).
 *
 * **Two endpoints, one transport, and the distinction is deliberate.** The endpoint genuinely
 * differs by platform — a Windows named pipe (`\\.\pipe\docker_engine`) on the customer's machine,
 * a Unix socket (`/var/run/docker.sock`) on Linux and on CI — and that difference is what
 * `resolveEndpoint` decides, from `process.platform` with an override per platform in `.env`.
 *
 * The transport does *not* differ, because Node's HTTP client speaks both through the same
 * `socketPath` option: a named pipe and a Unix socket are both local byte streams to it, and this
 * was measured against the live Docker Desktop pipe rather than assumed. Writing two classes with
 * identical bodies to match the phrase "two transport implementations" would be two places to fix a
 * header bug instead of one. What must be — and is — covered separately is the **selection**: the
 * named-pipe branch is chosen by a unit test on this machine's own platform value, and the live
 * pipe is exercised at the gate.
 *
 * TCP is not reachable from here at all, by construction (бандл A0 §Security: `localhost:2375` is
 * forbidden). There is no host/port option to pass.
 */

/** The Engine API version the loop pins. Present on every path so a daemon upgrade cannot reshape a reply. */
export const ENGINE_API_VERSION = 'v1.44';

export type EndpointKind = 'npipe' | 'unix';

export interface EngineEndpoint {
  kind: EndpointKind;
  /** What goes into `socketPath`. */
  socketPath: string;
  /** How the endpoint is written in logs and errors — the form an operator recognises. */
  display: string;
}

export const DEFAULT_WINDOWS_PIPE = String.raw`\\.\pipe\docker_engine`;
export const DEFAULT_UNIX_SOCKET = '/var/run/docker.sock';

export interface EndpointOverrides {
  DOCKER_ENGINE_PIPE?: string | undefined;
  DOCKER_ENGINE_SOCKET?: string | undefined;
}

/**
 * Which endpoint this host's daemon is behind.
 *
 * The platform is a parameter rather than a read of `process.platform`, so both branches are
 * reachable from a test on either operating system — the named-pipe branch has to be provable on
 * CI, where no named pipe exists.
 */
export function resolveEndpoint(
  platform: NodeJS.Platform,
  overrides: EndpointOverrides = {},
): EngineEndpoint {
  if (platform === 'win32') {
    const socketPath = overrides.DOCKER_ENGINE_PIPE ?? DEFAULT_WINDOWS_PIPE;
    return { kind: 'npipe', socketPath, display: `npipe://${socketPath}` };
  }

  const socketPath = overrides.DOCKER_ENGINE_SOCKET ?? DEFAULT_UNIX_SOCKET;
  return { kind: 'unix', socketPath, display: `unix://${socketPath}` };
}

export interface EngineRequest {
  method: 'GET' | 'POST' | 'DELETE';
  /** Path below the version prefix, e.g. `/containers/create`. */
  path: string;
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  /** A raw payload with its own content type — the tar of a build context (task 155). */
  rawBody?: { bytes: Buffer; contentType: string };
  /** Bounds one call. A daemon that stops answering must not stall the orchestrator. */
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface EngineResponse {
  status: number;
  body: string;
}

/** The daemon answered, and it answered with a refusal. Carries what it said. */
export class EngineError extends Error {
  readonly status: number;
  readonly responseBody: string;

  constructor(request: EngineRequest, status: number, responseBody: string) {
    super(`docker ${request.method} ${request.path} → ${String(status)}: ${responseBody.trim()}`);
    this.name = 'EngineError';
    this.status = status;
    this.responseBody = responseBody;
  }
}

/** The daemon could not be reached at all — not running, wrong endpoint, no permission. */
export class EngineUnreachableError extends Error {
  readonly endpoint: EngineEndpoint;

  constructor(endpoint: EngineEndpoint, cause: unknown) {
    super(
      `Docker не отвечает на ${endpoint.display}. ` +
        'Проверьте, что Docker Desktop запущен (Windows) или что демон слушает сокет (Linux/CI). ' +
        `Причина: ${String(cause)}`,
    );
    this.name = 'EngineUnreachableError';
    this.endpoint = endpoint;
    this.cause = cause;
  }
}

const DEFAULT_TIMEOUT_MS = 30_000;

function renderPath(request: EngineRequest): string {
  const query = new URLSearchParams();

  for (const [name, value] of Object.entries(request.query ?? {})) {
    if (value !== undefined) query.set(name, String(value));
  }

  const suffix = query.size === 0 ? '' : `?${query.toString()}`;
  return `/${ENGINE_API_VERSION}${request.path}${suffix}`;
}

/**
 * One call to the daemon, over whichever local byte stream this host uses.
 *
 * The response body is buffered: every lifecycle call answers with a short JSON document or with
 * nothing. Streaming endpoints — the log feed — go through `openStream` instead, which hands back
 * the socket rather than reading it to the end.
 */
export function engineRequest(
  endpoint: EngineEndpoint,
  request: EngineRequest,
): Promise<EngineResponse> {
  return new Promise((settle, fail) => {
    const payload =
      request.rawBody !== undefined
        ? request.rawBody.bytes
        : request.body === undefined
          ? undefined
          : Buffer.from(JSON.stringify(request.body), 'utf8');

    const call = httpRequest(
      {
        socketPath: endpoint.socketPath,
        path: renderPath(request),
        method: request.method,
        headers: {
          host: 'docker',
          ...(payload === undefined
            ? {}
            : {
                'content-type': request.rawBody?.contentType ?? 'application/json',
                'content-length': String(payload.length),
              }),
        },
        signal: request.signal,
        timeout: request.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      },
      (response: IncomingMessage) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => {
          settle({
            status: response.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
        response.on('error', (error) => {
          fail(new EngineUnreachableError(endpoint, error));
        });
      },
    );

    call.on('timeout', () => {
      call.destroy(
        new Error(`no reply within ${String(request.timeoutMs ?? DEFAULT_TIMEOUT_MS)}ms`),
      );
    });
    call.on('error', (error) => {
      fail(new EngineUnreachableError(endpoint, error));
    });

    if (payload !== undefined) call.write(payload);
    call.end();
  });
}

/** As `engineRequest`, but hands back the response stream unread — for the log feed. */
export function openStream(
  endpoint: EngineEndpoint,
  request: EngineRequest,
): Promise<{ status: number; stream: Readable }> {
  return new Promise((settle, fail) => {
    const call = httpRequest(
      {
        socketPath: endpoint.socketPath,
        path: renderPath(request),
        method: request.method,
        headers: { host: 'docker' },
        signal: request.signal,
      },
      (response: IncomingMessage) => {
        settle({ status: response.statusCode ?? 0, stream: response });
      },
    );

    call.on('error', (error) => {
      fail(new EngineUnreachableError(endpoint, error));
    });
    call.end();
  });
}
