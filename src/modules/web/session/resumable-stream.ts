import { decodeEvents, type GenerationEvent } from '@/modules/web/api/stream-protocol';

/**
 * The resumable stream reader (task 46; FR-008 AC-2; FR-017; NFR-002 AC-2; D-8).
 *
 * Framework-free on purpose. Everything that can be got wrong here — which deltas count as already
 * rendered, what a `restart` throws away, when to reconnect and how long to wait — is logic, and logic
 * that only runs inside a React component is logic that only gets tested by clicking. The hook in
 * `useResumableStream.ts` is a thin binding over this.
 *
 * **One reader for both streams.** The generation stream is opened with `POST` and the resume stream
 * with `GET`; `EventSource` can do neither of the things that matter here — it cannot `POST`, cannot
 * set headers, and reconnects on a policy it does not share. `response.body.getReader()` can, and one
 * implementation covers both paths (D-8).
 *
 * **Duplicates are impossible, gaps are recoverable.** Every batch the server emits was persisted
 * before it was sent, and the client tracks the highest sequence it has rendered. On reconnect it asks
 * for "everything above that", and it drops anything at or below it — so a batch delivered twice is
 * rendered once, and a batch lost to a dropped socket comes back on the next connection (SC-3, SC-5).
 */

export interface StreamFailure {
  code: string;
  message: string;
  retryable: boolean;
}

export interface StreamState {
  status: 'idle' | 'streaming' | 'reconnecting' | 'complete' | 'failed';
  /** Everything rendered for the current attempt. A `restart` empties it (D-9). */
  text: string;
  runId: string | null;
  stage: string | null;
  /** Which attempt the rendered text belongs to. */
  attempt: number;
  /** Highest rendered sequence; `-1` before anything has arrived. */
  sequence: number;
  researching: boolean;
  specFileId: string | null;
  revisionNumber: number | null;
  error: StreamFailure | null;
}

export const initialStreamState: StreamState = {
  status: 'idle',
  text: '',
  runId: null,
  stage: null,
  attempt: 1,
  sequence: -1,
  researching: false,
  specFileId: null,
  revisionNumber: null,
  error: null,
};

/**
 * Applies one event to the rendered state.
 *
 * A pure reducer, which is what makes "no duplicate text" a property with a test rather than a hope.
 */
export function applyEvent(state: StreamState, event: GenerationEvent): StreamState {
  switch (event.type) {
    case 'run':
      return {
        ...state,
        status: 'streaming',
        runId: event.runId,
        stage: event.stage,
        attempt: event.attempt,
        error: null,
      };

    case 'delta':
      // Already rendered. A reconnect that overlaps by a batch is normal, not an error.
      if (event.sequence <= state.sequence) return state;
      return {
        ...state,
        status: 'streaming',
        text: state.text + event.text,
        sequence: event.sequence,
      };

    case 'research':
      return { ...state, researching: event.status === 'started' };

    case 'restart':
      // Never concatenate two providers' output: the rendered text goes, and numbering starts again.
      return { ...state, status: 'streaming', text: '', sequence: -1, attempt: event.attempt };

    case 'complete':
      return {
        ...state,
        status: 'complete',
        specFileId: event.specFileId,
        revisionNumber: event.revisionNumber,
        researching: false,
      };

    case 'error':
      return {
        ...state,
        status: 'failed',
        researching: false,
        error: { code: event.code, message: event.message, retryable: event.retryable },
      };
  }
}

const isTerminal = (state: StreamState) => state.status === 'complete' || state.status === 'failed';

export interface ResumableStreamOptions {
  onState: (state: StreamState) => void;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Reconnect delays in milliseconds. Running out of them ends the stream in `failed`. */
  backoff?: readonly number[];
  /**
   * How long a connection may deliver nothing before it is treated as dropped.
   *
   * Without this the reader waits on `reader.read()` forever: a server holding the response open —
   * a provider stalled inside its own timeout, a proxy that keeps the socket but forwards nothing —
   * is indistinguishable from a slow first token, and the page sits in `streaming` with its
   * generate control disabled and no way out. That is the state the M6 gate walked into.
   *
   * A deadline turns "hung" into "dropped", which this reader already knows how to survive: it
   * reconnects, asks for everything above the last rendered sequence, and — if the server is still
   * silent — runs out of backoff and ends in `failed`, which is a state the user can act from.
   *
   * The value is deliberately generous. `LLM_REQUEST_TIMEOUT_MS` defaults to 60s per provider, and
   * a first token is expected within 3s (NFR-001), so 45s cuts nothing legitimate; it only bounds
   * silence.
   */
  idleTimeoutMs?: number;
}

export const DEFAULT_BACKOFF: readonly number[] = [250, 500, 1000, 2000, 4000, 8000];

export const DEFAULT_IDLE_TIMEOUT_MS = 45_000;

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Marker for a connection that delivered nothing for the whole idle deadline. */
const IDLE = Symbol('stream-idle');

export interface ResumableStream {
  /** Opens the generation stream for a session and follows it to a terminal event. */
  start(sessionId: string): Promise<StreamState>;
  /** Follows an existing run — a page reload landing on a session that is mid-generation. */
  resume(runId: string, from?: number, attempt?: number): Promise<StreamState>;
  /** Gives up on the current stream. The server-side run is unaffected and can be resumed. */
  stop(): void;
  readonly state: StreamState;
}

