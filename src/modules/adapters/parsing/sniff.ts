import { unzipSync } from 'fflate';

/**
 * What the bytes actually are (task 64/65; NFR-008 AC-1).
 *
 * The browser's `Content-Type` on a multipart part is whatever the client chose to send, and the file
 * extension is whatever the user chose to type. Neither is evidence. Everything downstream — which
 * extractor runs, what the allowed-type list is checked against, what is stored on the row — keys off
 * the type determined here, from the leading bytes.
 *
 * The declared type is consulted for exactly one thing: telling Markdown from plain text, which are
 * byte-identical families and differ only in how a human means them. Neither can execute, both are
 * passed through verbatim, so the distinction is cosmetic and the declaration is allowed to win it.
 */

const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];
const ZIP = [0x50, 0x4b, 0x03, 0x04]; // PK\x03\x04

export const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document' as const;
export const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' as const;

const CONTENT_TYPES_ENTRY = '[Content_Types].xml';

/** An OOXML content-types part is a few kilobytes. Anything claiming more is not one. */
const MAX_CONTENT_TYPES_BYTES = 256 * 1024;

const startsWith = (bytes: Uint8Array, signature: readonly number[]): boolean =>
  bytes.length >= signature.length && signature.every((byte, index) => bytes[index] === byte);

/**
 * Which OOXML document a ZIP holds — or `null` if it is some other ZIP.
 *
 * Only `[Content_Types].xml` is inflated, and only if it declares a plausible size. A ZIP is untrusted
 * input from the internet: inflating the whole archive to find out what it is would make a decompression
 * bomb a denial of service on the upload path, and the one small part that names the document type is
 * all that is needed to decide.
 */
function ooxmlType(bytes: Uint8Array): string | null {
  let extracted;

  try {
    extracted = unzipSync(bytes, {
      filter: (file) =>
        file.name === CONTENT_TYPES_ENTRY && file.originalSize <= MAX_CONTENT_TYPES_BYTES,
    });
  } catch {
    // Truncated, encrypted or otherwise unreadable. Not an OOXML document as far as we can tell.
    return null;
  }

  const part = extracted[CONTENT_TYPES_ENTRY];
  if (part === undefined) return null;

  const declaration = new TextDecoder('utf-8', { fatal: false }).decode(part);

  if (declaration.includes('wordprocessingml.document.main+xml')) return DOCX_MIME;
  if (declaration.includes('spreadsheetml.sheet.main+xml')) return XLSX_MIME;

  return null;
}

/**
 * Whether the bytes are text a person could have typed.
 *
 * Strict UTF-8 (`fatal`) plus a control-character screen. A binary file with no recognised signature
 * would otherwise fall through to `text/plain` and be stored as a wall of mojibake — accepted, useless,
 * and indistinguishable in the UI from a document that genuinely had nothing in it.
 */
function looksLikeText(bytes: Uint8Array): boolean {
  let decoded: string;

  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return false;
  }

  // Everything below 0x20 except tab, newline and carriage return, which text legitimately has.
  for (const character of decoded) {
    const code = character.codePointAt(0) ?? 0;

    if (code >= 0x20 || code === 0x09 || code === 0x0a || code === 0x0d) continue;

    return false;
  }

  return true;
}

export interface SniffInput {
  bytes: Uint8Array;
  /** The client's claim. Used only to separate Markdown from plain text. */
  declaredType: string;
}

/**
 * The content type of an upload, determined from its bytes — or `null` when nothing recognises them.
 *
 * `null` is not an error here: it is "this is not one of the formats the platform handles", which the
 * upload guard turns into `UPLOAD_REJECTED` naming the supported types (FR-004 AC-4).
 */
export function sniffMimeType({ bytes, declaredType }: SniffInput): string | null {
  if (bytes.length === 0) return null;

  if (startsWith(bytes, PDF)) return 'application/pdf';
  if (startsWith(bytes, PNG)) return 'image/png';
  if (startsWith(bytes, JPEG)) return 'image/jpeg';
  if (startsWith(bytes, ZIP)) return ooxmlType(bytes);

  if (looksLikeText(bytes)) {
    return declaredType.trim().toLowerCase() === 'text/markdown' ? 'text/markdown' : 'text/plain';
  }

  return null;
}
