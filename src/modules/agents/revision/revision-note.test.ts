import { describe, expect, it } from 'vitest';

import type { LlmAdapter } from '@/modules/adapters/llm';

import { createRevisionNoteAgent } from './revision-note';

/**
 * Task 113 — the paragraph the writer says before it rewrites (Эталон §1.3).
 *
 * It is a required part of the revision contract, so what is asserted is the contract: it sees the
 * ticked points and no others, it asks for the two halves the reference product's paragraph has
 * (what was folded in, and what the writer settled on its own), and it never returns something the
 * card cannot render.
 */
const answering = (text: string, seen?: string[]): LlmAdapter => ({
  generateStreaming: (options) => {
    seen?.push(options.messages.map((message) => message.content).join('\n'));
    return Promise.resolve({ text, providerUsed: 'stub', attempts: 1 });
  },
});

const POINTS = [
  { sectionPath: 'Scope', title: 'No non-goals', suggestion: 'Name a non-goal' },
  { sectionPath: 'Gates', title: 'Ownerless gate', suggestion: 'Name the module' },
];

describe('createRevisionNoteAgent (task 113)', () => {
  it('returns the paragraph the model wrote', async () => {
    const agent = createRevisionNoteAgent(answering('I am folding in the two points you ticked.'));

    expect(
      await agent.note({
        specType: 'constitution',
        points: POINTS,
        specContent: '# Constitution',
        runId: 'run-1',
      }),
    ).toBe('I am folding in the two points you ticked.');
  });

  it('hands the model the ticked points, and asks for the calls it makes itself', async () => {
    const seen: string[] = [];
    const agent = createRevisionNoteAgent(answering('Noted.', seen));

    await agent.note({
      specType: 'constitution',
      points: POINTS,
      specContent: '# Constitution\n\n## Scope\n\nText.',
      runId: 'run-2',
    });

    const prompt = seen[0] ?? '';

    expect(prompt).toContain('Scope — No non-goals: Name a non-goal');
    expect(prompt).toContain('Gates — Ownerless gate: Name the module');
    // The half that makes the paragraph worth showing (Эталон §1.3).
    expect(prompt).toMatch(/settling yourself/i);
    // It sees the document, because the calls it announces are calls about that text.
    expect(prompt).toContain('# Constitution\n\n## Scope\n\nText.');
  });

  it('never calls the model when nothing was ticked', async () => {
    let called = false;
    const agent = createRevisionNoteAgent({
      generateStreaming: () => {
        called = true;
        return Promise.resolve({ text: 'unreachable', providerUsed: 'stub', attempts: 1 });
      },
    });

    expect(
      await agent.note({
        specType: 'constitution',
        points: [],
        specContent: '# Constitution',
        runId: 'run-3',
      }),
    ).toBe('');
    expect(called).toBe(false);
  });

  it('keeps the first paragraph of a model that ignored "one paragraph"', async () => {
    const agent = createRevisionNoteAgent(
      answering('The paragraph.\n\nAn appendix nobody asked for.\n\nAnd another.'),
    );

    expect(
      await agent.note({
        specType: 'constitution',
        points: POINTS,
        specContent: '# C',
        runId: 'run-4',
      }),
    ).toBe('The paragraph.');
  });

  it('unwraps a fenced answer rather than showing the fence to the user', async () => {
    const agent = createRevisionNoteAgent(answering('```\nI am folding in one point.\n```'));

    expect(
      await agent.note({
        specType: 'constitution',
        points: POINTS,
        specContent: '# C',
        runId: 'run-5',
      }),
    ).toBe('I am folding in one point.');
  });

  it('caps an essay rather than letting it into the card whole', async () => {
    const agent = createRevisionNoteAgent(answering('x'.repeat(4000)));

    const note = await agent.note({
      specType: 'constitution',
      points: POINTS,
      specContent: '# C',
      runId: 'run-6',
    });

    expect(note.length).toBeLessThanOrEqual(1201);
    expect(note.endsWith('…')).toBe(true);
  });

  it('answers with nothing when the model answers with nothing', async () => {
    const agent = createRevisionNoteAgent(answering('   \n  \n '));

    expect(
      await agent.note({
        specType: 'constitution',
        points: POINTS,
        specContent: '# C',
        runId: 'run-7',
      }),
    ).toBe('');
  });
});
