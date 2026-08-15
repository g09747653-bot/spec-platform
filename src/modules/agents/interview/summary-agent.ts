import type { LlmAdapter } from '@/modules/adapters/llm';
import { sessionSummaryPrompt } from '@/modules/prompts/assets/interview';

/**
 * The session summariser (task 38; FR-006 AC-1(c)).
 *
 * The summary is content — the model writes it — but its **existence** is a gate condition, so
 * the contract here is strict about one thing only: a blank result is `null`, never persisted,
 * and the interview exit stays closed. An agent cannot talk its way through the gate; only a
 * persisted, non-blank summary opens it (FR-006 AC-4).
 */
export interface SummaryAgentInput {
  initialPrompt: string;
  answeredHighlights: readonly string[];
  /** The session's content language (У-1; task 108); forwarded to the prompt assembly point. */
  contentLanguage?: string | null | undefined;
  runId: string;
  signal?: AbortSignal;
}

export function createSummaryAgent(adapter: LlmAdapter) {
  return {
    async summarise(input: SummaryAgentInput): Promise<string | null> {
      const prompt = sessionSummaryPrompt(input);

      const result = await adapter.generateStreaming({
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user },
        ],
        runId: input.runId,
        signal: input.signal,
      });

      const summary = result.text.trim();
      return summary === '' ? null : summary;
    },
  };
}

export type SummaryAgent = ReturnType<typeof createSummaryAgent>;
