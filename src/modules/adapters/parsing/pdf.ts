import { extractText, getDocumentProxy } from 'unpdf';

import type { Extractor } from './registry';

/**
 * PDF text extraction with `unpdf` (task 66; IR-004-AC-1; D-14).
 *
 * In-process, so a user's document never leaves our infrastructure and there is no per-page cost —
 * the trade-off D-14 accepted is weaker extraction on complex layouts than a managed service would
 * give.
 *
 * Pages are merged into one string. A model reading a brief does not benefit from knowing where the
 * page breaks fell, and the alternative — an array — would have to be joined somewhere anyway, by a
 * caller with less context about the document than this has.
 *
 * Nothing is caught here. A corrupt file throws, and the registry turns that into a recorded failure
 * with a reason (task 65): five extractors each inventing their own idea of failure is five chances to
 * get it subtly different.
 */
export const extractPdf: Extractor = async (bytes) => {
  const document = await getDocumentProxy(bytes);
  const { text } = await extractText(document, { mergePages: true });

  return text;
};
