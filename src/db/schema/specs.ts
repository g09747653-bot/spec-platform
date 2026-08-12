import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

import { REVISION_ORIGINS, SPEC_FILE_NAMES, SPEC_TYPES } from '@/modules/specs/model/spec-files';

import { projects } from './projects';

/** Renders a tuple of names as a SQL value list. The inputs are compile-time constants. */
const list = (values: readonly string[]) => sql.raw(values.map((value) => `'${value}'`).join(', '));

/**
 * A logical file in the bundle (DR-4).
 *
 * `file_name` is constrained to the five permitted names, and a second constraint ties it to
 * `spec_type`: `requirements` can only ever be `requirements.md`. Two columns that must agree are two
 * chances to disagree, so the agreement is a database rule.
 *
 * `(project_id, spec_type)` is unique — a bundle holds at most one file of each type, which is what
 * makes "exactly four files" (constitution P3) countable rather than hopeful.
 *
 * `current_revision` is a **pointer, not content** (solution.md — Entity Notes): it moves as revisions
 * are appended and carries no immutability guarantee. `0` means no revision exists yet.
 */
export const specFiles = pgTable(
  'spec_files',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    specType: text('spec_type').notNull(),
    fileName: text('file_name').notNull(),
    currentRevision: integer('current_revision').notNull().default(0),
  },
  (table) => [
    unique('spec_files_project_id_spec_type_unique').on(table.projectId, table.specType),
    check('spec_files_spec_type_valid', sql`${table.specType} IN (${list(SPEC_TYPES)})`),
    check('spec_files_file_name_valid', sql`${table.fileName} IN (${list(SPEC_FILE_NAMES)})`),
    check(
      'spec_files_file_name_matches_spec_type',
      sql`${table.fileName} = ${table.specType} || '.md'`,
    ),
    check('spec_files_current_revision_non_negative', sql`${table.currentRevision} >= 0`),
  ],
);

/**
 * An immutable content version (DR-2, DR-3; A4).
 *
 * The immutability contract is **column-scoped** (D-11): approval is recorded on the row, so the row
 * cannot be frozen whole. Every column except `approved` is frozen by a `BEFORE UPDATE` trigger, and
 * `approved` may only travel `false → true`. Deletion is refused unless the owning project is being
 * deleted. All three rules live in the migration as triggers, because a constraint cannot compare a
 * new row against the old one — see `migrations/0003_spec_revisions.sql`.
 *
 * `origin` and `derived_from` are paired by a check constraint: an enrichment revision always names the
 * parity revision it was derived from, and a parity revision never claims a derivation. That pairing is
 * what makes the export rule of A6 mechanically decidable — "the last revision produced before
 * enrichment" is a query, not an inference.
 */
export const specRevisions = pgTable(
  'spec_revisions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    specFileId: uuid('spec_file_id')
      .notNull()
      .references(() => specFiles.id, { onDelete: 'cascade' }),
    revisionNumber: integer('revision_number').notNull(),
    content: text('content').notNull(),
    /** The only mutable column, and only in one direction (FR-009 AC-3). */
    approved: boolean('approved').notNull().default(false),
    origin: text('origin').notNull().default('parity'),
    derivedFrom: uuid('derived_from').references((): AnyPgColumn => specRevisions.id, {
      onDelete: 'restrict',
    }),
    /** The attachments available as context when this revision was generated (DR-12). */
    contextAttachmentIds: jsonb('context_attachment_ids')
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    unique('spec_revisions_file_revision_unique').on(table.specFileId, table.revisionNumber),
    check('spec_revisions_revision_number_positive', sql`${table.revisionNumber} >= 1`),
    check('spec_revisions_origin_valid', sql`${table.origin} IN (${list(REVISION_ORIGINS)})`),
    /*
     * The pairing of A4, written so neither branch can evaluate to NULL — a CHECK accepts NULL, so
     * `IS NULL` / `IS NOT NULL` are the only safe tests here.
     */
    check(
      'spec_revisions_origin_derivation_paired',
      sql`(${table.origin} = 'parity' AND ${table.derivedFrom} IS NULL)
          OR (${table.origin} = 'enrichment' AND ${table.derivedFrom} IS NOT NULL)`,
    ),
    /*
     * FR-015 AC-9: an empty spec is never exported, so an empty spec is never stored. Stated as
     * "contains at least one non-whitespace character" rather than with `btrim`, which strips only
     * spaces by default — content of nothing but newlines and tabs would have passed.
     */
    check('spec_revisions_content_not_blank', sql`${table.content} ~ '[^[:space:]]'`),
    check(
      'spec_revisions_context_attachment_ids_is_array',
      sql`jsonb_typeof(${table.contextAttachmentIds}) = 'array'`,
    ),
  ],
);

export type SpecFileRow = typeof specFiles.$inferSelect;
export type SpecRevisionRow = typeof specRevisions.$inferSelect;
