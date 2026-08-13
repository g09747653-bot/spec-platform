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
}

export function specGenerationPrompt(input: SpecPromptInput): AssembledPrompt {
  const context = input.context?.trim() ?? '';
  const changeInstruction = input.changeInstruction?.trim() ?? '';

  return assemblePrompt('spec.generation.v2', {
    specType: input.specType,
    initialPrompt: input.initialPrompt,
    context: context === '' ? '' : `\nContext gathered so far:\n${context}`,
    changeInstruction:
      changeInstruction === ''
        ? ''
        : `\nThe previous draft was returned for changes. Apply this instruction:\n${changeInstruction}`,
  });
}
