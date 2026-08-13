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

import { REVIEW_DECISIONS, REVIEW_OUTCOMES } from '@/modules/specs/model/review';
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

/**
 * The automated review of one approved revision, and the user's decision on it (FR-010; task 53).
 *
 * Keyed to a **revision**, not a file: FR-010 AC-8 requires a revised spec to get a fresh review of
 * the new content, and "fresh" is only mechanically true if the review names the exact bytes it read.
 * A file-keyed row would have to be overwritten, and overwriting the review of content the user
 * already decided on is how a stale verdict survives into the next stage.
 *
 * `items` is the flat list of everything the agent found; `mustfix` and `recommendations` are the same
 * items split by `severity`, so `selected_item_ids` references one namespace rather than two.
 *
 * The two acceptance criteria of task 53 are database rules, not repository discipline:
 *
 * - **every item has a stable, non-empty id** — `review_feedback_items_have_stable_ids`, because the
 *   ids are what `selected_item_ids` points at, and a missing id makes selection meaningless (AC-7);
 * - **`selected_item_ids` is populated only for request-changes** — `review_feedback_selection_matches_decision`,
 *   which also states the converse: accept and ignore store `NULL`, never an empty array. "The user
 *   selected nothing" and "the user was never asked to select" are different facts, and a decision
 *   path that confused them would silently apply no feedback where it should have applied some.
 */
export const reviewFeedback = pgTable(
  'review_feedback',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    specRevisionId: uuid('spec_revision_id')
      .notNull()
      .references(() => specRevisions.id, { onDelete: 'cascade' }),
    outcome: text('outcome').notNull(),
    items: jsonb('items')
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** Null until the user decides — the pending state the workflow waits on (FR-010 AC-4). */
    decision: text('decision'),
    selectedItemIds: jsonb('selected_item_ids'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    decidedAt: timestamp('decided_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    /*
     * One review per revision. Two rows would make "the pending review card" a choice rather than a
     * lookup — the same ambiguity DR-11 removes from proposed changes, and the same fix.
     */
    unique('review_feedback_spec_revision_unique').on(table.specRevisionId),
    check('review_feedback_outcome_valid', sql`${table.outcome} IN (${list(REVIEW_OUTCOMES)})`),
    check(
      'review_feedback_decision_valid',
      sql`${table.decision} IS NULL OR ${table.decision} IN (${list(REVIEW_DECISIONS)})`,
    ),
    check('review_feedback_items_is_array', sql`jsonb_typeof(${table.items}) = 'array'`),
    /*
     * AC-1 of task 53, as a constraint. `jsonb_path_exists` asks the inverse question — "is there an
     * element whose id is missing, non-string or empty?" — because a CHECK cannot run the aggregate
     * that "every element has one" would need. The `!exists(@.id)` arm is not redundant with the type
     * test: on a missing key `@.id.type()` yields no rows and the comparison is unknown, not true, so
     * without it an item with no `id` at all would pass.
     */
    check(
      'review_feedback_items_have_stable_ids',
      sql`NOT jsonb_path_exists(
            ${table.items},
            '$[*] ? (!exists(@.id) || @.id.type() != "string" || @.id == "")'
          )`,
    ),
    /*
     * AC-2 of task 53. Stated over all three states of `decision` so none is left to interpretation:
     * pending stores NULL, accept/ignore store NULL, request_changes stores a non-empty array. The
     * length test is what keeps `ReviewDecision`'s refine from being the only thing standing between
     * a request-changes decision and a revision prompt with no feedback in it.
     *
     * Written as a `CASE`, not as a disjunction of the three states, for the reason spelled out on
     * `spec_revisions_origin_derivation_paired`: **a CHECK accepts NULL**. The obvious form —
     * `(decision = 'request_changes' AND jsonb_typeof(selected_item_ids) = 'array' AND …) OR (…)` —
     * evaluates to NULL rather than false when `selected_item_ids` is NULL, because `jsonb_typeof`
     * of NULL is NULL; the constraint then admits exactly the row it exists to refuse. Its first
     * draft did, and the two tests below are what caught it. A `CASE` yields a boolean on every
     * path: an unknown `WHEN` falls to `ELSE`, and both branches end in an `IS NULL` test.
     */
    check(
      'review_feedback_selection_matches_decision',
      sql`CASE WHEN ${table.decision} = 'request_changes'
                 THEN ${table.selectedItemIds} IS NOT NULL
                      AND jsonb_typeof(${table.selectedItemIds}) = 'array'
                      AND jsonb_array_length(${table.selectedItemIds}) > 0
                 ELSE ${table.selectedItemIds} IS NULL
          END`,
    ),
    /* A decision and its timestamp arrive together; neither is inferable from the other. */
    check(
      'review_feedback_decision_timestamp_paired',
      sql`(${table.decision} IS NULL AND ${table.decidedAt} IS NULL)
          OR (${table.decision} IS NOT NULL AND ${table.decidedAt} IS NOT NULL)`,
    ),
  ],
);

export type SpecFileRow = typeof specFiles.$inferSelect;
export type SpecRevisionRow = typeof specRevisions.$inferSelect;
export type ReviewFeedbackRow = typeof reviewFeedback.$inferSelect;
