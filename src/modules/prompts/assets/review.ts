import { assemblePrompt } from '../assemble-prompt';
import type { AssembledPrompt } from '../registry';

/**
 * The review board prompt, as a call on the registry (task 54).
 *
 * The typed doorway to `review.board.v1`, in the shape `spec-generation.ts` established: it turns the
 * agent's input into the asset's variables and does nothing else.
 *
 * `specType` arrives as a plain string. The `prompts` module does not import the spec-type union —
 * the reviewer only names the document in its instruction, and unlike spec generation it derives no
 * section list, so there is nothing here that needs the vocabulary to be closed.
 */
export const REVIEW_BOARD_PROMPT_ID = 'review.board.v1';

export interface ReviewPromptInput {
  specType: string;
  /** The approved revision's content, verbatim: the review is about these exact bytes. */
  specContent: string;
}

export function reviewBoardPrompt(input: ReviewPromptInput): AssembledPrompt {
  return assemblePrompt('review.board.v1', {
    specType: input.specType,
    specContent: input.specContent,
  });
}