export function createResumableStream(options: ResumableStreamOptions): ResumableStream {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const sleep = options.sleep ?? defaultSleep;
  const backoff = options.backoff ?? DEFAULT_BACKOFF;
  const idleTimeoutMs = options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;

  let state: StreamState = initialStreamState;
  let controller: AbortController | null = null;
  let stopped = false;

  /*
   * Read through a function, not directly. `stop()` flips this from another call stack — a click, an
   * unmount — so a value narrowed by an earlier check says nothing about its value after an `await`.
   * The accessor is what makes each read a genuine one.
   */
  const isStopped = () => stopped;

  const update = (next: StreamState) => {
    state = next;
    options.onState(state);
  };

  /**
   * One read, bounded.
   *
   * The race leaves the losing `read()` pending, which is harmless: `follow` aborts the controller
   * before it opens the next connection, and an aborted reader settles on its own.
   */
  async function readBounded(
    reader: ReadableStreamDefaultReader<Uint8Array>,
  ): Promise<ReadableStreamReadResult<Uint8Array> | typeof IDLE> {
    if (idleTimeoutMs <= 0) return reader.read();

    const idle: Promise<typeof IDLE> = sleep(idleTimeoutMs).then(() => IDLE);

    return Promise.race([reader.read(), idle]);
  }

  /** Reads one connection to its end. Returns false when it ended without a terminal event. */
  async function consume(response: Response): Promise<boolean> {
    if (response.body === null) return false;

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    for (;;) {
      const result = await readBounded(reader);

      // Silence for the whole deadline. Treated as a dropped connection, which is recoverable —
      // rather than as a slow one, which would wait forever.
      if (result === IDLE) throw new Error('stream idle');

      const { done, value } = result;

      if (value !== undefined) {
        buffer += decoder.decode(value, { stream: true });
        const { events, rest } = decodeEvents(buffer);
        buffer = rest;

        for (const event of events) {
          update(applyEvent(state, event));
          if (isTerminal(state)) return true;
        }
      }

      if (done) return isTerminal(state);
    }
  }

  /** Opens a connection, then keeps reopening the resume stream until the run reaches an end. */
  async function follow(open: () => Promise<Response>): Promise<StreamState> {
    let attempt = 0;

    for (;;) {
      controller = new AbortController();

      try {
        const response = await open();

        if (!response.ok) throw new Error(`stream responded ${String(response.status)}`);
        if (await consume(response)) return state;
      } catch {
        // A dropped connection is not a failed generation: the run is still going server-side, and
        // everything already rendered is already persisted. Reconnect and ask for the rest.
        controller.abort();
      }

      if (isStopped()) return state;

      // Nothing to resume against: the very first connection failed before the `run` event.
      if (state.runId === null || attempt >= backoff.length) {
        update({
          ...state,
          status: 'failed',
          error: {
            code: 'STREAM_DISCONNECTED',
            message: 'The connection to the generation was lost. Nothing has been lost — retry.',
            retryable: true,
          },
        });
        return state;
      }

      update({ ...state, status: 'reconnecting' });
      await sleep(backoff[attempt] ?? 0);
      if (isStopped()) return state;

      attempt += 1;
      const runId = state.runId;
      const from = state.sequence;
      const current = state.attempt;

      open = () => resumeRequest(runId, from, current);
    }
  }

  function resumeRequest(runId: string, from: number, attempt: number): Promise<Response> {
    const query = new URLSearchParams({ from: String(from), attempt: String(attempt) });

    return fetchImpl(`/api/generations/${encodeURIComponent(runId)}/stream?${query.toString()}`, {
      method: 'GET',
      signal: controller?.signal,
      headers: { accept: 'application/x-ndjson' },
    });
  }

  return {
    start(sessionId: string): Promise<StreamState> {
      stopped = false;
      update({ ...initialStreamState, status: 'streaming' });

      return follow(() =>
        fetchImpl(`/api/sessions/${encodeURIComponent(sessionId)}/generate`, {
          method: 'POST',
          signal: controller?.signal,
          headers: { accept: 'application/x-ndjson' },
        }),
      );
    },

    resume(runId: string, from = -1, attempt = 1): Promise<StreamState> {
      stopped = false;
      update({ ...initialStreamState, status: 'streaming', runId, sequence: from, attempt });

      return follow(() => resumeRequest(runId, from, attempt));
    },

    /**
     * Gives up on reading. The server-side run is untouched and its chunks stay durable.
     *
     * **It publishes a state, and that is the point.** Before this, `stop()` aborted the reader and
     * returned without calling `onState`, so a component keyed on `status === 'streaming'` stayed
     * "Generating…" for ever — a stop control built on it would have made the dead state worse
     * rather than better. Returning to `idle` is what puts the generate control back.
     *
     * The rendered text is kept: it is what the run produced so far, and throwing it away would
     * lose the only evidence the user has of what happened.
     */
    stop(): void {
      stopped = true;
      controller?.abort();

      if (state.status === 'streaming' || state.status === 'reconnecting') {
        update({ ...state, status: 'idle', researching: false });
      }
    },

    get state(): StreamState {
      return state;
    },
  };
}
