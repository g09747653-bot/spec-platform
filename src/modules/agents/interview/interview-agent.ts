import type { LlmAdapter } from '@/modules/adapters/llm';
import {
  interviewQuestionsPrompt,
  type InterviewQuestionsPromptInput,
} from '@/modules/prompts/assets/interview';
import type { AskingStage } from '@/modules/workflow/model/stages';

import {
  validateQuestionSetDraft,
  type QuestionSet,
  type QuestionSetRepair,
} from '../schemas/question-set';

/**
 * The interview questioner (task 33; FR-005; solution.md — `InterviewAgent`).
 *
 * The agent produces **content** — a question round — and nothing else: whether the round may be
 * asked at all is `roundBudgetGate`'s decision at the calling edge, and whether the stage may
 * advance is the transition table's. The pipeline here is fixed:
 *
 *   model text → JSON → schema validation (repair once, then `DRAFT_INVALID`)
 *              → drop needs already satisfied (FR-005 AC-9) → round, or nothing left to ask.
 *
 * A draft that re-declares a satisfied need is not an error — models repeat themselves — but the
 * re-declared need is removed, a question left with no needs is dropped, and a set left with no
 * questions means the stage has nothing to ask (which the caller treats as collection complete,
 * FR-005 AC-10). An invalid set is never persisted and never rendered (NFR-009 AC-2).
 */
export interface InterviewAgentInput extends Omit<InterviewQuestionsPromptInput, 'stage'> {
  /** Typed here, not in the prompt asset: `prompts` may not import the stage union (A1). */
  stage: AskingStage;
  runId: string;
  signal?: AbortSignal;
}

export type InterviewAgentOutcome =
  | {
      kind: 'round';
      set: QuestionSet;
      declaredNeeds: readonly string[];
      promptId: string;
      repaired: boolean;
    }
  | { kind: 'nothing-to-ask'; promptId: string }
  | { kind: 'draft-invalid'; promptId: string; issues: readonly string[] };

/** Strips an accidental markdown fence and parses JSON; `null` when it is not JSON at all. */
export function parseJsonDocument(text: string): unknown {
  const unfenced = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');

  try {
    return JSON.parse(unfenced) as unknown;
  } catch {
    return null;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The deterministic repair pass (solution.md: "repaired and re-validated once").
 *
 * It fixes exactly the defects a well-meaning draft commonly has — a missing or false
 * `allowOther`, a stage echoed wrong, oversized option or question lists, questions that are not
 * objects at all — and drops what it cannot fix. It invents nothing: no option, question or need
 * is ever added, so the repaired set is always a subset of what the model proposed.
 */
export function repairQuestionSetDraft(expectedStage: string): QuestionSetRepair {
  return (draft) => {
    if (!isRecord(draft)) return draft;

    const questions = Array.isArray(draft.questions) ? draft.questions : [];

    const repairedQuestions = questions
      .filter(isRecord)
      .map((question) => {
        const needs = question.informationNeeds;
        const options: unknown[] = Array.isArray(question.options)
          ? question.options.slice(0, 8)
          : [];

        return { question, needs, options };
      })
      .filter(
        ({ needs, options }) => options.length >= 2 && Array.isArray(needs) && needs.length > 0,
      )
      .slice(0, 5)
      .map(({ question, options }) => ({ ...question, allowOther: true, options }));

    return { ...draft, stage: expectedStage, questions: repairedQuestions };
  };
}

/** Removes satisfied needs; drops questions left with none; `null` when nothing remains to ask. */
function withoutSatisfiedNeeds(set: QuestionSet, satisfied: readonly string[]): QuestionSet | null {
  const satisfiedNames = new Set(satisfied);

  const questions = set.questions
    .map((question) => ({
      ...question,
      informationNeeds: question.informationNeeds.filter((need) => !satisfiedNames.has(need)),
    }))
    .filter((question) => question.informationNeeds.length > 0);

  return questions.length === 0 ? null : { ...set, questions };
}

export function createInterviewAgent(adapter: LlmAdapter) {
  return {
    async draftRound(input: InterviewAgentInput): Promise<InterviewAgentOutcome> {
      const prompt = interviewQuestionsPrompt(input);

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

      // An explicitly empty set is the model saying "nothing further is worth asking" — a valid
      // outcome, not a defect (FR-005 AC-10's proceed branch).
      if (isRecord(draft) && Array.isArray(draft.questions) && draft.questions.length === 0) {
        return { kind: 'nothing-to-ask', promptId: prompt.id };
      }

      const validation = validateQuestionSetDraft(draft, repairQuestionSetDraft(input.stage));
      if (!validation.ok) {
        return { kind: 'draft-invalid', promptId: prompt.id, issues: validation.issues };
      }

      const set = withoutSatisfiedNeeds(validation.set, input.satisfiedNeeds);
      if (set === null) return { kind: 'nothing-to-ask', promptId: prompt.id };

      const declaredNeeds = [
        ...new Set(set.questions.flatMap((question) => question.informationNeeds)),
      ];

      return {
        kind: 'round',
        set,
        declaredNeeds,
        promptId: prompt.id,
        repaired: validation.repaired,
      };
    },
  };
}

export type InterviewAgent = ReturnType<typeof createInterviewAgent>;
