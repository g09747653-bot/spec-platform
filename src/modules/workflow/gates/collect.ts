import type { SpecStage } from '../model/stages';
import { allowed, rejected, type TransitionResult } from '../reason-codes';
import type { WorkflowSnapshot } from '../snapshot';

/**
 * The `collect → generate` gate (FR-007 AC-2).
 *
 * A stage may generate once at least one of its question rounds has been answered. The count is
 * per stage: every spec stage runs its own collection, so an answered constitution round says
 * nothing about requirements (FR-005 AC-7 keys rounds by stage).
 *
 * Unmet information needs do **not** hold this gate. FR-007 AC-2 names the answered round as the
 * condition; outstanding needs drive the asking loop instead — another round while the budget
 * lasts, the named-needs fallback once it is exhausted (FR-005 AC-10, task 37). Milestone 5 adds
 * the alternative evidence path ("accepted attachment-derived evidence"); until an attachment can
 * satisfy collection, an answered round is the one way through.
 */
export function collectGate(snapshot: WorkflowSnapshot, stage: SpecStage): TransitionResult {
  return snapshot.answeredRounds[stage] >= 1 ? allowed() : rejected('NO_ANSWERED_ROUND');
}
