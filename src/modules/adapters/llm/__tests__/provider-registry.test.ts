import { describe, expect, it } from 'vitest';

import { parseEnv } from '@/config/env';
import { testEnv } from '@/config/testing/test-env';

import {
  buildProviderRegistry,
  providerChain,
  ProviderConfigurationError,
} from '../provider-registry';
import { DEFAULT_MODELS, splitMessages, toSdkTools } from '../providers';

/**
 * The registry and the vendor edge's pure parts (task 42; IR-001-AC-3/AC-4).
 *
 * Constructing a registry builds real SDK clients but issues no request, so these cases stay inside
 * the "no live provider call" rule while still proving the thing that matters: which providers are
 * attempted, and in what order, follows from configuration alone.
 */

const envWith = (order: string, keys: Record<string, string> = {}) =>
  parseEnv(testEnv({ LLM_PROVIDER_ORDER: order, ...keys }));

describe('buildProviderRegistry', () => {
  it('builds the chain from configuration, in configured order', () => {
    const registry = buildProviderRegistry(
      envWith('openai,google', { OPENAI_API_KEY: 'openai-key' }),
    );

    expect(registry.map((entry) => entry.id)).toEqual(['openai', 'google']);
    expect(registry.map((entry) => entry.priority)).toEqual([1, 2]);
  });

  it('reorders with no code change when the configuration reorders (IR-001-AC-4)', () => {
    const forward = buildProviderRegistry(
      envWith('anthropic,openai,google', {
        ANTHROPIC_API_KEY: 'anthropic-key',
        OPENAI_API_KEY: 'openai-key',
      }),
    );
    const reversed = buildProviderRegistry(
      envWith('google,openai,anthropic', {
        ANTHROPIC_API_KEY: 'anthropic-key',
        OPENAI_API_KEY: 'openai-key',
      }),
    );

    expect(forward.map((entry) => entry.id)).toEqual(['anthropic', 'openai', 'google']);
    expect(reversed.map((entry) => entry.id)).toEqual(['google', 'openai', 'anthropic']);
  });

  it('supports a chain of one — the shape this deployment is actually in', () => {
    const registry = buildProviderRegistry(envWith('google'));

    expect(registry).toHaveLength(1);
    expect(registry[0]?.id).toBe('google');
    expect(registry[0]?.model).toBe(DEFAULT_MODELS.google);
  });

  it('exposes the configured chain without constructing clients', () => {
    expect(providerChain(envWith('google'))).toEqual(['google']);
  });

  it('refuses to build an entry whose key is missing, rather than failing at request time', () => {
    const env = { ...envWith('google'), GOOGLE_GENERATIVE_AI_API_KEY: undefined };

    expect(() => buildProviderRegistry(env)).toThrow(ProviderConfigurationError);
  });

  /**
   * The local provider (round 3; D-90).
   *
   * It is in the registry on the same terms as every other provider — named in the chain, given a
   * model, reached through `ProviderStream` — and on one different term: it is built from an address
   * rather than a credential. Stripping the one key this environment does have is the point of the
   * case, because "no key required" is a claim that only means something when there is no key to find.
   */
  it('builds the local provider from an address, with no credential in the environment', () => {
    const env = { ...envWith('ollama'), GOOGLE_GENERATIVE_AI_API_KEY: undefined };
    const registry = buildProviderRegistry(env);

    expect(registry.map((entry) => entry.id)).toEqual(['ollama']);
    expect(registry[0]?.model).toBe(DEFAULT_MODELS.ollama);
    expect(typeof registry[0]?.stream).toBe('function');
  });

  it('places the local provider after the funded one when the chain says so', () => {
    const registry = buildProviderRegistry(envWith('google,ollama'));

    expect(registry.map((entry) => entry.id)).toEqual(['google', 'ollama']);
    expect(registry.map((entry) => entry.priority)).toEqual([1, 2]);
  });

  it('gives every entry a model and nothing vendor-shaped beyond it', () => {
    const registry = buildProviderRegistry(envWith('google'));

    for (const entry of registry) {
      expect(Object.keys(entry).sort()).toEqual(['id', 'model', 'priority', 'stream']);
      expect(entry.model).not.toBe('');
    }
  });
});

describe('splitMessages', () => {
  it('lifts system messages out of the conversation, in order', () => {
    const { system, turns } = splitMessages([
      { role: 'system', content: 'be brief' },
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
    ]);

    expect(system).toBe('be brief');
    expect(turns).toEqual([
      { role: 'user', content: 'hello' },
      { role: 'assistant', content: 'hi' },
    ]);
  });

  it('joins several system messages rather than dropping any', () => {
    const { system } = splitMessages([
      { role: 'system', content: 'first' },
      { role: 'system', content: 'second' },
      { role: 'user', content: 'go' },
    ]);

    expect(system).toBe('first\n\nsecond');
  });

  it('leaves the system field absent when there is no system message', () => {
    expect(splitMessages([{ role: 'user', content: 'go' }]).system).toBeUndefined();
  });
});

describe('toSdkTools', () => {
  const definition = {
    name: 'search',
    description: 'Search the web.',
    parameters: { type: 'object', properties: { query: { type: 'string' } } },
    execute: () => Promise.resolve('result'),
  };

  it('is absent when no tool was offered, so no tool machinery is engaged', () => {
    expect(toSdkTools(undefined)).toBeUndefined();
    expect(toSdkTools([])).toBeUndefined();
  });

  it('keys the tool set by name and carries the description through', () => {
    const set = toSdkTools([definition]);

    expect(Object.keys(set ?? {})).toEqual(['search']);
    expect(set?.search?.description).toBe('Search the web.');
  });

  it('carries the caller’s parameter schema rather than inventing one', () => {
    const set = toSdkTools([definition]);
    const schema = set?.search?.inputSchema;

    expect(schema).toBeDefined();
    // `jsonSchema()` keeps the definition verbatim, which is what makes the tool contract ours.
    expect(JSON.stringify(schema)).toContain('query');
  });

  it('wires an executable implementation for every tool offered', () => {
    const set = toSdkTools([definition, { ...definition, name: 'fetch' }]);

    expect(Object.keys(set ?? {}).sort()).toEqual(['fetch', 'search']);
    expect(typeof set?.search?.execute).toBe('function');
    expect(typeof set?.fetch?.execute).toBe('function');
  });
});
