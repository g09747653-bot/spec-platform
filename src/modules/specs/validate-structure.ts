import type { CoreSpecType } from './model/spec-files';
import {
  defineSectionList,
  normaliseHeading,
  requiredSectionSchema,
  requiredSections,
  sectionListSchema,
  type RequiredSection,
  type SectionList,
} from './section-schema';

/**
 * The single structural-validation entry point (task 40; constitution P3, NFR-007; D-16).
 *
 * Everything that needs to know whether a document conforms asks here — the spec agent before
 * persisting a revision (FR-008 AC-4/AC-7), the parity check in CI, and later the export path. Only
 * this module and `assemblePrompt` import `section-schema.ts`; the heading list itself never leaves
 * the pair, so there is exactly one place a section can be renamed.
 *
 * The reusable shape (`requiredSectionSchema`, `sectionListSchema`, `defineSectionList`) is
 * re-exported here so another module — the optional `quality` module, for one — can declare its own
 * required sections and validate against them without importing the parity data (task 39 AC-3).
 */
export {
  defineSectionList,
  normaliseHeading,
  requiredSectionSchema,
  sectionListSchema,
  type RequiredSection,
  type SectionList,
};

/** Why a document failed. Machine-readable, because a failed generation is retried, not read. */
export type StructureViolationCode = 'MISSING_HEADING' | 'WRONG_LEVEL' | 'HEADING_OUT_OF_ORDER';

export interface StructureViolation {
  code: StructureViolationCode;
  /** The required heading this violation is about, as the schema spells it. */
  heading: string;
  /** The level the schema requires. */
  expectedLevel: number;
  /** The level actually found, for `WRONG_LEVEL`. */
  actualLevel?: number;
}

export interface StructureResult {
  valid: boolean;
  violations: readonly StructureViolation[];
}

/** A heading found in a document, in document order. */
export interface ParsedHeading {
  level: number;
  text: string;
}

const ATX = /^ {0,3}(#{1,6})[ \t]+(.*?)[ \t]*(?:[ \t]#+[ \t]*)?$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const SETEXT_H1 = /^ {0,3}={1,}[ \t]*$/;
const SETEXT_H2 = /^ {0,3}-{1,}[ \t]*$/;

/**
 * Extracts headings from markdown, in document order.
 *
 * Fenced code blocks are skipped, because a specification is full of them and `# install deps` in a
 * shell example is a comment, not a section. Both heading spellings are accepted: ATX (`## Name`) is
 * what the prompt asks for, and setext (a `---` rule under the heading text) is what a model
 * occasionally produces anyway — accepting it costs a few lines and avoids failing a whole generation
 * over a notation the reader cannot even see the difference in.
 */
export function parseHeadings(markdown: string): ParsedHeading[] {
  const lines = markdown.split(/\r?\n/);
  const headings: ParsedHeading[] = [];
  let fence: string | null = null;

  for (const [index, line] of lines.entries()) {
    const fenceMatch = FENCE.exec(line);

    if (fence !== null) {
      // Only a fence of the same character and at least the same length closes the block.
      if (fenceMatch !== null) {
        const marker = fenceMatch[1] ?? '';
        if (marker.startsWith(fence.charAt(0)) && marker.length >= fence.length) fence = null;
      }
      continue;
    }

    if (fenceMatch !== null) {
      fence = fenceMatch[1] ?? '';
      continue;
    }

    const atx = ATX.exec(line);
    if (atx !== null) {
      headings.push({ level: (atx[1] ?? '').length, text: atx[2] ?? '' });
      continue;
    }

    // Setext: the underline belongs to the single non-blank line above it, which must not itself be
    // a heading or a list item.
    const previous = index > 0 ? (lines[index - 1] ?? '') : '';
    if (
      previous.trim() === '' ||
      ATX.test(previous) ||
      /^ {0,3}([-*+]|\d+[.)])[ \t]/.test(previous)
    )
      continue;

    if (SETEXT_H1.test(line)) headings.push({ level: 1, text: previous.trim() });
    else if (SETEXT_H2.test(line)) headings.push({ level: 2, text: previous.trim() });
  }

  return headings;
}

