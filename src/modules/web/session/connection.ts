/**
 * Whether the server is answering (task 125; Эталон §1.5 «Connection lost»).
 *
 * **Not a new health check.** Nothing here polls, pings, or opens a socket of its own: the state is
 * assembled entirely from what the two existing request paths already learn on every call —
 * `session-request.ts` (did this POST reach the server?) and `resumable-stream.ts` (is the reader
 * reconnecting, or reading?). A separate probe would be a second opinion about reachability, and
 * the two would disagree exactly when it mattered.
 *
 * It is a module-level store rather than React state for the same reason the theme is: several
 * unrelated components report into it and one banner reads it, and both halves happen outside any
 * single component's lifetime. The store is pure — no timers, no globals beyond its own — so the
 * transitions below are unit-tested without a renderer.
 */
import { STREAM_DISCONNECTED } from './resumable-stream';

export { STREAM_DISCONNECTED };

export type ConnectionState =
  /** Something reached the server recently, and nothing has failed since. */
  | 'online'
  /** A request did not reach the server, or the stream reader is reconnecting. */
  | 'lost'
  /** The user asked to reconnect; waiting for the next report either way. */
  | 'checking';

const listeners = new Set<() => void>();

let state: ConnectionState = 'online';

function publish(next: ConnectionState): void {
  if (state === next) return;
  state = next;
  for (const listener of listeners) listener();
}

/** A request reached the server — whatever it answered. Clears a lost connection. */
export function reportServerAnswered(): void {
  publish('online');
}

/** A request did not reach the server, or the reader lost its connection. */
export function reportServerUnreachable(): void {
  publish('lost');
}

/**
 * The user pressed Reconnect.
 *
 * Deliberately its own state rather than an optimistic `online`: the re-read has been asked for and
 * has not answered yet, and saying "connected" before anything answered would be the page guessing
 * on the user's behalf — the same mistake `session-request.ts` refuses to make about its own
 * abandoned requests.
 */
export function reportCheckingConnection(): void {
  publish('checking');
}

export function connectionSnapshot(): ConnectionState {
  return state;
}

/** The server-render snapshot: a page rendered on the server has, by definition, reached it. */
export function connectionServerSnapshot(): ConnectionState {
  return 'online';
}

export function subscribeConnection(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

/** Test seam: nothing in the application resets the store, and nothing should. */
export function resetConnectionForTest(): void {
  state = 'online';
  listeners.clear();
}

/**
 * What a stream reader's state says about the connection.
 *
 * Two of the reader's statuses are evidence and one is ambiguous:
 *
 * - `reconnecting` is its own word for "the connection dropped and I am asking for the rest" — lost;
 * - `streaming` / `complete` mean bytes are arriving — online;
 * - `failed` depends on **why**. The reader fails both when the run failed and when it ran out of
 *   reconnects, and those are opposite facts about the server. `STREAM_DISCONNECTED` is the second;
 *   a provider chain that refused the generation is the first, and a banner saying "the server
 *   stopped answering" over it would be false — which is how a warning becomes background noise.
 */
export function connectionFromStream(stream: {
  status: string;
  error: { code: string } | null;
}): ConnectionState | null {
  if (stream.status === 'reconnecting') return 'lost';
  if (stream.status === 'streaming' || stream.status === 'complete') return 'online';
  if (stream.status === 'failed' && stream.error?.code === STREAM_DISCONNECTED) return 'lost';

  return null;
}
