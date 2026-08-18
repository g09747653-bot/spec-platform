import { isSpecStage, type Stage, type StagePosition } from '@/modules/workflow/model/stages';
import type { TransitionEdge } from '@/modules/workflow/transition-table';

import { buildTransitionTable, entryPosition } from './graph';
import type { MethodologyConfig } from './model/config';

/**
 * Structural validation of a configuration (task 116).
 *
 * A malformed config is a **build-time error, not a runtime surprise**: `assertMethodologyConfigs()`
 * runs from the same boot guard that asserts the prompt registry (task 41), so a graph with an
 * unreachable stage cannot be deployed and then discovered by a user who cannot leave a stage. Each
 * failure is a named code rather than a sentence, because the test that proves each malformation is
 * caught has to name the one it seeded.
 *
 * What is checked is what a graph can get wrong in a way no other test would notice:
 *
 * - the **terminal is reachable** from the entry, walking forward rows only — a config whose last
 *   stage has no row to `complete` is a session that can never finish;
 * - **no stage is unreachable** — a stage nothing leads to is a step pill the user will never see
 *   lit, which is worse than a missing stage because it looks like progress that stalled;
 * - **backward rows stay inside their stage** — a backward edge across a stage boundary would make
 *   the "backward is unconditional" rule of FR-007 AC-5 a way to walk the graph in reverse past a
 *   gate that has already been satisfied and revoked;
 * - **budgets are positive** — a zero round budget is a stage whose `collect` gate can never be
 *   satisfied, i.e. the dead end the Backlog already records as a hazard;
 * - **steps cover the graph** — a step naming a stage the graph does not visit, or a stage no step
 *   names, is a header that lies about where the session is.
 */
export type MethodologyValidationCode =
  | 'TERMINAL_UNREACHABLE'
  | 'NO_TERMINAL_STAGE'
  | 'UNREACHABLE_STAGE'
  | 'CROSS_STAGE_BACKWARD_EDGE'
  | 'NON_POSITIVE_BUDGET'
  | 'DUPLICATE_STAGE'
  | 'STEP_STAGE_NOT_IN_GRAPH'
  | 'STAGE_WITHOUT_STEP'
  | 'DUPLICATE_FILE_NAME'
  | 'DUPLICATE_SPEC_TYPE';

export interface MethodologyIssue {
  code: MethodologyValidationCode;
  detail: string;
}

export class MethodologyConfigError extends Error {
  readonly issues: readonly MethodologyIssue[];

  constructor(id: string, issues: readonly MethodologyIssue[]) {
    super(
      [
        `Invalid methodology configuration "${id}":`,
        ...issues.map((issue) => `  - ${issue.code}: ${issue.detail}`),
      ].join('\n'),
    );
    this.name = 'MethodologyConfigError';
    this.issues = issues;
  }
}

/** Stages reachable from the entry by forward rows. Backward rows are excluded by gate. */
function reachableStages(config: MethodologyConfig): Set<Stage> {
  const rows = buildTransitionTable(config).filter((row) => row.gate !== 'backward');
  const start = config.stages[0]?.position;
  const seen = new Set<Stage>();

  if (start === undefined) return seen;

  const queue: Stage[] = [start];
  seen.add(start);

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;

    for (const row of rows) {
      if (row.from.stage !== current || seen.has(row.to.stage)) continue;
      seen.add(row.to.stage);
      queue.push(row.to.stage);
    }
  }

  return seen;
}

/**
 * Rules about the rows themselves, checkable against any row list.
 *
 * Separated from the config walk on purpose: the derivation in `graph.ts` cannot currently *produce*
 * a backward row that leaves its stage, so a check reached only through a config would be a check
 * nobody has ever seen fire. Given a row list, it can be seeded directly — which is the difference
 * between an invariant that is enforced and one that is merely asserted.
 */
export function edgeIssues(rows: readonly TransitionEdge[]): MethodologyIssue[] {
  const issues: MethodologyIssue[] = [];

  for (const row of rows) {
    if (row.gate === 'backward' && row.from.stage !== row.to.stage) {
      issues.push({
        code: 'CROSS_STAGE_BACKWARD_EDGE',
        detail: `backward row ${row.id} leaves its stage`,
      });
    }
  }

  return issues;
}

