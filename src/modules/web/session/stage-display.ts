import { isStage, STAGES, type Stage } from '@/modules/workflow/model/stages';

/**
 * How stages are named to the user (FR-002 AC-1; FR-007 AC-9).
 *
 * The vocabulary itself is imported from `workflow`, which owns it; only the wording lives here. A
 * stage added to the model without a label is a type error, so the two cannot drift.
 */
const LABELS: Record<Stage, string> = {
  interview: 'Interview',
  constitution: 'Constitution',
  requirements: 'Requirements',
  solution: 'Solution',
  tasks: 'Tasks',
  quality: 'Quality',
  complete: 'Complete',
};

/** The forward order the rail renders. `quality` is optional and is filtered by the caller. */
export const ORDERED_STAGES = STAGES;

/**
 * Labels a stage read from the database.
 *
 * The value arrives as a string — a CHECK constraint keeps it inside the vocabulary, but the
 * repository does not import `workflow` (see `ProjectSummary`), so narrowing happens here, at the
 * boundary where it is rendered.
 */
export function stageLabel(stage: string): string {
  return isStage(stage) ? LABELS[stage] : 'Unknown stage';
}
