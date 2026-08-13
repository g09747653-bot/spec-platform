import { describe, expect, it, vi } from 'vitest';

import type { ResearchAdapter } from '@/modules/adapters/research';

import { performResearch, researchQuery } from './research-step';

/**
 * Task 70 at the step level (FR-019 AC-1/AC-3/AC-4).
 *
 * The claims are about what the step does *without being asked*: it searches on its own, it reads a
 * bounded number of pages, and it survives everything the adapter can hand it — which, by design, is
 * only ever emptiness.
 */
describe('performResearch (task 70)', () => {
  const adapter = (overrides: Partial<ResearchAdapter> = {}): ResearchAdapter => ({
    search: () => Promise.resolve([]),
    fetch: () => Promise.resolve({ text: '', truncated: false }),
    ...overrides,
  });

  const hits = (count: number) =>
    Array.from({ length: count }, (_value, index) => ({
      title: `Page ${String(index)}`,
      url: `https://example.test/${String(index)}`,
      snippet: 'A snippet.',
    }));

  it('searches without being asked, and reads what it finds (AC-1/AC-3)', async () => {
    const search = vi.fn(() => Promise.resolve(hits(1)));

    const outcome = await performResearch(
      adapter({ search, fetch: () => Promise.resolve({ text: 'Page text.', truncated: false }) }),
      { specType: 'solution', initialPrompt: 'A tool that writes specs' },
    );

    expect(search).toHaveBeenCalledTimes(1);
    expect(outcome.pages).toHaveLength(1);
    expect(outcome.pages[0]?.text).toBe('Page text.');
  });

  it('reads a bounded number of pages however many hits come back', async () => {
    const fetch = vi.fn(() => Promise.resolve({ text: 'Page text.', truncated: false }));

    await performResearch(adapter({ search: () => Promise.resolve(hits(10)), fetch }), {
      specType: 'requirements',
      initialPrompt: 'A tool',
    });

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('carries the truncation flag through to the context (IR-003-AC-3)', async () => {
    const outcome = await performResearch(
      adapter({
        search: () => Promise.resolve(hits(1)),
        fetch: () => Promise.resolve({ text: 'Half a page.', truncated: true }),
      }),
      { specType: 'tasks', initialPrompt: 'A tool' },
    );

    expect(outcome.pages[0]?.truncated).toBe(true);
  });

  describe('nothing can fail the stage (AC-4)', () => {
    it('returns no pages when the search found nothing', async () => {
      await expect(
        performResearch(adapter(), { specType: 'constitution', initialPrompt: 'A tool' }),
      ).resolves.toEqual({ pages: [] });
    });

    it('skips a hit whose page came back empty rather than listing it', async () => {
      const outcome = await performResearch(
        adapter({
          search: () => Promise.resolve(hits(2)),
          fetch: (url) =>
            Promise.resolve(
              url.endsWith('/0')
                ? { text: '   \n ', truncated: false }
                : { text: 'Real content.', truncated: false },
            ),
        }),
        { specType: 'solution', initialPrompt: 'A tool' },
      );

      expect(outcome.pages.map((page) => page.url)).toEqual(['https://example.test/1']);
    });
  });

  describe('the query', () => {
    it('is derived from the prompt and the stage, deterministically', () => {
      const first = researchQuery('solution', 'A tool that writes specifications');
      const second = researchQuery('solution', 'A tool that writes specifications');

      expect(first).toBe(second);
      expect(first).toContain('A tool that writes specifications');
      expect(first).toContain('libraries');
    });

    it('asks a different question for each stage', () => {
      const queries = (['constitution', 'requirements', 'solution', 'tasks'] as const).map((type) =>
        researchQuery(type, 'A tool'),
      );

      expect(new Set(queries).size).toBe(4);
    });

    it('bounds a very long prompt, and collapses its whitespace', () => {
      const query = researchQuery('tasks', `${'word '.repeat(200)}\n\n\tend`);

      expect(query.length).toBeLessThan(220);
      expect(query).not.toContain('\n');
    });
  });
});
