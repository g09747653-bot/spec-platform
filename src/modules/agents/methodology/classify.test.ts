import { describe, expect, it } from 'vitest';

import type { LlmAdapter } from '@/modules/adapters/llm';
import { DEFAULT_METHODOLOGY_ID, METHODOLOGY_IDS } from '@/modules/methodologies';

import { createMethodologyClassifier } from './classify';

/**
 * Auto workflow selection (task 117 AC-2).
 *
 * Two claims, and the second is the one that matters in production: the classification is *used*
 * when it names a workflow we ship, and **every** other outcome is the default. The failure table
 * below is written as data because the point is that the list is exhaustive — a null, a shape that
 * does not parse, an id from another product, a thrown adapter, an empty answer — and every row ends
 * in the same place, with nothing surfaced to the user.
 */
/**
 * A stub adapter that answers with one fixed body and records what it was asked.
 *
 * Typed rather than mocked: the prompt is an assertion target here, and reading it back off a
 * `vi.fn()` costs a chain of `any` the coding standards forbid.
 */
function adapterReturning(text: string): { adapter: LlmAdapter; prompts: string[] } {
  const prompts: string[] = [];

  const adapter = {
    generateStreaming: (request: { messages: readonly { content: string }[] }) => {
      prompts.push(request.messages.map((message) => message.content).join('\n'));
      return Promise.resolve({ text, attempts: 1 });
    },
  } as unknown as LlmAdapter;

  return { adapter, prompts };
}

function adapterThrowing(): LlmAdapter {
  const adapter: LlmAdapter = {
    generateStreaming: () => Promise.reject(new Error('all providers failed')),
  };

  return adapter;
}

describe('Auto workflow selection (task 117)', () => {
  it.each([
    ['a greenfield idea', 'myspec-greenfield-v1'],
    ['a change to an existing system', 'myspec-brownfield-v1'],
    ['a spec-kit style greenfield', 'speckit-greenfield-v1'],
  ])('uses the classification for %s', async (_label, id) => {
    const classifier = createMethodologyClassifier(adapterReturning(`{"id": "${id}"}`).adapter);

    await expect(classifier.classify({ description: 'anything', runId: 'r' })).resolves.toBe(id);
  });

  it('accepts a fenced answer, because models fence JSON', async () => {
    const classifier = createMethodologyClassifier(
      adapterReturning('```json\n{"id": "openspec-brownfield-v1"}\n```').adapter,
    );

    await expect(classifier.classify({ description: 'anything', runId: 'r' })).resolves.toBe(
      'openspec-brownfield-v1',
    );
  });

  it.each([
    ['an explicit abstention', '{"id": null}'],
    ['an ambiguous description answered with nothing', ''],
    ['prose instead of JSON', 'I think the greenfield one, probably?'],
    ['a workflow we do not ship', '{"id": "someone-elses-workflow-v9"}'],
    ['the edit workflow, which is not a generate candidate', '{"id": "myspec-edit-v1"}'],
    ['a wrong shape', '{"workflow": "myspec-brownfield-v1"}'],
  ])('falls back to the default on %s', async (_label, text) => {
    const classifier = createMethodologyClassifier(adapterReturning(text).adapter);

    await expect(classifier.classify({ description: 'anything', runId: 'r' })).resolves.toBe(
      DEFAULT_METHODOLOGY_ID,
    );
  });

  it('falls back to the default when the provider chain is exhausted', async () => {
    const classifier = createMethodologyClassifier(adapterThrowing());

    await expect(classifier.classify({ description: 'anything', runId: 'r' })).resolves.toBe(
      DEFAULT_METHODOLOGY_ID,
    );
  });

  it('never returns an id the registry does not know', async () => {
    const known = new Set(METHODOLOGY_IDS);

    for (const text of ['{"id": "x"}', '{"id": null}', 'nonsense']) {
      const chosen = await createMethodologyClassifier(adapterReturning(text).adapter).classify({
        description: 'anything',
        runId: 'r',
      });

      expect(known.has(chosen)).toBe(true);
    }
  });

  it('offers the model only the candidates of the chat class it was asked about', async () => {
    const { adapter, prompts } = adapterReturning('{"id": null}');
    await createMethodologyClassifier(adapter).classify({ description: 'x', runId: 'r' });

    const user = prompts.join('\n');

    expect(user).toContain('myspec-greenfield-v1');
    expect(user).toContain('speckit-greenfield-v1');
    // The edit workflow is a different chat class; listing it would invite an answer we discard.
    expect(user).not.toContain('myspec-edit-v1');
  });
});
