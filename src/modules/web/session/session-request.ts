/**
 * A session-moving POST that can always be abandoned (round 5, Р-3).
 *
 * Round 2's Д-1 established the invariant — **the page is never dead** — and fixed it for the one
 * long request anyone had noticed: the generation stream, which got `Stop`. Every *other* request
 * that moves a session kept the shape the gate walked into: `setBusy(action)`, `await fetch(...)`,
 * `finally { setBusy(null) }`. That shape has no deadline, no abort and no cancel control, so the
 * control that started it stays disabled for exactly as long as the request runs — and a request
 * that never settles disables it forever, with a caption that says nothing and never changes.
 *
 * It is not a hypothetical: entering `review` runs the review agent **inside** the transition
 * request, so `POST /transition` is bounded by the provider chain (`LLM_REQUEST_TIMEOUT_MS` per
 * provider, tried in order) rather than by anything the page can see, and a stalled connection is
 * bounded by nothing at all. `fetch` has no timeout.
 *
 * Framework-free for the same reason as `resumable-stream.ts`: what can be got wrong here — when to
 * stop believing the server, what an abandoned request leaves behind, which failures are worth words
 * — is logic, and logic that only runs inside a component is logic that only gets tested by
 * clicking. `useSessionRequest.ts` is a thin binding over this.
 *
 * **The words arrive as a translator, not as a locale** (task 143). `notice` stays a plain string,
 * because it is read by a renderer that puts it in a paragraph and by a suite that asserts on what a
 * refusal said; handing back a key would move that resolution into every one of those callers. But a
 * module with no React in it cannot reach the locale — the client half is a context and the server
 * half is a cookie — so the caller passes the `t` it already has. `useSessionRequest` calls `useT()`
 * once and hands it down here, which keeps this file free of both React and the dictionary while the
 * message it settles on is still in the reader's language.
 *
 * Three properties are deliberate:
 *
 * 1. **Abandoning is always possible.** `abandon()` aborts the request and settles the state, so a
 *    renderer can offer a live control at every moment the request is in flight.
 * 2. **The deadline is a backstop, not a budget.** It is set from the server's own worst case, so it
 *    can only fire past the point where the server could still legitimately be working. Waiting is
 *    the user's decision until then, which is why `abandon()` exists.
 * 3. **Every settled request ends by re-reading the server.** Abandoning a request does not undo it
 *    — the same lesson as Р-2's `cancel()` — so the honest answer to "did that go through?" is the
 *    server's, never the client's guess. The caller refreshes on success, failure, timeout and
 *    abandonment alike.
 */
import type { PhraseKey } from '../i18n/dictionary';
import type { Translate } from '../i18n/translate';

import { rejectionNotice } from './gate-copy';

/**
 * Which ending a notice is reporting, as a token (task 143).
 *
 * `expired` is the deadline's own ending rather than `abandoned`: both stop a wait, but one is the
 * user's decision and the other is the backstop firing, and a reader of this state that could not
 * tell them apart would be back to matching sentences.
 */
export type SessionNoticeKind = 'abandoned' | 'unreachable' | 'refused' | 'expired';

export interface SessionRequestState {
  /** The action whose request is in flight, or `null` when nothing is. */
  running: string | null;
  /** When the in-flight request started, so a renderer can show an honest elapsed reading. */
  startedAt: number | null;
  /** How the last request ended, in words the user can act on; `null` when there is nothing to say. */
  notice: string | null;
  /** The same ending as a token: the words are the reader's, this is for whatever has to *know*. */
  noticeKind: SessionNoticeKind | null;
  /** The gate's own reason code behind a refusal, when it attached one; `null` otherwise. */
  noticeReason: string | null;
}

export const initialSessionRequestState: SessionRequestState = {
  running: null,
  startedAt: null,
  notice: null,
  noticeKind: null,
  noticeReason: null,
};

