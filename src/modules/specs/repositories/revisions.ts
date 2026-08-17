import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import type { SchemaDatabase } from '@/db';
import type { OwnerScope } from '@/db/owner-scope';
import { projects, specFiles, specRevisions } from '@/db/schema';
import { queryOneRow, queryRows } from '@/db/sql';

import { revisionOriginForMode } from '../export/resolve-mode';
import type { ExportMode } from '../model/export';
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

/** A revision with the file it belongs to — what a project-wide read returns (task 104). */
const ProjectRevisionRow = z.object({
  id: z.uuid(),
  spec_file_id: z.uuid(),
  spec_type: z.string(),
  file_name: z.string(),
  revision_number: z.number().int().positive(),
  approved: z.boolean(),
  origin: z.enum(['parity', 'enrichment']),
  source_session_id: z.uuid().nullable(),
  created_at: z.coerce.date(),
});

export interface ProjectRevision {
  id: string;
  specFileId: string;
  specType: string;
  fileName: string;
  revisionNumber: number;
  approved: boolean;
  origin: RevisionOrigin;
  /** The chat that wrote it (task 118), or `null` for history written before chats were told apart. */
  sourceSessionId: string | null;
  createdAt: Date;
}

export interface AppendRevisionInput {
  specFileId: string;
  content: string;
  /** Defaults to `parity`; an `enrichment` revision must name the parity revision it derives from. */
  origin?: RevisionOrigin;
  derivedFrom?: string | null;
  contextAttachmentIds?: readonly string[];
  /**
   * The chat that produced this revision (task 118; А-6).
   *
   * Optional and defaulting to `null` rather than required, because "written before chats were
   * distinguishable" is a real state of the table and must stay distinguishable from "written by
   * this chat". Every caller that knows its session passes it.
   */
  sourceSessionId?: string | null;
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
                (spec_file_id, revision_number, content, origin, derived_from, context_attachment_ids, source_session_id)
              SELECT
                ${input.specFileId}::uuid,
                COALESCE(MAX(existing.revision_number), 0) + 1,
                ${input.content},
                ${origin},
                ${derivedFrom}::uuid,
                ${contextIds}::jsonb,
                ${input.sourceSessionId ?? null}::uuid
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

    /**
     * One revision of a file, named by its number (task 138).
     *
     * Approved or not: the viewer opens a document at the revision the card it came from is about,
     * and a draft is exactly the case where reading it matters most. Ownership is not this method's
     * business — the file was resolved through the owner predicate before its id reached here, which
     * is the same arrangement `latest` and `history` already rely on.
     */
    async findByNumber(specFileId: string, revisionNumber: number): Promise<SpecRevision | null> {
      const rows = await db
        .select()
        .from(specRevisions)
        .where(
          and(
            eq(specRevisions.specFileId, specFileId),
            eq(specRevisions.revisionNumber, revisionNumber),
          ),
        )
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

    /**
     * The revision a given export mode resolves this file to (task 74; FR-016 AC-5).
     *
     * The same rule the bundle uses, applied to one file — expressed by delegating to
     * `revisionOriginForMode` rather than by restating "default means parity". A clipboard copy that
     * disagreed with the archive would be the worst kind of wrong: silently, in a single file, in
     * the direction the user is least likely to check.
     */
    async latestApprovedForMode(
      specFileId: string,
      mode: ExportMode,
    ): Promise<SpecRevision | null> {
      return revisionOriginForMode(mode) === 'parity'
        ? this.latestApprovedPreEnrichment(specFileId)
        : this.latestApproved(specFileId);
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

    /**
     * Every revision of every file of a project, oldest first (task 104).
     *
     * The feed is a chronological projection, and a document card is a revision — so the whole
     * bundle's revision chain is one read rather than one read per file. `spec_type` and `file_name`
     * come along because the card prints them and the projection has no second lookup to resolve
     * them with.
     */
    async projectHistory(scope: OwnerScope, projectId: string): Promise<ProjectRevision[]> {
      if (!UUID.test(projectId)) return [];

      const rows = await queryRows(
        db,
        sql`
          SELECT
            ${specRevisions}.id,
            ${specRevisions}.spec_file_id,
            ${specFiles}.spec_type,
            ${specFiles}.file_name,
            ${specRevisions}.revision_number,
            ${specRevisions}.approved,
            ${specRevisions}.origin,
            ${specRevisions}.source_session_id,
            ${specRevisions}.created_at
          FROM ${specRevisions}
          JOIN ${specFiles} ON ${specFiles}.id = ${specRevisions}.spec_file_id
          JOIN ${projects} ON ${projects}.id = ${specFiles}.project_id
          WHERE ${specFiles}.project_id = ${projectId}::uuid
            AND ${projects}.owner_id = ${scope.userId}::uuid
          ORDER BY ${specRevisions}.created_at ASC, ${specFiles}.spec_type ASC,
                   ${specRevisions}.revision_number ASC
        `,
        ProjectRevisionRow,
      );

      return rows.map((row) => ({
        id: row.id,
        specFileId: row.spec_file_id,
        specType: row.spec_type,
        fileName: row.file_name,
        revisionNumber: row.revision_number,
        approved: row.approved,
        origin: row.origin,
        sourceSessionId: row.source_session_id,
        createdAt: row.created_at,
      }));
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
