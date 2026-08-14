import { describe, expect, it, vi } from 'vitest';

import { parseEnv } from '@/config/env';
import { testEnv } from '@/config/testing/test-env';

import { truncateToBytes } from './content-budget';
import { createTavilyResearch } from './tavily-client';
import { createDefaultResearch, createNullResearch } from './index';

/**
 * Task 70 — the research adapter, and the one property that matters most: **it cannot fail**.
 *
 * Every test below that provokes an error asserts a *value*, never a rejection. FR-019 AC-4 says a
 * research failure must not fail the stage, and the only way to make that true everywhere is for the
 * adapter to have no failure path for a caller to mishandle.
 */
describe('research adapter (task 70)', () => {
  const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  const adapter = (transport: typeof globalThis.fetch, maxBytes = 1_000) =>
    createTavilyResearch({ apiKey: 'test-key', maxBytes, timeoutMs: 1_000, transport });

  it('returns the hits a search found', async () => {
    const transport = vi.fn(() =>
      Promise.resolve(
        json({
          results: [
            { title: 'Drizzle docs', url: 'https://example.test/drizzle', content: 'An ORM.' },
            { title: 'Neon docs', url: 'https://example.test/neon', content: 'Postgres.' },
          ],
        }),
      ),
    );

    await expect(adapter(transport).search('drizzle orm')).resolves.toEqual([
      { title: 'Drizzle docs', url: 'https://example.test/drizzle', snippet: 'An ORM.' },
      { title: 'Neon docs', url: 'https://example.test/neon', snippet: 'Postgres.' },
    ]);
  });

  it('sends the key as a bearer token and never in the query', async () => {
    const seen: { url: string; headers: Record<string, string> }[] = [];
    const transport: typeof globalThis.fetch = (url, init) => {
      seen.push({
        url: url instanceof URL ? url.href : url instanceof Request ? url.url : url,
        headers: (init?.headers ?? {}) as Record<string, string>,
      });

      return Promise.resolve(json({ results: [] }));
    };

    await adapter(transport).search('anything');

    expect(seen[0]?.url).toBe('https://api.tavily.com/search');
    expect(seen[0]?.url).not.toContain('test-key');
    expect(seen[0]?.headers.authorization).toBe('Bearer test-key');
  });

  it('fetches a page and caps it at the configured byte budget (IR-003-AC-3)', async () => {
    const transport = vi.fn(() =>
      Promise.resolve(
        json({ results: [{ url: 'https://example.test/a', raw_content: 'x'.repeat(5_000) }] }),
      ),
    );

    const page = await adapter(transport, 100).fetch('https://example.test/a');

    expect(page.truncated).toBe(true);
    expect(new TextEncoder().encode(page.text).length).toBeLessThanOrEqual(100);
  });

  describe('every failure resolves to no result (AC-4; IR-003-AC-2)', () => {
    const cases: [string, () => Promise<Response>][] = [
      ['a non-200 answer', () => Promise.resolve(json({ error: 'nope' }, 500))],
      ['a network error', () => Promise.reject(new Error('ECONNRESET'))],
      ['a timeout', () => Promise.reject(new DOMException('aborted', 'TimeoutError'))],
      ['a payload that is not what the schema expects', () => Promise.resolve(json({ ok: 1 }))],
      ['a body that is not JSON at all', () => Promise.resolve(new Response('<html>'))],
    ];

    for (const [name, behaviour] of cases) {
      it(`returns no hits and no text on ${name}`, async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

        try {
          const client = adapter(behaviour);

          await expect(client.search('anything')).resolves.toEqual([]);
          await expect(client.fetch('https://example.test/a')).resolves.toEqual({
            text: '',
            truncated: false,
          });
          expect(warn).toHaveBeenCalled();
          expect(warn.mock.calls.flat().join(' ')).toContain('RESEARCH_UNAVAILABLE');
        } finally {
          warn.mockRestore();
        }
      });
    }
  });

  it('drops hits with no url rather than fetching nothing', async () => {
    const transport = vi.fn(() =>
      Promise.resolve(json({ results: [{ title: 'Nameless', url: '', content: 'x' }] })),
    );

    await expect(adapter(transport).search('anything')).resolves.toEqual([]);
  });

  describe('the null adapter', () => {
    it('behaves exactly like an outage, so no caller can tell them apart', async () => {
      const research = createNullResearch();

      await expect(research.search('anything')).resolves.toEqual([]);
      await expect(research.fetch('https://example.test/a')).resolves.toEqual({
        text: '',
        truncated: false,
      });
    });
  });

  describe('truncateToBytes', () => {
    it('leaves text within the budget untouched', () => {
      expect(truncateToBytes('hello', 100)).toEqual({ text: 'hello', truncated: false });
    });

    it('never splits a multi-byte character', () => {
      // Four 3-byte characters; a 10-byte budget must stop after three of them.
      const result = truncateToBytes('日本語です', 10);

      expect(result.truncated).toBe(true);
      expect(result.text).toBe('日本語');
      expect(result.text).not.toContain('�');
    });

    it('handles a zero budget without producing a replacement character', () => {
      expect(truncateToBytes('日本語', 0)).toEqual({ text: '', truncated: true });
    });
  });

  /**
   * The composition root, after `WEB_SEARCH_API_KEY` became required (D-73).
   *
   * The sharper of the two cases: a key that is present but wrong would make a paid third-party call
   * on every generation and get nothing for it, and the adapter's own no-failure rule would hide
   * that behind an empty result. So "no search here" is a value, not an omission — and an omission
   * is a boot failure rather than a search that quietly never happens.
   *
   * The Tavily side is asserted without a call: the adapter is built with a transport that would
   * record one, and the assertion is that resolution alone does not reach for it.
   */
  describe('createDefaultResearch selects on the credential (D-73)', () => {
    it('gives the null adapter for the stated absence', async () => {
      const research = createDefaultResearch(parseEnv(testEnv({ WEB_SEARCH_API_KEY: 'none' })));

      await expect(research.search('anything')).resolves.toEqual([]);
      await expect(research.fetch('https://example.test')).resolves.toEqual({
        text: '',
        truncated: false,
      });
    });

    it('gives the live adapter for a real key', async () => {
      /*
       * The two adapters are told apart by what a search *does*, not by what it returns: the null
       * one answers `[]` without reaching for a transport, so a recorded call is the evidence that
       * the live one was selected.
       *
       * The stub goes in **before** the adapter is built, not before the call: `createTavilyResearch`
       * captures `globalThis.fetch` once, at construction. Stubbing afterwards left the adapter
       * holding the real one — and the run went to api.tavily.com, got a 401, and passed anyway,
       * because a failed search is an empty result by design (FR-019 AC-4). A live call from a test
       * is invisible here unless the transport is taken away first (NFR-012 AC-2).
       */
      const seen: string[] = [];
      const original = globalThis.fetch;
      globalThis.fetch = ((url: string) => {
        seen.push(url);
        return Promise.resolve(json({ results: [] }));
      }) as unknown as typeof globalThis.fetch;

      try {
        const research = createDefaultResearch(
          parseEnv(testEnv({ WEB_SEARCH_API_KEY: 'tvly-key' })),
        );

        await research.search('drizzle orm');
      } finally {
        globalThis.fetch = original;
      }

      expect(seen).toHaveLength(1);
      expect(seen[0]).toContain('tavily.com');
    });
  });
});
