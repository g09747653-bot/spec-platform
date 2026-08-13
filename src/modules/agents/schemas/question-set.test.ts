import { describe, expect, it } from 'vitest';

import { validateQuestionSetDraft } from './question-set';

/**
 * Task 32 — the question-set contract and its repair-once discipline (FR-005 AC-2/AC-3; D-2).
 */
const validQuestion = (id: string, needs: string[] = ['target-users']) => ({
  id,
  text: 'Who is this for?',
  type: 'single' as const,
  options: [
    { id: 'a', label: 'Solo developers' },
    { id: 'b', label: 'Teams' },
  ],
  allowOther: true as const,
  informationNeeds: needs,
});

const validSet = () => ({ stage: 'interview', questions: [validQuestion('q1')] });

describe('QuestionSetSchema (task 32)', () => {
  it('accepts a well-formed set', () => {
    const result = validateQuestionSetDraft(validSet());

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.repaired).toBe(false);
  });

  it('rejects a question with one option (AC: 1 option)', () => {
    const draft = {
      stage: 'interview',
      questions: [{ ...validQuestion('q1'), options: [{ id: 'a', label: 'Only one' }] }],
    };

    expect(validateQuestionSetDraft(draft).ok).toBe(false);
  });

  it('rejects a question with nine options (AC: 9 options)', () => {
    const draft = {
      stage: 'interview',
      questions: [
        {
          ...validQuestion('q1'),
          options: Array.from({ length: 9 }, (_, index) => ({
            id: `o${String(index)}`,
            label: `Option ${String(index)}`,
          })),
        },
      ],
    };

    expect(validateQuestionSetDraft(draft).ok).toBe(false);
  });

  it('rejects a question missing allowOther, and one with allowOther: false', () => {
    const missing: Record<string, unknown> = { ...validQuestion('q1') };
    delete missing.allowOther;

    expect(validateQuestionSetDraft({ stage: 'interview', questions: [missing] }).ok).toBe(false);

    expect(
      validateQuestionSetDraft({
        stage: 'interview',
        questions: [{ ...validQuestion('q1'), allowOther: false }],
      }).ok,
    ).toBe(false);
  });

  it('rejects duplicated question ids and duplicated option ids', () => {
    expect(
      validateQuestionSetDraft({
        stage: 'interview',
        questions: [validQuestion('q1'), validQuestion('q1', ['core-problem'])],
      }).ok,
    ).toBe(false);

    const duplicatedOptions = {
      stage: 'interview',
      questions: [
        {
          ...validQuestion('q1'),
          options: [
            { id: 'same', label: 'One' },
            { id: 'same', label: 'Two' },
          ],
        },
      ],
    };
    expect(validateQuestionSetDraft(duplicatedOptions).ok).toBe(false);
  });

  it('rejects an empty set, a six-question set, and a question with no information needs', () => {
    expect(validateQuestionSetDraft({ stage: 'interview', questions: [] }).ok).toBe(false);

    expect(
      validateQuestionSetDraft({
        stage: 'interview',
        questions: Array.from({ length: 6 }, (_, index) => validQuestion(`q${String(index)}`)),
      }).ok,
    ).toBe(false);

    expect(
      validateQuestionSetDraft({
        stage: 'interview',
        questions: [{ ...validQuestion('q1'), informationNeeds: [] }],
      }).ok,
    ).toBe(false);
  });

  it('repairs once and reports it (solution.md: repaired and re-validated once)', () => {
    const broken = {
      stage: 'interview',
      questions: [{ ...validQuestion('q1'), allowOther: false }],
    };

    const result = validateQuestionSetDraft(broken, (draft) => {
      const record = draft as { stage: string; questions: Record<string, unknown>[] };
      return {
        ...record,
        questions: record.questions.map((question) => ({ ...question, allowOther: true })),
      };
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.repaired).toBe(true);
  });

  it('a set failing twice is DRAFT_INVALID and carries the issues (AC: never persisted)', () => {
    const hopeless = { stage: 'interview', questions: 'not-an-array' };

    const result = validateQuestionSetDraft(hopeless, (draft) => draft);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('DRAFT_INVALID');
      expect(result.issues.length).toBeGreaterThan(0);
    }
  });

  it('without a repair function, one strike is out', () => {
    const result = validateQuestionSetDraft({ stage: 'interview', questions: [] });

    expect(result).toMatchObject({ ok: false, code: 'DRAFT_INVALID' });
  });
});
