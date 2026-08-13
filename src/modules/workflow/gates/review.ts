import type { SpecStage } from '../model/stages';
import { allowed, rejected, type TransitionResult } from '../reason-codes';
import type { WorkflowSnapshot } from '../snapshot';

/**
 * The stage-exit gate (FR-007 AC-4; FR-010 AC-5).
 *
 * A stage is left only after its automated review has been decided by the user — accepted or
 * ignored; request-changes returns the stage to `generate` and is not a decision that advances.
 * Until Milestone 4 lands the review board, no review can be decided and the assembler reports
 * every stage undecided, which fails closed: the engine refuses rather than assumes.
 */
export function reviewGate(snapshot: WorkflowSnapshot, stage: SpecStage): TransitionResult {
  return snapshot.reviewDecided[stage] ? allowed() : rejected('REVIEW_NOT_DECIDED');
}
