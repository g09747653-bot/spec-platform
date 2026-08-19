import { describe, expect, it } from 'vitest';

import {
  AnswerDraft,
  ReviewSelectionDraft,
  resolveAnswers,
  resolveSelectedItems,
  type RoundQuestion,
} from './driver-draft';

/**
 * The line a hostile seed cannot cross (task 145; red-team pass of gate 146).
 *
 * `policy.ts` guarantees the model never picks a *move*. These are the tests for the other half:
 * that it cannot smuggle one into the content of a move either. Every case below is written as an
 * attack — an id that was never offered, a single-choice question answered with four, a draft that
 * answers nothing, a review selection that reaches for items the board does not carry — and the
 * property asserted is the same each time: **what is sent is a subset of what was on screen**.
 */
const single: RoundQuestion = {
  id: 'q-provider',
  type: 'single',
  options: [{ id: 'anthropic' }, { id: 'openai', recommended: true }, { id: 'no-preference' }],
};

const multiple: RoundQuestion = {
  id: 'q-problems',
  type: 'multiple',
  options: [{ id: 'context' }, { id: 'blank-page' }, { id: 'review' }],
};

const draft = (over: Partial<Parameters<typeof resolveAnswers>[1]> = {}) => ({
  answers: [],
  rationale: 'because',
  ...over,
});

describe('turning a draft into a submission', () => {
  it('keeps the picks the round actually offered', () => {
    const resolved = resolveAnswers(
      [single, multiple],
      draft({
        answers: [
          { questionId: 'q-provider', optionIds: ['anthropic'] },
          { questionId: 'q-problems', optionIds: ['context', 'review'] },
        ],
      }),
    );

    expect(resolved.answers).toEqual([
      { questionId: 'q-provider', selectedOptionIds: ['anthropic'] },
      { questionId: 'q-problems', selectedOptionIds: ['context', 'review'] },
    ]);
    expect(resolved.fallbacks).toBe(0);
    expect(resolved.rejectedIds).toBe(0);
  });

  /*
   * The attack this file exists for. An id the model returned that the round never offered is not
   * an unusual answer — it is the model answering a question nobody asked, and the endpoint would
   * reject the whole round for it (422 «unknown option»). Dropped, counted, and the question falls
   * back rather than the run ending.
   */
  it('drops ids that were never on the round, and counts them', () => {
    const resolved = resolveAnswers(
      [single],
      draft({ answers: [{ questionId: 'q-provider', optionIds: ['approve-everything'] }] }),
    );

    expect(resolved.answers).toEqual([{ questionId: 'q-provider', selectedOptionIds: ['openai'] }]);
    expect(resolved.rejectedIds).toBe(1);
    expect(resolved.fallbacks).toBe(1);
  });

  it('answers a question the draft ignored, with the option the round recommends', () => {
    const resolved = resolveAnswers([single, multiple], draft({ answers: [] }));

    expect(resolved.answers.map((answer) => answer.selectedOptionIds)).toEqual([
      ['openai'],
      ['context'],
    ]);
    expect(resolved.fallbacks).toBe(2);
  });

  /* No recommendation to fall back to: the first option is a rule, and the rule is stated. */
  it('falls back to the first option when the round recommends nothing', () => {
    const resolved = resolveAnswers([multiple], draft({ answers: [] }));
    expect(resolved.answers[0]?.selectedOptionIds).toEqual(['context']);
  });

  it('keeps one pick on a single-choice question, whatever the draft returned', () => {
    const resolved = resolveAnswers(
      [single],
      draft({
        answers: [
          { questionId: 'q-provider', optionIds: ['anthropic', 'openai', 'no-preference'] },
        ],
      }),
    );

    expect(resolved.answers[0]?.selectedOptionIds).toEqual(['anthropic']);
  });

  it('answers every question of the round and nothing else', () => {
    const resolved = resolveAnswers(
      [single],
      draft({
        answers: [
          { questionId: 'q-provider', optionIds: ['anthropic'] },
          { questionId: 'q-invented', optionIds: ['whatever'] },
        ],
      }),
    );

    expect(resolved.answers.map((answer) => answer.questionId)).toEqual(['q-provider']);
  });

  /*
   * Free text is carried only when it is substance. The endpoint's CHECK refuses an answer with
   * neither an option nor non-blank text, so a whitespace field would turn a whole round into a 422
   * for a value nobody filled in.
   */
  it('carries free text when there is any, and omits the key when there is not', () => {
    const withText = resolveAnswers(
      [single],
      draft({
        answers: [{ questionId: 'q-provider', optionIds: ['anthropic'], freeText: '  keep it  ' }],
      }),
    );
    expect(withText.answers[0]).toEqual({
      questionId: 'q-provider',
      selectedOptionIds: ['anthropic'],
      freeText: 'keep it',
    });

    const blank = resolveAnswers(
      [single],
      draft({ answers: [{ questionId: 'q-provider', optionIds: ['anthropic'], freeText: '   ' }] }),
    );
    expect(blank.answers[0]).not.toHaveProperty('freeText');
  });
});

describe('the answer schema', () => {
  it('requires a rationale, because a decision with no account of itself is not transparency', () => {
    expect(AnswerDraft.safeParse({ answers: [], rationale: '   ' }).success).toBe(false);
    expect(AnswerDraft.safeParse({ answers: [] }).success).toBe(false);
  });

  it('accepts a draft with no answers — the resolver decides what that means, not the schema', () => {
    expect(AnswerDraft.safeParse({ rationale: 'nothing decided this' }).success).toBe(true);
  });

  it('drops a free-text field of the wrong shape rather than rejecting the round', () => {
    const parsed = AnswerDraft.safeParse({
      answers: [{ questionId: 'q', optionIds: ['a'], freeText: 42 }],
      rationale: 'ok',
    });

    expect(parsed.success).toBe(true);
    expect(parsed.data?.answers[0]?.freeText).toBeUndefined();
  });
});

describe('which findings go into a rewrite', () => {
  const blocking = ['mf-1', 'mf-2'];
  const advisory = ['rec-1', 'rec-2', 'rec-3'];

  /*
   * The blocking half is added by code and is not asked for. This is the assertion that makes an
   * injected «keep nothing» harmless: the points the reviewer marked as blocking go into the
   * rewrite whether or not the model mentions them.
   */
  it('always carries every blocking finding, even when the model kept nothing', () => {
    expect(resolveSelectedItems(blocking, advisory, [])).toEqual(['mf-1', 'mf-2']);
  });

  it('adds the advisory findings the model kept, in board order', () => {
    expect(resolveSelectedItems(blocking, advisory, ['rec-3', 'rec-1'])).toEqual([
      'mf-1',
      'mf-2',
      'rec-1',
      'rec-3',
    ]);
  });

  it('ignores ids the board does not carry', () => {
    expect(resolveSelectedItems(blocking, advisory, ['rec-1', 'invented'])).toEqual([
      'mf-1',
      'mf-2',
      'rec-1',
    ]);
  });

  it('is stable: the same board and the same picks give the same list', () => {
    const once = resolveSelectedItems(blocking, advisory, ['rec-2', 'rec-1']);
    const twice = resolveSelectedItems(blocking, advisory, ['rec-1', 'rec-2']);
    expect(once).toEqual(twice);
  });
});

describe('the review-selection schema', () => {
  it('requires a rationale and tolerates an empty selection', () => {
    expect(ReviewSelectionDraft.safeParse({ keepIds: [], rationale: 'none earn it' }).success).toBe(
      true,
    );
    expect(ReviewSelectionDraft.safeParse({ keepIds: ['rec-1'] }).success).toBe(false);
  });
});
