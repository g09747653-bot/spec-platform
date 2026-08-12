import type { SpecType } from '@/modules/specs/model/spec-files';

/**
 * Prompt asset for spec generation (constitution — Coding Standards: prompts are assets, referenced by
 * identifier, never string literals in logic).
 *
 * This is the walking skeleton's version: it states the task and hands over the grounding input. It
 * does **not** derive required sections — that is `assemblePrompt`'s job once the section schema exists
 * (tasks 39–41), and inventing a heading list here would duplicate structural truth, which P3 forbids.
 *
 * The identifier carries a version, so a prompt change is visible in a diff and in a revision's history
 * rather than being an anonymous edit.
 */
export const SPEC_GENERATION_PROMPT_ID = 'spec.generation.skeleton.v1';

export interface SpecPromptInput {
  specType: SpecType;
  /** The session's grounding input, verbatim (FR-003 AC-3). */
  initialPrompt: string;
  /** What the user asked to change, when this is a re-generation (FR-009 AC-4). */
  changeInstruction?: string;
}

export interface AssembledPrompt {
  id: string;
  system: string;
  user: string;
}

export function specGenerationPrompt(input: SpecPromptInput): AssembledPrompt {
  const system = [
    'You are writing one file of a software specification bundle.',
    'Write GitHub-flavoured Markdown. Return the document only, with no preamble and no code fence',
    'around the whole file.',
  ].join(' ');

  const sections = [
    `Write the ${input.specType} document for the following product idea.`,
    '',
    'Product idea:',
    input.initialPrompt,
  ];

  if (input.changeInstruction !== undefined && input.changeInstruction.trim() !== '') {
    sections.push(
      '',
      'The previous draft was returned for changes. Apply this instruction:',
      input.changeInstruction.trim(),
    );
  }

  return { id: SPEC_GENERATION_PROMPT_ID, system, user: sections.join('\n') };
}
