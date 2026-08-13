import { z } from 'zod';

import type { LlmAdapter } from '@/modules/adapters/llm';
import { assemblePrompt } from '@/modules/prompts';

import { parseJsonDocument } from '../interview/interview-agent';

/**
 * The refinement agent (task 59; FR-011 AC-1/AC-9).
 *
 * It answers a plain-language instruction with either the whole revised document or **one question**
 * — and the question is the interesting branch. FR-011 AC-9 makes ambiguity a first-class outcome
 * rather than an error: "make the scope tighter" against a document with three scope-ish sections is
 * not a failed request, it is an under-specified one, and guessing which section to rewrite produces
 * a diff the user has to read carefully to catch. Asking costs one round trip.
 *
 * Whether the proposal is *admissible* — does it delete a required section, is one already pending —
 * is not decided here. That is `ProposedChangeService`, on the other side of a module boundary, and
 * deliberately: computing a candidate and judging it are different jobs with different failure modes.
 */
const RefinementResult = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('proposal'), content: z.string().min(1) }),
  z.object({ kind: z.literal('clarification'), question: z.string().min(1) }),
]);

export interface RefinementAgentInput {
  specType: string;
  /** The current revision's content — what the instruction is about. */
  specContent: string;
  instruction: string;
  runId: string;
  signal?: AbortSignal;
}

export type RefinementOutcome =
  | { kind: 'proposal'; content: string; promptId: string }
  | { kind: 'clarification'; question: string; promptId: string }
  /** The model produced something that is not a usable answer of either shape. */
  | { kind: 'draft-invalid'; promptId: string; issues: readonly string[] };

export function createRefinementAgent(adapter: LlmAdapter) {
  return {
    async propose(input: RefinementAgentInput): Promise<RefinementOutcome> {
      const prompt = assemblePrompt('refinement.propose.v1', {
        specType: input.specType,
        specContent: input.specContent,
        instruction: input.instruction,
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

      const parsed = RefinementResult.safeParse(draft);
      if (!parsed.success) {
        return {
          kind: 'draft-invalid',
          promptId: prompt.id,
          issues: parsed.error.issues.map(
            (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
          ),
        };
      }

      /*
       * No repair pass, unlike the review and question-set agents.
       *
       * There is nothing here whose repair would be honest: the two fields are a whole document and
       * a whole question, and inventing either is inventing the answer. An unusable draft is an
       * unusable draft, and the user retries — which costs them a click and costs the document
       * nothing.
       */
      return parsed.data.kind === 'proposal'
        ? { kind: 'proposal', content: parsed.data.content, promptId: prompt.id }
        : { kind: 'clarification', question: parsed.data.question, promptId: prompt.id };
    },
  };
}

export type RefinementAgent = ReturnType<typeof createRefinementAgent>;
