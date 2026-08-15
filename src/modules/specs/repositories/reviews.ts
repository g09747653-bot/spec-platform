import { sql } from 'drizzle-orm';
import { z } from 'zod';

import type { SchemaDatabase } from '@/db';
import type { OwnerScope } from '@/db/owner-scope';
import { projects, reviewFeedback, specFiles, specRevisions } from '@/db/schema';
import { queryOneRow, queryRows } from '@/db/sql';

import {
  FEEDBACK_SEVERITIES,
  FEEDBACK_SOURCES,
  isReviewDecision,
  type ReviewDecisionName,
  type ReviewOutcome,
} from '../model/review';

/**
 * Owner-scoped review storage (tasks 54, 56; FR-010).
 *
 * Ownership is a join predicate, as everywhere else in this module: a review is three joins from
 * `projects.owner_id`, and every lookup carries them, so another user's review id is
 * indistinguishable from one that does not exist (AR-2).
 *
 * **Nothing unvalidated is stored.** `create` parses its items through `StoredItem` before the
 * insert, so task 54's "Zod-validated before persistence" holds on this side of the boundary too,
 * for any caller rather than only for the one that remembered. It is deliberately not enough to say
 * "the agent already validated": `specs` may not import `agents` (A1), so the type arriving here is
 * structural, and a structural type is a promise the compiler cannot keep. The database adds the
 * third layer for the id rule specifically, which is the one FR-010 AC-7 reads back.
 *
 * `decide` is written as a conditional UPDATE rather than read-then-write. The same reasoning as the
 * revision allocator: two decisions racing on one card must not both succeed, and the arbiter is the
 * database. The `decision IS NULL` predicate is what makes the second one a no-op instead of an
 * overwrite of the first — which is also what FR-011 AC-6's "one pending decision" means for reviews.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The shape stored in `review_feedback.items` since review.v2 (task 111). */
const StoredItemV2 = z.object({
  id: z.string().min(1),
  sectionPath: z.string().min(1),
  title: z.string().min(1),
  body: z.string().min(1),
  suggestion: z.string().min(1),
  confidence: z.number().int().min(1).max(10),
  severity: z.enum(FEEDBACK_SEVERITIES),
  source: z.enum(FEEDBACK_SOURCES).default('model'),
});

export type StoredReviewItem = z.infer<typeof StoredItemV2>;

/**
 * A row written before review.v2, read forward (task 111).
 *
 * Every board in an existing session is one of these, and a board is history: it was decided by a
 * person on the words it showed them, and it is never rewritten (A4's reasoning, applied to the
 * review rather than to the document). So the shape change is absorbed on the way **out** rather
 * than by a data migration — the same compatibility contract task 106 wrote for v2 question sets
 * (D-104), and the same reason: the alternative is a session whose earlier stages stop rendering.
 *
 * The mapping invents nothing. `section` and `description` are the fields v2 renamed; a v1 item has
 * no separate heading, so its section path serves as the title, exactly as the card used to render
 * it; `line` is dropped, because v2 does not show one. Confidence carries over unchanged — the
 * widened band contains the old one.
 */
const StoredItemV1 = z
  .object({
    id: z.string().min(1),
    section: z.string().min(1),
    line: z.number().int().optional(),
    confidenceScore: z.number().int().min(1).max(10),
    description: z.string().min(1),
    suggestion: z.string().min(1),
    severity: z.enum(FEEDBACK_SEVERITIES),
  })
  .transform((item): StoredReviewItem => ({
    id: item.id,
    sectionPath: item.section,
    title: item.section,
    body: item.description,
    suggestion: item.suggestion,
    confidence: item.confidenceScore,
    severity: item.severity,
    source: 'model',
  }));

const StoredItem = z.union([StoredItemV2, StoredItemV1]);

const ReviewRow = z.object({
  id: z.uuid(),
  spec_revision_id: z.uuid(),
  spec_file_id: z.uuid(),
  project_id: z.uuid(),
  spec_type: z.string(),
  revision_number: z.number().int().positive(),
  outcome: z.enum(['pass', 'needs_revision']),
  summary: z.string().nullable(),
  items: z.array(StoredItem),
  decision: z.string().nullable(),
  selected_item_ids: z.array(z.string()).nullable(),
  revision_note: z.string().nullable(),
});

