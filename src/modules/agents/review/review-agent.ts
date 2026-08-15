import type { LlmAdapter } from '@/modules/adapters/llm';
import { reviewBoardPrompt, type ReviewVerificationItem } from '@/modules/prompts/assets/review';

import { parseJsonDocument } from '../interview/interview-agent';
import {
  flattenReviewItems,
  repairReviewDraft,
  validateReviewDraft,
  type PersistedFeedbackItem,
  type ReviewArtifactValue,
} from '../schemas/review-artifact';

/**
 * The ReviewAgent (task 54, review.v2 by task 111; FR-010 AC-1..AC-3; solution.md — `agents`).
 *
 * It reads one approved revision and reports findings. Like every other agent here it produces
 * **content and nothing else**: it does not decide whether the stage advances (the user's decision
 * does, FR-010 AC-5), and it is not asked to, which is why its vocabulary stops at `pass`/
 * `needs_revision` and never reaches `accept`/`ignore`/`request_changes` (constitution P2).
 *
 * The pipeline is the one round 4 settled for model-produced structure (Р-1; D-94), and it is the
 * same three layers the interview draft goes through:
 *
 *   model text → outermost balanced JSON → schema validation (repair once) → one more full draft
 *              if it is still unusable, then `DRAFT_INVALID` → flat items
 *
 * The three are not interchangeable. `parseJsonDocument` tolerates what *surrounds* the object — a
 * fence, a stray trailing character — and never edits its inside; the repair pass fixes the
 * bookkeeping of a draft that already parsed; and a second full sample is what answers a draft
 * neither could rescue. Until task 111 the review had only the first two, so a single trailing
 * character cost the user a whole board — the exact failure D-94 fixed for the interview and left
 * standing here.
 *
 * Nothing here writes. The caller persists the returned items, and the only shape it can persist is
 * one that has already been through `ReviewArtifact` — which is task 54's first acceptance criterion
 * expressed as a call graph rather than as a convention.
 *
 * It streams nothing: a review is a small JSON artifact the board renders whole, not a document the
 * user watches arrive, so A5 does not apply and there is no `onChunk`.
 */
export interface ReviewAgentInput {
  specType: string;
  /** The approved content under review — the exact bytes the artifact will be keyed to. */
  specContent: string;
  /** The session's content language (У-1; task 108); forwarded to the prompt assembly point. */
  contentLanguage?: string | null | undefined;
  /**
   * The points the user ticked on the previous board, when this is a re-review (task 113).
   *
   * Passed through to the prompt untouched. The filtering happened before this call, and the
   * unticked points are not in this list — see the asset for why they are not carried at all.
   */
  verifying?: readonly ReviewVerificationItem[] | undefined;
  runId: string;
  signal?: AbortSignal;
}

export type ReviewAgentOutcome =
  | {
      kind: 'review';
      artifact: ReviewArtifactValue;
      /** The artifact flattened for storage, blocking items first. */
      items: PersistedFeedbackItem[];
      promptId: string;
      repaired: boolean;
    }
  | { kind: 'draft-invalid'; promptId: string; issues: readonly string[] };

export function createReviewAgent(adapter: LlmAdapter) {
  /** One full review: prompt, model call, parse, validate. */
  async function attemptReview(input: ReviewAgentInput): Promise<ReviewAgentOutcome> {
    const prompt = reviewBoardPrompt({
      specType: input.specType,
      specContent: input.specContent,
      contentLanguage: input.contentLanguage,
      verifying: input.verifying,
    });

    const result = await adapter.generateStreaming({
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      runId: input.runId,
      signal: input.signal,
    });

    const draft = parseJsonDocument(result.text);
    if (draft === null) {
      return {
        kind: 'draft-invalid',
        promptId: prompt.id,
        issues: ['the draft is not parseable JSON'],
      };
    }

    const validation = validateReviewDraft(draft, repairReviewDraft());
    if (!validation.ok) {
      return { kind: 'draft-invalid', promptId: prompt.id, issues: validation.issues };
    }

    return {
      kind: 'review',
      artifact: validation.artifact,
      items: flattenReviewItems(validation.artifact),
      promptId: prompt.id,
      repaired: validation.repaired,
    };
  }

  return {
    /**
     * A review, with **one** automatic second try (Р-1, as task 111 extends it to reviews).
     *
     * Exactly one, for the reason `draftRound` states: a second failure is a signal about the prompt
     * or the model, and a third sample would hide it behind a longer wait — which on the local chain
     * is measured in minutes.
     */
    async review(input: ReviewAgentInput): Promise<ReviewAgentOutcome> {
      const first = await attemptReview(input);
      if (first.kind !== 'draft-invalid') return first;

      // Server-side only, and the reason the retry is not silent: a chain of these in a log is what
      // tells "one bad sample" apart from "this model never gets the contract right" (D-93).
      console.warn('review draft unusable, reviewing once more', {
        specType: input.specType,
        promptId: first.promptId,
        issues: first.issues,
      });

      return attemptReview(input);
    },
  };
}

export type ReviewAgent = ReturnType<typeof createReviewAgent>;
