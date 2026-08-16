import { describe, expect, it } from 'vitest';

import {
  createTestDoubleAdapter,
  promptMessages,
  UNPACKED_TARGET,
  type LlmAdapter,
} from '@/modules/adapters/llm';

import {
  assembleContext,
  selectedFeedback,
  type ContextFeedbackSelection,
  type ContextSources,
} from '../context-assembler';

import { createRevisionAgent } from './revision-agent';

/**
 * Task 57 — filtered feedback.
 *
 * Both acceptance criteria are negative claims: the unselected items must be *absent*. A negative
 * claim needs the whole population in play to be worth anything, so the fixture carries five items
 * and the tests tick two — and then assert that the other three appear nowhere in the assembled
 * prompt, by description, by suggestion and by id.
 */
const FIVE_ITEMS: ContextFeedbackSelection['items'] = [
  {
    id: 'mf-1',
    sectionPath: 'Scope',
    title: 'No boundary',
    body: 'Scope is vague',
    suggestion: 'Name a non-goal',
  },
  {
    id: 'mf-2',
    sectionPath: 'Gates',
    title: 'Ownerless gate',
    body: 'No owner for the gate',
    suggestion: 'Name the module',
  },
  {
    id: 'rec-1',
    sectionPath: 'API',
    title: 'No example',
    body: 'Add a worked example',
    suggestion: 'Show one request',
  },
  {
    id: 'rec-2',
    sectionPath: 'Risks',
    title: 'Order of risks',
    body: 'Reorder the risks',
    suggestion: 'Put likelihood first',
  },
  {
    id: 'rec-3',
    sectionPath: 'Glossary',
    title: 'Unexpanded acronym',
    body: 'Define the acronym',
    suggestion: 'Expand EARS on first use',
  },
];

const sources = (selectedIds: readonly string[]): ContextSources => ({
  initialPrompt: 'A tool that writes specifications',
  answers: [],
  attachments: [],
  approvedSpecs: [],
  feedback: { items: FIVE_ITEMS, selectedIds },
});

const UNSELECTED_TEXT = [
  'Add a worked example',
  'Show one request',
  'Reorder the risks',
  'Put likelihood first',
  'Define the acronym',
  'Expand EARS on first use',
];

describe('selectedFeedback (task 57)', () => {
  it('returns only the ticked items', () => {
    const chosen = selectedFeedback({ items: FIVE_ITEMS, selectedIds: ['mf-1', 'rec-2'] });

    expect(chosen.map((item) => item.id)).toEqual(['mf-1', 'rec-2']);
  });

  it('returns nothing when nothing is ticked', () => {
    expect(selectedFeedback({ items: FIVE_ITEMS, selectedIds: [] })).toEqual([]);
  });

  it('ignores an id the review does not contain rather than inventing an item', () => {
    const chosen = selectedFeedback({ items: FIVE_ITEMS, selectedIds: ['mf-1', 'ghost'] });

    expect(chosen.map((item) => item.id)).toEqual(['mf-1']);
  });

  it('is order-independent: the ticking order does not change the result', () => {
    const forwards = selectedFeedback({ items: FIVE_ITEMS, selectedIds: ['mf-1', 'rec-2'] });
    const backwards = selectedFeedback({ items: FIVE_ITEMS, selectedIds: ['rec-2', 'mf-1'] });

    expect(forwards).toEqual(backwards);
  });

  it('tolerates a repeated id without repeating the item', () => {
    const chosen = selectedFeedback({ items: FIVE_ITEMS, selectedIds: ['mf-1', 'mf-1'] });

    expect(chosen).toHaveLength(1);
  });
});

describe('the revision prompt contains only the selected items (AC-1)', () => {
  it('a prompt built with two of five selected items contains only those two', () => {
    const text = assembleContext(sources(['mf-1', 'rec-2'])).text;

    expect(text).toContain('Scope is vague');
    expect(text).toContain('Name a non-goal');
    expect(text).toContain('Reorder the risks');
    expect(text).toContain('Put likelihood first');

    for (const absent of ['No owner for the gate', 'Add a worked example', 'Define the acronym']) {
      expect(text).not.toContain(absent);
    }
  });

  it('omits unselected items entirely rather than marking them optional', () => {
    const text = assembleContext(sources(['mf-1'])).text;

    // Not "optional", not "not selected", not "for reference" — absent.
    for (const absent of UNSELECTED_TEXT) {
      expect(text).not.toContain(absent);
    }
    expect(text).not.toMatch(/optional|not selected|ignored by the user/i);
  });

  it('drops the section altogether when nothing is ticked', () => {
    expect(assembleContext(sources([])).text).not.toContain('Review feedback');
  });

  it('leaves the rest of the context untouched by the selection', () => {
    const withOne = assembleContext(sources(['mf-1'])).text;
    const withAnother = assembleContext(sources(['rec-3'])).text;

    for (const text of [withOne, withAnother]) {
      expect(text).toContain('A tool that writes specifications');
      expect(text).toContain('(no answers recorded yet)');
    }
  });
});