export interface StoredReview {
  id: string;
  specRevisionId: string;
  specFileId: string;
  projectId: string;
  specType: string;
  revisionNumber: number;
  outcome: ReviewOutcome;
  /** `null` on a board written before review.v2, which had no summary to write. */
  summary: string | null;
  items: StoredReviewItem[];
  decision: ReviewDecisionName | null;
  selectedItemIds: string[] | null;
  /** What the writer said it was folding in; `null` until a request-changes decision writes it. */
  revisionNote: string | null;
}

function toReview(row: z.infer<typeof ReviewRow>): StoredReview {
  if (row.decision !== null && !isReviewDecision(row.decision)) {
    throw new Error(`review_feedback.decision holds an unknown decision: ${row.decision}`);
  }

  return {
    id: row.id,
    specRevisionId: row.spec_revision_id,
    specFileId: row.spec_file_id,
    projectId: row.project_id,
    specType: row.spec_type,
    revisionNumber: row.revision_number,
    outcome: row.outcome,
    summary: row.summary,
    items: row.items,
    decision: row.decision,
    selectedItemIds: row.selected_item_ids,
    revisionNote: row.revision_note,
  };
}

/** The projection every lookup returns: the review plus the file it belongs to. */
const REVIEW_COLUMNS = sql`
  ${reviewFeedback}.id,
  ${reviewFeedback}.spec_revision_id,
  ${specRevisions}.spec_file_id,
  ${specFiles}.project_id,
  ${specFiles}.spec_type,
  ${specRevisions}.revision_number,
  ${reviewFeedback}.outcome,
  ${reviewFeedback}.summary,
  ${reviewFeedback}.items,
  ${reviewFeedback}.decision,
  ${reviewFeedback}.selected_item_ids,
  ${reviewFeedback}.revision_note
`;

const OWNED_REVIEW = sql`
  FROM ${reviewFeedback}
  JOIN ${specRevisions} ON ${specRevisions}.id = ${reviewFeedback}.spec_revision_id
  JOIN ${specFiles} ON ${specFiles}.id = ${specRevisions}.spec_file_id
  JOIN ${projects} ON ${projects}.id = ${specFiles}.project_id
`;

/** A review with the two timestamps the conversation orders it by (task 104). */
const ProjectReviewRow = ReviewRow.extend({
  created_at: z.coerce.date(),
  decided_at: z.coerce.date().nullable(),
});

export interface ProjectReview extends StoredReview {
  createdAt: Date;
  decidedAt: Date | null;
}

export interface CreateReviewInput {
  specRevisionId: string;
  outcome: ReviewOutcome;
  summary: string;
  items: readonly StoredReviewItem[];
}

