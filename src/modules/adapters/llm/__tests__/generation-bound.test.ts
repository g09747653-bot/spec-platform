import { beforeEach, describe, expect, it, vi } from 'vitest';

const streamText = vi.fn();

/*
 * The SDK is replaced rather than imported: the lint rule that confines vendor packages to
 * `providers.ts` (constitution P7, A3) applies to this file too, and it should — a test that had to
 * name `ai` to make its point would be evidence the boundary had moved. `Record<string, unknown>` is
 * enough to spread the original over, because what is asserted is the argument, not the SDK.
 */
vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();

  return { ...actual, streamText };
});

const { createProviderStream } = await import('../providers');
const { capacityFor } = await import('../capacity');

/**
 * The explicit generation bound (task 130 AC-2; амендмент А-8, point 3).
 *
 * "The Ollama call provably carries `num_predict`" is an acceptance criterion, and this is where it
 * is proved without a network: `maxOutputTokens` is the SDK's vendor-neutral spelling, and against
 * Ollama's OpenAI-compatible surface it arrives as `max_tokens` and is applied as `num_predict` —
 * verified live in the round-4 pre-flight (`max_tokens: 8` → `finish_reason: "length"` after exactly
 * eight tokens; `artifacts/gate-M9/run-4/preflight/CAPACITY.md`).
 *
 * Why it has to be stated at all: prompt and answer share one window on a local runtime. Left
 * unstated, the split is the runtime's to choose, and its choice is to cut the prompt from the front
 * — which is how the system instruction was thrown away and a summary of two web pages came back in
 * its place (D-146).
 */

function fakeStream(): { stream: AsyncIterable<{ type: string; text: string }> } {
  return {
    stream: {
      async *[Symbol.asyncIterator]() {
        await Promise.resolve();
        yield { type: 'text-delta', text: 'ok' };
      },
    },
  };
}

const call = () => streamText.mock.calls[0]?.[0] as Record<string, unknown> | undefined;

/** The bound the SDK was handed, as a number — the argument is typed `unknown` on the way in. */
const bound = () => Number(call()?.maxOutputTokens ?? 0);

describe('the generation reserve reaches the provider', () => {
  beforeEach(() => {
    streamText.mockReset();
    streamText.mockReturnValue(fakeStream());
  });

  it('bounds the local provider by what is left of its window, not by the minimum', async () => {
    const capacity = capacityFor('ollama', 16_384);
    const stream = createProviderStream(
      'ollama',
      { baseUrl: 'http://127.0.0.1:11434/v1' },
      'qwen3:14b',
      capacity,
    );

    await stream({ messages: [{ role: 'user', content: 'hello' }], onDelta: () => undefined });

    /*
     * A short prompt leaves nearly the whole window for the answer. The round-4 walk is why this is
     * asserted rather than assumed: with a flat 4 096 the Edit proposal — whole documents restated
     * as JSON — stopped mid-object at exactly that count, with 6 900 tokens of window unused, and
     * «the draft is not parseable JSON» is what the user was told.
     */
    expect(bound()).toBeGreaterThan(capacity.generationReserveTokens);
    expect(bound()).toBeLessThan(16_384);
  });

  it('shrinks the answer’s allowance as the prompt takes more of the window', async () => {
    const capacity = capacityFor('ollama', 16_384);
    const stream = createProviderStream(
      'ollama',
      { baseUrl: 'http://127.0.0.1:11434/v1' },
      'qwen3:14b',
      capacity,
    );

    await stream({ messages: [{ role: 'user', content: 'x' }], onDelta: () => undefined });
    const short = bound();

    streamText.mockReset();
    streamText.mockReturnValue(fakeStream());
    await stream({
      messages: [{ role: 'user', content: 'x'.repeat(20_000) }],
      onDelta: () => undefined,
    });

    expect(bound()).toBeLessThan(short);
    // Never below the reserve the prompt budget was computed against.
    expect(bound()).toBeGreaterThanOrEqual(capacity.generationReserveTokens);
  });

  it('leaves a hosted provider unbounded, so А-8 changes no hosted request', async () => {
    const stream = createProviderStream(
      'google',
      { apiKey: 'test-key' },
      'gemini-3.5-flash',
      capacityFor('google', 16_384),
    );

    await stream({ messages: [{ role: 'user', content: 'hello' }], onDelta: () => undefined });

    expect(call()).not.toHaveProperty('maxOutputTokens');
  });

  it('sends no bound at all when no capacity was declared', async () => {
    const stream = createProviderStream('ollama', { baseUrl: 'http://127.0.0.1:11434/v1' }, 'm');

    await stream({ messages: [{ role: 'user', content: 'hello' }], onDelta: () => undefined });

    expect(call()).not.toHaveProperty('maxOutputTokens');
  });
});
