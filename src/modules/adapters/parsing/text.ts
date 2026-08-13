import type { Extractor } from './registry';

/**
 * Plain text and Markdown (task 67; IR-004-AC-1).
 *
 * Passed through verbatim — not normalised, not stripped of its Markdown, not re-wrapped. The file is
 * already the thing a model should read, and every transformation here would be a decision made on the
 * user's behalf about what their document meant.
 *
 * `fatal` decoding: the upload guard has already established these bytes are valid UTF-8, so a failure
 * here means the stored object is not what was uploaded, and the honest outcome is a recorded parse
 * failure rather than a page of replacement characters.
 */
export const extractPlainText: Extractor = (bytes) =>
  Promise.resolve(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
