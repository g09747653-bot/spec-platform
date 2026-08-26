import type { CoreSpecType, SpecType } from '@/modules/specs/model/spec-files';
import {
  CANONICAL_TASK_RECORD,
  DEPENDENCY_LABELS,
  METHODOLOGY_DEPENDENCY_RECORD,
  NO_DEPENDENCIES_MARK,
} from '@/modules/specs/model/task-notation';

import { assemblePrompt } from '../assemble-prompt';
import type { AssembledPrompt } from '../registry';

/**
 * Spec generation, as a call on the registry (task 41).
 *
 * The prompt *text* lives in `registry.ts` as a versioned asset; this file is the typed doorway to
 * it — it turns an agent's input into the asset's variables and nothing more. Optional inputs are
 * rendered here into the block the template expects, because a template with a conditional in it is
 * a small programming language, and prompts are assets rather than programs.
 *
 * The required section list is deliberately absent: `assemblePrompt` derives it from the section
 * schema (constitution P3), and restating it here would be the duplication lint now rejects.
 */
export const SPEC_GENERATION_PROMPT_ID = 'spec.generation.v2';

export interface SpecPromptInput {
  specType: CoreSpecType;
  /** The session's grounding input, verbatim (FR-003 AC-3). */
  initialPrompt: string;
  /** Assembled context: prior answers, attachment text, approved specs (task 50; FR-008 AC-6). */
  context?: string;
  /** What the user asked to change, when this is a re-generation (FR-009 AC-4). */
  changeInstruction?: string;
  /**
   * The session's content language (У-1; task 108) — an ISO 639-1 code, or `null`/absent when
   * detection could not tell. Forwarded to the single assembly point, never acted on here.
   */
  contentLanguage?: string | null | undefined;
}

function contextBlock(context: string | undefined): string {
  const trimmed = context?.trim() ?? '';
  return trimmed === '' ? '' : `\nContext gathered so far:\n${trimmed}`;
}

function changeBlock(instruction: string | undefined): string {
  const trimmed = instruction?.trim() ?? '';
  return trimmed === ''
    ? ''
    : `\nThe previous draft was returned for changes. Apply this instruction:\n${trimmed}`;
}

/**
 * How the tasks document records a task, rendered from the notation the exporter parses (task 169).
 *
 * Written here rather than in the asset for the same reason `requiredSections` is derived: the
 * canonical form and the dependency labels live in `specs/model/task-notation.ts`, and a second
 * copy of them in a prompt file is the drift that ends with a bundle nobody can read. The example
 * lines below are quoted from that module verbatim, and its own test runs each of them through the
 * mapping — so a form this prompt teaches is by construction a form the export reads.
 *
 * **An instruction, never a rejection.** Structural validation is untouched: a document that ignores
 * this still generates, still passes review and still exports (task 169 AC-3). What it buys is a
 * document that *states* its dependencies — the M14а gate produced sixteen honest tasks whose
 * `dependsOn` were all empty, because the document named no dependencies anywhere, and a planner
 * given that bundle is blind to order.
 */
function documentRulesBlock(specType: CoreSpecType): string {
  if (specType !== 'tasks') return '';

  return [
    '',
    'Record every task as a markdown task-list item carrying its own identifier, like this:',
    '',
    `    ${CANONICAL_TASK_RECORD.entry}`,
    '',
    'Number the tasks from 1 upwards across the whole document, and never reuse an identifier.',
    'Beneath each task, on a line of its own, state which tasks it waits for, by identifier:',
    '',
    `    ${CANONICAL_TASK_RECORD.dependencies}`,
    '',
    `A task that waits for nothing states that too, with ${NO_DEPENDENCIES_MARK}:`,
    '',
    `    ${CANONICAL_TASK_RECORD.noDependencies}`,
    '',
    `Write the label in the language of the document — "${DEPENDENCY_LABELS.join('" or "')}" — and`,
    'name only task identifiers after it, never requirement identifiers or prose. Dependencies are',
    'what makes the plan executable in the right order, so state them for every task, including the',
    'ones that have none.',
  ].join('\n');
}

