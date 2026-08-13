import type { Extractor } from './registry';

/**
 * Images (task 67; IR-004-AC-2).
 *
 * `null`, which the registry records as `passthrough`: there is no text to extract, and saying so is
 * not the same as extracting nothing. The bytes stay in storage and are offered to vision-capable
 * models as bytes; the row is what tells the context assembler which of the two it is holding.
 *
 * No OCR. It would be a second, much heavier dependency producing text the user never wrote, and a
 * vision-capable model reads the image better than a text layer reconstructed from it.
 */
export const passThroughImage: Extractor = () => Promise.resolve(null);
