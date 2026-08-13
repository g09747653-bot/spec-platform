/**
 * The durable chunk log's writer (task 44; D-7; NFR-003; SC-1).
 *
 * Streaming has to survive a dropped connection, and the way it does is that **every piece of text the
 * client has rendered is already in the database**. That ordering is the whole design: a batch is
 * persisted first and emitted second, so a reconnect asking for "everything above sequence N" can
 * never be told about text that was lost, and can never be handed the same text twice (task 47).
 *
 * Which means the client renders at *batch* granularity, not token granularity. That is deliberate.
 * Writing a row per token would multiply writes by two orders of magnitude for a document nobody
 * keeps — the log exists for resume, not for history — and a quarter-second cadence is well inside
 * "never appears frozen" (NFR-002). Time-to-first-token is measured where it actually happens: the
 * stamp goes on the first delta, not on the first batch.
 *
 * The store is an interface rather than a table so that moving the log to Redis later touches this
 * file and nothing above it (D-7).
 */

export interface RecordedChunk {
  /** 0-based within the current attempt. A restart resets it to zero (D-9). */
  sequence: number;
  delta: string;
}

export interface ChunkStore {
  append(runId: string, chunk: RecordedChunk): Promise<void>;
  /** Drops every persisted chunk of the run — the discard half of discard-and-restart. */
  discardAll(runId: string): Promise<void>;
  stampFirstToken(runId: string, at: Date): Promise<void>;
  clearFirstToken(runId: string): Promise<void>;
  /** Removes the log once it can no longer be needed for resume. */
  prune(runId: string): Promise<void>;
}

export interface StreamRecorderOptions {
  runId: string;
  store: ChunkStore;
  /** Called once a batch is durable. This is what becomes a `delta` event on the wire. */
  onBatch?: (chunk: RecordedChunk) => void;
  /** Flush cadence in milliseconds. Default 250. */
  batchMs?: number;
  /** Flush threshold in characters. Default 2048. */
  batchBytes?: number;
  now?: () => Date;
}

export const DEFAULT_BATCH_MS = 250;
export const DEFAULT_BATCH_BYTES = 2048;

export interface StreamRecorder {
  /** Buffers a model delta. Cheap and synchronous: the provider stream must not wait on a write. */
  delta(text: string): void;
  /** Persists whatever is buffered, in order. */
  flush(): Promise<void>;
  /** Abandons this attempt: buffered and persisted chunks go, sequences restart at zero (D-9). */
  restart(): Promise<void>;
  /** Flushes, then prunes: the run is finished and the log has nothing left to resume. */
  complete(): Promise<void>;
  /** Discards without persisting: a failed run leaves no half-document to replay. */
  fail(): Promise<void>;
  /** The sequence the next batch will take. */
  readonly nextSequence: number;
}

export function createStreamRecorder(options: StreamRecorderOptions): StreamRecorder {
  const {
    runId,
    store,
    onBatch,
    batchMs = DEFAULT_BATCH_MS,
    batchBytes = DEFAULT_BATCH_BYTES,
    now = () => new Date(),
  } = options;

  let buffer = '';
  let sequence = 0;
  let stamped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  /*
   * Writes are chained rather than issued concurrently. Two flushes racing would be free to land out
   * of order, and a chunk log whose sequences do not match its contents is worse than no log at all.
   */
  let queue: Promise<void> = Promise.resolve();

  const enqueue = (work: () => Promise<void>): Promise<void> => {
    queue = queue.then(work, work);
    return queue;
  };

  const cancelTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const flushNow = (): Promise<void> => {
    cancelTimer();

    const pending = buffer;
    buffer = '';
    if (pending === '') return queue;

    const chunk: RecordedChunk = { sequence, delta: pending };
    sequence += 1;

    return enqueue(async () => {
      await store.append(runId, chunk);
      onBatch?.(chunk);
    });
  };

  return {
    delta(text: string): void {
      if (text === '') return;

      if (!stamped) {
        stamped = true;
        // The stamp belongs to the moment the model first produced text, not to the moment the batch
        // carrying it was written — SC-1 measures the user's wait, not our flush cadence.
        const at = now();
        void enqueue(() => store.stampFirstToken(runId, at));
      }

      buffer += text;

      if (buffer.length >= batchBytes) {
        void flushNow();
        return;
      }

      timer ??= setTimeout(() => {
        void flushNow();
      }, batchMs);
    },

    flush(): Promise<void> {
      return flushNow();
    },

    async restart(): Promise<void> {
      cancelTimer();
      buffer = '';
      sequence = 0;
      stamped = false;

      await enqueue(async () => {
        await store.discardAll(runId);
        // The stamp of an abandoned attempt is not this run's time to first token; the next attempt
        // sets it again from its own first delta (solution.md — Entity Notes).
        await store.clearFirstToken(runId);
      });
    },

    async complete(): Promise<void> {
      await flushNow();
      await enqueue(() => store.prune(runId));
    },

    async fail(): Promise<void> {
      cancelTimer();
      buffer = '';
      await enqueue(() => store.prune(runId));
    },

    get nextSequence(): number {
      return sequence;
    },
  };
}
