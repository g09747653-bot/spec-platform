import { methodologyConfig, stageNameFor } from '@/modules/methodologies';
import { isStage, STAGES, type Stage } from '@/modules/workflow/model/stages';

/**
 * How stages are named to the user (FR-002 AC-1; FR-007 AC-9).
 *
 * The vocabulary itself is imported from `workflow`, which owns it; only the wording lives here. A
 * stage added to the model without a label is a type error, so the two cannot drift.
 *
 * These are the **canonical** seven, and they are the fallback rather than the answer (task 132).
 * A session runs a methodology, and the methodology declares what each position is called (D-119):
 * the third position is «Specify» under SpecKit and «Requirements» under ours, and printing the
 * canonical name beside a step pill that says otherwise is the two-vocabulary defect of checklist
 * row `1.4-6`. So every surface that names a position calls `stageLabel` **with the session's
 * methodology**, and the map below answers only where the configuration is silent.
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
 * Labels a stage read from the database, in the vocabulary of the session's methodology.
 *
 * The value arrives as a string — a CHECK constraint keeps it inside the vocabulary, but the
 * repository does not import `workflow` (see `ProjectSummary`), so narrowing happens here, at the
 * boundary where it is rendered.
 *
 * `methodologyId` is optional so that a surface with no session behind it — nothing has one today —
 * still reads; every caller in the product passes it, and `stageNameFor` returns `null` wherever
 * the configuration does not name the position, which is what makes the canonical map a fallback
 * rather than a competitor.
 */
export function stageLabel(
  stage: string,
  methodologyId?: string | null,
  substage: string | null = null,
): string {
  const named =
    methodologyId === undefined || methodologyId === null
      ? null
      : stageNameFor(methodologyConfig(methodologyId), stage, substage);

  if (named !== null) return named;

  return isStage(stage) ? LABELS[stage] : 'Unknown stage';
}
