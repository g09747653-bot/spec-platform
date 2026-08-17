import { describe, expect, it } from 'vitest';

import type { LlmAdapter, ModelMessage, PromptTarget } from '@/modules/adapters/llm';
import { UNPACKED_TARGET } from '@/modules/adapters/llm';

import type { ContextSources } from '../context-assembler';

import { createBridgeAgent } from './bridge-agent';

/**
 * The analytical bridge (task 132; Эталон §1.2; checklist row `1.2-3`).
 *
 * Three properties, and each one is a way the feature could be worse than nothing: it has to see
 * what was answered (a bridge that does not name the answers is filler), it has to be able to say
 * nothing (an invented contradiction teaches the reader to skim), and it has to be packed for the
 * provider that reads it (А-8 — the local window is the reason packing exists).
 */
const SOURCES: ContextSources = {
  initialPrompt: 'A tool that tracks grant deadlines for a small charity.',
  answers: [
    {
      stage: 'interview',
      roundNumber: 1,
      questionId: 'q-audience',
      selectedOptions: ['One volunteer coordinator'],
      freeText: null,
    },
    {
      stage: 'interview',
      roundNumber: 1,
      questionId: 'q-offline',
      selectedOptions: ['Works with no internet'],
      freeText: 'but it should email people',
    },
  ],
  attachments: [],
  approvedSpecs: [],
};

/** Captures the messages the adapter was handed, having asked for them like the real one does. */
function recordingAdapter(text: string, target: PromptTarget = UNPACKED_TARGET) {
  const seen: ModelMessage[][] = [];

  const adapter = {
    generateStreaming: (options: {
      messages: readonly ModelMessage[] | ((target: PromptTarget) => readonly ModelMessage[]);
    }) => {
      const messages =
        typeof options.messages === 'function' ? options.messages(target) : options.messages;

      seen.push([...messages]);

      return Promise.resolve({ text, providerUsed: 'stub' as const, attempts: 1 });
    },
  } as unknown as LlmAdapter;

  return { adapter, seen };
}

describe('the analytical bridge (task 132)', () => {
  it('is written from the answers just given, so it can name what it builds on', async () => {
    const { adapter, seen } = recordingAdapter('You want it offline and emailing — those fight.');

    const comment = await createBridgeAgent(adapter).write({
      sources: SOURCES,
      unmetNeeds: ['budget'],
      runId: 'run-1',
    });

    expect(comment).toBe('You want it offline and emailing — those fight.');

    const prompt = (seen[0] ?? []).map((message) => message.content).join('\n');

    // The AC in so many words: the prompt receives the prior answers, and what is still open.
    expect(prompt).toContain('One volunteer coordinator');
    expect(prompt).toContain('Works with no internet');
    expect(prompt).toContain('but it should email people');
    expect(prompt).toContain('budget');
  });

  it('declines when the answers hold together, rather than inventing a contradiction', async () => {
    const { adapter } = recordingAdapter('NOTHING TO FLAG');

    await expect(
      createBridgeAgent(adapter).write({ sources: SOURCES, unmetNeeds: [], runId: 'run-1' }),
    ).resolves.toBeNull();
  });

  it('recognises a decline the model dressed up, and an empty answer', async () => {
    for (const text of ['Nothing to flag.', '  NOTHING TO FLAG  ', '   ']) {
      const { adapter } = recordingAdapter(text);

      await expect(
        createBridgeAgent(adapter).write({ sources: SOURCES, unmetNeeds: [], runId: 'run-1' }),
      ).resolves.toBeNull();
    }
  });

  it('packs for the provider that will read it, so a small window shortens the context (А-8)', async () => {
    const small: PromptTarget = {
      provider: 'ollama',
      capacity: { promptTokens: 1_200, generationReserveTokens: 1_024 },
    };
    const { adapter, seen } = recordingAdapter('A comment.', small);

    await createBridgeAgent(adapter).write({
      sources: {
        ...SOURCES,
        // Far past the window on its own: something has to give, and it is not the instruction —
        // the grounding prompt and the instruction are what А-8 calls inviolable.
        attachments: [{ id: 'a1', fileName: 'notes.md', text: 'x'.repeat(40_000) }],
      },
      unmetNeeds: [],
      runId: 'run-1',
    });

    const prompt = (seen[0] ?? []).map((message) => message.content).join('\n');

    expect(prompt).toContain('A tool that tracks grant deadlines');
    expect(prompt.length).toBeLessThan(40_000);
  });
});
