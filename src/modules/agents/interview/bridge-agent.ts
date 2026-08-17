import type { LlmAdapter } from '@/modules/adapters/llm';
import { interviewBridgePrompt } from '@/modules/prompts/assets/interview';

import type { ContextSources } from '../context-assembler';
import { describePacking, packPrompt } from '../pack-prompt';

/**
 * The analytical bridge between two rounds (task 132; Эталон §1.2, Часть 6 слой 1).
 *
 * The reference product's most distinctive interview move: after a round is answered the
 * interviewer writes a short comment naming where the answers pull against each other and what the
 * next round will therefore probe. The red-team called its absence a **content** gap, and it was
 * right to — everything else about our interview matched, and this is the part that makes the
 * exchange read as someone listening rather than a form advancing.
 *
 * Two properties make it safe to run on every answered round:
 *
 * - **It can decline.** The prompt's answer for "the answers hold together" is the literal
 *   `NOTHING TO FLAG`, which is recognised here and returns `null`. Nothing is persisted, nothing
 *   is rendered, and the interview simply carries on — an invented contradiction between two
 *   compatible answers would be worse than no bridge at all.
 * - **It costs the answers nothing.** The caller runs it after the submission is durable and treats
 *   a failure as no bridge (round 2, Д-6): a paragraph is not worth turning a persisted answer into
 *   a 500.
 *
 * Packed for the provider that will read it (А-8): a bridge carries the same session state a
 * generation does — the product idea, every answer so far — so the same window is the same problem,
 * and it goes through `packPrompt` like every other message rather than hoping it is small enough.
 */
export interface BridgeAgentInput {
  sources: ContextSources;
  /** What the stage still has not established, so the bridge can say what comes next. */
  unmetNeeds: readonly string[];
  /** The session's content language (У-1; task 108). */
  contentLanguage?: string | null | undefined;
  runId: string;
  signal?: AbortSignal;
}

/** The model's way of saying there is nothing worth flagging — the prompt names it verbatim. */
const DECLINED = 'NOTHING TO FLAG';

export function createBridgeAgent(adapter: LlmAdapter) {
  return {
    async write(input: BridgeAgentInput): Promise<string | null> {
      const build = (context: string) => {
        const prompt = interviewBridgePrompt({
          context,
          unmetNeeds: input.unmetNeeds,
          contentLanguage: input.contentLanguage,
        });

        return { system: prompt.system, user: prompt.user };
      };

      const result = await adapter.generateStreaming({
        messages: (target) => {
          const packed = packPrompt({
            build,
            sources: input.sources,
            target,
            label: 'interview-bridge',
          });
          console.info(describePacking(packed.record));
          return packed.messages;
        },
        runId: input.runId,
        signal: input.signal,
      });

      const text = result.text.trim();

      /*
       * A declining answer is recognised by prefix rather than by equality: a model that agrees to
       * the sentinel and then adds a full stop, or wraps it in quotes, has still declined, and
       * persisting «NOTHING TO FLAG.» as a turn of the conversation would be absurd.
       */
      if (text === '' || text.toUpperCase().startsWith(DECLINED)) return null;

      return text;
    },
  };
}

export type BridgeAgent = ReturnType<typeof createBridgeAgent>;
