import type { SpecStage } from '../model/stages';
import { allowed, rejected, type TransitionResult } from '../reason-codes';
import type { WorkflowSnapshot } from '../snapshot';

/**
 * The `generate → review` gate (FR-007 AC-3; FR-009 AC-2/AC-3).
 *
 * The stage's spec file must have its **latest** revision approved. Latest is the load-bearing
 * word: a request-changes decision appends a new unapproved revision (FR-009 AC-4), and reviewing
 * anything other than what the user just approved would put the review board in front of stale
 * content. The flag therefore drops back to false the moment a newer unapproved revision exists,
 * and only the user's next approval raises it again — P2, expressed as data.
 */
export function approvalGate(snapshot: WorkflowSnapshot, stage: SpecStage): TransitionResult {
  return snapshot.specApproved[stage] ? allowed() : rejected('SPEC_NOT_APPROVED');
}
