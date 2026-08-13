/**
 * The machine-readable vocabulary of transition rejections (solution.md — `workflow` interfaces;
 * NFR-012 AC-4).
 *
 * Rejections are values, not exceptions: a gate that refuses returns one of these codes, the API
 * forwards it, and a test asserts it. The set is closed — it is the `ReasonCode` contract from
 * `solution.md`, and adding to it is a solution-level decision, not an implementation detail.
 */
export const REASON_CODES = [
  'INTERVIEW_INCOMPLETE',
  'NO_ANSWERED_ROUND',
  'SPEC_NOT_APPROVED',
  'REVIEW_NOT_DECIDED',
  'SPEC_MISSING',
  'TRANSITION_NOT_IN_TABLE',
  'SESSION_SEALED',
  'ROUND_LIMIT_REACHED',
  'CAPABILITY_NOT_REGISTERED',
] as const;

export type ReasonCode = (typeof REASON_CODES)[number];

/**
 * The three persisted conditions of the interview exit gate (constitution A2; FR-006 AC-1).
 *
 * FR-006 AC-2 requires the rejection to name the unmet condition, and `INTERVIEW_INCOMPLETE` alone
 * does not — so the rejection carries the unmet subset alongside the code. The names are stable
 * identifiers for clients and tests, not display strings.
 */
export const INTERVIEW_CONDITIONS = ['grounding-input', 'answered-round', 'summary'] as const;

export type InterviewCondition = (typeof INTERVIEW_CONDITIONS)[number];

/**
 * The outcome of evaluating a transition or a gate (solution.md — `TransitionResult`).
 *
 * A discriminated union rather than `{ allowed: boolean; reason?: ReasonCode }` so that narrowing
 * on `allowed` is exhaustive, while remaining structurally assignable to the solution's declared
 * interface. `unmet` is populated only for `INTERVIEW_INCOMPLETE`, satisfying FR-006 AC-2 without
 * widening the reason-code set.
 */
export type TransitionResult =
  | { allowed: true; reason?: undefined; unmet?: undefined }
  | { allowed: false; reason: ReasonCode; unmet?: readonly InterviewCondition[] };

export const allowed = (): TransitionResult => ({ allowed: true });

export function rejected(
  reason: ReasonCode,
  unmet?: readonly InterviewCondition[],
): TransitionResult {
  return unmet === undefined ? { allowed: false, reason } : { allowed: false, reason, unmet };
}