describe('createRevisionAgent (task 57 AC-2)', () => {
  /** Records the prompt the adapter was handed, and answers it the way the stub would. */
  const recordingAdapter = (seen: string[]): LlmAdapter => ({
    generateStreaming: (options) => {
      const prompt = promptMessages(options, UNPACKED_TARGET)
        .map((message) => message.content)
        .join('\n');
      seen.push(prompt);

      return createTestDoubleAdapter({ followPrompt: true }).generateStreaming(options);
    },
  });

  it('no unselected recommendation reaches the model', async () => {
    const seen: string[] = [];
    const agent = createRevisionAgent(recordingAdapter(seen));

    await agent.revise({
      specType: 'constitution',
      sources: sources(['mf-1', 'mf-2']),
      runId: 'run-1',
    });

    expect(seen).toHaveLength(1);
    for (const absent of UNSELECTED_TEXT) {
      expect(seen[0]).not.toContain(absent);
    }
  });

  it('no unselected recommendation appears in the revised output', async () => {
    const agent = createRevisionAgent(createTestDoubleAdapter({ followPrompt: true }));

    const result = await agent.revise({
      specType: 'constitution',
      sources: sources(['mf-1']),
      runId: 'run-2',
    });

    // The stub answers the prompt it was given, so anything absent from the prompt is absent here.
    for (const absent of UNSELECTED_TEXT) {
      expect(result.content).not.toContain(absent);
    }
  });

  it('reports which items it applied, so the revision is auditable afterwards', async () => {
    const agent = createRevisionAgent(createTestDoubleAdapter({ followPrompt: true }));

    const result = await agent.revise({
      specType: 'constitution',
      sources: sources(['rec-2', 'mf-1']),
      runId: 'run-3',
    });

    expect(result.appliedItemIds).toEqual(['mf-1', 'rec-2']);
  });

  it('tells the model to change nothing else, and counts the points it named', async () => {
    const seen: string[] = [];
    const agent = createRevisionAgent(recordingAdapter(seen));

    await agent.revise({
      specType: 'constitution',
      sources: sources(['mf-1', 'rec-1']),
      runId: 'run-4',
    });

    expect(seen[0]).toContain('Apply exactly the 2 review points');
    expect(seen[0]).toContain('change nothing else');
  });

  it('uses the singular when exactly one point was ticked', async () => {
    const seen: string[] = [];
    const agent = createRevisionAgent(recordingAdapter(seen));

    await agent.revise({
      specType: 'constitution',
      sources: sources(['mf-1']),
      runId: 'run-5',
    });

    expect(seen[0]).toContain('Apply exactly the 1 review point ');
  });

  it('carries the structural verdict, like every other path that can write a revision', async () => {
    const agent = createRevisionAgent(createTestDoubleAdapter({ followPrompt: true }));

    const result = await agent.revise({
      specType: 'constitution',
      sources: sources(['mf-1']),
      runId: 'run-6',
    });

    // The stub writes the sections the prompt asked for, so a correct pipeline validates.
    expect(result.structure.valid).toBe(true);
    expect(result.promptId).toBe('spec.generation.v2');
  });

  it('reports an invalid structure rather than hiding it', async () => {
    const agent = createRevisionAgent(createTestDoubleAdapter({ document: '# Nothing useful' }));

    const result = await agent.revise({
      specType: 'constitution',
      sources: sources(['mf-1']),
      runId: 'run-7',
    });

    expect(result.structure.valid).toBe(false);
  });

  it('still revises when the review had no selection — with nothing to apply', async () => {
    const agent = createRevisionAgent(createTestDoubleAdapter({ followPrompt: true }));

    const result = await agent.revise({
      specType: 'constitution',
      sources: sources([]),
      runId: 'run-8',
    });

    expect(result.appliedItemIds).toEqual([]);
  });
});
