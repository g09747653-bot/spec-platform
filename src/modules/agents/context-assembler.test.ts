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
    { fileName: 'brief.pdf', text: 'The brief says: no life stories.' },
    { fileName: 'audit.docx', text: 'The audit says: too much scrolling.' },
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
        items: [{ id: 'f1', description: 'Scope is vague', suggestion: 'Name a non-goal' }],
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
    attachments: [{ fileName: 'big.pdf', text: 'A'.repeat(5_000) }],
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

  it('spends the budget on the sections that need it, not equally', () => {
    // The tiny attachment section survives whole; the enormous spec section is what gets cut.
    const assembled = assembleContext(
      { ...sources, approvedSpecs: [{ specType: 'constitution', content: 'C'.repeat(20_000) }] },
      { totalChars: 3_000 },
    );

    expect(assembled.text).toContain('no life stories');
    expect(assembled.truncated.map((note) => note.section)).toEqual(['approved-specs']);
  });
});
