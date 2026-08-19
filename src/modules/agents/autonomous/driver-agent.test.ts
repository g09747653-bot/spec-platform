import { describe, expect, it, vi } from 'vitest';

import type { GenerateOptions, LlmAdapter, ModelMessage } from '@/modules/adapters/llm';
import {
  looksLikeDriverAnswerPrompt,
  looksLikeDriverReviewPrompt,
  stubDriverAnswerDocument,
  stubDriverReviewDocument,
} from '@/modules/adapters/llm';

import { createDriverAgent } from './driver-agent';

/**
 * The driver's content half, and the three layers of Р-1 around it (task 145).
 *
 * The interesting assertions are not about a happy path — the stub answers correctly by
 * construction — but about what the agent does with an answer it cannot use: exactly one more
 * sample, announced, and then a named failure. A silent third attempt is what turns «this model
 * cannot hold the contract» into «the run was slow», and a gate transcript can no longer tell them
 * apart.
 */
/**
 * The prompt an agent handed the adapter, as one string.
 *
 * `messages` may be a function of the provider's capacity (А-8), and the driver never passes one —
 * so reading an array here is not an assumption but the shape this agent always sends. Anything else
 * yields an empty prompt, which fails an assertion rather than passing quietly.
 */
function promptOf(options: GenerateOptions): string {
  const messages: readonly ModelMessage[] = Array.isArray(options.messages) ? options.messages : [];

  return messages.map((message) => message.content).join('\n');
}

/** An adapter that answers with the next document in a list, recording what it was asked. */
const adapter = (documents: readonly string[]): { adapter: LlmAdapter; prompts: string[] } => {
  const prompts: string[] = [];
  let call = 0;

  return {
    prompts,
    adapter: {
      generateStreaming: (options: GenerateOptions) => {
        prompts.push(promptOf(options));
        const text = documents[Math.min(call, documents.length - 1)] ?? '';
        call += 1;

        return Promise.resolve({ text, providerUsed: 'stub', attempts: 1 });
      },
    },
  };
};

/** An adapter that records the prompt it was given and answers as a function of it. */
const echoing = (prompts: string[], answer: (prompt: string) => string): LlmAdapter => ({
  generateStreaming: (options: GenerateOptions) => {
    const prompt = promptOf(options);
    prompts.push(prompt);

    return Promise.resolve({ text: answer(prompt), providerUsed: 'stub', attempts: 1 });
  },
});

const ROUND = [
  {
    id: 'q-provider',
    text: 'Which model provider?',
    type: 'single' as const,
    options: [
      { id: 'anthropic', label: 'Anthropic Claude' },
      { id: 'openai', label: 'OpenAI', recommended: true },
    ],
  },
];

const answerInput = {
  seed: 'A tool that tracks grant deadlines for a small charity.',
  summary: null,
  stage: 'interview',
  questions: ROUND,
  runId: 'run-1',
};

