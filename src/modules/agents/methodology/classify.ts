import { z } from 'zod';

import type { LlmAdapter } from '@/modules/adapters/llm';
import {
  methodologiesForChatClass,
  DEFAULT_METHODOLOGY_ID,
  type ChatClass,
} from '@/modules/methodologies';
import { assemblePrompt } from '@/modules/prompts';

import { parseJsonDocument } from '../interview/interview-agent';

/**
 * Auto workflow selection (task 117; Эталон §5.3).
 *
 * **Every failure lands on the default, silently.** Unparseable output, an id that does not exist, a
 * `null`, an exhausted provider chain, a thrown adapter — all of them mean `myspec-greenfield-v1`,
 * and the user is told nothing about it. That is deliberate on two counts. The fallback *is* the
 * right answer: the parity workflow produces the four-file bundle, which is what a user who did not
 * choose a workflow expects. And the vendor's name is not the user's business — Эталон's Auto
 * recommends a workflow, it does not report which model failed to recommend one.
 *
 * One call, one word. The classification is single-shot with no retry: this is a *default* being
 * picked, not a document being written, and a second call to guess better at a choice the user can
 * change in the picker would be spending their latency on our tidiness.
 */
const ClassificationArtifact = z.object({
  id: z.string().nullable(),
});

export interface ClassifyMethodologyInput {
  /** The seed description, in the user's own words. */
  description: string;
  /** Which chat class is being started; only its methodologies are candidates. */
  chatClass?: ChatClass;
  runId: string;
  signal?: AbortSignal;
}

/** The candidate list, rendered from the registry so a new configuration needs no prompt edit. */
function renderOptions(chatClass: ChatClass): string {
  return methodologiesForChatClass(chatClass)
    .map((config) => `- ${config.id}: ${config.summary}`)
    .join('\n');
}

export function createMethodologyClassifier(adapter: LlmAdapter) {
  return {
    async classify(input: ClassifyMethodologyInput): Promise<string> {
      const chatClass: ChatClass = input.chatClass ?? 'generate';
      const candidates = methodologiesForChatClass(chatClass);
      const permitted = new Set(candidates.map((config) => config.id));

      try {
        const prompt = assemblePrompt('methodology.classify.v1', {
          options: renderOptions(chatClass),
          description: input.description,
        });

        const result = await adapter.generateStreaming({
          messages: [
            { role: 'system', content: prompt.system },
            { role: 'user', content: prompt.user },
          ],
          runId: input.runId,
          signal: input.signal,
        });

        const parsed = ClassificationArtifact.safeParse(parseJsonDocument(result.text));
        if (!parsed.success || parsed.data.id === null) return DEFAULT_METHODOLOGY_ID;

        // Intersected with the registry: a model naming a workflow we do not ship is the same event
        // as a model naming none (NFR-009 AC-2).
        return permitted.has(parsed.data.id) ? parsed.data.id : DEFAULT_METHODOLOGY_ID;
      } catch {
        return DEFAULT_METHODOLOGY_ID;
      }
    },
  };
}

export type MethodologyClassifier = ReturnType<typeof createMethodologyClassifier>;
