/**
 * What each pending card actually offers, and which of those a typed message may resolve
 * (task 61; FR-009 AC-7; FR-010 AC-4; constitution P2).
 *
 * Two different questions, deliberately kept apart:
 *
 * - `CARD_ACTIONS` — what the user can click. This is the authority for AC-3, "a resolved intent
 *   cannot select an action the pending card does not offer".
 * - `CHAT_RESOLVABLE` — the subset a *sentence* can express without the resolver guessing. It is
 *   smaller, and the gap is the point.
 *
 * **Why `update` on a review board is not chat-resolvable.** Requesting changes on a review carries
 * a selection of feedback items (FR-010 AC-7), and a selection of checkboxes is not something a
 * sentence expresses. "Request changes" tells us the action and nothing about *which* points — and
 * inventing that selection would apply feedback the user never chose, which is precisely the silent
 * wrong decision this module exists to prevent. So the resolver abstains and the board stays up.
 * Abstaining costs the user a click; guessing costs them a document they did not ask for.
 */
export const PENDING_KINDS = ['spec', 'review', 'diff'] as const;

export type PendingKind = (typeof PENDING_KINDS)[number];

export const DECISION_ACTIONS = ['approve', 'reject', 'accept', 'ignore', 'update'] as const;

export type DecisionAction = (typeof DECISION_ACTIONS)[number];

/** Every action the card renders as a control. */
export const CARD_ACTIONS: Readonly<Record<PendingKind, readonly DecisionAction[]>> = Object.freeze(
  {
    spec: ['approve', 'reject'],
    review: ['accept', 'ignore', 'update'],
    diff: ['accept', 'reject'],
  },
);

/** The subset a typed message may resolve. Never larger than `CARD_ACTIONS`. */
export const CHAT_RESOLVABLE: Readonly<Record<PendingKind, readonly DecisionAction[]>> =
  Object.freeze({
    spec: ['approve', 'reject'],
    review: ['accept', 'ignore'],
    diff: ['accept', 'reject'],
  });

/**
 * Actions that cannot be dispatched without the user's own words attached.
 *
 * Rejecting a *spec* means "request changes", and the endpoint needs the instruction to revise
 * against — an intent with no instruction is not a decision, it is half of one. Rejecting a *diff*
 * needs nothing: the proposal is discarded and the file is untouched.
 */
export function requiresEditPrompt(kind: PendingKind, action: DecisionAction): boolean {
  return kind === 'spec' && action === 'reject';
}

export function offersAction(kind: PendingKind, action: DecisionAction): boolean {
  return CARD_ACTIONS[kind].includes(action);
}

export function isChatResolvable(kind: PendingKind, action: DecisionAction): boolean {
  return CHAT_RESOLVABLE[kind].includes(action);
}

export function isPendingKind(value: string): value is PendingKind {
  return (PENDING_KINDS as readonly string[]).includes(value);
}