export function methodologyIssues(config: MethodologyConfig): MethodologyIssue[] {
  const issues: MethodologyIssue[] = [];
  const push = (code: MethodologyValidationCode, detail: string) => issues.push({ code, detail });

  const positions = config.stages.map((stage) => stage.position);
  for (const [index, position] of positions.entries()) {
    if (positions.indexOf(position) !== index)
      push('DUPLICATE_STAGE', `stage "${position}" appears twice`);
  }

  const terminal = config.stages.find((stage) => stage.position === 'complete');
  if (terminal === undefined) push('NO_TERMINAL_STAGE', 'the graph has no `complete` stage');

  for (const stage of config.stages) {
    if (stage.roundBudget !== null && stage.roundBudget <= 0) {
      push(
        'NON_POSITIVE_BUDGET',
        `stage "${stage.position}" declares roundBudget ${String(stage.roundBudget)}`,
      );
    }
    if (stage.revisionBudget !== null && stage.revisionBudget <= 0) {
      push(
        'NON_POSITIVE_BUDGET',
        `stage "${stage.position}" declares revisionBudget ${String(stage.revisionBudget)}`,
      );
    }
  }

  const documents = config.stages.flatMap((stage) =>
    stage.document === null ? [] : [stage.document],
  );
  const fileNames = documents.map((document) => document.fileName);
  const specTypes = documents.map((document) => document.specType);

  for (const [index, fileName] of fileNames.entries()) {
    if (fileNames.indexOf(fileName) !== index) {
      push('DUPLICATE_FILE_NAME', `two stages export "${fileName}"`);
    }
  }
  for (const [index, specType] of specTypes.entries()) {
    // The storage slot is unique per project by database constraint (`spec_files` unique on
    // `(project_id, spec_type)`), so two stages sharing one would fail at insert, not at review.
    if (specTypes.indexOf(specType) !== index) {
      push('DUPLICATE_SPEC_TYPE', `two stages store into spec type "${specType}"`);
    }
  }

  issues.push(...edgeIssues(buildTransitionTable(config)));

  const reachable = reachableStages(config);
  for (const stage of config.stages) {
    if (!reachable.has(stage.position)) {
      push('UNREACHABLE_STAGE', `stage "${stage.position}" is not reachable from the entry`);
    }
  }
  if (terminal !== undefined && !reachable.has('complete')) {
    push('TERMINAL_UNREACHABLE', 'no forward path reaches `complete`');
  }

  const graphStages = new Set(positions);
  const stepStages = new Set(config.steps.map((step) => step.stage));

  for (const step of config.steps) {
    if (!graphStages.has(step.stage)) {
      push('STEP_STAGE_NOT_IN_GRAPH', `step "${step.label}" names stage "${step.stage}"`);
    }
  }
  for (const stage of config.stages) {
    if (stage.position !== 'complete' && !stepStages.has(stage.position)) {
      push('STAGE_WITHOUT_STEP', `stage "${stage.position}" has no step`);
    }
  }

  return issues;
}

export function assertMethodologyConfig(config: MethodologyConfig): void {
  const issues = methodologyIssues(config);
  if (issues.length > 0) throw new MethodologyConfigError(config.id, issues);
}

/**
 * The position a step covers — used by the header to light the right pill and by validation to make
 * "steps cover the graph" checkable.
 */
export function stepCoversPosition(
  step: MethodologyConfig['steps'][number],
  stage: string,
  substage: string | null,
): boolean {
  if (step.stage !== stage) return false;
  if (step.substages === null) return true;
  return substage !== null && step.substages.some((candidate) => candidate === substage);
}

/**
 * Which step names a position — the index, not the word (task 143).
 *
 * A step label has two audiences, and that is why the chrome may not simply translate it.
 * `/api/sessions/[id]/generate` puts it into the prompt that writes the document, where it must stay
 * in the content language of the session (У-1); the badge those labels sit beside is pasted into a
 * coding agent by `specs/handoff`. So the configuration keeps its English, and the Russian lives in
 * `web/i18n/dictionary/methodology.ts` keyed by the pair (`config.id`, index).
 *
 * **Keyed by the index and never by the label**, because a label is not unique: «Proposal» names a
 * step in two of the five configurations, «Tasks» in four, and a table keyed by the English word
 * would hand an OpenSpec session the brownfield wording. The index is the one address that is both
 * unique and stable under a rename of the English.
 *
 * The lookup order is `stageNameFor`'s — it *is* `stageNameFor`'s, which is now the English half of
 * this function rather than a second walk of the same steps.
 */
export function stageStepIndexFor(
  config: MethodologyConfig,
  stage: string,
  substage: string | null = null,
): number | null {
  if (substage !== null) {
    const narrowed = config.steps.findIndex(
      (step) => step.substages !== null && stepCoversPosition(step, stage, substage),
    );
    if (narrowed !== -1) return narrowed;
  }

  const whole = config.steps.findIndex((step) => step.stage === stage && step.substages === null);

  return whole === -1 ? null : whole;
}

/**
 * What **this methodology** calls a position, or `null` when its steps do not name it (task 132).
 *
 * D-119 said a configuration declares "how each position is called to the user", and until now only
 * the step pills and the picker read that declaration: the proceed button, the stage chip and every
 * card caption printed the canonical seven, so an OpenSpec session showed a pill reading «Explore»
 * beside a button reading «Proceed to Constitution». One screen, two vocabularies — the red-team
 * finding behind checklist row `1.4-6`.
 *
 * The lookup goes narrowest-first on purpose. A step that covers *part* of a stage is the most
 * specific name the configuration has for that position — Edit's `Describe` is the `collect` of its
 * working stage — so when a substage is supplied it wins. A step covering the whole stage answers
 * everything else. And when the only steps naming a stage are substage-narrowed, the answer is
 * `null` rather than the first of them: a document card in an Edit chat is about the bundle's
 * `constitution.md`, and captioning it «Describe» would name a step that did not write it. The
 * caller then falls back to the canonical label, which is at least true.
 *
 * Since task 143 this is the **English** half: the chrome asks `stageStepIndexFor` and looks the
 * word up in the dictionary, and reaches this only for a configuration the dictionary does not name.
 * The prompt-facing callers, which need the English, still ask here.
 */
export function stageNameFor(
  config: MethodologyConfig,
  stage: string,
  substage: string | null = null,
): string | null {
  const index = stageStepIndexFor(config, stage, substage);

  return index === null ? null : (config.steps[index]?.label ?? null);
}

/** The position a session on this config starts at. */
export function configEntryPosition(config: MethodologyConfig): StagePosition {
  const first = config.stages[0];
  if (first === undefined) throw new Error(`methodology "${config.id}" declares no stages`);
  return entryPosition(first.position);
}

/** True when `stage` is a spec stage this config's graph visits. */
export function visitsSpecStage(config: MethodologyConfig, stage: string): boolean {
  return isSpecStage(stage) && config.stages.some((entry) => entry.position === stage);
}
