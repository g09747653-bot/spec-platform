import type { LlmAdapter } from '@/modules/adapters/llm';
import type { CoreSpecType } from '@/modules/specs/model/spec-files';

import { selectedFeedback, type ContextSources, type TruncationNote } from '../context-assembler';
import { createSpecAgent, type SpecAgentResult } from '../spec/spec-agent';

/**
 * The RevisionAgent (task 57; FR-010 AC-6/AC-7; solution.md — `agents`).
 *
 * A revision is a regeneration that has read the feedback the user ticked. It deliberately reuses
 * the spec agent rather than owning a prompt of its own: a second generation prompt would be a
 * second place the required section list could be derived, and structural validation would have to
 * be repeated on a path that could drift from the first. One prompt asset, one structural verdict,
 * one place a section rename lands (constitution P3).
 *
 * What this module adds is the **filter**, and the filter is the whole point of the task. The
 * unselected items never reach the prompt: `assembleContext` is handed the review's items together
 * with the ticked ids and includes only their intersection. There is no path through this function
 * that can render an item the user declined, because there is no argument that would express it.
 *
 * `appliedItemIds` is returned so a caller can record what the revision was actually asked to do —
 * the audit answer to "which feedback produced this revision", which is not recoverable from the
 * markdown afterwards.
 */
export interface RevisionAgentInput {
  specType: CoreSpecType;
  /** Everything the revision is grounded in, including the review's items and the selection. */
  sources: ContextSources;
  /**
   * What the user typed on the spec card, when the revision came from there (FR-009 AC-4).
   *
   * The two triggers are different in kind and both are legitimate: a review sends back a *set of
   * findings the user ticked*, the card sends back a *sentence the user wrote*. They compose — a
   * revision may carry either, or both — so the instruction is built from whichever are present.
   */
  instruction?: string;
  /** The session's content language (У-1; task 108); forwarded to the prompt assembly point. */
  contentLanguage?: string | null | undefined;
  runId: string;
  onChunk?: (text: string) => void;
  signal?: AbortSignal;
}

export interface RevisionAgentResult extends SpecAgentResult {
  /** The ids that reached the prompt — the ticked ones, and only those. */
  appliedItemIds: readonly string[];
  /** What the context budget shortened, if anything (task 50 AC-3). */
  truncated: readonly TruncationNote[];
}

/**
 * The directive that accompanies the feedback section.
 *
 * It says "only these" twice over — once by the section containing only the selected items, once in
 * the instruction — because the expensive failure here is a model that helpfully fixes something
 * nobody asked it to fix, and the second statement costs a sentence.
 */
export function reviseInstruction(count: number): string {
  return [
    `The document was returned for changes. Apply exactly the ${String(count)} review`,
    `${count === 1 ? 'point' : 'points'} listed under "Review feedback the user chose to apply"`,
    'and change nothing else. Every required section must still be present, in order.',
  ].join(' ');
}

export function createRevisionAgent(adapter: LlmAdapter) {
  const specAgent = createSpecAgent(adapter);

  return {
    async revise(input: RevisionAgentInput): Promise<RevisionAgentResult> {
      const applied =
        input.sources.feedback === undefined ? [] : selectedFeedback(input.sources.feedback);

      const typed = input.instruction?.trim() ?? '';
      const parts = [
        ...(typed === '' ? [] : [`The user asked for this change:\n${typed}`]),
        ...(applied.length === 0 ? [] : [reviseInstruction(applied.length)]),
      ];

      /*
       * The sources go through unassembled since А-8: the spec agent packs them to the window of the
       * provider that answers. What this module owns is unchanged and is still the whole point — the
       * *filter*: `sources.feedback` carries the items and the ticked ids together, and no argument
       * here can express «render an item the user declined».
       */
      const generated = await specAgent.generate({
        specType: input.specType,
        initialPrompt: input.sources.initialPrompt,
        sources: input.sources,
        ...(parts.length === 0 ? {} : { changeInstruction: parts.join('\n\n') }),
        contentLanguage: input.contentLanguage,
        runId: input.runId,
        onChunk: input.onChunk,
        signal: input.signal,
      });

      return {
        ...generated,
        appliedItemIds: applied.map((item) => item.id),
        truncated: (generated.packing?.sections ?? [])
          .filter((entry) => entry.omittedChars > 0)
          .map((entry) => ({ section: entry.section, omittedChars: entry.omittedChars })),
      };
    },
  };
}

export type RevisionAgent = ReturnType<typeof createRevisionAgent>;
