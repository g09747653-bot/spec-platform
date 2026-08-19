import { describe, expect, it } from 'vitest';

import { OPTION_NOTE, validateQuestionSetDraft } from './question-set';

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

/**
 * Task 106 — the v3 additions, and the compatibility they are required to keep.
 *
 * The whole point of making `description` and `recommended` optional is that every round already in
 * a customer's database is still a valid draft. That is not a claim worth asserting once in prose:
 * the interview gate counts *answered rounds*, so a schema change that made an old round unreadable
 * would strand a session at a gate it had already passed.
 */
describe('question set v3 (task 106)', () => {
  const v2Question = () => ({
    id: 'q-v2',
    text: 'Who is this for?',
    type: 'single' as const,
    options: [
      { id: 'a', label: 'Solo developers' },
      { id: 'b', label: 'Teams' },
    ],
    allowOther: true as const,
    informationNeeds: ['target-users'],
  });

  it('still accepts a v2 draft — no descriptions, no recommendation', () => {
    const result = validateQuestionSetDraft({ stage: 'interview', questions: [v2Question()] });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const [question] = result.set.questions;
      expect(question?.options[0]?.description).toBeUndefined();
      expect(question?.options[0]?.recommended).toBeUndefined();
    }
  });

  it('accepts a v3 draft with descriptions and one recommendation', () => {
    const result = validateQuestionSetDraft({
      stage: 'interview',
      questions: [
        {
          ...v2Question(),
          options: [
            { id: 'a', label: 'Solo developers', description: 'One person, many projects' },
            { id: 'b', label: 'Teams', description: 'Two to ten people', recommended: true },
          ],
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.set.questions[0]?.options[1]).toMatchObject({
        description: 'Two to ten people',
        recommended: true,
      });
    }
  });

  it('refuses a question that recommends more than one option', () => {
    const result = validateQuestionSetDraft({
      stage: 'interview',
      questions: [
        {
          ...v2Question(),
          options: [
            { id: 'a', label: 'Solo developers', recommended: true },
            { id: 'b', label: 'Teams', recommended: true },
          ],
        },
      ],
    });

    expect(result).toMatchObject({ ok: false, code: 'DRAFT_INVALID' });
    if (!result.ok) {
      expect(result.issues.join(' ')).toContain('at most one may be recommended');
    }
  });

  it('accepts a question that recommends nothing at all', () => {
    const result = validateQuestionSetDraft({
      stage: 'interview',
      questions: [
        {
          ...v2Question(),
          options: [
            { id: 'a', label: 'Solo developers', recommended: false },
            { id: 'b', label: 'Teams', recommended: false },
          ],
        },
      ],
    });

    expect(result.ok).toBe(true);
  });
});

/**
 * Task 134 — tag chips on options (row `1.1-6`; Эталон §1.1).
 *
 * Optional by construction, like `recommended` before it: the schema's job here is to accept a
 * draft that has none, accept a draft that has a few, and refuse a draft that would turn a chip row
 * into an essay.
 */
describe('option tags (task 134)', () => {
  const withTags = (tags: unknown) => ({
    stage: 'interview',
    questions: [
      {
        id: 'q-tags',
        text: 'Who is this for?',
        type: 'single' as const,
        options: [
          { id: 'a', label: 'Solo developers', tags },
          { id: 'b', label: 'Teams' },
        ],
        allowOther: true as const,
        informationNeeds: ['target-users'],
      },
    ],
  });

  it('accepts a draft with none — every round drafted before this is still valid', () => {
    const result = validateQuestionSetDraft({
      stage: 'interview',
      questions: [
        {
          id: 'q-plain',
          text: 'Who is this for?',
          type: 'single',
          options: [
            { id: 'a', label: 'Solo developers' },
            { id: 'b', label: 'Teams' },
          ],
          allowOther: true,
          informationNeeds: ['target-users'],
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.set.questions[0]?.options[0]?.tags).toBeUndefined();
  });

  it('keeps up to four short tags', () => {
    const result = validateQuestionSetDraft(withTags(['faster', 'no cost']));

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.set.questions[0]?.options[0]?.tags).toEqual(['faster', 'no cost']);
  });

  it('refuses five tags, and one that is a sentence', () => {
    expect(validateQuestionSetDraft(withTags(['a', 'b', 'c', 'd', 'e'])).ok).toBe(false);
    expect(validateQuestionSetDraft(withTags(['x'.repeat(25)])).ok).toBe(false);
  });
});

/**
 * Task 144 — the reference note, and the rule that it is **dropped, not rejected**.
 *
 * Three optional fields carrying the one thing the model could invent: an address. So the contract
 * has two halves and both are asserted here. A round that names a technology keeps its note, its link
 * and its logo; and a round whose note, link or logo is wrong loses exactly that field and stays a
 * round. The second half is the one that matters at three in the morning on a live walk — a draft is
 * repaired once and then discarded with `DRAFT_INVALID`, and a hallucinated URL has no business
 * costing a person the whole round of questions they were about to answer.
 */
describe('option reference notes (task 144)', () => {
  const withOptions = (options: unknown[]) => ({
    stage: 'interview',
    questions: [
      {
        id: 'q-provider',
        text: 'Which provider should the drafting run through?',
        type: 'single' as const,
        options,
        allowOther: true as const,
        informationNeeds: ['model-provider'],
      },
    ],
  });

  const firstOption = (draft: unknown) => {
    const result = validateQuestionSetDraft(draft);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.issues.join('; '));

    return result.set.questions[0]?.options[0];
  };

  const annotated = (extra: Record<string, unknown>) =>
    withOptions([
      { id: 'a', label: 'Anthropic Claude', ...extra },
      { id: 'b', label: 'No preference — recommend the best fit' },
    ]);

  it('keeps a note, a vendor home page and a known slug, and leaves the bare option bare', () => {
    const result = validateQuestionSetDraft(
      annotated({
        note: 'Anthropic makes the Claude family of models and sells access through its own API.',
        href: 'https://www.anthropic.com',
        logo: 'anthropic',
      }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      const [question] = result.set.questions;
      expect(question?.options[0]).toMatchObject({
        note: 'Anthropic makes the Claude family of models and sells access through its own API.',
        href: 'https://www.anthropic.com',
        logo: 'anthropic',
      });
      // The asymmetry is the point: an option naming no technology carries none of it.
      expect(question?.options[1]?.note).toBeUndefined();
      expect(question?.options[1]?.href).toBeUndefined();
      expect(question?.options[1]?.logo).toBeUndefined();
    }
  });

  it('still accepts every option that carries none of the three — the compatibility contract', () => {
    const result = validateQuestionSetDraft(validSet());

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.set.questions[0]?.options[0]?.note).toBeUndefined();
      expect(result.set.questions[0]?.options[0]?.href).toBeUndefined();
    }
  });

  it('drops a slug outside the closed set and keeps the note and the link with it', () => {
    // PostgreSQL, the case the design names: no vendored SVG, so the logo goes and nothing else does.
    const option = firstOption(
      annotated({
        note: 'PostgreSQL is the open-source SQL database most of this list runs or imitates.',
        href: 'https://www.postgresql.org',
        logo: 'postgresql',
      }),
    );

    expect(option?.logo).toBeUndefined();
    expect(option?.href).toBe('https://www.postgresql.org');
    expect(option?.note).toContain('PostgreSQL is the open-source SQL database');
  });

  it.each([
    ['plain http', 'http://anthropic.com'],
    ['a documentation page', 'https://anthropic.com/en/docs/get-started'],
    ['a search result', 'https://anthropic.com/?q=claude'],
    ['an anchor', 'https://anthropic.com#pricing'],
    ['credentials', 'https://user:pass@anthropic.com'],
    ['a port', 'https://anthropic.com:8443'],
    ['a host with no dot', 'https://localhost'],
    ['prose rather than an address', 'their website'],
  ])('drops an href that is %s, and keeps the note beside it', (_case, href) => {
    const option = firstOption(
      annotated({ note: 'Anthropic makes the Claude family of models.', href, logo: 'anthropic' }),
    );

    expect(option?.href).toBeUndefined();
    expect(option?.note).toBe('Anthropic makes the Claude family of models.');
    expect(option?.logo).toBe('anthropic');
  });

  it('drops a link that points somewhere else than the logo it arrived with', () => {
    // A known slug is its own allow-list: a link on a foreign host is a guess, not an address.
    const option = firstOption(
      annotated({
        note: 'Anthropic makes the Claude family of models.',
        href: 'https://example.com',
        logo: 'anthropic',
      }),
    );

    expect(option?.href).toBeUndefined();
    expect(option?.logo).toBe('anthropic');
  });

  it('drops a link and a logo that arrive with no note — the note is what they hang on', () => {
    const option = firstOption(annotated({ href: 'https://www.anthropic.com', logo: 'anthropic' }));

    expect(option?.href).toBeUndefined();
    expect(option?.logo).toBeUndefined();
  });

  it('drops a note longer than the bound, and an empty one, without losing the round', () => {
    expect(firstOption(annotated({ note: 'x'.repeat(OPTION_NOTE.max + 1) }))?.note).toBeUndefined();
    expect(firstOption(annotated({ note: '   ' }))?.note).toBeUndefined();
    expect(firstOption(annotated({ note: 42 }))?.note).toBeUndefined();
  });

  it('drops a logo that is a URL or a file name, which is what the field name invites', () => {
    expect(
      firstOption(annotated({ note: 'Anthropic makes Claude.', logo: 'https://cdn/anthropic.svg' }))
        ?.logo,
    ).toBeUndefined();
    expect(
      firstOption(annotated({ note: 'Anthropic makes Claude.', logo: 'anthropic.svg' }))?.logo,
    ).toBeUndefined();
  });

  it('accepts the vendor home page with or without www, and normalises neither', () => {
    const bare = firstOption(
      annotated({
        note: 'Neon runs PostgreSQL as a managed service.',
        href: 'https://neon.com',
        logo: 'neon',
      }),
    );
    const prefixed = firstOption(
      annotated({
        note: 'Neon runs PostgreSQL as a managed service.',
        href: 'https://www.neon.com',
        logo: 'neon',
      }),
    );

    expect(bare?.href).toBe('https://neon.com');
    expect(prefixed?.href).toBe('https://www.neon.com');
  });
});
