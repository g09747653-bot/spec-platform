import type { LlmAdapter } from '@/modules/adapters/llm';
import {
  interviewQuestionsPrompt,
  type InterviewQuestionsPromptInput,
} from '@/modules/prompts/assets/interview';
import type { AskingStage } from '@/modules/workflow/model/stages';

import { constrainedOutput } from '../schemas/constrained-output';
import {
  OPTION_LOGO_SLUGS,
  OPTION_NOTE,
  OPTIONS_PER_QUESTION,
  QUESTIONS_PER_ROUND,
  QuestionSetSchema,
  validateQuestionSetDraft,
  type QuestionSet,
  type QuestionSetRepair,
} from '../schemas/question-set';

/** A round's shape, stated to a runtime that can be constrained to it (А-10; task 131). */
const QUESTION_SET_OUTPUT = constrainedOutput('question_set', QuestionSetSchema);

/**
 * The interview questioner (task 33; FR-005; solution.md — `InterviewAgent`).
 *
 * The agent produces **content** — a question round — and nothing else: whether the round may be
 * asked at all is `roundBudgetGate`'s decision at the calling edge, and whether the stage may
 * advance is the transition table's. The pipeline here is fixed:
 *
 *   model text → JSON → schema validation (repair once) → draft once more if it is still
 *              unusable, then `DRAFT_INVALID` → drop needs already satisfied (FR-005 AC-9)
 *              → round, or nothing left to ask.
 *
 * Three distinct layers, and they are not interchangeable (round 4, Р-1; D-94). `parseJsonDocument`
 * tolerates what surrounds the object (a fence, a stray trailing character); the M2 repair pass fixes
 * the *structure* of a draft that already parsed; and a second full draft is what answers a sample
 * that neither could rescue. None of them edits the inside of a document a model wrote.
 *
 * A draft that re-declares a satisfied need is not an error — models repeat themselves — but the
 * re-declared need is removed, a question left with no needs is dropped, and a set left with no
 * questions means the stage has nothing to ask (which the caller treats as collection complete,
 * FR-005 AC-10). An invalid set is never persisted and never rendered (NFR-009 AC-2).
 */
export interface InterviewAgentInput extends Omit<
  InterviewQuestionsPromptInput,
  'stage' | 'questionsPerRound' | 'optionsPerQuestion' | 'optionNote' | 'logoSlugs'
> {
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

/**
 * The span of the outermost balanced JSON object, or `null` if the text never balances.
 *
 * Depth counting, with strings honoured — a `}` inside a quoted value closes nothing, and a `\"`
 * inside a string does not end it. Anything before the opening brace and after its match is outside
 * the object and is not this function's business.
 */
function outermostObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const character = text[index];

    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }

    if (character === '"') inString = true;
    else if (character === '{') depth += 1;
    else if (character === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }

  return null;
}

/**
 * Strips an accidental markdown fence and parses JSON; `null` when it is not JSON at all.
 *
 * **Tolerant of what surrounds the object, never of what is inside it (round 4, Р-1).** A local model
 * ends about a quarter of its interview drafts with one character too many — `…}]}"` and `…}]}.` were
 * both observed live — and a whole round of questions was being thrown away over a stray quote. So the
 * outermost balanced object is extracted and the tail after its closing brace is discarded.
 *
 * The line is drawn deliberately: this repairs *nothing* within the object. A draft with a broken
 * bracket inside an array stays invalid and takes the `DRAFT_INVALID` path, because guessing where a
 * missing bracket belongs is inventing content, and the schema layer above exists to reject invention.
 *
 * Well-formed text takes the first branch untouched, so the tolerance costs nothing when it is not
 * needed and cannot change how a valid draft is read.
 */
