import { describe, expect, it } from 'vitest';

import {
  createTestDoubleAdapter,
  documentFromRefinementPrompt,
  instructionFromRefinementPrompt,
  stubRefinementDocument,
  type LlmAdapter,
} from '@/modules/adapters/llm';

import { createRefinementAgent } from './refinement-agent';

/**
 * Task 59 — the agent half: does the model answer with an edit, or with a question?
 *
 * FR-011 AC-9 is the criterion under test, and it is a criterion about *restraint*. The assertions
 * therefore care most about the clarification branch surviving intact: it must be reachable, it must
 * not be repaired into a proposal, and a draft that is neither shape must not become either.
 */
const DOCUMENT = ['# Constitution', '', '## Purpose', '', 'The current text.'].join('\n');

/** An adapter whose answer is a fixed string, so the agent's parsing is what is under test. */
const answering = (text: string): LlmAdapter => createTestDoubleAdapter({ document: text });

/** An adapter that answers the prompt the way the configured stub provider would. */
const stub = (): LlmAdapter => ({
  generateStreaming: (options) => {
    const prompt = options.messages.map((message) => message.content).join('\n');

    return Promise.resolve({
      text: stubRefinementDocument(prompt),
      providerUsed: 'stub',
      attempts: 1,
    });
  },
});

const propose = (adapter: LlmAdapter, instruction: string) =>
  createRefinementAgent(adapter).propose({
    specType: 'constitution',
    specContent: DOCUMENT,
    instruction,
    runId: 'run-1',
  });

describe('createRefinementAgent (task 59)', () => {
  describe('AC-1 — a clear instruction yields a proposal', () => {
    it('returns the whole revised document', async () => {
      const outcome = await propose(stub(), 'Add a line about non-goals.');

      expect(outcome.kind).toBe('proposal');
      if (outcome.kind !== 'proposal') return;
      expect(outcome.content).toContain('## Purpose');
      expect(outcome.content).toContain('Add a line about non-goals.');
      expect(outcome.promptId).toBe('refinement.propose.v1');
    });

    it('passes the current document and the instruction through verbatim', async () => {
      const seen: string[] = [];
      const recorder: LlmAdapter = {
        generateStreaming: (options) => {
          seen.push(options.messages.map((message) => message.content).join('\n'));
          return Promise.resolve({
            text: JSON.stringify({ kind: 'proposal', content: DOCUMENT }),
            providerUsed: 'stub',
            attempts: 1,
          });
        },
      };

      await propose(recorder, 'Tighten the purpose section.');

      expect(documentFromRefinementPrompt(seen[0] ?? '')).toBe(DOCUMENT);
      expect(instructionFromRefinementPrompt(seen[0] ?? '')).toBe('Tighten the purpose section.');
    });
  });

  describe('AC-2 — an ambiguous instruction yields a question, not a guessed change', () => {
    it('returns a clarification for a vague request', async () => {
      const outcome = await propose(stub(), 'Make it better.');

      expect(outcome.kind).toBe('clarification');
      if (outcome.kind !== 'clarification') return;
      expect(outcome.question.length).toBeGreaterThan(0);
    });

    it('produces no content at all on the clarification branch', async () => {
      const outcome = await propose(stub(), 'Improve the wording somehow.');

      // There is nothing to accept: a clarification is not a proposal with an empty diff.
      expect(outcome.kind).toBe('clarification');
      expect('content' in outcome).toBe(false);
    });

    it('does not repair a clarification into a proposal', async () => {
      const outcome = await propose(
        answering(JSON.stringify({ kind: 'clarification', question: 'Which section?' })),
        'Change the thing.',
      );

      expect(outcome.kind).toBe('clarification');
      if (outcome.kind !== 'clarification') return;
      expect(outcome.question).toBe('Which section?');
    });
  });

  describe('an unusable draft is unusable — nothing is invented', () => {
    it('reports prose as draft-invalid', async () => {
      const outcome = await propose(answering('Sure, here is the updated document!'), 'Change it.');

      expect(outcome.kind).toBe('draft-invalid');
      if (outcome.kind !== 'draft-invalid') return;
      expect(outcome.issues.join('\n')).toMatch(/not parseable JSON/);
    });

    it('rejects a third kind the contract does not define', async () => {
      const outcome = await propose(
        answering(JSON.stringify({ kind: 'refusal', reason: 'I would rather not' })),
        'Change it.',
      );

      expect(outcome.kind).toBe('draft-invalid');
    });

    it('rejects a proposal with empty content and a clarification with an empty question', async () => {
      for (const draft of [
        { kind: 'proposal', content: '' },
        { kind: 'clarification', question: '' },
        { kind: 'proposal' },
        { kind: 'clarification' },
      ]) {
        expect((await propose(answering(JSON.stringify(draft)), 'Change it.')).kind).toBe(
          'draft-invalid',
        );
      }
    });

    it('accepts an answer the model wrapped in a markdown fence', async () => {
      const draft = JSON.stringify({ kind: 'proposal', content: DOCUMENT });
      const outcome = await propose(answering(`\`\`\`json\n${draft}\n\`\`\``), 'Change it.');

      expect(outcome.kind).toBe('proposal');
    });
  });

  describe('the stub provider, which every automated run uses', () => {
    it('removes a section when asked to, so the AC-8 refusal has something to refuse', async () => {
      const outcome = await propose(stub(), 'Remove the Purpose section.');

      expect(outcome.kind).toBe('proposal');
      if (outcome.kind !== 'proposal') return;
      expect(outcome.content).not.toContain('## Purpose');
      expect(outcome.content).toContain('# Constitution');
    });

    it('is deterministic: the same request twice gives the same answer', async () => {
      const first = await propose(stub(), 'Add a line about non-goals.');
      const second = await propose(stub(), 'Add a line about non-goals.');

      expect(first).toEqual(second);
    });
  });
});
