import { methodologyConfig } from '@/modules/methodologies';

import type { StagePosition } from './model/stages';
import type { WorkflowSnapshot } from './snapshot';
import { transitionTable } from './transition-table';

/**
 * Where "forward" leads from here (tasks 78, 117; FR-007, FR-020).
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
 * **Read off the graph since M9п.** It used to hold the parity stage order as a constant, which was
 * right while there was one graph; with five it would answer for the wrong one. Now it takes the
 * forward rows leaving the current position from the session's own table, so the door and the row
 * that permits it are the same fact — and a methodology that skips `solution` cannot be offered a
 * door into it.
 *
 * Pure, like everything else in this module: a snapshot in, a position or `null` out.
 */

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

  /*
   * Forward rows leaving this position, in table order. Backward rows are excluded by gate, which is
   * exactly what "this edge does not advance the session" means (FR-007 AC-5).
   */
  const forward = transitionTable(snapshot.methodologyId).filter(
    (row) =>
      row.from.stage === position.stage &&
      row.from.substage === position.substage &&
      row.gate !== 'backward',
  );

  if (forward.length === 0) return null;

  /*
   * `complete` has exactly one exit and it is conditional (FR-020 AC-9). With Quality unselected or
   * uninstalled there is no door at all — which is what "sealed" means, and why this returns `null`
   * rather than a position the gate would refuse: there is nothing here for the user to be told is
   * unavailable, because the session is finished.
   */
  if (position.stage === 'complete') {
    return qualityIsTheWayOn(snapshot) ? (forward[0]?.to ?? null) : null;
  }

  /*
   * A fork. Two shapes, and they are decided differently on purpose.
   *
   * The **Quality** fork is decided by the session's persisted selection (constitution A2 makes the
   * ordering binding per session), so the door follows the selection rather than asking again.
   *
   * Any **other** optional stage is decided by the user at this gate, and the door offered is the
   * one that continues the workflow — a session that has just accepted its Requirements review is
   * more likely to be going on to Tasks than to be finishing, and the terminal stays reachable
   * because the row exists and the surface offers both (task 117).
   */
  const detour = forward.find((row) => row.gate === 'tasks-to-quality');
  if (detour !== undefined) {
    return qualityIsTheWayOn(snapshot)
      ? detour.to
      : (forward.find((row) => row.to.stage === 'complete')?.to ?? detour.to);
  }

  const onward = forward.find((row) => row.to.stage !== 'complete');
  return onward?.to ?? forward[0]?.to ?? null;
}

/**
 * Every forward door from here, so a fork can be *offered* rather than chosen for the user (P2).
 *
 * `nextPosition` answers "which one door", which is what a single button needs; a stage that ends a
 * methodology *and* leads on to an optional stage has two, and hiding one of them would decide on
 * the user's behalf which is exactly what an optional stage must not do.
 */
export interface ForwardDoor {
  to: StagePosition;
  /** What the door is called: the next step's label, or `Complete`. */
  label: string;
}

export function forwardDoors(snapshot: WorkflowSnapshot): ForwardDoor[] {
  const config = methodologyConfig(snapshot.methodologyId);
  const { position } = snapshot;

  return transitionTable(snapshot.methodologyId)
    .filter(
      (row) =>
        row.from.stage === position.stage &&
        row.from.substage === position.substage &&
        row.gate !== 'backward' &&
        // The Quality detour is offered only to a session that selected it — the ordering is binding.
        (row.gate !== 'tasks-to-quality' || qualityIsTheWayOn(snapshot)) &&
        (row.gate !== 'tasks-to-complete' || !qualityIsTheWayOn(snapshot)),
    )
    .map((row) => ({
      to: row.to,
      label:
        row.to.stage === 'complete'
          ? 'Complete'
          : (config.steps.find((step) => step.stage === row.to.stage)?.label ?? row.to.stage),
    }));
}
