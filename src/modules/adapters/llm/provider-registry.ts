import { getEnv, type Env } from '@/config/env';

import { createProviderStream, DEFAULT_MODELS, type ProviderStream } from './providers';
import { createStubProviderStream } from './test-double';
import type { ProviderId } from './types';

/**
 * The provider registry (task 42; solution.md — `adapters/llm`; IR-001-AC-4).
 *
 * "Configuration-driven ordered list of `{ id, model, priority }`" — built here from
 * `LLM_PROVIDER_ORDER` and nothing else. Reordering the chain, shortening it to one provider, or
 * adding a third are configuration changes; no call site learns about any of them, because the
 * failover client consumes this list rather than naming providers.
 *
 * The environment loader has already guaranteed that every provider named in the chain has a
 * non-empty key (D-46), so a registry built from a valid configuration is always usable.
 */
export interface ProviderEntry {
  id: ProviderId;
  model: string;
  /** 1-based position in the chain: the order providers are attempted in. */
  priority: number;
  stream: ProviderStream;
}

/** Missing at this point means the environment loader was bypassed, which is a programming error. */
export class ProviderConfigurationError extends Error {
  constructor(provider: ProviderId) {
    super(
      `No API key configured for provider "${provider}", which appears in LLM_PROVIDER_ORDER. ` +
        'The environment loader should have refused to start; see src/config/env.ts.',
    );
    this.name = 'ProviderConfigurationError';
  }
}

function apiKeyFor(env: Env, provider: ProviderId): string {
  const key =
    provider === 'anthropic'
      ? env.ANTHROPIC_API_KEY
      : provider === 'openai'
        ? env.OPENAI_API_KEY
        : env.GOOGLE_GENERATIVE_AI_API_KEY;

  if (key === undefined || key.trim() === '') throw new ProviderConfigurationError(provider);

  return key;
}

export function buildProviderRegistry(env: Env = getEnv()): readonly ProviderEntry[] {
  return env.LLM_PROVIDER_ORDER.map((id, index) => {
    const model = DEFAULT_MODELS[id];

    return {
      id,
      model,
      priority: index + 1,
      // The double is a provider like any other from here: same interface, chosen the same way, and
      // reached with no key because it has no vendor behind it (D-48; IR-001-AC-5).
      stream:
        id === 'stub'
          ? createStubProviderStream()
          : createProviderStream(id, apiKeyFor(env, id), model),
    };
  });
}

/** The chain as configured, without constructing clients — for logging and for the run record. */
export function providerChain(env: Env = getEnv()): readonly ProviderId[] {
  return env.LLM_PROVIDER_ORDER;
}
