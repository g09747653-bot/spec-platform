import { getEnv, type Env } from '@/config/env';

import { DEFAULT_MODELS } from './providers';
import { createFailoverClient } from './failover-client';
import { buildProviderRegistry } from './provider-registry';
import type { LlmAdapter, ProviderId } from './types';

/**
 * The composition root for model access (task 45; D-23; IR-001-AC-5).
 *
 * One function, so there is exactly one place that decides what "the model" means for a request — the
 * configured chain wrapped in the failover client — and exactly one seam a test replaces to guarantee
 * no automated run reaches a vendor. Route handlers ask for an adapter; nothing above this line knows
 * whether it got three providers, one, or a deterministic stub.
 *
 * **Pinning a model (task 121).** A session may choose one, and choosing one means exactly this: the
 * chain is filtered to that provider, so the failover client still runs — with a chain of length one.
 * Nothing else changes, and in particular the *call* is identical: the picker selects who answers,
 * not how the request is made (A3; P7). `null`, the default, is Auto and leaves the chain whole,
 * which is what every session before M9п meant and what А-3 requires Auto to keep meaning.
 *
 * A pinned provider that is not in the configured chain falls back to the whole chain. The picker
 * only ever offers configured providers, so this covers a stored choice whose key was later removed
 * — where refusing to answer would be a worse response than answering with the chain.
 *
 * **`env` stays the first parameter, and callers pass `undefined` for it.** That is not clumsiness:
 * this function is the seam every route test replaces, and reading the environment *inside* it is
 * what lets a test mock the seam without also having to mock configuration it does not care about.
 * Moving the options first would push a `getEnv()` call into every route, which is one place too
 * many for "what the model is" to be decided.
 */
export function createDefaultAdapter(
  env: Env = getEnv(),
  options: { modelId?: string | null } = {},
): LlmAdapter {
  const registry = buildProviderRegistry(env);
  const provider = pinnedProvider(options.modelId, env);
  const pinned = provider === null ? registry : registry.filter((entry) => entry.id === provider);

  return createFailoverClient({
    providers: pinned.length === 0 ? registry : pinned,
    timeoutMs: env.LLM_REQUEST_TIMEOUT_MS,
  });
}

/** The value a session stores when it has made no choice — Auto, the whole chain (task 121). */
export const AUTO_MODEL = 'auto';

export interface ModelChoice {
  /** `auto`, or a provider id. What the session column holds. */
  id: string;
  /** What the picker shows: the model's own name, or «Auto». */
  label: string;
}

/**
 * What the per-chat picker may offer (task 121).
 *
 * Derived from the configured chain, so a provider whose key is absent is **not in the list** rather
 * than listed and broken: the environment loader refuses to start with a keyless provider in
 * `LLM_PROVIDER_ORDER` (D-46), which makes "configured" and "usable" the same set. Auto is first
 * because it is the default and because it is the answer for anyone who does not want to choose.
 */
export function modelRegistry(env: Env = getEnv()): ModelChoice[] {
  return [
    { id: AUTO_MODEL, label: 'Auto' },
    ...env.LLM_PROVIDER_ORDER.map((id) => ({ id, label: DEFAULT_MODELS[id] })),
  ];
}

/** Narrows a stored model id to a provider the chain still has, or `null` for Auto. */
export function pinnedProvider(
  modelId: string | null | undefined,
  env: Env = getEnv(),
): ProviderId | null {
  if (modelId === null || modelId === undefined || modelId === AUTO_MODEL) return null;

  return env.LLM_PROVIDER_ORDER.find((id) => id === modelId) ?? null;
}