export interface SessionRequestResult {
  /** True only when the server answered with a success status. */
  ok: boolean;
  /** The decoded JSON body, when there was one. */
  payload: unknown;
}

export interface SessionRequestOptions {
  onState: (state: SessionRequestState) => void;
  /** The caller's translator — see the note on words above. Required, so a notice cannot ship in one language. */
  t: Translate;
  fetchImpl?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /**
   * How long to wait before concluding the server cannot still be working.
   *
   * The page derives it from the chain the server is configured with rather than guessing, so this
   * default only applies where nothing was passed.
   */
  deadlineMs?: number;
  /**
   * Whether the server was reachable, reported per request (task 125).
   *
   * `true` the moment a response arrives, whatever its status — a 409 is the server answering. `false`
   * only when the request never reached it. **The deadline reports neither**: a server that has not
   * answered within its own worst case may still be working, and calling that "unreachable" would
   * put a connection banner over a session that is merely slow.
   */
  onReachability?: (reachable: boolean) => void;
}

export interface SessionRequest {
  send(action: string, url: string, body?: unknown): Promise<SessionRequestResult>;
  /** Stops waiting for the request in flight. The server-side effect, if any, is unaffected. */
  abandon(): void;
  /** Clears the notice — for a renderer that wants the message gone on the next interaction. */
  dismiss(): void;
  readonly state: SessionRequestState;
}

export const DEFAULT_DEADLINE_MS = 120_000;

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Marker for the deadline winning the race against the request. */
const EXPIRED = Symbol('session-request-deadline');

/**
 * The four endings, as keys rather than sentences (task 143).
 *
 * Still exported, and for the same reason as before: a test asserting «this is what an abandoned
 * request says» must name the copy rather than repeat it, or the assertion becomes a second place the
 * wording lives. A key does that job better than a constant did — it also names the entry a
 * translator edits.
 */
export const ABANDONED_NOTICE: PhraseKey = 'errors.request.abandoned';

export const UNREACHABLE_NOTICE: PhraseKey = 'errors.request.unreachable';

export const FALLBACK_FAILURE_NOTICE: PhraseKey = 'errors.request.failed';

export const EXPIRED_NOTICE: PhraseKey = 'errors.request.expired';

/**
 * The deadline's own sentence, which is the one ending that has a number in it.
 *
 * Kept a function so the milliseconds→seconds rounding happens once, beside the deadline that
 * produced it, rather than at each place the phrase is rendered.
 */
export function expiredNotice(t: Translate, deadlineMs: number): string {
  return t(EXPIRED_NOTICE, { seconds: Math.round(deadlineMs / 1000) });
}

/**
 * The message a failed response carries, if it carries one.
 *
 * Every handler answers in the shape `{ error: { code, message } }`, so the server's own words reach
 * the user instead of a generic sentence written at the call site. The gate walk's
 * "That step is not available yet" was exactly such a sentence: it replaced a message that named the
 * reason with one that named nothing.
 */
export function messageOf(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null || !('error' in payload)) return null;

  const { error } = payload;
  if (typeof error !== 'object' || error === null || !('message' in error)) return null;

  return typeof error.message === 'string' && error.message !== '' ? error.message : null;
}

/**
 * The error code a failed response carries.
 *
 * Read for the same purpose as `messageOf` and instead of it wherever possible: the code is the half
 * of `{ error: { code, message } }` the browser can word for itself (see `API_EXPLANATION` in
 * `gate-copy.ts`), while the message is the server's English. A response with neither leaves the
 * fallback notice, which is the only sentence written at a call site in this file.
 */
export function codeOf(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null || !('error' in payload)) return null;

  const { error } = payload;
  if (typeof error !== 'object' || error === null || !('code' in error)) return null;

  return typeof error.code === 'string' && error.code !== '' ? error.code : null;
}

