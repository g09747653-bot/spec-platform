/**
 * The file vocabulary of a bundle (DR-4; constitution P3).
 *
 * This is the *names* of the bundle's files, not their required headings. The heading definition is a
 * separate module with a deliberately narrow consumption chain (`section-schema.ts`, task 39, imported
 * only by prompt assembly and `validateStructure`); keeping the vocabulary here lets the database
 * constraint, the export and — later — the section schema all key off one list without any of them
 * reaching into that chain.
 *
 * A leaf module: it imports nothing.
 */

/** The four files of the parity baseline, in bundle order (constitution P3). */
export const CORE_SPEC_TYPES = ['constitution', 'requirements', 'solution', 'tasks'] as const;

export type CoreSpecType = (typeof CORE_SPEC_TYPES)[number];

/**
 * Every spec type a file may have. `quality` is the one addition the Quality stage may introduce
 * (constitution — Bundle contract), which is why the database permits five names and an export in
 * default mode still emits four.
 */
export const SPEC_TYPES = [...CORE_SPEC_TYPES, 'quality'] as const;

export type SpecType = (typeof SPEC_TYPES)[number];

/** File names are fixed, so a bundle extracts into `.specs/` without renaming (FR-015 AC-10). */
export type SpecFileName = `${SpecType}.md`;

export function specFileName<T extends SpecType>(specType: T): `${T}.md` {
  return `${specType}.md`;
}

/** The five permitted file names, in the same order as `SPEC_TYPES`. */
export const SPEC_FILE_NAMES: readonly SpecFileName[] = SPEC_TYPES.map((specType) =>
  specFileName(specType),
);

/** The four parity file names, in bundle order. */
export const CORE_SPEC_FILE_NAMES: readonly SpecFileName[] = CORE_SPEC_TYPES.map((specType) =>
  specFileName(specType),
);

export function isSpecType(value: string): value is SpecType {
  return (SPEC_TYPES as readonly string[]).includes(value);
}

export function isCoreSpecType(value: string): value is CoreSpecType {
  return (CORE_SPEC_TYPES as readonly string[]).includes(value);
}

/** How a revision was produced (A4). `enrichment` rows always name the parity revision they derive from. */
export const REVISION_ORIGINS = ['parity', 'enrichment'] as const;

export type RevisionOrigin = (typeof REVISION_ORIGINS)[number];
