import { describe, expect, it, vi } from 'vitest';

import type { Env } from '@/config/env';

import {
  AUTO_MODEL,
  createDefaultAdapter,
  modelRegistry,
  pinnedProvider,
} from '../default-adapter';
import * as providerRegistry from '../provider-registry';
import type { ProviderId } from '../types';

/**
 * Task 121 — the per-chat model picker, at the seam where a choice becomes a call.
 *
 * The acceptance criterion is "picking a concrete model provably changes the adapter invocation, and
 * Auto restores chain behaviour", so the assertions are about **which provider streams**, observed
 * with a spy on the provider entries themselves. Asserting on the registry's shape would only prove
 * the list was filtered; asserting on who was called proves the request went where the picker said.
 */
const env = (order: readonly ProviderId[]): Env =>
  ({
    LLM_PROVIDER_ORDER: order,
    LLM_REQUEST_TIMEOUT_MS: 1_000,
  }) as unknown as Env;

/** Provider entries whose streams record their own name and answer with it. */
function spyRegistry(order: readonly ProviderId[]) {
  const calls: ProviderId[] = [];

  const entries = order.map((id, index) => ({
    id,
    model: `${id}-model`,
    priority: index + 1,
    stream: vi.fn(async (input: { onDelta: (text: string) => void }) => {
      calls.push(id);
      input.onDelta(id);
      return Promise.resolve(id);
    }),
  }));

  vi.spyOn(providerRegistry, 'buildProviderRegistry').mockReturnValue(entries);

  return { calls };
}

const ask = (adapter: ReturnType<typeof createDefaultAdapter>) =>
  adapter.generateStreaming({
    messages: [{ role: 'user', content: 'hello' }],
    runId: 'run-1',
  });

describe('the model a chat picks', () => {
  it('is the only provider called when one is pinned', async () => {
    const { calls } = spyRegistry(['google', 'ollama']);

    const result = await ask(
      createDefaultAdapter(env(['google', 'ollama']), { modelId: 'ollama' }),
    );

    expect(calls).toEqual(['ollama']);
    expect(result.providerUsed).toBe('ollama');
  });

  it('leaves the chain whole on Auto, so the first provider answers as before (А-3)', async () => {
    const { calls } = spyRegistry(['google', 'ollama']);

    const result = await ask(
      createDefaultAdapter(env(['google', 'ollama']), { modelId: AUTO_MODEL }),
    );

    expect(calls).toEqual(['google']);
    expect(result.providerUsed).toBe('google');
  });

  /*
   * A pinned provider that is no longer configured. Answering with the chain is the right degradation
   * — the alternative is a session that cannot generate at all because a key was rotated away — and
   * it is the same rule `methodologyConfig` applies to a methodology this build stopped shipping.
   */
  it('falls back to the whole chain when the pinned provider is gone', async () => {
    const { calls } = spyRegistry(['google']);

    await ask(createDefaultAdapter(env(['google']), { modelId: 'anthropic' }));

    expect(calls).toEqual(['google']);
  });

  it('offers Auto plus each configured model, and nothing that is not configured', () => {
    const choices = modelRegistry(env(['google', 'ollama']));

    expect(choices[0]).toEqual({ id: AUTO_MODEL, label: 'Auto' });
    expect(choices.map((choice) => choice.id)).toEqual([AUTO_MODEL, 'google', 'ollama']);
    // A provider with no key is not in `LLM_PROVIDER_ORDER` (D-46), so it cannot be offered here.
    expect(choices.some((choice) => choice.id === 'anthropic')).toBe(false);
  });

  it('reads a stored choice back to a provider, and anything unusable to Auto', () => {
    const configured = env(['google', 'ollama']);

    expect(pinnedProvider('ollama', configured)).toBe('ollama');
    expect(pinnedProvider(AUTO_MODEL, configured)).toBeNull();
    expect(pinnedProvider(null, configured)).toBeNull();
    expect(pinnedProvider('anthropic', configured)).toBeNull();
  });
});