/**
 * The scaffolding a template writes **into its own headings**: `*(mandatory)*`, `*(include if …)*`.
 *
 * One rule, in one place, with two consumers — `templateSections` strips it when it reads a
 * template's required headings, and the comparison below strips it when it reads a generated
 * document's. That pairing is the whole point, and its absence is what the M9п round-4 walk found:
 * the extractor removed the annotation, the check therefore demanded `## Requirements`, the model
 * reproduced the vendored template faithfully as `## Requirements *(mandatory)*`, and a perfectly
 * well-formed SpecKit specification was rejected three times running for a suffix the template
 * itself prescribes. What the writer is shown and what the writer is judged by must be the same
 * list; two spellings of one rule is how they came apart.
 */
const TEMPLATE_ANNOTATION = /\s*\*\([^)]*\)\*\s*$/;

export function stripTemplateAnnotation(heading: string): string {
  return heading.replace(TEMPLATE_ANNOTATION, '').trim();
}

export interface SectionMatchOptions {
  /**
   * Read a trailing `*(annotation)*` off the document's headings before comparing them.
   *
   * **Only the methodology path sets it**, and deliberately so. The parity baseline's headings carry
   * no annotations, nothing shows a parity writer a template that does, and loosening the comparison
   * there would weaken P3 for no gain — D-40 fixed normalisation at case and whitespace precisely so
   * that everything else stays exact. A foreign methodology is the other case: its required list is
   * *parsed from a file we vendor byte-for-byte*, and that file writes the annotation itself.
   */
  ignoreTemplateAnnotations?: boolean;
}

/**
 * Checks a document against an explicit section list.
 *
 * Extra headings are permitted anywhere — a `tasks.md` carries a milestone heading per milestone and
 * a `solution.md` carries one per module, and neither count is knowable in advance. What is asserted
 * is that every required heading is present, at its required level, and that the required ones appear
 * in the required order relative to each other.
 */
export function validateAgainstSections(
  markdown: string,
  required: readonly RequiredSection[],
  options: SectionMatchOptions = {},
): StructureResult {
  const strip =
    options.ignoreTemplateAnnotations === true
      ? stripTemplateAnnotation
      : (heading: string) => heading;

  const headings = parseHeadings(markdown).map((heading, position) => ({
    ...heading,
    normalised: normaliseHeading(strip(heading.text)),
    position,
  }));

  const violations: StructureViolation[] = [];
  let cursor = 0;

  for (const section of required) {
    const wanted = normaliseHeading(strip(section.heading));
    const matches = headings.filter((heading) => heading.normalised === wanted);

    if (matches.length === 0) {
      violations.push({
        code: 'MISSING_HEADING',
        heading: section.heading,
        expectedLevel: section.level,
      });
      continue;
    }

    const atLevel = matches.filter((heading) => heading.level === section.level);

    if (atLevel.length === 0) {
      violations.push({
        code: 'WRONG_LEVEL',
        heading: section.heading,
        expectedLevel: section.level,
        actualLevel: matches[0]?.level,
      });
      continue;
    }

    const next = atLevel.find((heading) => heading.position >= cursor);

    if (next === undefined) {
      violations.push({
        code: 'HEADING_OUT_OF_ORDER',
        heading: section.heading,
        expectedLevel: section.level,
      });
      continue;
    }

    cursor = next.position + 1;
  }

  return { valid: violations.length === 0, violations };
}

/**
 * Validates a generated core spec file against the parity baseline.
 *
 * This is the function the rest of the system calls. It is the only way to reach the baseline, which
 * is what keeps P3's "one place" claim true.
 */
export function validateStructure(specType: CoreSpecType, markdown: string): StructureResult {
  return validateAgainstSections(markdown, requiredSections(specType));
}

/**
 * The requirements document's two requirement-bearing sections, sliced for the machine export
 * (task 150; А-20).
 *
 * The machine bundle's `requirements.json` carries a functional and a non-functional array, and the
 * parity document keeps each in a section of its own. Which headings those are is baseline
 * knowledge, so the slicing lives here — in the baseline's one sanctioned reader — and the heading
 * text never reaches the export module (constitution P3: the list has exactly one home).
 *
 * The two entries are picked from the schema by shape rather than by restated name: the
 * non-functional one is the requirements heading that starts with «non-», the functional one is the
 * other requirements heading that names no other qualifier. A rename in the schema that breaks the
 * predicates is a loud throw in every test that touches export — never a silently empty bundle.
 */
export interface RequirementSectionBodies {
  /** Body markdown of the functional-requirements section, `''` when the document lacks it. */
  functional: string;
  /** Body markdown of the non-functional-requirements section, `''` when the document lacks it. */
  nonFunctional: string;
}

