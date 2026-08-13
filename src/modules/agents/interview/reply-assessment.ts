import { z } from 'zod';

import type { LlmAdapter } from '@/modules/adapters/llm';
import { replyAssessmentPrompt } from '@/modules/prompts/assets/interview';

import { parseJsonDocument } from './interview-agent';

/**
 * Which declared needs did a free-text reply demonstrably satisfy? (task 36; FR-005 AC-6.)
 *
 * The model proposes; code disposes. The verdict is Zod-parsed and then **intersected with the
 * round's declared needs**, so a hallucinated need name cannot enter the record (NFR-009 AC-2),
 * and any failure — unparseable output, wrong shape — degrades to the conservative answer: the
 * reply satisfied nothing, the needs stay open, the interview asks on. Marking too little costs a
 * narrower follow-up question; marking too much would silently skip a question the user never
 * answered.
 */
const ReplyAssessmentArtifact = z.object({
  satisfiedNeeds: z.array(z.string()),
});

export interface ReplyAssessmentInput {
  reply: string;
  declaredNeeds: readonly string[];
  runId: string;
  signal?: AbortSignal;
}

export function createReplyAssessor(adapter: LlmAdapter) {
  return {
    async assess(input: ReplyAssessmentInput): Promise<readonly string[]> {
      const prompt = replyAssessmentPrompt(input);

      const result = await adapter.generateStreaming({
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user },
        ],
        runId: input.runId,
        signal: input.signal,
      });

      const parsed = ReplyAssessmentArtifact.safeParse(parseJsonDocument(result.text));
      if (!parsed.success) return [];

      const declared = new Set(input.declaredNeeds);
      return [...new Set(parsed.data.satisfiedNeeds.filter((need) => declared.has(need)))];
    },
  };
}

export type ReplyAssessor = ReturnType<typeof createReplyAssessor>;
