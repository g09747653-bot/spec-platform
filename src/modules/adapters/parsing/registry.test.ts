import { describe, expect, it, vi } from 'vitest';

import { createExtractorRegistry, type Extractor } from './registry';

/**
 * Task 65 — the registry's three guarantees.
 *
 * Every extractor here is a fake, deliberately: what is under test is the *registry* — the lookup that
 * gates an unregistered type, the ceiling that bounds a slow one, and the promise that nothing escapes
 * as an exception. Real format libraries are exercised in tasks 66–67.
 */
describe('createExtractorRegistry (task 65)', () => {
  const bytes = new Uint8Array([1, 2, 3]);
  const read = () => Promise.resolve(bytes);

  const registry = (extractors: Record<string, Extractor>, timeoutMs = 1_000) =>
    createExtractorRegistry({ extractors, read, timeoutMs });

  it('extracts through the extractor registered for the sniffed type', async () => {
    const adapter = registry({
      'application/pdf': () => Promise.resolve('The document text.'),
      'text/plain': () => Promise.resolve('the wrong one'),
    });

    await expect(adapter.extract({ blobKey: 'k', mimeType: 'application/pdf' })).resolves.toEqual({
      status: 'ok',
      text: 'The document text.',
    });
  });

  /** The acceptance criterion: an unregistered type never *reaches* an extractor. */
  it('never calls an extractor for an unregistered type', async () => {
    const pdf = vi.fn<Extractor>(() => Promise.resolve('text'));
    const adapter = registry({ 'application/pdf': pdf });

    const outcome = await adapter.extract({ blobKey: 'k', mimeType: 'application/zip' });

    expect(outcome).toEqual({
      status: 'failed',
      reason: 'no extractor is registered for application/zip',
    });
    expect(pdf).not.toHaveBeenCalled();
  });

  it('does not read the bytes of an unregistered type either', async () => {
    const source = vi.fn(() => Promise.resolve(bytes));
    const adapter = createExtractorRegistry({ extractors: {}, read: source, timeoutMs: 1_000 });

    await adapter.extract({ blobKey: 'k', mimeType: 'application/zip' });

    expect(source).not.toHaveBeenCalled();
  });

  it('reports a passthrough type as such rather than as empty text', async () => {
    const adapter = registry({ 'image/png': () => Promise.resolve(null) });

    await expect(adapter.extract({ blobKey: 'k', mimeType: 'image/png' })).resolves.toEqual({
      status: 'passthrough',
    });
  });

  describe('failure', () => {
    it('records a timeout and returns rather than hanging', async () => {
      vi.useFakeTimers();

      try {
        const adapter = registry(
          { 'application/pdf': () => new Promise<string>(() => undefined) },
          50,
        );

        const outcome = adapter.extract({ blobKey: 'k', mimeType: 'application/pdf' });
        await vi.advanceTimersByTimeAsync(60);

        expect(await outcome).toEqual({
          status: 'failed',
          reason: 'extraction exceeded 50 ms',
        });
      } finally {
        vi.useRealTimers();
      }
    });

    it('turns a throwing extractor into a recorded failure, never an exception', async () => {
      const adapter = registry({
        'application/pdf': () => Promise.reject(new Error('corrupt xref table\n  at parse()')),
      });

      await expect(adapter.extract({ blobKey: 'k', mimeType: 'application/pdf' })).resolves.toEqual(
        { status: 'failed', reason: 'corrupt xref table' },
      );
    });

    it('turns an unreadable object into a recorded failure', async () => {
      const adapter = createExtractorRegistry({
        extractors: { 'application/pdf': () => Promise.resolve('unreachable') },
        read: () => Promise.reject(new Error('no stored object for key k')),
        timeoutMs: 1_000,
      });

      await expect(adapter.extract({ blobKey: 'k', mimeType: 'application/pdf' })).resolves.toEqual(
        { status: 'failed', reason: 'no stored object for key k' },
      );
    });

    /** A parser that "succeeds" with whitespace has failed; storing it would claim an empty document. */
    it('treats whitespace-only output as a failure', async () => {
      const adapter = registry({ 'application/pdf': () => Promise.resolve('  \n\t ') });

      await expect(adapter.extract({ blobKey: 'k', mimeType: 'application/pdf' })).resolves.toEqual(
        { status: 'failed', reason: 'no text could be extracted from the file' },
      );
    });

    it('never lets a thrown non-Error escape either', async () => {
      const adapter = registry({
        // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- the case under test.
        'application/pdf': () => Promise.reject('a string, thrown by a library'),
      });

      await expect(adapter.extract({ blobKey: 'k', mimeType: 'application/pdf' })).resolves.toEqual(
        { status: 'failed', reason: 'a string, thrown by a library' },
      );
    });
  });
});
