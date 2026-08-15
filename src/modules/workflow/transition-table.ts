import { DEFAULT_METHODOLOGY_ID, transitionTableFor } from '@/modules/methodologies/registry';

import { samePosition, type StagePosition } from './model/stages';

/**
 * The transition table (task 24; constitution A2, P1; D-1) — now **derived from a methodology
 * configuration** (task 116).
 *
 * Every legal movement of the workflow is one row here — a plain array that tests enumerate
 * programmatically (NFR-012 AC-3). A transition absent from a session's table is illegal by
 * definition and is rejected with `TRANSITION_NOT_IN_TABLE` (or `SESSION_SEALED` when attempted
 * out of `complete`); no code path can advance a session along an edge its table does not name.
 *
 * **What changed in M9п, and what did not.** The rows used to be written out literally here. They
 * are now produced by `methodologies/graph.ts` from a configuration, because five methodologies
 * would otherwise be five hand-written tables saying the same thing five times. What did not change
 * is the table itself: `__tests__/transition-table.parity.json` was captured from the literal array
 * *before* the derivation existed, and the snapshot test asserts the default methodology's derived
 * table against it row for row, id for id, gate for gate. The rules the old comment stated in prose
 * still hold, and are now stated in the derivation:
 *
 * - `interview` exits only to `constitution.collect`, through the three-condition gate (FR-006).
 * - Each spec stage runs `collect → generate → review` forward through its gates (FR-007
 *   AC-2/AC-3) and permits every backward move within the stage unconditionally (FR-007 AC-5).
 * - A decided review advances to the next stage's `collect` (FR-007 AC-4).
 * - `tasks.review` forks on the session's Quality selection: `→ complete` when disabled,
 *   `→ quality.collect` when enabled (FR-007 AC-7; FR-013 AC-4/AC-5) — both rows exist, and the
 *   gates hold whichever contradicts the persisted selection to be not-in-table for that session.
 * - `complete → quality.collect` is the **only** row out of `complete` (FR-007 AC-8; FR-020
 *   AC-5/AC-9), and `quality.review → complete` closes the re-entry cycle (FR-020 AC-7).
 *
 * Each row names its gate by identifier; the implementations live in `gates/` and are looked up in
 * `evaluate-transition.ts`. A row carries no logic of its own.
 */
export type GateId =
  | 'interview-exit'
  | 'collect'
  | 'approval'
  | 'review-advance'
  | 'backward'
  | 'stage-to-complete'
  | 'tasks-to-complete'
  | 'tasks-to-quality'
  | 'quality-to-complete'
  | 'quality-reentry';

export interface TransitionEdge {
  /** Stable row identifier: `<from>->#<to>` in `positionKey` notation. */
  id: string;
  from: StagePosition;
  to: StagePosition;
  gate: GateId;
}

/** A session's graph: the rows of its methodology, defaulting to the parity one. */
export function transitionTable(methodologyId?: string | null): readonly TransitionEdge[] {
  return transitionTableFor(methodologyId);
}

/**
 * The parity graph — `myspec-greenfield-v1`, the 33 rows this file used to spell out.
 *
 * Kept as a named export because it is what every caller that has no session in hand means: the
 * exhaustive matrix of task 30, the step-pill derivation, the fixtures. It is a *value*, not a
 * default anyone silently falls into — a session's rows always come from that session's methodology.
 */
export const TRANSITION_TABLE: readonly TransitionEdge[] =
  transitionTableFor(DEFAULT_METHODOLOGY_ID);

/** The row for `(from, to)` in a methodology's table, or `undefined` — "illegal transition". */
export function findTransition(
  from: StagePosition,
  to: StagePosition,
  methodologyId?: string | null,
): TransitionEdge | undefined {
  return transitionTable(methodologyId).find(
    (row) => samePosition(row.from, from) && samePosition(row.to, to),
  );
}
