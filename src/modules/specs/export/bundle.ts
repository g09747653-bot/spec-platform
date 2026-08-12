import { zipSync, strToU8 } from 'fflate';

import { CORE_SPEC_FILE_NAMES, CORE_SPEC_TYPES, type SpecFileName } from '../model/spec-files';
import type { ExportableFile } from '../repositories/spec-files';

/**
 * Bundle assembly (task 22; FR-015).
 *
 * Two rules do the work here, and both are about what the archive must *not* contain:
 *
 * - **Only spec markdown, named exactly** (AC-5, AC-10). Entries are built from the fixed file-name
 *   vocabulary, so a manifest, a README or a directory prefix cannot appear by accident — there is no
 *   code path that would add one.
 * - **A missing file is omitted, never emitted empty** (AC-6, AC-9). An incomplete bundle still
 *   downloads; the omissions are reported *beside* the archive, not inside it (AC-7, AC-8).
 *
 * Ordering follows the bundle order of the parity baseline rather than the order rows came back in, so
 * two exports of the same content produce the same archive.
 */
export type ExportMode = 'default' | 'quality';

export interface ExportResult {
  zip: Uint8Array;
  included: SpecFileName[];
  omitted: SpecFileName[];
  mode: ExportMode;
}

/**
 * Which files a mode may contain.
 *
 * Milestone 1 assembles the parity four; `quality` mode — the fifth file and enriched revisions —
 * arrives with the Quality stage (M7) and resolves through the same function then.
 */
function expectedFiles(mode: ExportMode): readonly SpecFileName[] {
  return mode === 'default' ? CORE_SPEC_FILE_NAMES : [...CORE_SPEC_FILE_NAMES, 'quality.md'];
}

export function assembleBundle(files: readonly ExportableFile[], mode: ExportMode): ExportResult {
  const byName = new Map(files.map((file) => [file.fileName, file] as const));

  const included: SpecFileName[] = [];
  const omitted: SpecFileName[] = [];
  const entries: Record<string, Uint8Array> = {};

  for (const fileName of expectedFiles(mode)) {
    const file = byName.get(fileName);

    if (file === undefined) {
      omitted.push(fileName);
      continue;
    }

    included.push(fileName);
    entries[fileName] = strToU8(file.content);
  }

  return { zip: zipSync(entries, { level: 6 }), included, omitted, mode };
}

/** The four core types, for callers that need the expected set without importing the vocabulary. */
export const BUNDLE_ORDER = CORE_SPEC_TYPES;
