import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { describeAllowedTypes, guardUpload, resolveDeclaredType } from './upload-guard';

/**
 * Task 64 — what may be written, decided before anything is written.
 *
 * The guard is pure, so these tests assert the verdict. That no blob is written on a rejection is
 * asserted where it is actually observable — against the storage double in the upload service test
 * (`attachment-service.test.ts`), which fails if `put` was entered even once (SC-9).
 */
describe('guardUpload (task 64)', () => {
  const limits = {
    maxBytes: 1_000,
    allowedTypes: [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/markdown',
      'image/png',
    ],
  };

  const pdf = (size = 100) => {
    const bytes = new Uint8Array(size);
    bytes.set(strToU8('%PDF-1.7\n'));
    return bytes;
  };

  it('accepts a supported file and reports the sniffed type and the real size', () => {
    const outcome = guardUpload(
      { fileName: 'brief.pdf', declaredType: 'application/pdf', bytes: pdf(120) },
      limits,
    );

    expect(outcome).toEqual({ ok: true, mimeType: 'application/pdf', sizeBytes: 120 });
  });

  describe('size', () => {
    it('rejects on the declared length before looking at the bytes', () => {
      const outcome = guardUpload(
        {
          fileName: 'brief.pdf',
          declaredType: 'application/pdf',
          declaredSizeBytes: 5_000,
          bytes: pdf(),
        },
        limits,
      );

      expect(outcome).toMatchObject({ ok: false, code: 'UPLOAD_REJECTED', reason: 'size' });
    });

    /** A client can lie about the length; the bytes are the fact. */
    it('rejects oversized bytes that arrived under an honest-looking declaration', () => {
      const outcome = guardUpload(
        {
          fileName: 'brief.pdf',
          declaredType: 'application/pdf',
          declaredSizeBytes: 10,
          bytes: pdf(2_000),
        },
        limits,
      );

      expect(outcome).toMatchObject({ ok: false, reason: 'size' });
    });

    it('names the limit in the message (FR-004 AC-4)', () => {
      const outcome = guardUpload(
        {
          fileName: 'brief.pdf',
          declaredType: 'application/pdf',
          declaredSizeBytes: 20_000_000,
          bytes: pdf(2_000),
        },
        { ...limits, maxBytes: 10_485_760 },
      );

      expect(outcome.ok).toBe(false);
      if (!outcome.ok) expect(outcome.message).toContain('10.0 MB');
    });

    it('rejects an empty file', () => {
      const outcome = guardUpload(
        { fileName: 'empty.txt', declaredType: 'text/plain', bytes: new Uint8Array() },
        limits,
      );

      expect(outcome).toMatchObject({ ok: false, reason: 'empty' });
    });
  });

  describe('type', () => {
    it('rejects a type outside the allowed list, naming the supported types', () => {
      const outcome = guardUpload(
        {
          fileName: 'sheet.xlsx',
          declaredType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          bytes: zipSync({ '[Content_Types].xml': strToU8('<Types/>') }),
        },
        limits,
      );

      expect(outcome).toMatchObject({ ok: false, reason: 'type' });
      if (!outcome.ok) expect(outcome.message).toContain('PDF, DOCX, plain text, Markdown, PNG');
    });

    it('rejects a file whose contents contradict its declared type', () => {
      const outcome = guardUpload(
        { fileName: 'brief.pdf', declaredType: 'application/pdf', bytes: strToU8('# not a pdf') },
        limits,
      );

      expect(outcome).toMatchObject({ ok: false, reason: 'type' });
      if (!outcome.ok) expect(outcome.message).toContain('do not match');
    });

    it('rejects bytes nothing recognises', () => {
      const outcome = guardUpload(
        {
          fileName: 'mystery.bin',
          declaredType: 'application/pdf',
          bytes: new Uint8Array([0, 1, 2, 3]),
        },
        limits,
      );

      expect(outcome).toMatchObject({ ok: false, reason: 'type' });
    });

    it('accepts a Markdown file the browser declined to name', () => {
      const outcome = guardUpload(
        {
          fileName: 'notes.md',
          declaredType: 'application/octet-stream',
          bytes: strToU8('# Notes\n'),
        },
        limits,
      );

      expect(outcome).toEqual({ ok: true, mimeType: 'text/markdown', sizeBytes: 8 });
    });

    it('accepts a file with no declaration at all, on the strength of its bytes', () => {
      const outcome = guardUpload(
        { fileName: 'unnamed', declaredType: '', bytes: pdf(50) },
        limits,
      );

      expect(outcome).toMatchObject({ ok: true, mimeType: 'application/pdf' });
    });
  });

  describe('resolveDeclaredType', () => {
    it('prefers a stated type and falls back to the extension', () => {
      expect(resolveDeclaredType('a.md', 'text/markdown')).toBe('text/markdown');
      expect(resolveDeclaredType('a.md', '')).toBe('text/markdown');
      expect(resolveDeclaredType('a.PDF', 'application/octet-stream')).toBe('application/pdf');
      expect(resolveDeclaredType('a.md', 'text/plain')).toBe('text/plain');
    });

    it('claims nothing for an unknown extension with no stated type', () => {
      expect(resolveDeclaredType('archive', '')).toBeNull();
    });
  });

  describe('describeAllowedTypes', () => {
    it('is derived from the configuration rather than restated', () => {
      expect(describeAllowedTypes(['application/pdf', 'image/jpeg'])).toBe('PDF, JPEG');
      expect(describeAllowedTypes(['text/plain', 'text/markdown'])).toBe('plain text, Markdown');
      expect(describeAllowedTypes(['application/x-future'])).toBe('application/x-future');
    });
  });
});
