import { sql } from 'drizzle-orm';
import { z } from 'zod';

import type { SchemaDatabase } from '@/db';
import type { OwnerScope } from '@/db/owner-scope';
import { projects, reviewFeedback, specFiles, specRevisions } from '@/db/schema';
import { queryOneRow, queryRows } from '@/db/sql';

import { isReviewDecision, type ReviewDecisionName, type ReviewOutcome } from '../model/review';

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

/** The shape stored in `review_feedback.items`; validated on the way out as well as in. */
const StoredItem = z.object({
  id: z.string().min(1),
  section: z.string().min(1),
  line: z.number().int().positive(),
  confidenceScore: z.number().int().min(5).max(10),
  description: z.string().min(1),
  suggestion: z.string().min(1),
  severity: z.enum(['blocking', 'advisory']),
});

export type StoredReviewItem = z.infer<typeof StoredItem>;

const ReviewRow = z.object({
  id: z.uuid(),
  spec_revision_id: z.uuid(),
  spec_file_id: z.uuid(),
  project_id: z.uuid(),
  spec_type: z.string(),
  revision_number: z.number().int().positive(),
  outcome: z.enum(['pass', 'needs_revision']),
  items: z.array(StoredItem),
  decision: z.string().nullable(),
  selected_item_ids: z.array(z.string()).nullable(),
});

export interface StoredReview {
  id: string;
  specRevisionId: string;
  specFileId: string;
  projectId: string;
  specType: string;
  revisionNumber: number;
  outcome: ReviewOutcome;
  items: StoredReviewItem[];
  decision: ReviewDecisionName | null;
  selectedItemIds: string[] | null;
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
    items: row.items,
    decision: row.decision,
    selectedItemIds: row.selected_item_ids,
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
  ${reviewFeedback}.items,
  ${reviewFeedback}.decision,
  ${reviewFeedback}.selected_item_ids
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
        .values({ specRevisionId: input.specRevisionId, outcome: input.outcome, items })
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
