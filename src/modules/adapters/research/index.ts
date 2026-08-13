import { getEnv, type Env } from '@/config/env';

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
 * Not a stub for tests — a deployment without `WEB_SEARCH_API_KEY` genuinely has no search service,
 * and the honest behaviour is the same as an outage: no hits, no text, generation continues (FR-019
 * AC-4). Callers cannot tell the two apart, which is the point: there is one no-research path, and it
 * is exercised every time the suite runs.
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
 * Configuration decides, as everywhere else: a key means Tavily, no key means the null adapter. No
 * calling code branches on whether research is available, so no calling code can forget that it might
 * not be.
 */
export function createDefaultResearch(env: Env = getEnv()): ResearchAdapter {
  const apiKey = env.WEB_SEARCH_API_KEY;

  return apiKey === undefined
    ? createNullResearch()
    : createTavilyResearch({
        apiKey,
        maxBytes: env.WEB_FETCH_MAX_BYTES,
        timeoutMs: env.WEB_FETCH_TIMEOUT_MS,
      });
}
