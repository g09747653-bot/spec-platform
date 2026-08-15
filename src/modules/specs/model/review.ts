/**
 * The review vocabulary (FR-010; task 53).
 *
 * The outcome the agent states and the decision the user takes are two different alphabets, and
 * keeping them apart is the point: `pass`/`needs_revision` is the model's opinion, `accept`/`ignore`/
 * `request_changes` is the human gate over it (constitution P2). A model that could write `accept`
 * would be deciding, and deciding is not its job.
 *
 * A leaf module, like `spec-files.ts`: the database constraint, the Zod artifact schema and the
 * ReviewBoard all key off these lists without any of them importing each other.
 */

/** What the review agent concluded about the spec (FR-010 AC-3). */
export const REVIEW_OUTCOMES = ['pass', 'needs_revision'] as const;

export type ReviewOutcome = (typeof REVIEW_OUTCOMES)[number];

/**
 * What the user did about it (FR-010 AC-4).
 *
 * `accept` and `ignore` both open the gate to the next stage (AC-5) and differ only in what they say
 * about the feedback; `request_changes` sends the stage back to `generate` (AC-6).
 */
export const REVIEW_DECISIONS = ['accept', 'ignore', 'request_changes'] as const;

export type ReviewDecisionName = (typeof REVIEW_DECISIONS)[number];

/** The two decisions that satisfy `reviewGate` (FR-010 AC-5). */
export const GATE_OPENING_REVIEW_DECISIONS = ['accept', 'ignore'] as const;

export function isReviewDecision(value: string): value is ReviewDecisionName {
  return (REVIEW_DECISIONS as readonly string[]).includes(value);
}

/** Whether a decision permits the transition to the next stage (FR-010 AC-5). */
export function opensReviewGate(decision: ReviewDecisionName): boolean {
  return (GATE_OPENING_REVIEW_DECISIONS as readonly string[]).includes(decision);
}

/** How a feedback item is classified (FR-010 AC-2). Advisory items are never blocking. */
export const FEEDBACK_SEVERITIES = ['blocking', 'advisory'] as const;

export type FeedbackSeverity = (typeof FEEDBACK_SEVERITIES)[number];

/**
 * Who found the item (task 114; А-3 У-3).
 *
 * A board carries findings from two producers that are not alike and must not be presented as
 * though they were. A `model` item is a judgement — it can be wrong, which is what its confidence
 * score is for. A `linter` item is a **measurement**: a cross-reference either resolves or it does
 * not, an identifier either kept its number or it did not. Recording which one an item is keeps the
 * card honest about how much the number above it is worth, and keeps a machine finding from being
 * quietly re-derived by a model on the next pass.
 */
export const FEEDBACK_SOURCES = ['model', 'linter'] as const;

export type FeedbackSource = (typeof FEEDBACK_SOURCES)[number];

/**
 * The lifecycle of a conversational refinement (FR-011; DR-10; DR-11).
 *
 * `pending` is the only status the partial unique index counts, and it is the only one the user can
 * act on. `accepted` and `rejected` are both terminal: a proposal is decided once, and the row stays
 * afterwards as the record of that decision — a rejected proposal is evidence that the user said no,
 * not something to delete (FR-012 AC-6 only forbids it becoming a *revision*).
 */
export const PROPOSAL_STATUSES = ['pending', 'accepted', 'rejected'] as const;

export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export function isProposalStatus(value: string): value is ProposalStatus {
  return (PROPOSAL_STATUSES as readonly string[]).includes(value);
}
