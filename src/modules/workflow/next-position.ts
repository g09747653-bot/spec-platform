import { CORE_SPEC_TYPES } from '@/modules/specs/model/spec-files';

import type { StagePosition } from './model/stages';
import type { WorkflowSnapshot } from './snapshot';

/**
 * Where "forward" leads from here (task 78; FR-007, FR-020).
 *
 * The interface needs one door per position, and it must be the *same* door the engine would let a
 * session through — otherwise a button exists for a movement no table row defines, and the only
 * thing standing between the user and a confusing 409 is that the two lists happened to agree.
 *
 * So this answers only "which position is forward", and `evaluateTransition` still decides whether
 * the session may go there. Nothing here is a gate: a returned position may well be refused, and the
 * caller renders the refusal rather than hiding the door — a disabled control that says what is
 * missing is how P2 looks from the outside.
 *
 * Pure, like everything else in this module: a snapshot in, a position or `null` out.
 */

/** The parity stage order. `quality` is not in it — it is reached by the fork, never by sequence. */
const FORWARD_STAGES = CORE_SPEC_TYPES;

/**
 * The fork out of `tasks.review`, and the one out of `complete` (constitution A2; FR-013 AC-4/AC-5).
 *
 * Both need the same two facts: is the capability installed at all, and has this session opted in.
 * Neither alone is enough — an installed module the session declined must not divert the parity
 * exit, and a selection with no module behind it must not point at a stage that cannot run.
 */
function qualityIsTheWayOn(snapshot: WorkflowSnapshot): boolean {
  return snapshot.capabilities.includes('quality') && snapshot.qualityEnabled;
}

export function nextPosition(snapshot: WorkflowSnapshot): StagePosition | null {
  const { position } = snapshot;

  if (position.stage === 'interview') return { stage: 'constitution', substage: 'collect' };

  /*
   * `complete` has exactly one exit and it is conditional (FR-020 AC-9). With Quality unselected or
   * uninstalled there is no door at all — which is what "sealed" means, and why this returns `null`
   * rather than a position the gate would refuse: there is nothing here for the user to be told is
   * unavailable, because the session is finished.
   */
  if (position.stage === 'complete') {
    return qualityIsTheWayOn(snapshot) ? { stage: 'quality', substage: 'collect' } : null;
  }

  if (position.substage === 'collect') return { stage: position.stage, substage: 'generate' };
  if (position.substage === 'generate') return { stage: position.stage, substage: 'review' };

  // From `review`: on to the next stage, or out of the sequence entirely.
  if (position.stage === 'quality') return { stage: 'complete', substage: null };

  const index = FORWARD_STAGES.indexOf(position.stage);
  const following = FORWARD_STAGES[index + 1];

  if (following !== undefined) return { stage: following, substage: 'collect' };

  // `tasks.review` — the parity exit, or the opt-in detour through Quality (FR-007 AC-7).
  return qualityIsTheWayOn(snapshot)
    ? { stage: 'quality', substage: 'collect' }
    : { stage: 'complete', substage: null };
}
