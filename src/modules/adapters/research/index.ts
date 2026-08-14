import { getEnv, NO_CREDENTIAL, type Env } from '@/config/env';

import { createTavilyResearch } from './tavily-client';
import type { ResearchAdapter } from './types';

/** `adapters/research` — web search and fetch (IR-003). */
export const MODULE_ID = 'adapters/research';

export {
  logResearchUnavailable,
  RESEARCH_UNAVAILABLE,
  type FetchedPage,
  type ResearchAdapter,
  type SearchHit,
} from './types';
export { truncateToBytes } from './content-budget';
export { createTavilyResearch, type TavilyOptions } from './tavily-client';

/**
 * The adapter used when research is not configured.
 *
 * Not a stub for tests — an environment declaring `WEB_SEARCH_API_KEY=none` genuinely has no search
 * service, and the honest behaviour is the same as an outage: no hits, no text, generation continues
 * (FR-019 AC-4). Callers cannot tell the two apart, which is the point: there is one no-research
 * path, and it is exercised every time the suite runs.
 */
export function createNullResearch(): ResearchAdapter {
  return {
    search: () => Promise.resolve([]),
    fetch: () => Promise.resolve({ text: '', truncated: false }),
  };
}

/**
 * The composition root for research, mirroring `createDefaultAdapter` and `createDefaultStorage`.
 *
 * Configuration decides, as everywhere else: a key means Tavily, `none` means the null adapter. No
 * calling code branches on whether research is available, so no calling code can forget that it might
 * not be. The variable is required (D-73), so the choice is always a stated one — an environment that
 * omits it does not boot rather than searching nothing for the rest of its life.
 */
export function createDefaultResearch(env: Env = getEnv()): ResearchAdapter {
  const apiKey = env.WEB_SEARCH_API_KEY;

  return apiKey === NO_CREDENTIAL
    ? createNullResearch()
    : createTavilyResearch({
        apiKey,
        maxBytes: env.WEB_FETCH_MAX_BYTES,
        timeoutMs: env.WEB_FETCH_TIMEOUT_MS,
      });
}
