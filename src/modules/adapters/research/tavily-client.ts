import { z } from 'zod';

import { truncateToBytes } from './content-budget';
import {
  logResearchUnavailable,
  type FetchedPage,
  type ResearchAdapter,
  type SearchHit,
} from './types';

/**
 * Web search and fetch over Tavily (IR-003; task 70).
 *
 * The vendor lives here and nowhere else — the interface above is what `agents` sees, so swapping the
 * service is an adapter change (constitution A3/P7, applied to the research integration exactly as it
 * is to model providers).
 *
 * **Every failure resolves to "no result".** Timeouts, non-200s, malformed payloads and network
 * errors all take the same path: log `RESEARCH_UNAVAILABLE`, return nothing, let the generation
 * continue (FR-019 AC-4; IR-003-AC-2). There is no error type for a caller to handle because there is
 * no decision for a caller to make.
 *
 * **Responses are parsed, not trusted.** Model-adjacent and web-adjacent bytes crossing into the
 * domain are a boundary like any other (NFR-009 AC-2), and a schema failure is simply another way to
 * have no result.
 */

const SEARCH_ENDPOINT = 'https://api.tavily.com/search';
const EXTRACT_ENDPOINT = 'https://api.tavily.com/extract';

/**
 * `results` is **required**, the fields inside it are not.
 *
 * A missing entry field is a thin result and defaults harmlessly; a missing `results` array means the
 * service is answering something other than what this adapter was written against. Defaulting that to
 * `[]` too would turn a breaking API change into "research quietly stopped working", with nothing in
 * the log to say so. As a schema failure it is still fail-open — the caller gets no hits — but the
 * reason is recorded.
 */
const SearchResponse = z.object({
  results: z.array(
    z.object({
      title: z.string().default(''),
      url: z.string().default(''),
      content: z.string().default(''),
    }),
  ),
});

const ExtractResponse = z.object({
  results: z.array(z.object({ url: z.string().default(''), raw_content: z.string().default('') })),
});

export interface TavilyOptions {
  apiKey: string;
  maxBytes: number;
  timeoutMs: number;
  /** How many hits a search may return. Small on purpose: the budget is spent on reading, not listing. */
  maxResults?: number;
  /** Injectable for tests; production passes nothing and gets the platform's `fetch`. */
  transport?: typeof globalThis.fetch;
}

export function createTavilyResearch(options: TavilyOptions): ResearchAdapter {
  const transport = options.transport ?? globalThis.fetch;
  const maxResults = options.maxResults ?? 3;

  async function post(url: string, body: unknown): Promise<unknown> {
    const response = await transport(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${options.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(options.timeoutMs),
    });

    if (!response.ok) throw new Error(`${url} answered ${String(response.status)}`);

    return response.json();
  }

  return {
    async search(query: string): Promise<SearchHit[]> {
      try {
        const parsed = SearchResponse.parse(
          await post(SEARCH_ENDPOINT, {
            query,
            max_results: maxResults,
            search_depth: 'basic',
            include_answer: false,
          }),
        );

        return parsed.results
          .filter((hit) => hit.url !== '')
          .map((hit) => ({ title: hit.title, url: hit.url, snippet: hit.content }));
      } catch (error) {
        logResearchUnavailable('search', error);
        return [];
      }
    },

    async fetch(url: string): Promise<FetchedPage> {
      try {
        const parsed = ExtractResponse.parse(await post(EXTRACT_ENDPOINT, { urls: [url] }));
        const raw = parsed.results[0]?.raw_content ?? '';

        // The cap is applied before the text is handed back, so nothing above this line ever holds
        // an unbounded page (IR-003-AC-3).
        return truncateToBytes(raw, options.maxBytes);
      } catch (error) {
        logResearchUnavailable('fetch', error);
        return { text: '', truncated: false };
      }
    },
  };
}
