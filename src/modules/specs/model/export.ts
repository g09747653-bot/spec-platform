import { CORE_SPEC_FILE_NAMES, specFileName, type SpecFileName } from './spec-files';

/**
 * The export vocabulary (constitution A6; FR-015; task 72).
 *
 * A mode is a **declaration**, not an observation. A6 is explicit that export never resolves against
 * "whatever the latest revisions happen to be": the caller says which bundle it wants, and the mode
 * decides both which revisions answer and which file names may appear. Keeping the two names here —
 * beside the file vocabulary, in a module that imports nothing but it — is what lets the database
 * constraint on `export_records.mode` and the resolution code key off one list.
 */
export const EXPORT_MODES = ['default', 'quality'] as const;

export type ExportMode = (typeof EXPORT_MODES)[number];

export function isExportMode(value: string): value is ExportMode {
  return (EXPORT_MODES as readonly string[]).includes(value);
}

/**
 * Which file names a mode may contain, in bundle order.
 *
 * The parity baseline is four files and nothing else (constitution P3), and quality mode adds exactly
 * one, after `tasks.md` (constitution — Bundle contract). Stated as a function of the mode rather than
 * as a branch at each use site, so an archive, an omission manifest and a clipboard lookup cannot
 * disagree about what the bundle is supposed to contain.
 */
export function fileNamesForMode(mode: ExportMode): readonly SpecFileName[] {
  return mode === 'default'
    ? CORE_SPEC_FILE_NAMES
    : [...CORE_SPEC_FILE_NAMES, specFileName('quality')];
}
