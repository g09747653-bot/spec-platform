import type { CoreSpecType } from '@/modules/specs/model/spec-files';

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

export function specGenerationPrompt(input: SpecPromptInput): AssembledPrompt {
  return assemblePrompt(
    'spec.generation.v2',
    {
      specType: input.specType,
      initialPrompt: input.initialPrompt,
      context: contextBlock(input.context),
      changeInstruction: changeBlock(input.changeInstruction),
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
      initialPrompt: input.initialPrompt,
      context: contextBlock(input.context),
      changeInstruction: changeBlock(input.changeInstruction),
    },
    { contentLanguage: input.contentLanguage },
  );
}