export function parseJsonDocument(text: string): unknown {
  const unfenced = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');

  try {
    return JSON.parse(unfenced) as unknown;
  } catch {
    const object = outermostObject(unfenced);
    if (object === null) return null;

    try {
      return JSON.parse(object) as unknown;
    } catch {
      return null;
    }
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The deterministic repair pass (solution.md: "repaired and re-validated once").
 *
 * It fixes exactly the defects a well-meaning draft commonly has — a missing or false
 * `allowOther`, a stage echoed wrong, oversized option or question lists, questions that are not
 * objects at all, **more than one option marked as recommended** — and drops what it cannot fix. It
 * invents nothing: no option, question or need is ever added, so the repaired set is always a subset
 * of what the model proposed.
 *
 * The recommendation rule joined the list in M9п round 4, and the walk is why. `qwen3:14b` marks
 * three or four options `(Recommended)` about as often as it marks one, and the schema allows one
 * (v3) — so a draft that was otherwise perfectly good was discarded, re-sampled at four and a half
 * minutes a go, discarded again for the same reason, and the stage could not leave `collect`. There
 * is nothing to re-sample *for*: keeping the first flag and clearing the rest removes a marker, which
 * is repair in exactly the sense this function already means it, and it costs no model call.
 *
 * The reference note of task 144 asks nothing of this function, and that is worth saying out loud. A
 * hallucinated link, an unknown logo slug or a note three paragraphs long is dropped **by the schema**,
 * field by field, so none of them ever reaches a repair: a guess costs its own chip, never the round
 * (the compatibility contract of D-188). What the fields need from here is only that they survive a
 * repair made for another reason — every option travels through the spreads below whole, and the two
 * places that rebuild one copy the rest of it.
 */
/**
 * Keeps the first recommendation and clears the rest — the model's own first choice, not ours.
 *
 * First rather than best, because "best" would be a judgement this function has no business making;
 * the order is the model's and it put that option first among the ones it liked. A draft that marked
 * none is left exactly as it is: no recommendation is a legitimate answer, and inventing one here
 * would be inventing content.
 *
 * It reports how many flags it cleared, because the count is the only thing that distinguishes
 * «the repair worked» from «the model complied» after the fact — see the log line below.
 */
export function atMostOneRecommended(options: readonly unknown[]): {
  options: unknown[];
  cleared: number;
} {
  let kept = false;
  let cleared = 0;

  const repaired = options.map((option) => {
    if (!isRecord(option) || option.recommended !== true) return option;
    if (!kept) {
      kept = true;
      return option;
    }

    cleared += 1;
    return { ...option, recommended: false };
  });

  return { options: repaired, cleared };
}

export function repairQuestionSetDraft(expectedStage: string): QuestionSetRepair {
  return (draft) => {
    if (!isRecord(draft)) return draft;

    const questions = Array.isArray(draft.questions) ? draft.questions : [];
    let cleared = 0;
    let questionsTouched = 0;

    const repairedQuestions = questions
      .filter(isRecord)
      .map((question) => {
        const needs = question.informationNeeds;
        const options: unknown[] = Array.isArray(question.options)
          ? question.options.slice(0, OPTIONS_PER_QUESTION.max)
          : [];

        return { question, needs, options };
      })
      .filter(
        ({ needs, options }) =>
          options.length >= OPTIONS_PER_QUESTION.min && Array.isArray(needs) && needs.length > 0,
      )
      .slice(0, QUESTIONS_PER_ROUND.max)
      .map(({ question, options }) => {
        const recommendation = atMostOneRecommended(options);

        if (recommendation.cleared > 0) {
          cleared += recommendation.cleared;
          questionsTouched += 1;
        }

        return { ...question, allowOther: true, options: recommendation.options };
      });

    /*
     * One line, and only when the repair actually removed a flag (вердикт по §7.1 рапорта M9п р.5).
     *
     * Constrained decoding (А-10) makes a draft *parseable*; it does not make the model recommend
     * once. So the two explanations for a green interview — «the model complied» and «we quietly
     * fixed it» — stay indistinguishable in a gate transcript unless the repair says so itself. This
     * is the same class of evidence as the packing record of А-8, and it is logged the same way:
     * server-side, `info`, counts only, no draft content.
     */
    if (cleared > 0) {
      console.info('interview repair: cleared extra recommendations', {
        stage: expectedStage,
        questions: questionsTouched,
        cleared,
      });
    }

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
  /** One full draft: prompt, model call, parse, validate. */
  async function attemptDraft(input: InterviewAgentInput): Promise<InterviewAgentOutcome> {
    // The bounds the draft below will be validated against, handed to the prompt that asks for it
    // (task 133; row `1.2-2`) — one rule, one place, both halves reading it.
    const prompt = interviewQuestionsPrompt({
      ...input,
      questionsPerRound: QUESTIONS_PER_ROUND,
      optionsPerQuestion: OPTIONS_PER_QUESTION,
      // The same arrangement for the reference note (task 144): the length asked for is the length
      // checked, and the slugs offered are the slugs the schema will accept back.
      optionNote: OPTION_NOTE,
      logoSlugs: OPTION_LOGO_SLUGS,
    });

    const result = await adapter.generateStreaming({
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      structuredOutput: QUESTION_SET_OUTPUT,
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
  }

  return {
    /**
     * A draft, with **one** automatic second try (round 4, Р-1).
     *
     * Drafting is the one model call in this system whose output is machine-read rather than shown:
     * a round is either a usable question set or nothing at all. An unusable one is therefore worth
     * exactly one more sample before it becomes an error the user has to act on — sampling again is
     * the cheapest repair there is, and unlike editing the draft it invents nothing.
     *
     * Exactly one. A second failure is a signal (a prompt or a model that cannot hold the contract),
     * and burning provider budget on a third sample would hide it behind a longer wait.
     */
    async draftRound(input: InterviewAgentInput): Promise<InterviewAgentOutcome> {
      const first = await attemptDraft(input);
      if (first.kind !== 'draft-invalid') return first;

      // Server-side only, and the reason the retry is not silent: a chain of these in a log is what
      // tells "one bad sample" apart from "this model never gets the contract right" (D-93).
      console.warn('interview draft unusable, drafting once more', {
        stage: input.stage,
        roundNumber: input.roundNumber,
        promptId: first.promptId,
        issues: first.issues,
      });

      return attemptDraft(input);
    },
  };
}

export type InterviewAgent = ReturnType<typeof createInterviewAgent>;
