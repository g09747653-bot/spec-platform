import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import type { SchemaDatabase } from '@/db';
import { specFiles, specRevisions } from '@/db/schema';
import { queryOneRow, queryRows } from '@/db/sql';

import { type RevisionOrigin, type SpecType, specFileName } from '../model/spec-files';

/**
 * Append-only revision storage (FR-012; DR-3; solution.md — `specs`).
 *
 * Two properties this repository is responsible for, and neither is achievable with a read followed by
 * a write:
 *
 * - **Gapless numbering.** `revision_number` is allocated by the same statement that inserts the row —
 *   `SELECT max(...) + 1` reads and writes atomically inside one implicit transaction. The production
 *   driver has no interactive transactions (D-16), so "inside the insert transaction" *is* one
 *   statement. Two concurrent inserts therefore cannot both take the same number: the loser violates
 *   the unique constraint on `(spec_file_id, revision_number)` and is retried, which yields consecutive
 *   numbers with no gaps and no duplicates.
 * - **Resolution.** Latest, latest-approved and latest pre-enrichment are three different questions
 *   with three different answers, and the export rule of A6 depends on the third being decidable rather
 *   than inferred.
 */

const RevisionRow = z.object({
  id: z.uuid(),
  spec_file_id: z.uuid(),
  revision_number: z.number().int().positive(),
  content: z.string(),
  approved: z.boolean(),
  origin: z.enum(['parity', 'enrichment']),
  derived_from: z.uuid().nullable(),
  created_at: z.union([z.date(), z.string()]),
});

export interface SpecRevision {
  id: string;
  specFileId: string;
  revisionNumber: number;
  content: string;
  approved: boolean;
  origin: RevisionOrigin;
  derivedFrom: string | null;
  createdAt: Date;
}

const toRevision = (row: z.infer<typeof RevisionRow>): SpecRevision => ({
  id: row.id,
  specFileId: row.spec_file_id,
  revisionNumber: row.revision_number,
  content: row.content,
  approved: row.approved,
  origin: row.origin,
  derivedFrom: row.derived_from,
  createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
});

export interface AppendRevisionInput {
  specFileId: string;
  content: string;
  /** Defaults to `parity`; an `enrichment` revision must name the parity revision it derives from. */
  origin?: RevisionOrigin;
  derivedFrom?: string | null;
  contextAttachmentIds?: readonly string[];
}

/** How many times an allocation collision is retried before giving up. */
const MAX_ALLOCATION_ATTEMPTS = 5;

/**
 * Recognises the allocation race.
 *
 * The constraint name lives further down the `cause` chain than the message Drizzle throws, so the whole
 * chain is flattened before matching — otherwise a genuine collision would look like an unknown error and
 * be rethrown instead of retried.
 */
function isUniqueViolation(error: unknown): boolean {
  const parts: string[] = [];

  for (let current: unknown = error; current instanceof Error; current = current.cause) {
    parts.push(current.message);
  }

  return /spec_revisions_file_revision_unique|duplicate key/i.test(parts.join(' | '));
}

