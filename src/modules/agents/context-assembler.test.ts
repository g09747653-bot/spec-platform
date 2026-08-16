import { describe, expect, it } from 'vitest';

import { assembleContext, DEFAULT_CONTEXT_BUDGET, type ContextSources } from './context-assembler';

/**
 * The ContextAssembler (task 50; FR-008 AC-6).
 *
 * Three claims, each of which fails quietly if it is wrong: the same inputs always produce the same
 * string, every available source is present, and an oversized context is shortened rather than
 * silently missing a source. Tasks 57, 69 and 71 build on this, so a defect here would surface as
 * three unrelated bugs later.
 */

const sources: ContextSources = {
  initialPrompt: 'A recipe app for cooks who hate scrolling.',
  answers: [
    {
      stage: 'constitution',
      roundNumber: 1,
      questionId: 'q-scope',
      selectedOptions: ['strict'],
      freeText: null,
    },
    {
      stage: 'interview',
      roundNumber: 1,
      questionId: 'q-audience',
      selectedOptions: ['solo-devs'],
      freeText: 'and small teams',
    },
    {
      stage: 'interview',
      roundNumber: 2,
      questionId: null,
      selectedOptions: [],
      freeText: 'answered in chat instead',
    },
  ],
  attachments: [
    { id: 'att-1', fileName: 'brief.pdf', text: 'The brief says: no life stories.' },
    { id: 'att-2', fileName: 'audit.docx', text: 'The audit says: too much scrolling.' },
  ],
  approvedSpecs: [
    { specType: 'requirements', content: '# Requirements\n\nFR-001 …' },
    { specType: 'constitution', content: '# Constitution\n\nP1 …' },
  ],
};

describe('determinism (AC-1)', () => {
  it('produces a byte-identical context for identical inputs', () => {
    expect(assembleContext(sources).text).toBe(assembleContext(sources).text);
  });

  it('does not depend on the order collections happen to arrive in', () => {
    const shuffled: ContextSources = {
      ...sources,
      answers: [...sources.answers].reverse(),
      attachments: [...sources.attachments].reverse(),
      approvedSpecs: [...sources.approvedSpecs].reverse(),
    };

    expect(assembleContext(shuffled).text).toBe(assembleContext(sources).text);
  });

  it('orders approved specs in bundle order, not alphabetically', () => {
    const text = assembleContext(sources).text;

    expect(text.indexOf('constitution.md')).toBeLessThan(text.indexOf('requirements.md'));
  });

  it('orders answers by stage, then round, then question', () => {
    const text = assembleContext(sources).text;

    expect(text.indexOf('q-audience')).toBeLessThan(text.indexOf('free reply'));
    expect(text.indexOf('free reply')).toBeLessThan(text.indexOf('q-scope'));
  });
});

describe('completeness (AC-2)', () => {
  it('carries all four sources when they are available', () => {
    const text = assembleContext(sources).text;

    expect(text).toContain('A recipe app for cooks who hate scrolling.');
    expect(text).toContain('and small teams');
    expect(text).toContain('no life stories');
    expect(text).toContain('# Constitution');
  });

  it('states an absent source as absent rather than omitting the section', () => {
    const text = assembleContext({
      initialPrompt: 'An idea.',
      answers: [],
      attachments: [],
      approvedSpecs: [],
    }).text;

    expect(text).toContain('(no answers recorded yet)');
    expect(text).toContain('(no documents attached)');
    expect(text).toContain('(no specification files approved yet)');
  });

  it('includes selected feedback only when there is some (task 57)', () => {
    expect(assembleContext(sources).text).not.toContain('Review feedback');

    const withFeedback = assembleContext({
      ...sources,
      feedback: {
        items: [
          {
            id: 'f1',
            sectionPath: 'Scope',
            title: 'No non-goals',
            body: 'Scope is vague',
            suggestion: 'Name a non-goal',
          },
        ],
        selectedIds: ['f1'],
      },
    }).text;

    expect(withFeedback).toContain('Scope is vague');
    expect(withFeedback).toContain('Name a non-goal');
  });
});

describe('the size budget (AC-3)', () => {
  const huge: ContextSources = {
    ...sources,
    approvedSpecs: [{ specType: 'constitution', content: 'C'.repeat(5_000) }],
    attachments: [{ id: 'att-3', fileName: 'big.pdf', text: 'A'.repeat(5_000) }],
  };

  it('truncates rather than dropping a source', () => {
    const assembled = assembleContext(huge, { totalChars: 2_000 });

    expect(assembled.text.length).toBeLessThanOrEqual(2_600);
    expect(assembled.text).toContain('The product idea');
    expect(assembled.text).toContain('Answers given during the interview');
    expect(assembled.text).toContain('Documents the user supplied');
    expect(assembled.text).toContain('Specification files already approved');
  });

  it('says what it removed, in the text and in the result', () => {
    const assembled = assembleContext(huge, { totalChars: 2_000 });

    expect(assembled.text).toContain('characters omitted to fit the context budget');
    expect(assembled.truncated.map((note) => note.section)).toContain('approved-specs');
    expect(assembled.truncated.every((note) => note.omittedChars > 0)).toBe(true);
  });

  it('never truncates the grounding input, whatever the budget', () => {
    const assembled = assembleContext(huge, { totalChars: 200 });

    expect(assembled.text).toContain('A recipe app for cooks who hate scrolling.');
    expect(assembled.truncated.map((note) => note.section)).not.toContain('prompt');
  });

  it('leaves everything whole when it already fits', () => {
    const assembled = assembleContext(sources, DEFAULT_CONTEXT_BUDGET);

    expect(assembled.truncated).toEqual([]);
    expect(assembled.text).not.toContain('characters omitted');
  });

  it('spends a level of the budget on the sections that need it, not equally', () => {
    // Within one priority level the tiny section survives whole and the enormous one is what gets
    // cut. Across levels this is not the rule — that is what the А-8 suite below is about.
    const assembled = assembleContext(
      {
        initialPrompt: sources.initialPrompt,
        answers: sources.answers,
        attachments: [],
        approvedSpecs: [{ specType: 'constitution', content: 'C'.repeat(20_000) }],
      },
      { totalChars: 3_000 },
    );

    expect(assembled.text).toContain('and small teams');
    expect(assembled.truncated.map((note) => note.section)).toEqual(['approved-specs']);
  });
});

