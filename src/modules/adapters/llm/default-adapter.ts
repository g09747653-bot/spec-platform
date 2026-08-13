import { getEnv, type Env } from '@/config/env';

import { createFailoverClient } from './failover-client';
import { buildProviderRegistry } from './provider-registry';
import type { LlmAdapter } from './types';

/**
 * The composition root for model access (task 45; D-23; IR-001-AC-5).
 *
 * One function, so there is exactly one place that decides what "the model" means for a request — the
 * configured chain wrapped in the failover client — and exactly one seam a test replaces to guarantee
 * no automated run reaches a vendor. Route handlers ask for an adapter; nothing above this line knows
 * whether it got three providers, one, or a deterministic stub.
 */
export function createDefaultAdapter(env: Env = getEnv()): LlmAdapter {
  return createFailoverClient({
    providers: buildProviderRegistry(env),
    timeoutMs: env.LLM_REQUEST_TIMEOUT_MS,
  });
}
