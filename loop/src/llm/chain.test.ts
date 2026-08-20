import { afterEach, describe, expect, it, vi } from 'vitest';

import { createChain } from './chain.ts';
import { buildProviders } from './providers.ts';
import { AllProvidersFailedError, NoProviderConfiguredError } from './types.ts';

/**
 * The provider chain (task 156; constitution P7, D-229's mirror).
 *
 * The property under test is that **no vendor is unavoidable**: the order is configuration, a link
 * without its credential is skipped rather than fatal, and a failing link is followed by the next
 * one without the caller ever learning a vendor name.
 *
 * No live call anywhere here — `fetch` is replaced, so a case that accidentally reached a provider
 * would fail rather than spend money.
 */
afterEach(() => {
  vi.unstubAllGlobals();
});

const reply = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

describe('which providers a configuration actually has (task 156)', () => {
  it('builds only the links whose credential is present, in the order asked for', () => {
    const providers = buildProviders(['google', 'anthropic', 'openai'], {
      anthropicApiKey: 'a',
      googleApiKey: 'g',
    });

    expect(providers.map((provider) => provider.id)).toEqual(['google', 'anthropic']);
  });

  it('treats a local endpoint’s presence as its configuration', () => {
    expect(buildProviders(['ollama'], {}).map((provider) => provider.id)).toEqual([]);
    expect(
      buildProviders(['ollama'], { localApiBase: 'http://127.0.0.1:11434/v1' }).map(
        (provider) => provider.id,
      ),
    ).toEqual(['ollama']);
  });

  it('has no vendor it cannot be configured without', () => {
    for (const only of ['anthropic', 'openai', 'google', 'ollama'] as const) {
      const credentials = {
        anthropic: { anthropicApiKey: 'k' },
        openai: { openaiApiKey: 'k' },
        google: { googleApiKey: 'k' },
        ollama: { localApiBase: 'http://127.0.0.1:11434/v1' },
      }[only];

      expect(buildProviders([only], credentials).map((provider) => provider.id)).toEqual([only]);
    }
  });
});

describe('failing over (task 156)', () => {
  it('refuses up front when nothing is configured', async () => {
    const chain = createChain({ order: ['anthropic'] });

    await expect(chain.generate({ prompt: 'привет' })).rejects.toBeInstanceOf(
      NoProviderConfiguredError,
    );
  });

  it('moves to the next provider when the first refuses, and says which failed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        url.includes('anthropic')
          ? reply({ error: 'rate limited' }, 429)
          : reply({ choices: [{ message: { content: 'ответ второго' } }] }),
      ),
    );

    const failures: string[] = [];
    const chain = createChain({
      order: ['anthropic', 'openai'],
      anthropicApiKey: 'a',
      openaiApiKey: 'o',
      onProviderFailure: (failure) => failures.push(`${failure.provider}:${failure.error}`),
    });

    const answer = await chain.generate({ prompt: 'привет' });

    expect(answer).toEqual({ text: 'ответ второго', provider: 'openai' });
    expect(failures[0]).toContain('anthropic');
    expect(failures[0]).toContain('429');
  });

  it('treats an empty answer as a failure of that link, not as a result', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) =>
        url.includes('anthropic')
          ? reply({ content: [{ type: 'text', text: '   ' }] })
          : reply({ choices: [{ message: { content: 'настоящий ответ' } }] }),
      ),
    );

    const chain = createChain({
      order: ['anthropic', 'openai'],
      anthropicApiKey: 'a',
      openaiApiKey: 'o',
    });

    expect((await chain.generate({ prompt: 'привет' })).provider).toBe('openai');
  });

  it('reports exhaustion with a count and no vendor payload', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => reply({ error: 'секрет из тела ответа' }, 500)),
    );

    const chain = createChain({
      order: ['anthropic', 'openai'],
      anthropicApiKey: 'a',
      openaiApiKey: 'o',
    });

    try {
      await chain.generate({ prompt: 'привет' });
      expect.unreachable('an exhausted chain must throw');
    } catch (error) {
      expect(error).toBeInstanceOf(AllProvidersFailedError);
      expect((error as AllProvidersFailedError).attempts).toBe(2);
      expect((error as Error).message).not.toContain('секрет');
    }
  });

  it('returns the first provider’s answer without touching the rest', async () => {
    const call = vi.fn(() => reply({ content: [{ type: 'text', text: 'сразу' }] }));
    vi.stubGlobal('fetch', call);

    const chain = createChain({
      order: ['anthropic', 'openai'],
      anthropicApiKey: 'a',
      openaiApiKey: 'o',
    });

    expect((await chain.generate({ prompt: 'привет' })).text).toBe('сразу');
    expect(call).toHaveBeenCalledTimes(1);
  });
});
