import type { Readable } from 'node:stream';

import { z } from 'zod';

import {
  EngineError,
  engineRequest,
  openStream,
  resolveEndpoint,
  type EngineEndpoint,
  type EngineRequest,
} from './transport.ts';

/**
 * Container lifecycle over the Docker Engine API (task 154).
 *
 * The operations the loop actually performs, and no wrapper around the rest of the API: create,
 * start, stop, pause, unpause, remove, wait, and attach to the log stream. Pause and unpause are
 * here from the start because M16а's «red CI» freezes running executors by name
 * (`delivery-executor-${taskId}`) rather than killing them — a frozen container can be resumed with
 * its work intact, and a killed one cannot.
 *
 * Every reply is parsed with Zod before it is believed. A daemon is an external system like any
 * other, and the shape of what it returns is not something to assume (constitution — runtime
 * validation at every boundary; the loop follows the platform's standards, А-20).
 */

const Created = z.object({ Id: z.string().min(1), Warnings: z.array(z.string()).optional() });

const Waited = z.object({ StatusCode: z.number().int() });

const Inspected = z.object({
  Id: z.string(),
  Name: z.string(),
  State: z.object({
    Status: z.string(),
    Running: z.boolean(),
    Paused: z.boolean(),
    ExitCode: z.number().int(),
    OOMKilled: z.boolean().optional(),
  }),
});

export type ContainerState = z.infer<typeof Inspected>['State'];

export interface CreateContainerSpec {
  /** `delivery-executor-${taskId}` for executors — the name M16а's freeze finds them by. */
  name: string;
  image: string;
  cmd?: readonly string[];
  /**
   * The **pointwise** environment (task 155): entries the container is given, one at a time.
   * The loop's own `.env` is never passed through, and there is no option here that could.
   */
  env?: Readonly<Record<string, string>>;
  /** Already-translated bind specifications — see `paths.ts`. */
  binds?: readonly string[];
  workingDir?: string;
  /** Removed by the daemon the moment it exits. Off by default: the gate reads exit codes. */
  autoRemove?: boolean;
  /** Cut the container off the network entirely, for anything that must not phone home. */
  networkDisabled?: boolean;
}

export interface DockerEngine {
  readonly endpoint: EngineEndpoint;
  ping(): Promise<boolean>;
  version(): Promise<{ version: string; apiVersion: string; os: string }>;
  pullImage(image: string): Promise<void>;
  hasImage(image: string): Promise<boolean>;
  /** Builds `tag` from a tar build context (task 155). Throws with the daemon's own output. */
  buildImage(tag: string, context: Buffer): Promise<void>;
  createContainer(spec: CreateContainerSpec): Promise<string>;
  startContainer(id: string): Promise<void>;
  stopContainer(id: string, timeoutSeconds?: number): Promise<void>;
  pauseContainer(id: string): Promise<void>;
  unpauseContainer(id: string): Promise<void>;
  removeContainer(id: string, options?: { force?: boolean }): Promise<void>;
  waitContainer(id: string, signal?: AbortSignal): Promise<number>;
  inspectContainer(id: string): Promise<{ id: string; name: string; state: ContainerState }>;
  /** Follows stdout and stderr; the caller demultiplexes with `readLogFrames`. */
  attachLogs(id: string, options?: { follow?: boolean; signal?: AbortSignal }): Promise<Readable>;
  /** The container of that name, or null. Names are the loop's index into the daemon. */
  findByName(name: string): Promise<string | null>;
}

const Listed = z.array(z.object({ Id: z.string(), Names: z.array(z.string()) }));

const Images = z.array(z.object({ RepoTags: z.array(z.string()).nullable() }));

/**
 * The engine for this host.
 *
 * The default reads `process.platform` — which machine this is, not configuration. The overrides
 * that *are* configuration (`DOCKER_ENGINE_PIPE`/`DOCKER_ENGINE_SOCKET`) reach `resolveEndpoint`
 * from `getEnv()` through the caller, so this module reads no environment of its own.
 */
