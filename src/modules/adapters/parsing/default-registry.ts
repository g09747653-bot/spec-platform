import { getEnv, type Env } from '@/config/env';

import { extractDocx } from './docx';
import { passThroughImage } from './image';
import { extractPdf } from './pdf';
import {
  createExtractorRegistry,
  type BlobSource,
  type Extractor,
  type ParsingAdapter,
} from './registry';
import { DOCX_MIME, XLSX_MIME } from './sniff';
import { extractPlainText } from './text';
import { extractXlsx } from './xlsx';

/**
 * Every format the platform handles, keyed by the type the sniffer produces (tasks 66–67).
 *
 * This map *is* the answer to "which types are supported": the registry refuses anything absent from
 * it, and the upload guard refuses anything absent from `ALLOWED_UPLOAD_TYPES`. The two lists are
 * deliberately separate — configuration narrows what a deployment accepts, and code says what the
 * platform can read — and a type in the configuration with no extractor here is refused at extraction
 * rather than silently stored as unreadable.
 */
export const DEFAULT_EXTRACTORS: Readonly<Record<string, Extractor>> = Object.freeze({
  'application/pdf': extractPdf,
  [DOCX_MIME]: extractDocx,
  [XLSX_MIME]: extractXlsx,
  'text/plain': extractPlainText,
  'text/markdown': extractPlainText,
  'image/png': passThroughImage,
  'image/jpeg': passThroughImage,
});

/**
 * The composition root for parsing, mirroring `createDefaultAdapter` and `createDefaultStorage`.
 *
 * The byte source is a parameter rather than a storage adapter built here: extraction runs once, at
 * upload, on the bytes the caller already holds (DR-8), and a re-parse would supply a reader backed by
 * the store. Either way `adapters/parsing` depends on one function, not on a whole storage client.
 */
export function createDefaultParsing(read: BlobSource, env: Env = getEnv()): ParsingAdapter {
  return createExtractorRegistry({
    extractors: DEFAULT_EXTRACTORS,
    read,
    timeoutMs: env.PARSE_TIMEOUT_MS,
  });
}
