import { methodologyConfig, requiredDocumentStages } from '@/modules/methodologies';

import { isSpecStage } from '../model/stages';
import { allowed, rejected, type TransitionResult } from '../reason-codes';
import type { WorkflowSnapshot } from '../snapshot';

/**
 * The completion gate (FR-020 AC-2).
 *
 * `complete` may not be entered while any required spec file lacks an approved revision. The
 * required set is **the session's methodology's required documents** (task 116) — for the parity
 * graph, the four parity files, which is what this gate asked for before methodologies existed and
 * what it still asks for by default. The existence check is deliberately not "latest revision
 * approved": a file whose newest revision awaits a decision still has approved content to export,
 * and completion is about the bundle existing, not about a redraft being settled.
 *
 * Optional stages are excluded by definition — a stage the graph lets the session skip cannot be a
 * precondition for finishing. `quality.md` is therefore absent here even on the Quality ordering,
 * and would be anyway: the `quality.review → complete` edge is only reachable after `quality`'s own
 * approval gate held its latest revision approved, so checking it here would assert something
 * already guaranteed.
 */
export function completionGate(snapshot: WorkflowSnapshot): TransitionResult {
  const required = requiredDocumentStages(methodologyConfig(snapshot.methodologyId));

  const missing = required.some(
    (stage) => isSpecStage(stage) && !snapshot.approvedRevisionExists[stage],
  );

  return missing ? rejected('SPEC_MISSING') : allowed();
}
