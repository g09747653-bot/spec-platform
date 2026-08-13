import mammoth from 'mammoth';

import type { Extractor } from './registry';

/**
 * DOCX text extraction with `mammoth` (task 66; IR-004-AC-1; D-14).
 *
 * `extractRawText` rather than `convertToHtml`: the consumer is a prompt, and markup would spend the
 * context budget on presentation a model does not need. Headings and lists survive as lines, which is
 * as much structure as the extracted text is asked to carry.
 *
 * `mammoth.messages` — its warnings about unconvertible features — are deliberately ignored. They are
 * about fidelity, not readability, and a document that produced warnings has still produced text.
 */
export const extractDocx: Extractor = async (bytes) => {
  const { value } = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });

  return value;
};