function requirementBearingEntries(): {
  functional: RequiredSection;
  nonFunctional: RequiredSection;
} {
  const entries = requiredSections('requirements').filter((section) =>
    normaliseHeading(section.heading).endsWith('requirements'),
  );

  const nonFunctional = entries.filter((section) =>
    normaliseHeading(section.heading).startsWith('non-'),
  );
  const functional = entries.filter((section) =>
    normaliseHeading(section.heading).startsWith('functional'),
  );

  const [functionalEntry] = functional;
  const [nonFunctionalEntry] = nonFunctional;

  if (functional.length !== 1 || functionalEntry === undefined) {
    throw new Error(
      'the requirements baseline no longer has exactly one functional-requirements section; the machine export mapping (task 150) must be revisited',
    );
  }
  if (nonFunctional.length !== 1 || nonFunctionalEntry === undefined) {
    throw new Error(
      'the requirements baseline no longer has exactly one non-functional-requirements section; the machine export mapping (task 150) must be revisited',
    );
  }

  return { functional: functionalEntry, nonFunctional: nonFunctionalEntry };
}

/**
 * The lines of the first section under `heading` — at its required level when `atLevel` is given,
 * at whatever level the document put it otherwise — up to the next heading at the same or a
 * shallower level than the one that opened it. Fence-aware with the same rules as `parseHeadings`.
 */
function sliceSectionBody(
  markdown: string,
  section: RequiredSection,
  atLevel: number | null = section.level,
): string {
  const wanted = normaliseHeading(section.heading);
  const lines = markdown.split(/\r?\n/);

  const body: string[] = [];
  let fence: string | null = null;
  let inside = false;
  let openedAt = section.level;

  for (const line of lines) {
    const fenceMatch = FENCE.exec(line);

    if (fence !== null) {
      if (inside) body.push(line);
      if (fenceMatch !== null) {
        const marker = fenceMatch[1] ?? '';
        if (marker.startsWith(fence.charAt(0)) && marker.length >= fence.length) fence = null;
      }
      continue;
    }

    if (fenceMatch !== null) {
      fence = fenceMatch[1] ?? '';
      if (inside) body.push(line);
      continue;
    }

    const atx = ATX.exec(line);
    if (atx !== null) {
      const level = (atx[1] ?? '').length;
      const text = normaliseHeading(atx[2] ?? '');

      if (inside && level <= openedAt) return body.join('\n');
      if (!inside && (atLevel === null || level === atLevel) && text === wanted) {
        inside = true;
        openedAt = level;
        continue;
      }
      // A deeper heading inside the section is body — the subsections are the rows the machine
      // export reads, and a slice that swallowed them would collapse a section into one entry.
      if (inside) body.push(line);
      continue;
    }

    if (inside) body.push(line);
  }

  return inside ? body.join('\n') : '';
}

/**
 * The exact-level slice first, then the same heading at any level (D-316).
 *
 * The fallback exists for documents of a non-classic methodology: the speckit spec keeps the same
 * «Functional Requirements» heading the baseline names, but one level deeper, inside its own
 * «Requirements» section — and the Программа-А acceptance mapped a 28-KB document to an empty
 * requirements.json because the exact-level slice found nothing and nothing else looked. The
 * heading text still comes from the section schema alone: the fallback loosens *where* the section
 * may sit, never *what* it is called (P3 — the list has exactly one home).
 */
function sliceSectionBodyTolerantly(markdown: string, section: RequiredSection): string {
  const exact = sliceSectionBody(markdown, section);
  if (exact !== '') return exact;

  return sliceSectionBody(markdown, section, null);
}

export function requirementSectionBodies(markdown: string): RequirementSectionBodies {
  const entries = requirementBearingEntries();

  return {
    functional: sliceSectionBodyTolerantly(markdown, entries.functional),
    nonFunctional: sliceSectionBodyTolerantly(markdown, entries.nonFunctional),
  };
}

/** A one-line, user-safe summary of why a document was rejected. Carries no document content. */
export function describeViolations(violations: readonly StructureViolation[]): string {
  return violations
    .map((violation) => {
      const heading = `${'#'.repeat(violation.expectedLevel)} ${violation.heading}`;
      if (violation.code === 'MISSING_HEADING') return `missing section "${heading}"`;
      if (violation.code === 'WRONG_LEVEL')
        return `section "${violation.heading}" is at level ${String(violation.actualLevel ?? 0)}, expected ${String(violation.expectedLevel)}`;
      return `section "${heading}" is out of order`;
    })
    .join('; ');
}
