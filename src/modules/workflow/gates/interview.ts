import { allowed, rejected, type InterviewCondition, type TransitionResult } from '../reason-codes';
import type { WorkflowSnapshot } from '../snapshot';

/**
 * The interview exit gate (FR-006; constitution A2).
 *
 * Three conditions, all over persisted state: grounding input recorded, at least one interview
 * round answered, a session summary persisted. FR-006 AC-3 makes them sufficient as well as
 * necessary — nothing else may hold this gate, and in particular no agent opinion participates
 * (FR-006 AC-4): there is simply no input through which one could arrive.
 *
 * The rejection names every unmet condition (FR-006 AC-2), not just the first, so a client can
 * show the whole remaining checklist rather than revealing it one refusal at a time.
 */
export function interviewGate(snapshot: WorkflowSnapshot): TransitionResult {
  const unmet: InterviewCondition[] = [];

  if (!snapshot.groundingInputRecorded) unmet.push('grounding-input');
  if (snapshot.answeredRounds.interview < 1) unmet.push('answered-round');
  if (!snapshot.summaryPersisted) unmet.push('summary');

  return unmet.length === 0 ? allowed() : rejected('INTERVIEW_INCOMPLETE', unmet);
}
