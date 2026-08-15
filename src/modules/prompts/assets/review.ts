import { assemblePrompt } from '../assemble-prompt';
import type { AssembledPrompt } from '../registry';

/**
 * The review board prompt, as a call on the registry (task 54; v2 by tasks 111/113).
 *
 * The typed doorway to `review.board.v2`, in the shape `spec-generation.ts` established: it turns the
 * agent's input into the asset's variables and does nothing else.
 *
 * `specType` arrives as a plain string. The `prompts` module does not import the spec-type union —
 * the reviewer only names the document in its instruction, and unlike spec generation it derives no
 * section list, so there is nothing here that needs the vocabulary to be closed.
 *
 * `verifying` is the same kind of doorway work: the caller passes the points the user ticked and this
 * renders them, so the shape of that block lives beside the asset that reads it rather than in the
 * agent. An empty list renders an empty string — a first review says nothing about verification, and
 * a sentence explaining that there is nothing to verify would be a sentence about our plumbing.
 */
export const REVIEW_BOARD_PROMPT_ID = 'review.board.v2';

/** One point the previous board carried and the user chose to have applied. */
export interface ReviewVerificationItem {
  sectionPath: string;
  title: string;
  suggestion: string;
}

export interface ReviewPromptInput {
  specType: string;
  /** The approved revision's content, verbatim: the review is about these exact bytes. */
  specContent: string;
  /**
   * The session's content language (У-1; task 108) — an ISO 639-1 code, or `null`/absent when
   * detection could not tell. Forwarded to the single assembly point, never acted on here.
   */
  contentLanguage?: string | null | undefined;
  /**
   * The ticked points of the previous board, when this is a re-review (task 113).
   *
   * Only the ticked ones ever arrive here — the filter is the caller's, and the reason it is not
   * this function's is that a doorway which could be handed everything would eventually be.
   */
  verifying?: readonly ReviewVerificationItem[] | undefined;
}

function verificationBlock(items: readonly ReviewVerificationItem[]): string {
  if (items.length === 0) return '';

  const count = items.length;

  return [
    '',
    `This document has been revised. The revision was asked to apply exactly the ${String(count)}`,
    `${count === 1 ? 'point' : 'points'} below. Say for each whether the new text actually applies`,
    'it, and raise a finding where it does not. Judge the rest of the document as you normally',
    'would: anything the rewrite itself broke is a new finding.',
    '',
    ...items.map((item) => `- ${item.sectionPath} — ${item.title}: ${item.suggestion}`),
  ].join('\n');
}

export function reviewBoardPrompt(input: ReviewPromptInput): AssembledPrompt {
  return assemblePrompt(
    'review.board.v2',
    {
      specType: input.specType,
      specContent: input.specContent,
      verification: verificationBlock(input.verifying ?? []),
    },
    { contentLanguage: input.contentLanguage },
  );
}
