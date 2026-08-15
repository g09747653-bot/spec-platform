import type { LlmAdapter } from '@/modules/adapters/llm';
import { reviewBoardPrompt } from '@/modules/prompts/assets/review';

import { parseJsonDocument } from '../interview/interview-agent';
import {
  flattenReviewItems,
  repairReviewDraft,
  validateReviewDraft,
  type PersistedFeedbackItem,
  type ReviewArtifactValue,
} from '../schemas/review-artifact';

/**
 * The ReviewAgent (task 54; FR-010 AC-1..AC-3; solution.md — `agents`).
 *
 * It reads one approved revision and reports findings. Like every other agent here it produces
 * **content and nothing else**: it does not decide whether the stage advances (the user's decision
 * does, FR-010 AC-5), and it is not asked to, which is why its vocabulary stops at `pass`/
 * `needs_revision` and never reaches `accept`/`ignore`/`request_changes` (constitution P2).
 *
 * The pipeline is the one task 32 established for model-produced structure:
 *
 *   model text → JSON → schema validation (repair once, then `DRAFT_INVALID`) → flat items
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
  return {
    async review(input: ReviewAgentInput): Promise<ReviewAgentOutcome> {
      const prompt = reviewBoardPrompt({
        specType: input.specType,
        specContent: input.specContent,
        contentLanguage: input.contentLanguage,
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
    },
  };
}

export type ReviewAgent = ReturnType<typeof createReviewAgent>;