export function createReviewRepository(db: SchemaDatabase) {
  return {
    /**
     * Records the review of one revision, or returns the one already recorded.
     *
     * `ON CONFLICT DO NOTHING` plus a read, in the shape `ensureSpecFile` established: the table
     * holds one review per revision, and two approvals racing on the same revision must produce a
     * lookup rather than an error. Re-reviewing is not a thing that happens — the content is
     * immutable, so a second review of the same bytes could only ever disagree with the first.
     */
    async create(input: CreateReviewInput): Promise<StoredReview> {
      const items = z.array(StoredItem).parse(input.items);

      await db
        .insert(reviewFeedback)
        .values({
          specRevisionId: input.specRevisionId,
          outcome: input.outcome,
          summary: input.summary,
          items,
        })
        .onConflictDoNothing();

      return toReview(
        await queryOneRow(
          db,
          sql`
            SELECT ${REVIEW_COLUMNS} ${OWNED_REVIEW}
            WHERE ${reviewFeedback}.spec_revision_id = ${input.specRevisionId}::uuid
          `,
          ReviewRow,
        ),
      );
    },

    /** The review, or `null` when it belongs to someone else or does not exist. */
    async findById(scope: OwnerScope, reviewId: string): Promise<StoredReview | null> {
      if (!UUID.test(reviewId)) return null;

      const rows = await queryRows(
        db,
        sql`
          SELECT ${REVIEW_COLUMNS} ${OWNED_REVIEW}
          WHERE ${reviewFeedback}.id = ${reviewId}::uuid
            AND ${projects}.owner_id = ${scope.userId}::uuid
        `,
        ReviewRow,
      );

      const row = rows[0];
      return row === undefined ? null : toReview(row);
    },

    /**
     * Every review of every file of a project, oldest first (task 104).
     *
     * A review card is a block of the conversation, decided or not, so the feed reads the whole
     * chain rather than only the pending one. `decided_at` comes along because a decided review has
     * a place in the timeline of its own — after the revision it read, before the one it caused.
     */
    async projectHistory(scope: OwnerScope, projectId: string): Promise<ProjectReview[]> {
      if (!UUID.test(projectId)) return [];

      const rows = await queryRows(
        db,
        sql`
          SELECT ${REVIEW_COLUMNS},
                 ${reviewFeedback}.created_at,
                 ${reviewFeedback}.decided_at
          ${OWNED_REVIEW}
          WHERE ${specFiles}.project_id = ${projectId}::uuid
            AND ${projects}.owner_id = ${scope.userId}::uuid
          ORDER BY ${reviewFeedback}.created_at ASC
        `,
        ProjectReviewRow,
      );

      return rows.map((row) => ({
        ...toReview(row),
        createdAt: row.created_at,
        decidedAt: row.decided_at,
      }));
    },

    /**
     * The review awaiting a decision on a file's latest revision, if there is one.
     *
     * Keyed to the latest revision rather than to "any undecided review": after a request-changes
     * appends a new revision, the earlier review is decided and the new one is what the board shows.
     */
    async pendingForFile(scope: OwnerScope, specFileId: string): Promise<StoredReview | null> {
      if (!UUID.test(specFileId)) return null;

      const rows = await queryRows(
        db,
        sql`
          SELECT ${REVIEW_COLUMNS} ${OWNED_REVIEW}
          WHERE ${specFiles}.id = ${specFileId}::uuid
            AND ${projects}.owner_id = ${scope.userId}::uuid
            AND ${reviewFeedback}.decision IS NULL
            AND ${specRevisions}.revision_number = (
              SELECT MAX(latest.revision_number)
              FROM ${specRevisions} AS latest
              WHERE latest.spec_file_id = ${specFileId}::uuid
            )
        `,
        ReviewRow,
      );

      const row = rows[0];
      return row === undefined ? null : toReview(row);
    },

    /**
     * The review that sent this file back for changes, if that is where it stands (FR-010 AC-6).
     *
     * Keyed to the file's latest revision, like `pendingForFile`: a request-changes decision is what
     * the *next* generation must apply, and once that generation appends a revision the review no
     * longer describes the newest content and stops answering here. That is what stops a single
     * request-changes from being applied to every subsequent regeneration for the rest of the stage.
     */
    async requestedChangesForFile(
      scope: OwnerScope,
      specFileId: string,
    ): Promise<StoredReview | null> {
      if (!UUID.test(specFileId)) return null;

      const rows = await queryRows(
        db,
        sql`
          SELECT ${REVIEW_COLUMNS} ${OWNED_REVIEW}
          WHERE ${specFiles}.id = ${specFileId}::uuid
            AND ${projects}.owner_id = ${scope.userId}::uuid
            AND ${reviewFeedback}.decision = 'request_changes'
            AND ${specRevisions}.revision_number = (
              SELECT MAX(latest.revision_number)
              FROM ${specRevisions} AS latest
              WHERE latest.spec_file_id = ${specFileId}::uuid
            )
        `,
        ReviewRow,
      );

      const row = rows[0];
      return row === undefined ? null : toReview(row);
    },

    /**
     * The most recent request-changes decision on this file, whatever revision it read (task 113).
     *
     * The sibling of `requestedChangesForFile`, and the difference is the whole reason it exists:
     * that one answers "what must the *next* generation apply?" and therefore stops answering the
     * moment the revision lands. This one answers "what was the last revision asked to fix?", which
     * is the question a **re-review** asks — by then the revision exists, so the other query has
     * gone quiet. Эталон's «Verifying the revision against the four items you selected» is exactly
     * this lookup.
     */
    async lastRequestedChangesForFile(
      scope: OwnerScope,
      specFileId: string,
    ): Promise<StoredReview | null> {
      if (!UUID.test(specFileId)) return null;

      const rows = await queryRows(
        db,
        sql`
          SELECT ${REVIEW_COLUMNS} ${OWNED_REVIEW}
          WHERE ${specFiles}.id = ${specFileId}::uuid
            AND ${projects}.owner_id = ${scope.userId}::uuid
            AND ${reviewFeedback}.decision = 'request_changes'
          ORDER BY ${reviewFeedback}.decided_at DESC
          LIMIT 1
        `,
        ReviewRow,
      );

      const row = rows[0];
      return row === undefined ? null : toReview(row);
    },

    /**
     * How many times this file has been sent back for changes (task 113).
     *
     * The count the revision budget is measured against. Decisions, not revisions: a regeneration
     * the user asked for on the spec card is not a review cycle, and counting revisions would spend
     * the loop's budget on work the loop never ordered.
     */
    async countRequestedChanges(scope: OwnerScope, specFileId: string): Promise<number> {
      if (!UUID.test(specFileId)) return 0;

      const rows = await queryRows(
        db,
        sql`
          SELECT COUNT(*)::int AS cycles ${OWNED_REVIEW}
          WHERE ${specFiles}.id = ${specFileId}::uuid
            AND ${projects}.owner_id = ${scope.userId}::uuid
            AND ${reviewFeedback}.decision = 'request_changes'
        `,
        z.object({ cycles: z.number().int().nonnegative() }),
      );

      return rows[0]?.cycles ?? 0;
    },

    /**
     * Records what the writer said it was folding in, once (task 113; Эталон §1.3).
     *
     * `revision_note IS NULL` in the predicate for the same reason `decide` carries
     * `decision IS NULL`: the paragraph explains a decision that has already been taken, so a second
     * one would be a second account of the same event. A retried generation therefore keeps the note
     * the first attempt wrote rather than replacing it — the board is history (task 111).
     */
    async noteRevision(reviewId: string, note: string): Promise<boolean> {
      if (!UUID.test(reviewId)) return false;

      const updated = await queryRows(
        db,
        sql`
          UPDATE ${reviewFeedback}
          SET revision_note = ${note}
          WHERE id = ${reviewId}::uuid AND revision_note IS NULL
          RETURNING id
        `,
        z.object({ id: z.uuid() }),
      );

      return updated.length > 0;
    },

    /**
     * Records the user's decision, once.
     *
     * Returns `null` when the review was already decided — the caller answers `PENDING_DECISION`
     * rather than silently applying the second decision, so a double submission from the card and
     * from chat cannot produce two different outcomes (FR-009 AC-7).
     */
    async decide(
      reviewId: string,
      decision: ReviewDecisionName,
      selectedItemIds: readonly string[] | null,
    ): Promise<StoredReview | null> {
      const selection =
        decision === 'request_changes' ? JSON.stringify([...(selectedItemIds ?? [])]) : null;

      const updated = await queryRows(
        db,
        sql`
          UPDATE ${reviewFeedback}
          SET decision = ${decision},
              selected_item_ids = ${selection}::jsonb,
              decided_at = now()
          WHERE id = ${reviewId}::uuid AND decision IS NULL
          RETURNING id
        `,
        z.object({ id: z.uuid() }),
      );

      if (updated.length === 0) return null;

      return toReview(
        await queryOneRow(
          db,
          sql`SELECT ${REVIEW_COLUMNS} ${OWNED_REVIEW} WHERE ${reviewFeedback}.id = ${reviewId}::uuid`,
          ReviewRow,
        ),
      );
    },
  };
}

export type ReviewRepository = ReturnType<typeof createReviewRepository>;