export function createDockerEngine(
  endpoint: EngineEndpoint = resolveEndpoint(process.platform),
): DockerEngine {
  async function call(request: EngineRequest): Promise<string> {
    const response = await engineRequest(endpoint, request);

    // 2xx and 304 (already in that state — pausing a paused container) are both success.
    if (response.status >= 200 && response.status < 300) return response.body;
    if (response.status === 304) return response.body;

    throw new EngineError(request, response.status, response.body);
  }

  async function json<T>(request: EngineRequest, shape: z.ZodType<T>): Promise<T> {
    return shape.parse(JSON.parse(await call(request)));
  }

  return {
    endpoint,

    async ping(): Promise<boolean> {
      try {
        await call({ method: 'GET', path: '/_ping', timeoutMs: 5_000 });
        return true;
      } catch {
        return false;
      }
    },

    async version() {
      const parsed = await json(
        { method: 'GET', path: '/version', timeoutMs: 5_000 },
        z.object({ Version: z.string(), ApiVersion: z.string(), Os: z.string() }),
      );

      return { version: parsed.Version, apiVersion: parsed.ApiVersion, os: parsed.Os };
    },

    async hasImage(image: string): Promise<boolean> {
      const images = await json({ method: 'GET', path: '/images/json' }, Images);
      return images.some((entry) => (entry.RepoTags ?? []).includes(withTag(image)));
    },

    async pullImage(image: string): Promise<void> {
      // The pull is a progress stream; the loop only needs it to have finished. Twenty minutes is
      // the bound because a first pull of a Node image on a cold machine is minutes, not seconds.
      await call({
        method: 'POST',
        path: '/images/create',
        query: { fromImage: nameOf(image), tag: tagOf(image) },
        timeoutMs: 20 * 60_000,
      });
    },

    async buildImage(tag: string, context: Buffer): Promise<void> {
      /*
       * The build endpoint answers 200 and then reports failure *inside* the progress stream — a
       * Dockerfile that does not compile is a 200 with an `error` object in the body. Reading the
       * status alone would call a failed build a success, and the loop would then run tasks against
       * an image that is not there.
       */
      const body = await call({
        method: 'POST',
        path: '/build',
        query: { t: tag, rm: true, forcerm: true, q: false },
        rawBody: { bytes: context, contentType: 'application/x-tar' },
        timeoutMs: 30 * 60_000,
      });

      for (const line of body.split('\n')) {
        if (line.trim() === '') continue;

        const parsed: unknown = safeJson(line);
        if (
          typeof parsed === 'object' &&
          parsed !== null &&
          'error' in parsed &&
          typeof parsed.error === 'string'
        ) {
          throw new Error(`сборка образа ${tag} не удалась: ${parsed.error}`);
        }
      }
    },

    async createContainer(spec: CreateContainerSpec): Promise<string> {
      const created = await json(
        {
          method: 'POST',
          path: '/containers/create',
          query: { name: spec.name },
          body: {
            Image: spec.image,
            ...(spec.cmd === undefined ? {} : { Cmd: [...spec.cmd] }),
            ...(spec.env === undefined
              ? {}
              : { Env: Object.entries(spec.env).map(([name, value]) => `${name}=${value}`) }),
            ...(spec.workingDir === undefined ? {} : { WorkingDir: spec.workingDir }),
            ...(spec.networkDisabled === true ? { NetworkDisabled: true } : {}),
            HostConfig: {
              ...(spec.binds === undefined ? {} : { Binds: [...spec.binds] }),
              AutoRemove: spec.autoRemove ?? false,
            },
          },
        },
        Created,
      );

      return created.Id;
    },

    async startContainer(id: string): Promise<void> {
      await call({ method: 'POST', path: `/containers/${id}/start` });
    },

    async stopContainer(id: string, timeoutSeconds = 10): Promise<void> {
      await call({
        method: 'POST',
        path: `/containers/${id}/stop`,
        query: { t: timeoutSeconds },
        timeoutMs: (timeoutSeconds + 15) * 1_000,
      });
    },

    async pauseContainer(id: string): Promise<void> {
      await call({ method: 'POST', path: `/containers/${id}/pause` });
    },

    async unpauseContainer(id: string): Promise<void> {
      await call({ method: 'POST', path: `/containers/${id}/unpause` });
    },

    async removeContainer(id: string, options: { force?: boolean } = {}): Promise<void> {
      await call({
        method: 'DELETE',
        path: `/containers/${id}`,
        query: { force: options.force ?? true, v: true },
      });
    },

    async waitContainer(id: string, signal?: AbortSignal): Promise<number> {
      const waited = await json(
        {
          method: 'POST',
          path: `/containers/${id}/wait`,
          // No timeout: the caller's own bound (the executor's five minutes, task 155) is the one
          // that decides how long a container may run. A second, smaller bound here would end the
          // wait while the container kept going, which is worse than not waiting at all.
          timeoutMs: 0,
          ...(signal === undefined ? {} : { signal }),
        },
        Waited,
      );

      return waited.StatusCode;
    },

    async inspectContainer(id: string) {
      const inspected = await json({ method: 'GET', path: `/containers/${id}/json` }, Inspected);

      return {
        id: inspected.Id,
        name: inspected.Name.replace(/^\//, ''),
        state: inspected.State,
      };
    },

    async attachLogs(id: string, options: { follow?: boolean; signal?: AbortSignal } = {}) {
      const { status, stream } = await openStream(endpoint, {
        method: 'GET',
        path: `/containers/${id}/logs`,
        query: { stdout: true, stderr: true, follow: options.follow ?? true, timestamps: false },
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      });

      if (status < 200 || status >= 300) {
        stream.resume();
        throw new EngineError({ method: 'GET', path: `/containers/${id}/logs` }, status, '');
      }

      return stream;
    },

    async findByName(name: string): Promise<string | null> {
      const listed = await json(
        {
          method: 'GET',
          path: '/containers/json',
          query: { all: true, filters: JSON.stringify({ name: [name] }) },
        },
        Listed,
      );

      // Docker's name filter is a substring match, so `p1` would find `p10`. The loop indexes the
      // daemon by exact name (`delivery-executor-${taskId}`), and a near miss there would pause,
      // inspect or remove somebody else's container.
      const exact = listed.find((entry) => entry.Names.some((each) => each === `/${name}`));
      return exact?.Id ?? null;
    },
  };
}

/** A progress line that is not JSON is progress, not a verdict. */
function safeJson(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

/** `node:24-bookworm` → name `node`, tag `24-bookworm`; a bare name defaults to `latest`. */
function nameOf(image: string): string {
  const at = image.lastIndexOf(':');
  return at === -1 || image.includes('/', at) ? image : image.slice(0, at);
}

function tagOf(image: string): string {
  const at = image.lastIndexOf(':');
  return at === -1 || image.includes('/', at) ? 'latest' : image.slice(at + 1);
}

function withTag(image: string): string {
  return `${nameOf(image)}:${tagOf(image)}`;
}
