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
): StructureResult {
  const headings = parseHeadings(markdown).map((heading, position) => ({
    ...heading,
    normalised: normaliseHeading(heading.text),
    position,
  }));

  const violations: StructureViolation[] = [];
  let cursor = 0;

  for (const section of required) {
    const wanted = normaliseHeading(section.heading);
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
