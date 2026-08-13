import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { PARSE_STATUSES } from '@/modules/projects/attachments/model';
import { STAGES } from '@/modules/workflow/model/stages';

import { sessions } from './projects';

/** Renders a tuple of names as a SQL value list. The inputs are compile-time constants. */
const list = (values: readonly string[]) => sql.raw(values.map((value) => `'${value}'`).join(', '));

/**
 * An uploaded grounding document (FR-004; DR-8; task 63).
 *
 * Owned through the session, which is owned through the project, so a two-join predicate resolves an
 * attachment to exactly one user (DR-1) and there is no unscoped read path (S2).
 *
 * **`blob_key` is unique.** It is the only reference to the stored object (solution.md —
 * `adapters/storage`), so two rows naming one object would make deletion ambiguous: removing one
 * attachment would strip the bytes out from under the other. The uniqueness is what lets DR-6's
 * cascade delete a blob per row without checking whether anyone else still wants it.
 *
 * **`extracted_text` is nullable and `parse_status` is not.** Extraction is a fact about the upload
 * that is always known; the text is a fact that exists only when extraction succeeded. The pairing is
 * a constraint rather than a convention, so a `failed` row carrying text — or an `ok` row carrying
 * none — cannot reach the context assembler and be read as "this document is empty".
 *
 * `attached_at_stage` is what FR-004 AC-6 lists to the owner and what makes a late attachment legible;
 * the *impact* of a late attachment is computed from `spec_revisions.context_attachment_ids` instead
 * (DR-12), because that is state the generation itself recorded rather than a stage name compared
 * after the fact.
 */
export const attachments = pgTable(
  'attachments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    fileName: text('file_name').notNull(),
    /** The **sniffed** type, never the declared one (task 65; NFR-008 AC-1). */
    mimeType: text('mime_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    blobKey: text('blob_key').notNull().unique(),
    parseStatus: text('parse_status').notNull().default('pending'),
    /** Why extraction failed. Present only on `failed` rows (FR-004 AC-5; IR-004-AC-3). */
    parseReason: text('parse_reason'),
    extractedText: text('extracted_text'),
    attachedAtStage: text('attached_at_stage').notNull(),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('attachments_session_id_idx').on(table.sessionId),
    check('attachments_file_name_not_blank', sql`${table.fileName} ~ '[^[:space:]]'`),
    check('attachments_size_bytes_positive', sql`${table.sizeBytes} > 0`),
    check('attachments_parse_status_valid', sql`${table.parseStatus} IN (${list(PARSE_STATUSES)})`),
    check(
      'attachments_attached_at_stage_valid',
      sql`${table.attachedAtStage} IN (${list(STAGES)})`,
    ),
    /*
     * Text exists exactly when extraction succeeded.
     *
     * Written as a `CASE` for the reason spelled out on `review_feedback_selection_matches_decision`:
     * a CHECK accepts NULL, so a disjunction over columns that are themselves NULL evaluates to
     * unknown and admits the row it exists to refuse. Every branch here ends in an `IS NULL` /
     * `IS NOT NULL` test, which is boolean on every path.
     */
    check(
      'attachments_extracted_text_matches_status',
      sql`CASE WHEN ${table.parseStatus} = 'ok'
                 THEN ${table.extractedText} IS NOT NULL
                 ELSE ${table.extractedText} IS NULL
           END`,
    ),
    /* A reason belongs to a failure and to nothing else: an `ok` row explaining itself is a defect. */
    check(
      'attachments_parse_reason_matches_status',
      sql`CASE WHEN ${table.parseStatus} = 'failed'
                 THEN ${table.parseReason} IS NOT NULL
                 ELSE ${table.parseReason} IS NULL
           END`,
    ),
  ],
);

export type AttachmentRow = typeof attachments.$inferSelect;