/**
 * The dependency rules for a **methodology's** plan document (А-52).
 *
 * The other half of «the generator always writes explicit dependencies». The parity block above
 * closed this for the parity path at task 169; the methodology path stayed silent, and the live
 * Программа-А plan is what that silence produces — 7 inline clauses across 41 tasks, 34 exported
 * with an empty `dependsOn`, and a scheduler honestly starting T019 alongside T001.
 *
 * A methodology's task *entry* is its template's own — lettered checkboxes for speckit — so unlike
 * the parity block this one prescribes no entry form. It prescribes the **clause**: every task
 * states what it waits for, in one of the two forms the export already reads (D-316), and «waits
 * for nothing» is stated with the mark rather than left out. The example lines are quoted from
 * `task-notation.ts` and run through the mapping by a unit test, exactly as the canonical record is.
 */
function methodologyDependencyRulesBlock(specType: SpecType | undefined): string {
  if (specType !== 'tasks') return '';

  return [
    '',
    'Whatever entry form the template uses for its tasks, every task must state which tasks it',
    'waits for, by their identifiers. Either keep the dependency clause inline on the entry line,',
    'the way the template writes it:',
    '',
    `    ${METHODOLOGY_DEPENDENCY_RECORD.inline}`,
    '',
    'or state it on a line of its own beneath the entry:',
    '',
    `    ${METHODOLOGY_DEPENDENCY_RECORD.entry}`,
    `      ${METHODOLOGY_DEPENDENCY_RECORD.dependencies}`,
    '',
    `A task that waits for nothing states that too, with ${NO_DEPENDENCIES_MARK}:`,
    '',
    `      ${METHODOLOGY_DEPENDENCY_RECORD.noDependencies}`,
    '',
    `Write the label in the language of the document — "${DEPENDENCY_LABELS.join('" or "')}" — and`,
    'name only task identifiers after it, never requirement identifiers or prose. Dependencies are',
    'what makes the plan executable in the right order, so state them for every task, including the',
    'ones that have none: «depends on nothing» is a statement, not a default.',
  ].join('\n');
}

export function specGenerationPrompt(input: SpecPromptInput): AssembledPrompt {
  return assemblePrompt(
    'spec.generation.v2',
    {
      specType: input.specType,
      initialPrompt: input.initialPrompt,
      context: contextBlock(input.context),
      changeInstruction: changeBlock(input.changeInstruction),
      documentRules: documentRulesBlock(input.specType),
    },
    { contentLanguage: input.contentLanguage },
  );
}

/**
 * Generation under a methodology whose document is not the parity baseline (task 116).
 *
 * **This is the only place a vendored template reaches a model.** The templates live as data in the
 * `methodologies` module; nothing there talks to an adapter, and no agent holds template text of its
 * own. The route is one function, and У-1 applies to it exactly as to every other prompt because it
 * goes through `assemblePrompt` — the language instruction is added at the single assembly point,
 * not per methodology.
 *
 * The section list arrives already rendered, for the reason the asset states: a foreign
 * methodology's headings are its template's, and the derived list of `assemblePrompt` is the parity
 * baseline's. An empty list renders as an empty block, and the template carries the shape alone.
 */
export const METHODOLOGY_GENERATION_PROMPT_ID = 'spec.generation.methodology.v1';

export interface MethodologyPromptInput {
  /** The document as the methodology names it: «Plan», «Proposal», «Specs». */
  documentLabel: string;
  /**
   * The spec type this document stores into (А-52) — what decides whether the dependency rules
   * apply. Absent means «not a plan», which every caller written before this input existed means.
   */
  specType?: SpecType;
  /** The template, verbatim. */
  template: string;
  /** Required headings in required order, or an empty list when the template prescribes none. */
  requiredSections: readonly { level: number; heading: string }[];
  initialPrompt: string;
  context?: string;
  changeInstruction?: string;
  contentLanguage?: string | null | undefined;
}

export function methodologyGenerationPrompt(input: MethodologyPromptInput): AssembledPrompt {
  const sections =
    input.requiredSections.length === 0
      ? ''
      : [
          '',
          'Whatever else you write, these sections must be present, spelled exactly as written, at',
          'this heading level and in this order:',
          '',
          ...input.requiredSections.map(
            (section, index) =>
              `${String(index + 1)}. ${'#'.repeat(section.level)} ${section.heading}`,
          ),
        ].join('\n');

  return assemblePrompt(
    'spec.generation.methodology.v1',
    {
      documentLabel: input.documentLabel,
      template: input.template,
      requiredSections: sections,
      documentRules: methodologyDependencyRulesBlock(input.specType),
      initialPrompt: input.initialPrompt,
      context: contextBlock(input.context),
      changeInstruction: changeBlock(input.changeInstruction),
    },
    { contentLanguage: input.contentLanguage },
  );
}
