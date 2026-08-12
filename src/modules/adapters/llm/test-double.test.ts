import { describe, expect, it } from 'vitest';

import { chunkDocument, createTestDoubleAdapter, STUB_DOCUMENT } from './test-double';
import { AllProvidersFailedError } from './types';

/**
 * Task 18 — the stub provider.
 *
 * Determinism is the property under test: every later suite depends on this adapter behaving the same
 * way twice, so "the same call yields the same chunks" is asserted directly rather than assumed.
 */
const collect = async (adapter: ReturnType<typeof createTestDoubleAdapter>) => {
  const chunks: string[] = [];
  const result = await adapter.generateStreaming({
    messages: [{ role: 'user', content: 'write a constitution' }],
    runId: 'run-1',
    onChunk: (text) => chunks.push(text),
  });

  return { chunks, result };
};

describe('deterministic stub adapter (task 18)', () => {
  it('streams a known document chunk by chunk', async () => {
    const { chunks, result } = await collect(createTestDoubleAdapter());

    expect(chunks.length).toBeGreaterThan(1);
    expect(result.text).toBe(STUB_DOCUMENT);
    expect(result.providerUsed).toBe('anthropic');
    expect(result.attempts).toBe(1);
  });

  it('reassembles byte-for-byte from its chunks', async () => {
    const { chunks, result } = await collect(createTestDoubleAdapter());

    expect(chunks.join('')).toBe(result.text);
  });

  it('produces identical chunks on a second run (IR-001-AC-5)', async () => {
    const first = await collect(createTestDoubleAdapter());
    const second = await collect(createTestDoubleAdapter());

    expect(second.chunks).toEqual(first.chunks);
  });

  it('streams a caller-supplied document', async () => {
    const document = '# Requirements\n\nOne two three four five six seven eight.';
    const { chunks, result } = await collect(createTestDoubleAdapter({ document }));

    expect(result.text).toBe(document);
    expect(chunks.join('')).toBe(document);
  });

  it('respects the chunk size it is given', async () => {
    const document = 'one two three four five six';

    const oneWord = await collect(createTestDoubleAdapter({ document, wordsPerChunk: 1 }));
    const threeWords = await collect(createTestDoubleAdapter({ document, wordsPerChunk: 3 }));

    expect(oneWord.chunks).toHaveLength(6);
    expect(threeWords.chunks).toHaveLength(2);
    expect(threeWords.chunks.join('')).toBe(document);
  });

  it('makes no model call: it needs no network, no key and no client', async () => {
    // The adapter is constructed with nothing. If it required configuration or a client, this line
    // would not compile — which is the substitutability IR-001-AC-5 asks for.
    const adapter = createTestDoubleAdapter();

    await expect(
      adapter.generateStreaming({ messages: [], runId: 'run-2' }),
    ).resolves.toMatchObject({ providerUsed: 'anthropic' });
  });

  describe('failure injection (for the failover tests of tasks 43–48)', () => {
    it('fails after the chosen number of chunks, having emitted exactly that many', async () => {
      const chunks: string[] = [];
      const adapter = createTestDoubleAdapter({ failAtChunk: 3, wordsPerChunk: 2 });

      await expect(
        adapter.generateStreaming({
          messages: [],
          runId: 'run-3',
          onChunk: (text) => chunks.push(text),
        }),
      ).rejects.toBeInstanceOf(AllProvidersFailedError);

      expect(chunks).toHaveLength(3);
    });

    it('fails before the first chunk when told to fail at zero', async () => {
      const chunks: string[] = [];
      const adapter = createTestDoubleAdapter({ failAtChunk: 0 });

      await expect(
        adapter.generateStreaming({
          messages: [],
          runId: 'run-4',
          onChunk: (text) => chunks.push(text),
        }),
      ).rejects.toBeInstanceOf(AllProvidersFailedError);

      expect(chunks).toEqual([]);
    });

    it('never returns partial text — a failed stream resolves to nothing at all', async () => {
      const adapter = createTestDoubleAdapter({ failAtChunk: 2 });

      const result = await adapter
        .generateStreaming({ messages: [], runId: 'run-5' })
        .catch(() => null);

      expect(result).toBeNull();
    });

    it('fails at the very end when the failure point is the chunk count', async () => {
      const document = 'one two three';
      const adapter = createTestDoubleAdapter({ document, wordsPerChunk: 1, failAtChunk: 3 });

      await expect(
        adapter.generateStreaming({ messages: [], runId: 'run-6' }),
      ).rejects.toBeInstanceOf(AllProvidersFailedError);
    });

    it('reports which provider served a successful stream', async () => {
      const adapter = createTestDoubleAdapter({ providerUsed: 'google' });

      const { result } = await collect(adapter);

      expect(result.providerUsed).toBe('google');
    });
  });

  describe('cancellation', () => {
    it('stops when the caller aborts', async () => {
      const controller = new AbortController();
      const chunks: string[] = [];
      const adapter = createTestDoubleAdapter({ wordsPerChunk: 1, chunkDelayMs: 1 });

      const pending = adapter.generateStreaming({
        messages: [],
        runId: 'run-7',
        signal: controller.signal,
        onChunk: (text) => {
          chunks.push(text);
          if (chunks.length === 2) controller.abort();
        },
      });

      await expect(pending).rejects.toThrow();
      expect(chunks).toHaveLength(2);
    });
  });

  describe('chunkDocument', () => {
    it('preserves every separator, so joining restores the input', () => {
      const document = 'a  b\n\nc\td';

      expect(chunkDocument(document, 2).join('')).toBe(document);
    });

    it('emits a final short chunk rather than dropping the remainder', () => {
      // A chunk closes on its last word, so the whitespace that follows opens the next one. What
      // matters is that nothing is lost or duplicated.
      expect(chunkDocument('one two three', 2)).toEqual(['one two', ' three']);
    });

    it('refuses a chunk size below one instead of looping forever', () => {
      expect(() => chunkDocument('a b', 0)).toThrow(/at least 1/);
    });
  });
});
