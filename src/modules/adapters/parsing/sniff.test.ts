import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { DOCX_MIME, sniffMimeType, XLSX_MIME } from './sniff';

/**
 * Task 64/65 — the sniffed type is the one that decides.
 *
 * The declared type appears in exactly one assertion group below (Markdown versus plain text) and is
 * ignored everywhere else, which is the property the guard depends on: a file that claims to be a PDF
 * and is not cannot become one by saying so.
 */
describe('sniffMimeType (tasks 64–65)', () => {
  const bytes = (...values: number[]) => new Uint8Array(values);
  const text = (value: string) => strToU8(value);

  const ooxml = (contentType: string, extra: Record<string, Uint8Array> = {}) =>
    zipSync({
      '[Content_Types].xml': strToU8(
        `<?xml version="1.0" encoding="UTF-8"?><Types><Override PartName="/doc" ContentType="${contentType}"/></Types>`,
      ),
      ...extra,
    });

  it('recognises a PDF by its signature', () => {
    expect(sniffMimeType({ bytes: text('%PDF-1.7\n...'), declaredType: '' })).toBe(
      'application/pdf',
    );
  });

  it('recognises PNG and JPEG', () => {
    expect(
      sniffMimeType({
        bytes: bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0),
        declaredType: '',
      }),
    ).toBe('image/png');
    expect(sniffMimeType({ bytes: bytes(0xff, 0xd8, 0xff, 0xe0, 0), declaredType: '' })).toBe(
      'image/jpeg',
    );
  });

  it('tells DOCX from XLSX by the part the archive declares', () => {
    const docx = ooxml(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml',
    );
    const xlsx = ooxml(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml',
    );

    expect(sniffMimeType({ bytes: docx, declaredType: '' })).toBe(DOCX_MIME);
    expect(sniffMimeType({ bytes: xlsx, declaredType: '' })).toBe(XLSX_MIME);
  });

  it('refuses a ZIP that is not an OOXML document', () => {
    const archive = zipSync({ 'notes.txt': strToU8('just a zip') });

    expect(sniffMimeType({ bytes: archive, declaredType: '' })).toBeNull();
  });

  it('refuses a truncated archive rather than throwing', () => {
    const archive = ooxml(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml',
    );

    expect(sniffMimeType({ bytes: archive.slice(0, 30), declaredType: '' })).toBeNull();
  });

  it('does not believe a declared type over the bytes', () => {
    expect(sniffMimeType({ bytes: text('%PDF-1.7'), declaredType: 'image/png' })).toBe(
      'application/pdf',
    );
    expect(
      sniffMimeType({ bytes: bytes(0x00, 0x01, 0x02, 0x03), declaredType: 'application/pdf' }),
    ).toBeNull();
  });

  describe('text', () => {
    it('separates Markdown from plain text by the declaration alone', () => {
      const document = text('# Heading\n\nA paragraph.\n');

      expect(sniffMimeType({ bytes: document, declaredType: 'text/markdown' })).toBe(
        'text/markdown',
      );
      expect(sniffMimeType({ bytes: document, declaredType: 'text/plain' })).toBe('text/plain');
      expect(sniffMimeType({ bytes: document, declaredType: '' })).toBe('text/plain');
    });

    it('accepts tabs and newlines, and refuses binary that decodes', () => {
      expect(sniffMimeType({ bytes: text('a\tb\r\nc\n'), declaredType: '' })).toBe('text/plain');
      expect(sniffMimeType({ bytes: bytes(0x41, 0x00, 0x42), declaredType: '' })).toBeNull();
    });

    it('refuses bytes that are not valid UTF-8', () => {
      expect(sniffMimeType({ bytes: bytes(0xc3, 0x28), declaredType: 'text/plain' })).toBeNull();
    });

    it('refuses an empty file', () => {
      expect(sniffMimeType({ bytes: new Uint8Array(), declaredType: 'text/plain' })).toBeNull();
    });
  });
});
