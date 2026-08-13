import { positionKey, samePosition, type StagePosition } from './model/stages';

/**
 * The explicit transition table (task 24; constitution A2, P1; D-1).
 *
 * Every legal movement of the workflow is one row here — a plain exported array that tests
 * enumerate programmatically (NFR-012 AC-3). A transition absent from this table is illegal by
 * definition and is rejected with `TRANSITION_NOT_IN_TABLE` (or `SESSION_SEALED` when attempted
 * out of `complete`); no code path can advance a session along an edge this file does not name.
 *
 * Rows are written out literally, not generated: the table is the artifact the requirements are
 * checked against, and a reviewer verifying it against FR-007/FR-020 should read rows, not unroll
 * a loop. The shape mirrors `.specs/requirements.md`:
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

/** Row constructor: the id is derived from the endpoints so it cannot drift from them. */
function edge(from: StagePosition, to: StagePosition, gate: GateId): TransitionEdge {
  return { id: `${positionKey(from)}->${positionKey(to)}`, from, to, gate };
}

const interview: StagePosition = { stage: 'interview', substage: null };
const complete: StagePosition = { stage: 'complete', substage: null };

const constitutionCollect: StagePosition = { stage: 'constitution', substage: 'collect' };
const constitutionGenerate: StagePosition = { stage: 'constitution', substage: 'generate' };
const constitutionReview: StagePosition = { stage: 'constitution', substage: 'review' };

const requirementsCollect: StagePosition = { stage: 'requirements', substage: 'collect' };
const requirementsGenerate: StagePosition = { stage: 'requirements', substage: 'generate' };
const requirementsReview: StagePosition = { stage: 'requirements', substage: 'review' };

const solutionCollect: StagePosition = { stage: 'solution', substage: 'collect' };
const solutionGenerate: StagePosition = { stage: 'solution', substage: 'generate' };
const solutionReview: StagePosition = { stage: 'solution', substage: 'review' };

const tasksCollect: StagePosition = { stage: 'tasks', substage: 'collect' };
const tasksGenerate: StagePosition = { stage: 'tasks', substage: 'generate' };
const tasksReview: StagePosition = { stage: 'tasks', substage: 'review' };

const qualityCollect: StagePosition = { stage: 'quality', substage: 'collect' };
const qualityGenerate: StagePosition = { stage: 'quality', substage: 'generate' };
const qualityReview: StagePosition = { stage: 'quality', substage: 'review' };

export const TRANSITION_TABLE: readonly TransitionEdge[] = [
  // ————— Interview exit (FR-006; constitution A2) —————
  edge(interview, constitutionCollect, 'interview-exit'),

  // ————— constitution: collect → generate → review, backward free (FR-007 AC-2/AC-3/AC-5) —————
  edge(constitutionCollect, constitutionGenerate, 'collect'),
  edge(constitutionGenerate, constitutionReview, 'approval'),
  edge(constitutionGenerate, constitutionCollect, 'backward'),
  edge(constitutionReview, constitutionGenerate, 'backward'),
  edge(constitutionReview, constitutionCollect, 'backward'),

  // ————— constitution → requirements (FR-007 AC-4) —————
  edge(constitutionReview, requirementsCollect, 'review-advance'),

  // ————— requirements —————
  edge(requirementsCollect, requirementsGenerate, 'collect'),
  edge(requirementsGenerate, requirementsReview, 'approval'),
  edge(requirementsGenerate, requirementsCollect, 'backward'),
  edge(requirementsReview, requirementsGenerate, 'backward'),
  edge(requirementsReview, requirementsCollect, 'backward'),

  // ————— requirements → solution —————
  edge(requirementsReview, solutionCollect, 'review-advance'),

  // ————— solution —————
  edge(solutionCollect, solutionGenerate, 'collect'),
  edge(solutionGenerate, solutionReview, 'approval'),
  edge(solutionGenerate, solutionCollect, 'backward'),
  edge(solutionReview, solutionGenerate, 'backward'),
  edge(solutionReview, solutionCollect, 'backward'),

  // ————— solution → tasks —————
  edge(solutionReview, tasksCollect, 'review-advance'),

  // ————— tasks —————
  edge(tasksCollect, tasksGenerate, 'collect'),
  edge(tasksGenerate, tasksReview, 'approval'),
  edge(tasksGenerate, tasksCollect, 'backward'),
  edge(tasksReview, tasksGenerate, 'backward'),
  edge(tasksReview, tasksCollect, 'backward'),

  // ————— tasks exit: the Quality fork (FR-007 AC-7; FR-013 AC-4/AC-5; FR-020 AC-1/AC-2) —————
  edge(tasksReview, complete, 'tasks-to-complete'),
  edge(tasksReview, qualityCollect, 'tasks-to-quality'),

  // ————— quality (FR-020 AC-6: same substage gates as any other stage) —————
  edge(qualityCollect, qualityGenerate, 'collect'),
  edge(qualityGenerate, qualityReview, 'approval'),
  edge(qualityGenerate, qualityCollect, 'backward'),
  edge(qualityReview, qualityGenerate, 'backward'),
  edge(qualityReview, qualityCollect, 'backward'),

  // ————— quality exit and re-entry (FR-020 AC-5/AC-7/AC-9) —————
  edge(qualityReview, complete, 'quality-to-complete'),
  edge(complete, qualityCollect, 'quality-reentry'),
];

/** The row for `(from, to)`, or `undefined` — which is what "illegal transition" means. */
export function findTransition(from: StagePosition, to: StagePosition): TransitionEdge | undefined {
  return TRANSITION_TABLE.find((row) => samePosition(row.from, from) && samePosition(row.to, to));
}
