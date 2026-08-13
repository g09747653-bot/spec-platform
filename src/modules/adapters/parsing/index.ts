/** `adapters/parsing` — PDF, DOCX, XLSX and image extraction (IR-004, D-14). */
export const MODULE_ID = 'adapters/parsing';

export {
  createExtractorRegistry,
  type BlobSource,
  type ExtractionOutcome,
  type Extractor,
  type ExtractorRegistryOptions,
  type ParsingAdapter,
} from './registry';
export { DOCX_MIME, sniffMimeType, XLSX_MIME, type SniffInput } from './sniff';
export { createDefaultParsing, DEFAULT_EXTRACTORS } from './default-registry';
export { extractPdf } from './pdf';
export { extractDocx } from './docx';
export { extractXlsx } from './xlsx';
export { extractPlainText } from './text';
export { passThroughImage } from './image';