/** The machine-readable reason a rejection carries, when the handler attached one. */
export function reasonOf(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null || !('error' in payload)) return null;

  const { error } = payload;
  if (typeof error !== 'object' || error === null || !('details' in error)) return null;

  const { details } = error;
  if (typeof details !== 'object' || details === null || !('reason' in details)) return null;

  return typeof details.reason === 'string' ? details.reason : null;
}

/**
 * Everything a settled request has to say, carried together so the words and the token cannot be
 * set from different branches and disagree about which ending this was.
 */
type SettledNotice = Pick<SessionRequestState, 'notice' | 'noticeKind' | 'noticeReason'>;

/** Nothing to report: a request that succeeded, and the state a new one starts from. */
const NO_NOTICE: SettledNotice = { notice: null, noticeKind: null, noticeReason: null };

export function createSessionRequest(options: SessionRequestOptions): SessionRequest {
  const t = options.t;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? defaultSleep;
  const deadlineMs = options.deadlineMs ?? DEFAULT_DEADLINE_MS;

  let state: SessionRequestState = initialSessionRequestState;
  let controller: AbortController | null = null;

  function publish(next: SessionRequestState): void {
    state = next;
    options.onState(state);
  }

  function settle(ending: SettledNotice): void {
    controller = null;
    publish({ running: null, startedAt: null, ...ending });
  }

  async function send(action: string, url: string, body?: unknown): Promise<SessionRequestResult> {
    // One request at a time per instance: the control that starts it is disabled while it runs, and
    // a second one would race the first to settle the same state.
    if (state.running !== null) return { ok: false, payload: null };

    const local = new AbortController();
    controller = local;
    publish({ running: action, startedAt: now(), ...NO_NOTICE });

    const request = fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: local.signal,
    }).then(
      (response) => ({ response }),
      (error: unknown) => ({ error }),
    );

    // Annotated for the same reason as the stream reader's idle marker: without it the arrow widens
    // to `symbol` and the race's union stops narrowing.
    const deadline: Promise<typeof EXPIRED> = sleep(deadlineMs).then(() => EXPIRED);
    const outcome = await Promise.race([request, deadline]);

    if (outcome === EXPIRED) {
      // Abort so the socket is released, then say so. The server may well have applied the change
      // already; the caller's refresh is what resolves that, not an assumption made here.
      local.abort();
      settle({ notice: expiredNotice(t, deadlineMs), noticeKind: 'expired', noticeReason: null });
      return { ok: false, payload: null };
    }

    if ('error' in outcome) {
      // The signal is the record of who ended it: `abandon()` aborts, a dropped connection does not.
      const abandoned = local.signal.aborted;
      if (!abandoned) options.onReachability?.(false);

      settle(
        abandoned
          ? { notice: t(ABANDONED_NOTICE), noticeKind: 'abandoned', noticeReason: null }
          : { notice: t(UNREACHABLE_NOTICE), noticeKind: 'unreachable', noticeReason: null },
      );
      return { ok: false, payload: null };
    }

    const { response } = outcome;
    options.onReachability?.(true);
    const payload: unknown = await response.json().catch(() => null);

    /*
     * A refusal is shown in the words of whichever layer knows most about it: the reason code when
     * the gate attached one, the error code when the handler answered with a known one, the server's
     * own message otherwise. What is never shown is a sentence invented at the call site — "That step
     * is not available yet" was one, and it is what the gate walk got back for a question budget that
     * had run out (Р-3 item 4).
     */
    const reason = reasonOf(payload);

    settle(
      response.ok
        ? NO_NOTICE
        : {
            notice:
              rejectionNotice(t, messageOf(payload), reason, codeOf(payload)) ??
              t(FALLBACK_FAILURE_NOTICE),
            noticeKind: 'refused',
            noticeReason: reason,
          },
    );

    return { ok: response.ok, payload };
  }

  return {
    send,
    abandon(): void {
      controller?.abort();
    },
    dismiss(): void {
      if (state.notice !== null) publish({ ...state, ...NO_NOTICE });
    },
    get state() {
      return state;
    },
  };
}