export function createRevisionRepository(db: SchemaDatabase) {
  /**
   * Appends a revision, allocating the next number inside the insert.
   *
   * The retry loop exists because the race is resolved by the database, not avoided by locking: under
   * contention one of the two inserts fails on the unique constraint, and the correct response is to
   * read the (now higher) maximum and insert again — never to renumber or overwrite the winner.
   */
  async function append(input: AppendRevisionInput): Promise<SpecRevision> {
    const origin = input.origin ?? 'parity';
    const derivedFrom = input.derivedFrom ?? null;
    const contextIds = JSON.stringify([...(input.contextAttachmentIds ?? [])]);

    for (let attempt = 1; ; attempt += 1) {
      try {
        const inserted = await queryOneRow(
          db,
          sql`
            WITH allocated AS (
              INSERT INTO ${specRevisions}
                (spec_file_id, revision_number, content, origin, derived_from, context_attachment_ids)
              SELECT
                ${input.specFileId}::uuid,
                COALESCE(MAX(existing.revision_number), 0) + 1,
                ${input.content},
                ${origin},
                ${derivedFrom}::uuid,
                ${contextIds}::jsonb
              FROM ${specRevisions} AS existing
              WHERE existing.spec_file_id = ${input.specFileId}::uuid
              RETURNING id, spec_file_id, revision_number, content, approved, origin, derived_from, created_at
            ), pointer AS (
              UPDATE ${specFiles}
              SET current_revision = (SELECT revision_number FROM allocated)
              WHERE id = ${input.specFileId}::uuid
              RETURNING id
            )
            SELECT allocated.* FROM allocated JOIN pointer ON pointer.id = allocated.spec_file_id
          `,
          RevisionRow,
        );

        return toRevision(inserted);
      } catch (error) {
        if (!isUniqueViolation(error) || attempt >= MAX_ALLOCATION_ATTEMPTS) throw error;
      }
    }
  }

  return {
    append,

    /** The newest revision of a file, approved or not. */
    async latest(specFileId: string): Promise<SpecRevision | null> {
      const rows = await db
        .select()
        .from(specRevisions)
        .where(eq(specRevisions.specFileId, specFileId))
        .orderBy(desc(specRevisions.revisionNumber))
        .limit(1);

      const row = rows[0];
      return row === undefined
        ? null
        : {
            id: row.id,
            specFileId: row.specFileId,
            revisionNumber: row.revisionNumber,
            content: row.content,
            approved: row.approved,
            origin: row.origin === 'enrichment' ? 'enrichment' : 'parity',
            derivedFrom: row.derivedFrom,
            createdAt: row.createdAt,
          };
    },

    /** The newest **approved** revision — what an export may contain (FR-015 AC-2). */
    async latestApproved(specFileId: string): Promise<SpecRevision | null> {
      const rows = await queryRows(
        db,
        sql`
          SELECT id, spec_file_id, revision_number, content, approved, origin, derived_from, created_at
          FROM ${specRevisions}
          WHERE spec_file_id = ${specFileId}::uuid AND approved = true
          ORDER BY revision_number DESC
          LIMIT 1
        `,
        RevisionRow,
      );

      const row = rows[0];
      return row === undefined ? null : toRevision(row);
    },

    /**
     * The newest approved revision produced **before** enrichment (FR-012 AC-4; A6).
     *
     * `origin = 'parity'` is the whole definition: enrichment revisions are marked, so "before
     * enrichment" is a filter rather than a guess about timestamps. This is what a default-mode export
     * resolves to even on a session where enrichment has already run.
     */
    async latestApprovedPreEnrichment(specFileId: string): Promise<SpecRevision | null> {
      const rows = await queryRows(
        db,
        sql`
          SELECT id, spec_file_id, revision_number, content, approved, origin, derived_from, created_at
          FROM ${specRevisions}
          WHERE spec_file_id = ${specFileId}::uuid AND approved = true AND origin = 'parity'
          ORDER BY revision_number DESC
          LIMIT 1
        `,
        RevisionRow,
      );

      const row = rows[0];
      return row === undefined ? null : toRevision(row);
    },

    /** Marks exactly one revision approved (FR-009 AC-3). Returns `false` if there was nothing to mark. */
    async approve(revisionId: string): Promise<boolean> {
      const updated = await db
        .update(specRevisions)
        .set({ approved: true })
        .where(and(eq(specRevisions.id, revisionId), eq(specRevisions.approved, false)))
        .returning({ id: specRevisions.id });

      return updated.length > 0;
    },

    /** Every revision of a file, oldest first — the history a diff walks (A4). */
    async history(specFileId: string): Promise<SpecRevision[]> {
      const rows = await queryRows(
        db,
        sql`
          SELECT id, spec_file_id, revision_number, content, approved, origin, derived_from, created_at
          FROM ${specRevisions}
          WHERE spec_file_id = ${specFileId}::uuid
          ORDER BY revision_number ASC
        `,
        RevisionRow,
      );

      return rows.map(toRevision);
    },

    /**
     * Finds or creates the spec file of a given type for a project.
     *
     * `ON CONFLICT DO NOTHING` plus a follow-up read rather than a check-then-insert: two concurrent
     * generations of the same stage would otherwise both believe they had to create the file, and the
     * unique constraint would turn the loser into an error instead of a lookup.
     */
    async ensureSpecFile(projectId: string, specType: SpecType): Promise<{ id: string }> {
      await db
        .insert(specFiles)
        .values({ projectId, specType, fileName: specFileName(specType) })
        .onConflictDoNothing();

      const rows = await db
        .select({ id: specFiles.id })
        .from(specFiles)
        .where(and(eq(specFiles.projectId, projectId), eq(specFiles.specType, specType)));

      const row = rows[0];
      if (row === undefined) throw new Error(`spec file ${specType} could not be created`);

      return row;
    },
  };
}

export type RevisionRepository = ReturnType<typeof createRevisionRepository>;
