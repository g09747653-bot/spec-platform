/**
 * The attachment vocabulary (FR-004; DR-8; task 63).
 *
 * A leaf module: it imports nothing, so the database CHECK constraint, the upload service and the UI
 * all read one spelling of every status. The same arrangement `specs/model/spec-files.ts` has, and for
 * the same reason — a status spelled twice is a status that can disagree with itself.
 */

/**
 * The lifecycle of an upload's extraction.
 *
 * Four states rather than two, because "we have not tried yet" and "we tried and it produced nothing"
 * are different facts and the UI owes the user different sentences for them:
 *
 * - `pending` — the row exists and the bytes are stored; extraction has not finished. It is written
 *   *before* extraction starts so a crash mid-parse leaves a row pointing at the blob rather than an
 *   object no cascade can ever find (DR-6).
 * - `ok` — text was extracted and persisted; generations read it from the row, never by re-parsing
 *   (DR-8).
 * - `failed` — extraction was attempted and did not produce text. A reason accompanies it, and the
 *   session continues without the document (FR-004 AC-5).
 * - `passthrough` — no extraction was attempted **by design**: images carry no text to extract and are
 *   offered to vision-capable models as bytes (IR-004-AC-2). Recording this as `ok` with empty text
 *   would make "the parser found nothing" and "there was nothing to parse" indistinguishable.
 */
export const PARSE_STATUSES = ['pending', 'ok', 'failed', 'passthrough'] as const;

export type ParseStatus = (typeof PARSE_STATUSES)[number];

export function isParseStatus(value: string): value is ParseStatus {
  return (PARSE_STATUSES as readonly string[]).includes(value);
}

/**
 * Whether an attachment contributes text to an assembled context.
 *
 * `passthrough` is deliberately excluded: an image has no extracted text, and a context section that
 * listed it with an empty body would tell a model a document was empty rather than that it was an
 * image.
 */
export function contributesText(status: ParseStatus): boolean {
  return status === 'ok';
}