/**
 * Priority packing (task 130; амендмент А-8).
 *
 * The order below is not a preference, it is the correction of a measured defect: the local runtime
 * used to make the prompt fit by itself and kept the *tail*, so the web research survived and the
 * system instruction did not (D-146). These tests assert the inverse, level by level, because the
 * failure they prevent is silent — a document written from research nobody meant to be the brief.
 */
describe('priority packing (А-8)', () => {
  const big = (size: number) => 'x'.repeat(size);

  /**
   * Sized so the four levels are separated by a wide margin, and the assertions are about which
   * level gave way rather than about arithmetic: research 60k, the two documents 5k each, the
   * answers and the grounding input a few hundred between them.
   */
  const everything: ContextSources = {
    initialPrompt: 'A grant reminder tool for a small charity.',
    answers: sources.answers,
    attachments: [{ id: 'att-1', fileName: 'brief.pdf', text: big(5_000) }],
    approvedSpecs: [{ specType: 'constitution', content: big(5_000) }],
    research: [
      { url: 'https://example.test/a', title: 'A', text: big(30_000), truncated: false },
      { url: 'https://example.test/b', title: 'B', text: big(30_000), truncated: false },
    ],
  };

  const entryFor = (assembled: ReturnType<typeof assembleContext>, section: string) =>
    assembled.packing.find((item) => item.section === section);

  it('shortens the web research before it touches anything else', () => {
    const assembled = assembleContext(everything, { totalChars: 30_000 });

    expect(entryFor(assembled, 'research')?.omittedChars).toBeGreaterThan(0);
    expect(entryFor(assembled, 'attachments')?.omittedChars).toBe(0);
    expect(entryFor(assembled, 'approved-specs')?.omittedChars).toBe(0);
    expect(entryFor(assembled, 'answers')?.omittedChars).toBe(0);
  });

  it('drops the research entirely before it shortens a supplied document', () => {
    const assembled = assembleContext(everything, { totalChars: 11_000 });

    expect(entryFor(assembled, 'research')?.dropped).toBe(true);
    expect(entryFor(assembled, 'attachments')?.omittedChars).toBe(0);
    expect(entryFor(assembled, 'approved-specs')?.omittedChars).toBe(0);
  });

  it('shortens the supplied documents before the stage state', () => {
    const assembled = assembleContext(everything, { totalChars: 8_000 });

    expect(entryFor(assembled, 'research')?.dropped).toBe(true);
    expect(entryFor(assembled, 'attachments')?.omittedChars).toBeGreaterThan(0);
    expect(entryFor(assembled, 'approved-specs')?.omittedChars).toBe(0);
  });

  it('keeps the grounding input whole when every other level is gone', () => {
    const assembled = assembleContext(everything, { totalChars: 500 });

    expect(assembled.text).toContain('A grant reminder tool for a small charity.');
    expect(entryFor(assembled, 'prompt')?.omittedChars).toBe(0);
    expect(entryFor(assembled, 'research')?.dropped).toBe(true);
    expect(entryFor(assembled, 'attachments')?.dropped).toBe(true);
  });

  it('states a dropped section rather than removing it, so the model can say what it lacks', () => {
    const assembled = assembleContext(everything, { totalChars: 11_000 });

    expect(assembled.text).toContain('## Pages read during live research');
    expect(assembled.text).toContain('did not fit the context budget');
    expect(assembled.text).not.toContain('https://example.test/a');
  });

  it('records every section, including the ones that survived whole', () => {
    const assembled = assembleContext(everything, { totalChars: 30_000 });

    expect(assembled.packing.map((item) => item.section).sort()).toEqual([
      'answers',
      'approved-specs',
      'attachments',
      'prompt',
      'research',
    ]);
    expect(entryFor(assembled, 'answers')?.dropped).toBe(false);
  });

  it('packs deterministically: the same sources and budget give the same text', () => {
    const once = assembleContext(everything, { totalChars: 30_000 });
    const twice = assembleContext(everything, { totalChars: 30_000 });

    expect(once.text).toBe(twice.text);
    expect(once.packing).toEqual(twice.packing);
  });
});
