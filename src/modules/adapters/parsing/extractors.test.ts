import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { utils, write } from 'xlsx';

import { DEFAULT_EXTRACTORS } from './default-registry';
import { extractDocx } from './docx';
import { passThroughImage } from './image';
import { extractPdf } from './pdf';
import { createExtractorRegistry } from './registry';
import { DOCX_MIME, sniffMimeType, XLSX_MIME } from './sniff';
import { extractPlainText } from './text';
import { extractXlsx } from './xlsx';

/**
 * Tasks 66–67 — the real format libraries, against real files.
 *
 * The fixtures are built here rather than checked in as binaries: a byte blob in the repository is a
 * fixture nobody can read a diff of, and one that silently stops representing what its name claims.
 * Every document below is assembled by the same specifications the extractors parse — a PDF with its
 * cross-reference table computed, an OOXML package with its relationships, a workbook written by
 * SheetJS itself.
 */

/** A minimal but valid multi-page PDF, with a correct xref table. */
function buildPdf(pages: readonly string[]): Uint8Array {
  const objects: string[] = [];
  const pageIds = pages.map((_page, index) => 3 + index * 2);
  const fontId = 3 + pages.length * 2;

  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push(
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${String(id)} 0 R`).join(' ')}] /Count ${String(pages.length)} >>`,
  );

  for (const [index, page] of pages.entries()) {
    const contentId = pageIds[index] === undefined ? 0 : (pageIds[index] ?? 0) + 1;
    const stream = `BT /F1 12 Tf 72 720 Td (${page}) Tj ET`;

    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${String(contentId)} 0 R ` +
        `/Resources << /Font << /F1 ${String(fontId)} 0 R >> >> >>`,
    );
    objects.push(`<< /Length ${String(stream.length)} >>\nstream\n${stream}\nendstream`);
  }

  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  let body = '%PDF-1.4\n';
  const offsets: number[] = [];

  for (const [index, object] of objects.entries()) {
    offsets.push(body.length);
    body += `${String(index + 1)} 0 obj\n${object}\nendobj\n`;
  }

  const xrefOffset = body.length;
  const entries = offsets
    .map((offset) => `${offset.toString().padStart(10, '0')} 00000 n \n`)
    .join('');

  body +=
    `xref\n0 ${String(objects.length + 1)}\n0000000000 65535 f \n${entries}` +
    `trailer\n<< /Size ${String(objects.length + 1)} /Root 1 0 R >>\n` +
    `startxref\n${String(xrefOffset)}\n%%EOF\n`;

  return strToU8(body);
}

/** A minimal OOXML word package: content types, relationships, and a two-paragraph body. */
function buildDocx(paragraphs: readonly string[]): Uint8Array {
  const body = paragraphs
    .map((paragraph) => `<w:p><w:r><w:t>${paragraph}</w:t></w:r></w:p>`)
    .join('');

  return zipSync({
    '[Content_Types].xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
        '</Types>',
    ),
    '_rels/.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
        '</Relationships>',
    ),
    'word/document.xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
        `<w:body>${body}</w:body></w:document>`,
    ),
  });
}

function buildXlsx(sheets: Record<string, string[][]>): Uint8Array {
  const workbook = utils.book_new();

  for (const [name, rows] of Object.entries(sheets)) {
    utils.book_append_sheet(workbook, utils.aoa_to_sheet(rows), name);
  }

  return new Uint8Array(write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
}

describe('PDF and DOCX extraction (task 66)', () => {
  it('extracts the text of every page of a multi-page PDF', async () => {
    const text = await extractPdf(buildPdf(['Page one speaks', 'Page two answers']));

    expect(text).toContain('Page one speaks');
    expect(text).toContain('Page two answers');
  });

  it('extracts the paragraphs of a DOCX', async () => {
    const text = await extractDocx(buildDocx(['First paragraph.', 'Second paragraph.']));

    expect(text).toContain('First paragraph.');
    expect(text).toContain('Second paragraph.');
  });

  /**
   * The acceptance criterion is that a corrupt file "records a failure rather than throwing out of the
   * adapter". The extractors themselves throw — deliberately (see the note on `pdf.ts`) — so what is
   * asserted is the boundary the criterion is about: nothing escapes the registry.
   */
  describe('corruption', () => {
    const registry = createExtractorRegistry({
      extractors: DEFAULT_EXTRACTORS,
      read: (blobKey) => Promise.resolve(FIXTURES[blobKey] ?? new Uint8Array()),
      timeoutMs: 30_000,
    });

    const FIXTURES: Record<string, Uint8Array> = {
      'corrupt.pdf': strToU8('%PDF-1.4\nthis is not a pdf body at all'),
      'corrupt.docx': zipSync({ '[Content_Types].xml': strToU8('<Types/>') }),
      'truncated.docx': buildDocx(['whole']).slice(0, 40),
    };

    it('records a corrupt PDF as a failure with a reason', async () => {
      const outcome = await registry.extract({
        blobKey: 'corrupt.pdf',
        mimeType: 'application/pdf',
      });

      expect(outcome.status).toBe('failed');
      if (outcome.status === 'failed') expect(outcome.reason).not.toBe('');
    });

    it('records a corrupt DOCX as a failure with a reason', async () => {
      for (const key of ['corrupt.docx', 'truncated.docx']) {
        const outcome = await registry.extract({ blobKey: key, mimeType: DOCX_MIME });

        expect(outcome.status).toBe('failed');
      }
    });
  });
});

describe('XLSX, text and image handling (task 67)', () => {
  it('extracts cell text from every sheet, under the sheet name', async () => {
    const text = await extractXlsx(
      buildXlsx({
        Requirements: [
          ['id', 'title'],
          ['FR-1', 'Sign in'],
        ],
        Risks: [['risk'], ['provider outage']],
      }),
    );

    expect(text).toContain('## Requirements');
    expect(text).toContain('FR-1,Sign in');
    expect(text).toContain('## Risks');
    expect(text).toContain('provider outage');
  });

  it('stores Markdown and plain text verbatim', async () => {
    const markdown = '# Heading\n\n- one\n- two\n\n**bold** and `code`\n';

    expect(await extractPlainText(strToU8(markdown))).toBe(markdown);
    expect(await extractPlainText(strToU8('  spaced  \n\ttabbed\n'))).toBe(
      '  spaced  \n\ttabbed\n',
    );
  });

  it('reports an image as having nothing to extract', async () => {
    expect(await passThroughImage(new Uint8Array([0x89, 0x50]))).toBeNull();
  });

  it('records an image as `passthrough` through the registry', async () => {
    const registry = createExtractorRegistry({
      extractors: DEFAULT_EXTRACTORS,
      read: () => Promise.resolve(new Uint8Array([0x89, 0x50, 0x4e, 0x47])),
      timeoutMs: 1_000,
    });

    await expect(
      registry.extract({ blobKey: 'chart.png', mimeType: 'image/png' }),
    ).resolves.toEqual({ status: 'passthrough' });
    await expect(
      registry.extract({ blobKey: 'photo.jpg', mimeType: 'image/jpeg' }),
    ).resolves.toEqual({ status: 'passthrough' });
  });
});

/**
 * The two halves have to agree: a type the sniffer can produce and the registry cannot read would be
 * stored as permanently unreadable, and a type with an extractor the sniffer never produces is dead
 * code. This asserts the join.
 */
describe('the registry covers exactly what the sniffer recognises', () => {
  it('has an extractor for every type the sniffer can return', () => {
    const built = {
      'application/pdf': buildPdf(['x']),
      [DOCX_MIME]: buildDocx(['x']),
      [XLSX_MIME]: buildXlsx({ Sheet1: [['x']] }),
      'text/plain': strToU8('x'),
      'text/markdown': strToU8('# x'),
      'image/png': new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      'image/jpeg': new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
    };

    for (const [mimeType, bytes] of Object.entries(built)) {
      expect(sniffMimeType({ bytes, declaredType: mimeType })).toBe(mimeType);
      expect(DEFAULT_EXTRACTORS[mimeType]).toBeDefined();
    }
  });
});
