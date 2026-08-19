import type { z } from 'zod';

import type { LlmAdapter, StructuredOutput } from '@/modules/adapters/llm';
import type { AssembledPrompt } from '@/modules/prompts';
import {
  driverAnswerPrompt,
  driverReviewPrompt,
  type DriverFinding,
  type DriverQuestion,
} from '@/modules/prompts/assets/driver';

import { parseJsonDocument } from '../interview/interview-agent';
import { constrainedOutput } from '../schemas/constrained-output';

import {
  AnswerDraft,
  ReviewSelectionDraft,
  type AnswerDraftValue,
  type ReviewSelectionDraftValue,
} from './driver-draft';

/**
 * The driver's content half (task 145; А-7, А-10).
 *
 * It supplies two things and nothing else: which options to tick on a round that is on screen, and
 * which advisory findings to carry into a rewrite the policy has already decided to ask for. Both
 * are content inside a move `agents/autonomous/policy.ts` chose, which is the whole reason an
 * autonomous driver sits inside constitution P1 rather than beside it.
 *
 * Р-1 in full, the same three layers every machine-read agent here carries: the tolerant parse of
 * `parseJsonDocument`, a schema that validates, and exactly one full re-sample announced by a
 * `console.warn` (D-93/D-94). No repair pass, and for the reason `refinement-agent.ts` gives: there
 * is nothing here whose repair would be honest. A missing rationale is a sentence we would be
 * writing on the model's behalf and attributing to it in the feed, and missing picks are already
 * handled — `resolveAnswers` falls back to the round's own recommendation and *says* it did, which
 * is a better account than a repaired draft that hides the gap.
 *
 * `structuredOutput` on both calls, from the same Zod objects that validate the answer (А-10): on a
 * local provider parseability stops depending on the model's obedience, while the schema layer keeps
 * enforcing what a grammar cannot — that the ids are ids this round actually offered.
 */
const ANSWER_OUTPUT = constrainedOutput('driver_answer', AnswerDraft);
const REVIEW_OUTPUT = constrainedOutput('driver_review_selection', ReviewSelectionDraft);

export interface DriverAnswerInput {
  /** The session's grounding input — the driver's only source of intent. */
  seed: string;
  summary: string | null;
  stage: string;
  questions: readonly DriverQuestion[];
  contentLanguage?: string | null | undefined;
  runId: string;
  signal?: AbortSignal;
}

export interface DriverReviewInput {
  seed: string;
  specType: string;
  blocking: readonly DriverFinding[];
  advisory: readonly DriverFinding[];
  contentLanguage?: string | null | undefined;
  runId: string;
  signal?: AbortSignal;
}

export type DriverOutcome<T> =
  | { kind: 'draft'; draft: T; promptId: string }
  | { kind: 'draft-invalid'; promptId: string; issues: readonly string[] };

export function createDriverAgent(adapter: LlmAdapter) {
  async function attempt<T>(
    prompt: AssembledPrompt,
    structuredOutput: StructuredOutput,
    schema: z.ZodType<T>,
    input: { runId: string; signal?: AbortSignal | undefined },
  ): Promise<DriverOutcome<T>> {
    const result = await adapter.generateStreaming({
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      structuredOutput,
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

    const parsed = schema.safeParse(draft);
    if (!parsed.success) {
      return {
        kind: 'draft-invalid',
        promptId: prompt.id,
        issues: parsed.error.issues.map(
          (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
        ),
      };
    }

    return { kind: 'draft', draft: parsed.data, promptId: prompt.id };
  }

  /**
   * One automatic re-sample, and the warning before it is evidence rather than noise: it is what
   * distinguishes «one bad sample» from «this model cannot hold the contract» in a gate transcript.
   */
  async function withOneResample<T>(
    label: string,
    run: () => Promise<DriverOutcome<T>>,
  ): Promise<DriverOutcome<T>> {
    const first = await run();
    if (first.kind !== 'draft-invalid') return first;

    console.warn(`${label} draft unusable, drafting once more`, {
      promptId: first.promptId,
      issues: first.issues,
    });

    return run();
  }

  return {
    /** Which options to tick on the round on screen. */
    async answerRound(input: DriverAnswerInput): Promise<DriverOutcome<AnswerDraftValue>> {
      const prompt = driverAnswerPrompt({
        seed: input.seed,
        summary: input.summary,
        stage: input.stage,
        questions: input.questions,
        contentLanguage: input.contentLanguage,
      });

      return withOneResample('driver answer', () =>
        attempt<AnswerDraftValue>(prompt, ANSWER_OUTPUT, AnswerDraft, input),
      );
    },

    /** Which advisory findings to carry into the rewrite. */
    async selectFindings(
      input: DriverReviewInput,
    ): Promise<DriverOutcome<ReviewSelectionDraftValue>> {
      const prompt = driverReviewPrompt({
        seed: input.seed,
        specType: input.specType,
        blocking: input.blocking,
        advisory: input.advisory,
        contentLanguage: input.contentLanguage,
      });

      return withOneResample('driver review selection', () =>
        attempt<ReviewSelectionDraftValue>(prompt, REVIEW_OUTPUT, ReviewSelectionDraft, input),
      );
    },
  };
}

export type DriverAgent = ReturnType<typeof createDriverAgent>;
