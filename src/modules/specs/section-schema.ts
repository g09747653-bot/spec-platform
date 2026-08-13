import { z } from 'zod';

import { CORE_SPEC_TYPES, type CoreSpecType } from './model/spec-files';

/**
 * The parity baseline's required section headings — the single source of structural truth
 * (constitution P3; D-16; task 39).
 *
 * P3 defines the baseline as four files, each with a required list of section headings in a required
 * order. This module is that list. Restating it anywhere — inline in a prompt file, hard-coded in a
 * test fixture, or repeated in documentation — is a constitution violation, and is blocked by lint
 * (`spec-platform/no-duplicated-section-headings` in `eslint.section-schema.js`).
 *
 * **Consumption chain (binding).** Exactly two modules import this file:
 *
 * - `prompts/assemble-prompt.ts` — derives the list it instructs the model to produce;
 * - `specs/validate-structure.ts` — asserts generated output against it.
 *
 * Everything else — the agent, the parity test, the export path — goes through `validateStructure`.
 * The restriction is lint-enforced, so a third consumer is a red build rather than a review comment.
 *
 * **What lives here and what does not.** Only the *parity* baseline. `quality.md` is owned by the
 * optional `quality` module (constitution A6: it must be removable without touching the parity path),
 * so its headings are that module's to declare — which is what `sectionListSchema` is exported for.
 */

/**
 * One required section: heading text at a markdown heading level.
 *
 * The reusable shape (task 39 AC-3). It carries no parity data, so another module can build its own
 * schema from it without gaining access to — or a second copy of — the baseline.
 */
export const requiredSectionSchema = z.object({
  /** Markdown heading level, `1`–`6`. The baseline uses `2`; `1` is the document title, which varies. */
  level: z.number().int().min(1).max(6),
  /** Heading text, exactly as it must appear after the `#` marks. */
  heading: z.string().min(1),
});

export type RequiredSection = z.infer<typeof requiredSectionSchema>;

/** A file's required sections, in required order. Non-empty, and no heading repeated. */
export const sectionListSchema = z
  .array(requiredSectionSchema)
  .min(1)
  .refine(
    (sections) =>
      new Set(sections.map((section) => normaliseHeading(section.heading))).size ===
      sections.length,
    { message: 'a required heading may not appear twice in the same list' },
  );

export type SectionList = z.infer<typeof sectionListSchema>;

/**
 * Heading comparison is normalised, and deliberately only this much (D-40).
 *
 * Case and whitespace runs are model noise: `## Core principles` and `##  Core   Principles` are the
 * same section by any reading, and failing a whole generation over them would make the parity check a
 * source of flakes rather than of truth. Everything else — wording, punctuation, ordering, presence —
 * is structure, and is compared exactly.
 */
export function normaliseHeading(heading: string): string {
  return heading.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Validates a heading list and freezes it.
 *
 * Exported so the `quality` module can declare `quality.md`'s sections against the same contract
 * (A6), and used below for the baseline itself — one definition of what a well-formed section list is.
 */
export function defineSectionList(sections: readonly RequiredSection[]): SectionList {
  return sectionListSchema.parse(sections);
}

const section = (heading: string): RequiredSection => ({ level: 2, heading });

/*
 * The baseline itself. The markers below delimit the region the lint rule reads to learn the heading
 * vocabulary it forbids elsewhere: every single-quoted string between them is a required heading.
 * Moving, renaming or removing a marker fails lint loudly rather than silently disarming the rule.
 */
/* section-schema:headings:start */
const CORE_SECTIONS: Readonly<Record<CoreSpecType, SectionList>> = Object.freeze({
  constitution: defineSectionList([
    section('Project Vision'),
    section('Core Principles'),
    section('Technology Constraints'),
    section('Architecture Constraints'),
    section('Testing Approaches'),
    section('Coding Standards'),
    section('Security Constraints'),
    section('Performance Targets'),
    section('Integration Points'),
  ]),
  requirements: defineSectionList([
    section('Overview'),
    section('User Roles'),
    section('Functional Requirements'),
    section('Non-Functional Requirements'),
    section('Data Requirements'),
    section('Integration Requirements'),
  ]),
  solution: defineSectionList([
    section('Overview'),
    section('High-Level Architecture Design'),
    section('System Modules'),
    section('Data Model'),
    section('API / Protocol Design'),
    section('Security Architecture'),
    section('Deployment & Operations'),
    section('Observability'),
    section('Testing Strategy'),
    section('Success Criteria'),
    section('Key Solution Decisions'),
  ]),
  tasks: defineSectionList([
    section('Overview'),
    section('Requirement Coverage'),
    section('Risks & Sequencing Notes'),
  ]),
});
/* section-schema:headings:end */

/**
 * The required sections for a core spec type, in required order.
 *
 * Callers outside the consumption chain do not get here: they ask `validateStructure` whether a
 * document conforms, which is the only question the rest of the system needs answered.
 */
export function requiredSections(specType: CoreSpecType): SectionList {
  return CORE_SECTIONS[specType];
}

/** The four core types the baseline covers, in bundle order. */
export const SCHEMA_SPEC_TYPES: readonly CoreSpecType[] = CORE_SPEC_TYPES;