describe('answering a round', () => {
  it('asks with the round rendered as ids, and validates what comes back', async () => {
    /* The stub answers the prompt it is given, so it has to see the prompt first. */
    const prompts: string[] = [];
    const echo = echoing(prompts, stubDriverAnswerDocument);

    const outcome = await createDriverAgent(echo).answerRound(answerInput);

    expect(outcome.kind).toBe('draft');
    expect(prompts[0]).toContain('q-provider | Which model provider? | single');
    expect(prompts[0]).toContain('openai — OpenAI (recommended)');
    /* The seed is fenced and named, so an instruction inside it reads as description. */
    expect(prompts[0]).toContain('<<<DESCRIPTION');

    if (outcome.kind !== 'draft') return;
    expect(outcome.draft.answers[0]?.questionId).toBe('q-provider');
    expect(outcome.draft.rationale).not.toBe('');
  });

  it('re-samples exactly once, and says so, before calling a draft unusable', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { adapter: llm, prompts } = adapter(['not JSON at all', 'still not JSON']);

    const outcome = await createDriverAgent(llm).answerRound(answerInput);

    expect(outcome.kind).toBe('draft-invalid');
    expect(prompts).toHaveLength(2);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it('recovers when the second sample is usable', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const usable = JSON.stringify({
      answers: [{ questionId: 'q-provider', optionIds: ['anthropic'] }],
      rationale: 'The charity already pays for Claude.',
    });
    const { adapter: llm, prompts } = adapter(['# A markdown document', usable]);

    const outcome = await createDriverAgent(llm).answerRound(answerInput);

    expect(outcome.kind).toBe('draft');
    expect(prompts).toHaveLength(2);
    warn.mockRestore();
  });

  /* Р-1 layer 1: the outermost object is taken and the surrounding chatter discarded. */
  it('reads a fenced object out of prose', async () => {
    const body = JSON.stringify({
      answers: [{ questionId: 'q-provider', optionIds: ['openai'] }],
      rationale: 'Nothing in the description names a provider.',
    });
    const { adapter: llm } = adapter([`Sure — here you go:\n\`\`\`json\n${body}\n\`\`\`\nDone.`]);

    const outcome = await createDriverAgent(llm).answerRound(answerInput);
    expect(outcome.kind).toBe('draft');
  });

  it('rejects a draft with no rationale, because an unexplained decision is the failure mode', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { adapter: llm } = adapter([
      JSON.stringify({ answers: [{ questionId: 'q-provider', optionIds: ['openai'] }] }),
    ]);

    const outcome = await createDriverAgent(llm).answerRound(answerInput);
    expect(outcome.kind).toBe('draft-invalid');
    warn.mockRestore();
  });
});

describe('choosing which advisory findings to keep', () => {
  const reviewInput = {
    seed: 'A tool that tracks grant deadlines for a small charity.',
    specType: 'constitution',
    blocking: [{ id: 'mf-1', title: 'Untestable criterion', suggestion: 'Restate it.' }],
    advisory: [{ id: 'rec-1', title: 'Add an example', suggestion: 'One short example.' }],
    runId: 'run-2',
  };

  it('shows the blocking findings without offering them, and asks only about the optional ones', async () => {
    const prompts: string[] = [];
    const echo = echoing(prompts, stubDriverReviewDocument);

    const outcome = await createDriverAgent(echo).selectFindings(reviewInput);

    expect(outcome.kind).toBe('draft');
    expect(prompts[0]).toContain('Already going into the rewrite:');
    expect(prompts[0]).toContain('mf-1 — Untestable criterion');
    expect(prompts[0]).toContain('Optional findings:');

    if (outcome.kind !== 'draft') return;
    expect(outcome.draft.keepIds).toEqual(['rec-1']);
  });

  it('renders an empty list as an explicit «none» rather than a blank', async () => {
    const prompts: string[] = [];
    const echo = echoing(prompts, () =>
      JSON.stringify({ keepIds: [], rationale: 'nothing optional was raised' }),
    );

    await createDriverAgent(echo).selectFindings({ ...reviewInput, advisory: [] });
    expect(prompts[0]).toContain('Optional findings:\n(none)');
  });
});

describe('the stub provider recognises the driver by what its own templates render', () => {
  it('matches each prompt and nothing else', async () => {
    const prompts: string[] = [];
    const capture = echoing(prompts, () => '{}');

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const agent = createDriverAgent(capture);
    await agent.answerRound(answerInput);
    await agent.selectFindings({
      seed: 'x',
      specType: 'constitution',
      blocking: [],
      advisory: [],
      runId: 'run-3',
    });
    warn.mockRestore();

    const answerPrompt = prompts[0] ?? '';
    const reviewPrompt = prompts[2] ?? '';

    expect(looksLikeDriverAnswerPrompt(answerPrompt)).toBe(true);
    expect(looksLikeDriverReviewPrompt(answerPrompt)).toBe(false);
    expect(looksLikeDriverReviewPrompt(reviewPrompt)).toBe(true);
    expect(looksLikeDriverAnswerPrompt(reviewPrompt)).toBe(false);
  });
});
