import { zipSync, strToU8 } from 'fflate';

import type { BundleEntry } from '@/modules/methodologies';

import { fileNamesForMode, type ExportMode } from '../model/export';
import { CORE_SPEC_TYPES, specFileName, SPEC_TYPES } from '../model/spec-files';
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
export type { ExportMode } from '../model/export';

export interface ExportResult {
  zip: Uint8Array;
  included: string[];
  omitted: string[];
  mode: ExportMode;
}

/**
 * The parity plan: the four core files under their own names, plus `quality.md` in quality mode.
 *
 * The default when no methodology is supplied, and identical to what `fileNamesForMode` produced
 * before methodologies existed — storage slot and exported name coincide for every parity file,
 * which is why `myspec-greenfield-v1` exports byte-for-byte what M6 exported.
 */
function parityPlan(mode: ExportMode): BundleEntry[] {
  const permitted = new Set<string>(fileNamesForMode(mode));

  return SPEC_TYPES.filter((specType) => permitted.has(specFileName(specType))).map((specType) => ({
    specType,
    fileName: specFileName(specType),
  }));
}

export function assembleBundle(
  files: readonly ExportableFile[],
  mode: ExportMode,
  plan: readonly BundleEntry[] = parityPlan(mode),
): ExportResult {
  const byType = new Map(files.map((file) => [file.specType, file] as const));

  const included: string[] = [];
  const omitted: string[] = [];
  const entries: Record<string, Uint8Array> = {};

  /*
   * The expected set comes from the bundle plan, which the repository query also keys off. One
   * answer to "what belongs in this bundle" serves the resolution, the assembly and the manifest —
   * so an extra file cannot appear in one of them and be omitted from another.
   *
   * Lookup is by **storage slot**, not by name: a methodology's exported name is its own
   * (`plan.md` for SpecKit's Plan), while what the database holds is the `solution` row. Keying on
   * the name would have meant the repository and the archive agreeing only by coincidence.
   */
  for (const entry of plan) {
    const file = byType.get(entry.specType);

    if (file === undefined) {
      omitted.push(entry.fileName);
      continue;
    }

    included.push(entry.fileName);
    entries[entry.fileName] = strToU8(file.content);
  }

  return { zip: zipSync(entries, { level: 6 }), included, omitted, mode };
}

/** The four core types, for callers that need the expected set without importing the vocabulary. */
export const BUNDLE_ORDER = CORE_SPEC_TYPES;
