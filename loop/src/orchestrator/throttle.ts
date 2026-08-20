/**
 * The plan's own budget signal, treated as a working state rather than an error (task 159; А-24 §2).
 *
 * The loop runs on the customer's subscription, and a subscription is a rolling window of turns. The
 * CLI says so out loud in its `stream-json`: a `rate_limit_event` whose status is not `allowed` means
 * «this window is spent». That is **not** a failure of the iteration, of the plan or of the model —
 * it is the pipeline being told to wait, and the correct response is to stop *starting* containers,
 * let the running ones finish, say so in the feed with the time it will resume, and resume.
 *
 * The distinction is a red condition of the M16а gate, not a nicety: a pipeline that treats a
 * throttle as an error cascades — ten executors each fail, ten tasks go red, and «красный CI»
 * freezes an orchestration that had nothing wrong with it. What the operator would see is a plan
 * that collapsed at exactly the moment it was working hardest.
 *
 * Pure, with the clock injected, so «paused until the window resets» is a table of cases rather than
 * a test that sleeps.
 */

export interface ThrottleState {
  /** Epoch milliseconds until which no new container may start; `null` when nothing is holding. */
  pausedUntil: number | null;
  /** The status the CLI last reported, e.g. `allowed`, `rejected`, `allowed_warning`. */
  status: string | null;
  /** Which window it was about, e.g. `five_hour`. */
  window: string | null;
  /** How many times this run has been held. Measured by the gate, reported in the feed. */
  pauses: number;
}

export interface RateLimitSignal {
  status?: string | undefined;
  window?: string | undefined;
  /** Epoch **seconds**, as the CLI reports it. */
  resetsAt?: number | undefined;
}

export const IDLE_THROTTLE: ThrottleState = Object.freeze({
  pausedUntil: null,
  status: null,
  window: null,
  pauses: 0,
});

/**
 * How long to wait when the CLI says the window is spent but does not say when it reopens.
 *
 * Five minutes, and the reason it is not longer: the cost of waiting too little is one more refused
 * call, which the next event re-pauses on; the cost of waiting too long is an orchestration asleep
 * through a window that reopened. The asymmetry favours the short guess.
 */
export const BLIND_THROTTLE_MS = 5 * 60_000;

/** The one status that means «carry on». Everything else holds new starts. */
const ALLOWED = 'allowed';

export function observeRateLimit(
  state: ThrottleState,
  signal: RateLimitSignal,
  now: number,
): ThrottleState {
  const status = signal.status ?? null;

  if (status === null) return state;

  if (status === ALLOWED) {
    /*
     * The window is open. The hold is released **immediately** rather than left to expire: the CLI
     * has just told us the truth about the budget, and honouring a stale deadline over it would be
     * the loop believing its own guess more than the provider.
     */
    return { ...state, status, window: signal.window ?? state.window, pausedUntil: null };
  }

  const until =
    signal.resetsAt === undefined ? now + BLIND_THROTTLE_MS : Math.max(signal.resetsAt * 1000, now);

  return {
    pausedUntil: until,
    status,
    window: signal.window ?? state.window,
    /* A pause already in force is one event, not two: the CLI repeats the status on every call. */
    pauses: state.pausedUntil !== null && state.pausedUntil > now ? state.pauses : state.pauses + 1,
  };
}

export function throttled(state: ThrottleState, now: number): boolean {
  return state.pausedUntil !== null && state.pausedUntil > now;
}

/** Milliseconds left to wait, or 0 — what a caller sleeps for before looking again. */
export function remainingMs(state: ThrottleState, now: number): number {
  return state.pausedUntil === null ? 0 : Math.max(state.pausedUntil - now, 0);
}

/** The line the operator reads. Named window and named time — never «something went wrong». */
export function describeThrottle(state: ThrottleState, now: number): string {
  const seconds = Math.ceil(remainingMs(state, now) / 1000);
  const window = state.window === null ? '' : ` (${state.window})`;

  return (
    `Лимит тарифа${window}: ${state.status ?? 'не allowed'}. ` +
    `Новые исполнители не запускаются, уже запущенные доигрывают. ` +
    `Возобновление через ${String(seconds)} с.`
  );
}
