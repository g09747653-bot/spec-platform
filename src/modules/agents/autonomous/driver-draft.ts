import { z } from 'zod';

/**
 * What the driver's model calls are allowed to say, and what happens to anything else (task 145).
 *
 * This module is the line the seed cannot cross. `policy.ts` guarantees the model never chooses a
 * *move*; these schemas and the two resolvers below guarantee it cannot smuggle one into the content
 * of a move either — everything it returns is intersected with the ids that were on screen, and what
 * survives that intersection is, by construction, something a human could have clicked.
 *
 * The resolvers are deliberately **total**: they always produce a submittable answer, and where the
 * model gave them nothing usable they fall back to a rule written here rather than to a retry loop.
 * A driver that cannot answer a question is a driver that stalls, and «the model returned nothing
 * usable twice» is not a state a person watching a run can do anything with — whereas «it took the
 * recommended option and said so» is.
 */

/** A per-question draft. `optionIds` and `freeText` are both optional; a resolver decides. */
const AnswerDraftItem = z.object({
  questionId: z.string().min(1),
  optionIds: z.array(z.string().min(1)).max(16).default([]),
  freeText: z.string().trim().max(400).optional().catch(undefined),
});

export const AnswerDraft = z.object({
  answers: z.array(AnswerDraftItem).max(16).default([]),
  /** One sentence, shown to the person when they come back. Bounded so a card cannot fill a page. */
  rationale: z.string().trim().min(1).max(300),
});

export type AnswerDraftValue = z.infer<typeof AnswerDraft>;

export const ReviewSelectionDraft = z.object({
  keepIds: z.array(z.string().min(1)).max(32).default([]),
  rationale: z.string().trim().min(1).max(300),
});

export type ReviewSelectionDraftValue = z.infer<typeof ReviewSelectionDraft>;

/** One question, as the persisted round holds it — the only source of legal ids. */
export interface RoundQuestion {
  id: string;
  type: 'single' | 'multiple';
  options: readonly { id: string; recommended?: boolean | undefined }[];
}

/** One answer in the shape `POST /api/sessions/:id/answers` accepts. */
export interface ResolvedAnswer {
  questionId: string;
  selectedOptionIds: string[];
  freeText?: string;
}

/**
 * Why a question ended up answered the way it did — carried out so the step can journal it.
 *
 * `fallback` counts the questions the model did not usably answer. It is not an error and not a
 * silence: a run in which most questions were answered by the fallback rule is a run whose seed did
 * not decide much, and that is worth being able to read afterwards.
 */
export interface AnswerResolution {
  answers: ResolvedAnswer[];
  fallbacks: number;
  /**
   * How many of those fallbacks took the option the round itself recommended.
   *
   * Counted apart because the two are different things to tell a reader, and the first version of
   * the note said «I took the recommended option» over questions that recommended nothing — a
   * sentence that is grammatical, plausible and false. `fallbacks - recommendedFallbacks` is the
   * number of questions where the driver took the first option because there was no better rule.
   */
  recommendedFallbacks: number;
  /** Ids the model returned that were not on the round. Dropped, and counted. */
  rejectedIds: number;
}

/**
 * The option a question falls back to when the draft gave nothing usable.
 *
 * The round's own recommendation first — it is the interviewer's judgement about its own question,
 * and preferring it keeps the driver's default the same default a hurried person would take — then
 * the first option, which is a rule rather than a preference and is stated as such.
 */
function fallbackOption(question: RoundQuestion): { id: string; recommended: boolean } | null {
  const recommended = question.options.find((option) => option.recommended === true);
  if (recommended !== undefined) return { id: recommended.id, recommended: true };

  const first = question.options[0];
  return first === undefined ? null : { id: first.id, recommended: false };
}

/**
 * Turns a draft into a submission the answers endpoint will accept, question by question.
 *
 * Three rules, in order, and each of them is a place an injected instruction dies:
 *
 * 1. only ids that are on this question survive — an id the model invented is dropped, counted, and
 *    never sent;
 * 2. a `single` question keeps exactly one — the first surviving id — because the endpoint refuses
 *    more and because «pick one» is the question's own contract, not a formatting detail;
 * 3. a question left with nothing takes its fallback option.
 *
 * Free text is carried only when it is non-empty after trimming, because the endpoint's CHECK
 * refuses an answer that carries neither an option nor substance, and a blank string would turn a
 * whole round into a 422 for the sake of a field nobody filled in.
 */
export function resolveAnswers(
  questions: readonly RoundQuestion[],
  draft: AnswerDraftValue,
): AnswerResolution {
  const drafted = new Map(draft.answers.map((answer) => [answer.questionId, answer]));
  const answers: ResolvedAnswer[] = [];
  let fallbacks = 0;
  let recommendedFallbacks = 0;
  let rejectedIds = 0;

  for (const question of questions) {
    const legal = new Set(question.options.map((option) => option.id));
    const item = drafted.get(question.id);
    const offered = item?.optionIds ?? [];

    const kept = offered.filter((id) => legal.has(id));
    rejectedIds += offered.length - kept.length;

    let selected = question.type === 'single' ? kept.slice(0, 1) : kept;

    if (selected.length === 0) {
      const fallback = fallbackOption(question);
      if (fallback !== null) {
        selected = [fallback.id];
        fallbacks += 1;
        if (fallback.recommended) recommendedFallbacks += 1;
      }
    }

    const freeText = item?.freeText?.trim() ?? '';

    answers.push({
      questionId: question.id,
      selectedOptionIds: selected,
      ...(freeText === '' ? {} : { freeText }),
    });
  }

  return { answers, fallbacks, recommendedFallbacks, rejectedIds };
}

/**
 * The item ids a `request_changes` decision carries: every blocking finding, plus the advisory ones
 * the model kept.
 *
 * Blocking items are added **here**, by code, and not asked for: «Must Fix» is the reviewer's own
 * severity and the decision to act on it belongs to the policy, so a model that returned an empty
 * list — or a hostile seed that persuaded it to — still sends every blocking point into the rewrite.
 * The advisory ids are intersected with the board's, so an id the model invented reaches nothing
 * (the endpoint would answer 422 «unknown feedback item», which is a refusal the driver should never
 * be able to provoke).
 *
 * The order is blocking-first and then board order, so two runs over the same board send the same
 * list — a set built from iteration order is a set that changes when a `Map` is rebuilt.
 */
export function resolveSelectedItems(
  blockingIds: readonly string[],
  advisoryIds: readonly string[],
  keepIds: readonly string[],
): string[] {
  const wanted = new Set(keepIds);
  return [...blockingIds, ...advisoryIds.filter((id) => wanted.has(id))];
}
