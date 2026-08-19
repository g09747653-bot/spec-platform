import { methodologyConfig, stageStepIndexFor } from '@/modules/methodologies';
import { isStage, STAGES, type Stage } from '@/modules/workflow/model/stages';

import { stagePhraseKey } from '../i18n/dictionary/methodology';
import { type PhraseKey } from '../i18n/dictionary';
import { type Translate } from '../i18n/translate';

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
 *
 * Since task 143 the map holds keys rather than words: the words are in
 * `i18n/dictionary/methodology.ts`, in both languages, beside the per-methodology names they are the
 * fallback for. Keeping the two halves of one decision in one file is what stops «Архитектура» on a
 * pill from meeting «Solution» on the card below it.
 */
const LABELS: Record<Stage, PhraseKey> = {
  interview: 'session.stage.canonical.interview',
  constitution: 'session.stage.canonical.constitution',
  requirements: 'session.stage.canonical.requirements',
  solution: 'session.stage.canonical.solution',
  tasks: 'session.stage.canonical.tasks',
  quality: 'session.stage.canonical.quality',
  complete: 'session.stage.canonical.complete',
};

/** A stage read from a column that no longer names anything this build ships. */
const UNKNOWN_STAGE: PhraseKey = 'session.stage.canonical.unknown';

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
 * still reads; every caller in the product passes it, and `stageStepIndexFor` returns `null` wherever
 * the configuration does not name the position, which is what makes the canonical map a fallback
 * rather than a competitor.
 *
 * **`t` is required and comes first** (task 143). It could have been optional, defaulting to English,
 * and that is exactly the arrangement this task exists to prevent: a caller that forgot it would go
 * on rendering an English pill inside a Russian header, and nothing would say so. Required, a
 * forgotten caller is a type error.
 *
 * The three answers, in order: the dictionary's word for this methodology's step; failing that the
 * configuration's own English label, which is at least true of a workflow this build ships without a
 * translation; failing that the canonical name of the position.
 */
export function stageLabel(
  t: Translate,
  stage: string,
  methodologyId?: string | null,
  substage: string | null = null,
): string {
  const config =
    methodologyId === undefined || methodologyId === null ? null : methodologyConfig(methodologyId);
  const index = config === null ? null : stageStepIndexFor(config, stage, substage);

  if (config !== null && index !== null) {
    const key = stagePhraseKey(config.id, index);
    if (key !== null) return t(key);

    const step = config.steps[index];
    if (step !== undefined) return step.label;
  }

  return t(isStage(stage) ? LABELS[stage] : UNKNOWN_STAGE);
}
