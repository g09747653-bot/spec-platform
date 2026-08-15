import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import type { SchemaDatabase } from '@/db';
import type { OwnerScope } from '@/db/owner-scope';
import {
  generationRuns,
  projects,
  proposedChanges,
  sessions,
  specFiles,
  specRevisions,
} from '@/db/schema';
import { queryRows } from '@/db/sql';

import { diffLines, formatUnifiedDiff, type FileDiff } from '../diff';
import { isProposalStatus, type ProposalStatus } from '../model/review';
import { isCoreSpecType } from '../model/spec-files';
import { validateStructure } from '../validate-structure';

/**
 * The ProposedChangeService (task 59; FR-011 AC-1/AC-2/AC-8).
 *
 * A refinement is computed, shown, and only *then* — if the user accepts — written. This service
 * owns the middle of that sentence: it takes content someone else produced, refuses it if it would
 * damage the document, stores it as a proposal that no spec-content query can see, and returns the
 * diff the user decides on.
 *
 * **It does not call a model.** `specs` may not import `agents`, `prompts` or `adapters`
 * (constitution A1), and that boundary is doing real work here rather than being an inconvenience:
 * computing the text and deciding whether the text is admissible are separate concerns, and this
 * half is deterministic and unit-testable with no provider in sight. The composition root produces
 * the candidate content and hands it over.
 *
 * **The required-section check goes through `validateStructure`, not the section schema** (D-16, and
 * the M3 consumption chain). Reading the heading list directly to see what an instruction would
 * remove would put structural truth in a third place; asking the validator what is now broken gets
 * the same answer from the one module allowed to know.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ProposalRow = z.object({
  id: z.uuid(),
  spec_file_id: z.uuid(),
  project_id: z.uuid(),
  spec_type: z.string(),
  file_name: z.string(),
  base_revision: z.number().int().positive(),
  proposed_content: z.string(),
  instruction: z.string(),
  status: z.string(),
  edit_batch_id: z.uuid().nullable(),
  created_at: z.union([z.date(), z.string()]),
});

export interface StoredProposal {
  id: string;
  specFileId: string;
  projectId: string;
  specType: string;
  fileName: string;
  baseRevision: number;
  proposedContent: string;
  instruction: string;
  status: ProposalStatus;
  /** The cross-file edit this belongs to (task 118), or `null` for a single-file refinement. */
  editBatchId: string | null;
  /** When the proposed text was produced — the moment its context set is asked about (DR-12). */
  createdAt: Date;
}

function toProposal(row: z.infer<typeof ProposalRow>): StoredProposal {
  if (!isProposalStatus(row.status)) {
    throw new Error(`proposed_changes.status holds an unknown status: ${row.status}`);
  }

  return {
    id: row.id,
    specFileId: row.spec_file_id,
    projectId: row.project_id,
    specType: row.spec_type,
    fileName: row.file_name,
    baseRevision: row.base_revision,
    proposedContent: row.proposed_content,
    instruction: row.instruction,
    status: row.status,
    editBatchId: row.edit_batch_id,
    createdAt: row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
  };
}

const PROPOSAL_COLUMNS = sql`
  ${proposedChanges}.id,
  ${proposedChanges}.spec_file_id,
  ${specFiles}.project_id,
  ${specFiles}.spec_type,
  ${specFiles}.file_name,
  ${proposedChanges}.base_revision,
  ${proposedChanges}.proposed_content,
  ${proposedChanges}.instruction,
  ${proposedChanges}.status,
  ${proposedChanges}.edit_batch_id,
  ${proposedChanges}.created_at
`;

const OWNED_PROPOSAL = sql`
  FROM ${proposedChanges}
  JOIN ${specFiles} ON ${specFiles}.id = ${proposedChanges}.spec_file_id
  JOIN ${projects} ON ${projects}.id = ${specFiles}.project_id
`;

export interface ProposeInput {
  specFileId: string;
  instruction: string;
  /** The candidate text, produced outside this module (see the note on boundaries above). */
  proposedContent: string;
}

export type ProposeOutcome =
  | { status: 'proposed'; proposal: StoredProposal; diff: FileDiff; unifiedDiff: string }
  /** A proposal is already awaiting a decision on this file (FR-011 AC-6). */
  | { status: 'pending-decision'; existing: StoredProposal }
  /** The change would remove a section the schema requires (FR-011 AC-8). */
  | { status: 'removes-required-section'; sections: readonly string[] }
  /** The instruction would change nothing — there is no diff to decide on. */
  | { status: 'no-change' }
  | { status: 'not-found' };

/** Recognises the partial unique index firing, the way the revision repository recognises its own. */
function isPendingCollision(error: unknown): boolean {
  const parts: string[] = [];
  for (let current: unknown = error; current instanceof Error; current = current.cause) {
    parts.push(current.message);
  }

  return /proposed_changes_one_pending_per_file|duplicate key/i.test(parts.join(' | '));
}

export function createProposedChangeService(db: SchemaDatabase) {
  async function findOwned(scope: OwnerScope, proposalId: string): Promise<StoredProposal | null> {
    if (!UUID.test(proposalId)) return null;

    const rows = await queryRows(
      db,
      sql`
        SELECT ${PROPOSAL_COLUMNS} ${OWNED_PROPOSAL}
        WHERE ${proposedChanges}.id = ${proposalId}::uuid
          AND ${projects}.owner_id = ${scope.userId}::uuid
      `,
      ProposalRow,
    );

    const row = rows[0];
    return row === undefined ? null : toProposal(row);
  }

  async function pendingForFile(
    scope: OwnerScope,
    specFileId: string,
  ): Promise<StoredProposal | null> {
    if (!UUID.test(specFileId)) return null;

    const rows = await queryRows(
      db,
      sql`
        SELECT ${PROPOSAL_COLUMNS} ${OWNED_PROPOSAL}
        WHERE ${proposedChanges}.spec_file_id = ${specFileId}::uuid
          AND ${projects}.owner_id = ${scope.userId}::uuid
          AND ${proposedChanges}.status = 'pending'
      `,
      ProposalRow,
    );

    const row = rows[0];
    return row === undefined ? null : toProposal(row);
  }

  /**
   * The project's pending proposal, whichever file it belongs to (task 69).
   *
   * DR-11 bounds pending proposals per *file*, not per project, so this can in principle find more
   * than one; the newest is returned and the rest stay pending until decided. It exists because a
   * refinement can now be started against a file that is not the one the page is currently showing —
   * the late-attachment action of FR-004 AC-10 does exactly that — and a diff the user cannot see is
   * a decision they cannot make.
   */
  async function pendingForProject(
    scope: OwnerScope,
    projectId: string,
  ): Promise<StoredProposal | null> {
    if (!UUID.test(projectId)) return null;

    const rows = await queryRows(
      db,
      sql`
        SELECT ${PROPOSAL_COLUMNS} ${OWNED_PROPOSAL}
        WHERE ${specFiles}.project_id = ${projectId}::uuid
          AND ${projects}.owner_id = ${scope.userId}::uuid
          AND ${proposedChanges}.status = 'pending'
        ORDER BY ${proposedChanges}.created_at DESC
        LIMIT 1
      `,
      ProposalRow,
    );

    const row = rows[0];
    return row === undefined ? null : toProposal(row);
  }

  /**
   * Every proposal of a project, oldest first (task 104).
   *
   * A refinement is a turn of the conversation whether it was accepted, rejected or is still
   * waiting, so the feed reads the chain rather than only the pending one. `pendingForProject`
   * stays as it is: the pending lookup answers "what is the user deciding", and this answers "what
   * happened", and collapsing the two would make the tail depend on how history is ordered.
   */
  async function historyForProject(
    scope: OwnerScope,
    projectId: string,
  ): Promise<StoredProposal[]> {
    if (!UUID.test(projectId)) return [];

    const rows = await queryRows(
      db,
      sql`
        SELECT ${PROPOSAL_COLUMNS} ${OWNED_PROPOSAL}
        WHERE ${specFiles}.project_id = ${projectId}::uuid
          AND ${projects}.owner_id = ${scope.userId}::uuid
        ORDER BY ${proposedChanges}.created_at ASC
      `,
      ProposalRow,
    );

    return rows.map(toProposal);
  }

  return {
    findOwned,
    pendingForFile,
    pendingForProject,
    historyForProject,

    /**
     * Computes and stores a proposal — and writes **no revision** (FR-011 AC-1/AC-2).
     *
     * The order of the checks is the design. Structure is validated before anything is inserted, so
     * a change that would remove a required section is refused rather than stored and refused later;
     * and the pending check is resolved by the index rather than by a prior read, so two instructions
     * arriving together produce one proposal and one `PENDING_DECISION`, never two proposals.
     */
    async propose(scope: OwnerScope, input: ProposeInput): Promise<ProposeOutcome> {
      const current = await currentRevision(db, scope, input.specFileId);
      if (current === null) return { status: 'not-found' };

      if (current.content === input.proposedContent) return { status: 'no-change' };

      /*
       * FR-011 AC-8. Only sections that were present and are now gone are reported: a document that
       * was already missing a heading before the instruction is a pre-existing defect, and blaming
       * the user's edit for it would refuse a legitimate change with a confusing reason.
       */
      if (isCoreSpecType(current.specType)) {
        const before = validateStructure(current.specType, current.content);
        const after = validateStructure(current.specType, input.proposedContent);

        const alreadyBroken = new Set(before.violations.map((violation) => violation.heading));
        const removed = after.violations
          .filter((violation) => !alreadyBroken.has(violation.heading))
          .map((violation) => violation.heading);

        if (removed.length > 0) {
          return { status: 'removes-required-section', sections: removed };
        }
      }

      try {
        const inserted = await queryRows(
          db,
          sql`
            INSERT INTO ${proposedChanges}
              (spec_file_id, base_revision, proposed_content, instruction)
            VALUES (
              ${input.specFileId}::uuid,
              ${current.revisionNumber},
              ${input.proposedContent},
              ${input.instruction}
            )
            RETURNING id
          `,
          z.object({ id: z.uuid() }),
        );

        const proposal = await findOwned(scope, inserted[0]?.id ?? '');
        if (proposal === null) return { status: 'not-found' };

        const diff = diffLines(current.content, input.proposedContent);

        return {
          status: 'proposed',
          proposal,
          diff,
          unifiedDiff: formatUnifiedDiff(diff, current.fileName),
        };
      } catch (error) {
        if (!isPendingCollision(error)) throw error;

        const existing = await pendingForFile(scope, input.specFileId);
        if (existing === null) throw error;

        return { status: 'pending-decision', existing };
      }
    },

    /** The diff a stored proposal represents, recomputed against the revision it was based on. */
    async diffFor(
      scope: OwnerScope,
      proposal: StoredProposal,
    ): Promise<{ diff: FileDiff; unifiedDiff: string; baseContent: string } | null> {
      const rows = await queryRows(
        db,
        sql`
          SELECT ${specRevisions}.content
          FROM ${specRevisions}
          JOIN ${specFiles} ON ${specFiles}.id = ${specRevisions}.spec_file_id
          JOIN ${projects} ON ${projects}.id = ${specFiles}.project_id
          WHERE ${specRevisions}.spec_file_id = ${proposal.specFileId}::uuid
            AND ${specRevisions}.revision_number = ${proposal.baseRevision}
            AND ${projects}.owner_id = ${scope.userId}::uuid
        `,
        z.object({ content: z.string() }),
      );

      const baseContent = rows[0]?.content;
      if (baseContent === undefined) return null;

      const diff = diffLines(baseContent, proposal.proposedContent);

      return { diff, unifiedDiff: formatUnifiedDiff(diff, proposal.fileName), baseContent };
    },

    /**
     * Marks a proposal decided, once. Returns `false` when it had already been decided.
     *
     * A conditional UPDATE rather than read-then-write, for the reason every decision in this
     * codebase is: the second of two racing decisions must be a no-op, not an overwrite.
     */
    async markDecided(proposalId: string, status: 'accepted' | 'rejected'): Promise<boolean> {
      const updated = await db
        .update(proposedChanges)
        .set({ status, decidedAt: new Date() })
        .where(and(eq(proposedChanges.id, proposalId), eq(proposedChanges.status, 'pending')))
        .returning({ id: proposedChanges.id });

      return updated.length > 0;
    },

    /**
     * Stores one cross-file edit as a batch of proposals (task 118).
     *
     * Every file is checked the way `propose` checks its one file, and the **whole batch is refused
     * if any file fails** — a partial batch would offer the user a card whose Approve applies less
     * than the card describes. The insert is one statement for the same reason its acceptance is:
     * an edit that half-existed would leave a pending proposal on one file and nothing on another,
     * and the file with the orphan would refuse the next edit with `PENDING_DECISION`.
     */
    async proposeBatch(scope: OwnerScope, input: ProposeBatchInput): Promise<ProposeBatchOutcome> {
      if (input.files.length === 0) return { status: 'no-change' };

      const members: {
        specFileId: string;
        baseRevision: number;
        content: string;
        fileName: string;
        diff: FileDiff;
        unifiedDiff: string;
      }[] = [];

      for (const file of input.files) {
        const current = await currentRevision(db, scope, file.specFileId);
        if (current === null) return { status: 'not-found' };
        if (current.content === file.content) continue;

        if (isCoreSpecType(current.specType)) {
          const before = validateStructure(current.specType, current.content);
          const after = validateStructure(current.specType, file.content);
          const alreadyBroken = new Set(before.violations.map((violation) => violation.heading));
          const removed = after.violations
            .filter((violation) => !alreadyBroken.has(violation.heading))
            .map((violation) => violation.heading);

          if (removed.length > 0) {
            return {
              status: 'removes-required-section',
              fileName: current.fileName,
              sections: removed,
            };
          }
        }

        const diff = diffLines(current.content, file.content);

        members.push({
          specFileId: file.specFileId,
          baseRevision: current.revisionNumber,
          content: file.content,
          fileName: current.fileName,
          diff,
          unifiedDiff: formatUnifiedDiff(diff, current.fileName),
        });
      }

      if (members.length === 0) return { status: 'no-change' };

      try {
        await queryRows(
          db,
          sql`
            INSERT INTO ${proposedChanges}
              (spec_file_id, base_revision, proposed_content, instruction, edit_batch_id)
            SELECT
              (member->>'specFileId')::uuid,
              (member->>'baseRevision')::int,
              member->>'content',
              ${input.instruction},
              ${input.editBatchId}::uuid
            FROM jsonb_array_elements(${JSON.stringify(
              members.map((member) => ({
                specFileId: member.specFileId,
                baseRevision: member.baseRevision,
                content: member.content,
              })),
            )}::jsonb) AS member
            RETURNING id
          `,
          z.object({ id: z.uuid() }),
        );
      } catch (error) {
        if (!isPendingCollision(error)) throw error;
        return { status: 'pending-decision' };
      }

      return {
        status: 'proposed',
        editBatchId: input.editBatchId,
        files: members.map((member) => ({
          specFileId: member.specFileId,
          fileName: member.fileName,
          baseRevision: member.baseRevision,
          unifiedDiff: member.unifiedDiff,
          added: member.diff.added,
          removed: member.diff.removed,
        })),
      };
    },

    /**
     * The chat that produced a batch (task 118 AC-4).
     *
     * A join, not a stored duplicate: the batch is named by its generation run, and a run already
     * knows its session. Owner-scoped like every other read here, so a batch id from another
     * account resolves to `null` rather than to somebody else's chat.
     */
    async sessionForBatch(scope: OwnerScope, editBatchId: string): Promise<string | null> {
      if (!UUID.test(editBatchId)) return null;

      const rows = await queryRows(
        db,
        sql`
          SELECT ${generationRuns}.session_id
          FROM ${generationRuns}
          JOIN ${sessions} ON ${sessions}.id = ${generationRuns}.session_id
          JOIN ${projects} ON ${projects}.id = ${sessions}.project_id
          WHERE ${generationRuns}.id = ${editBatchId}::uuid
            AND ${projects}.owner_id = ${scope.userId}::uuid
        `,
        z.object({ session_id: z.uuid() }),
      );

      return rows[0]?.session_id ?? null;
    },

    /** Every proposal of a batch, in bundle order — what one edit card renders. */
    async batchMembers(scope: OwnerScope, editBatchId: string): Promise<StoredProposal[]> {
      if (!UUID.test(editBatchId)) return [];

      const rows = await queryRows(
        db,
        sql`
          SELECT ${PROPOSAL_COLUMNS} ${OWNED_PROPOSAL}
          WHERE ${proposedChanges}.edit_batch_id = ${editBatchId}::uuid
            AND ${projects}.owner_id = ${scope.userId}::uuid
          ORDER BY ${specFiles}.spec_type ASC
        `,
        ProposalRow,
      );

      return rows.map(toProposal);
    },

    /**
     * Applies a whole batch — every file or none (task 118 AC-2).
     *
     * **One statement, and that is what "atomically" means here.** The production driver has no
     * interactive transactions (D-16), so a multi-file apply written as a loop of appends would be
     * N implicit transactions: a failure on the third file would leave two documents revised, one
     * not, and a half-decided batch. Chained CTEs make the claim, the revisions and the pointer
     * moves one unit of work — if the fifth insert violates a constraint, the first four inserts and
     * the `UPDATE … SET status = 'accepted'` roll back with it, and the batch is still pending.
     *
     * The revisions are written **approved**. In the M4 refinement path an accepted proposal lands
     * unapproved and is approved separately, because there the user accepted a *proposal* and the
     * document then goes through its own approval; here the diff card **is** the approval surface —
     * the user read the change and said yes to it (P2; FR-009 AC-1). Requiring a second decision on
     * bytes already decided would also mean an edit session could end with the bundle still
     * exporting the old text, which is the one outcome the flow exists to prevent.
     *
     * `sourceSessionId` is stamped on every revision: with several chats on a project, "which
     * conversation produced this?" stops being answerable any other way (А-6).
     */
    async acceptBatch(
      scope: OwnerScope,
      editBatchId: string,
      sourceSessionId: string,
    ): Promise<AppliedEdit[]> {
      if (!UUID.test(editBatchId) || !UUID.test(sourceSessionId)) return [];

      for (let attempt = 1; ; attempt += 1) {
        try {
          const rows = await queryRows(
            db,
            sql`
              WITH claimed AS (
                UPDATE ${proposedChanges}
                SET status = 'accepted', decided_at = now()
                WHERE ${proposedChanges}.edit_batch_id = ${editBatchId}::uuid
                  AND ${proposedChanges}.status = 'pending'
                  AND ${proposedChanges}.spec_file_id IN (
                    SELECT ${specFiles}.id FROM ${specFiles}
                    JOIN ${projects} ON ${projects}.id = ${specFiles}.project_id
                    WHERE ${projects}.owner_id = ${scope.userId}::uuid
                  )
                RETURNING ${proposedChanges}.spec_file_id, ${proposedChanges}.proposed_content
              ), numbered AS (
                SELECT
                  claimed.spec_file_id,
                  claimed.proposed_content,
                  COALESCE(MAX(existing.revision_number), 0) + 1 AS revision_number
                FROM claimed
                LEFT JOIN ${specRevisions} AS existing
                  ON existing.spec_file_id = claimed.spec_file_id
                GROUP BY claimed.spec_file_id, claimed.proposed_content
              ), inserted AS (
                INSERT INTO ${specRevisions}
                  (spec_file_id, revision_number, content, approved, source_session_id)
                SELECT spec_file_id, revision_number, proposed_content, true, ${sourceSessionId}::uuid
                FROM numbered
                RETURNING id, spec_file_id, revision_number
              ), pointer AS (
                UPDATE ${specFiles}
                SET current_revision = inserted.revision_number
                FROM inserted
                WHERE ${specFiles}.id = inserted.spec_file_id
                RETURNING ${specFiles}.id, ${specFiles}.spec_type, ${specFiles}.file_name
              )
              SELECT
                inserted.id AS revision_id,
                inserted.spec_file_id,
                inserted.revision_number,
                pointer.spec_type,
                pointer.file_name
              FROM inserted JOIN pointer ON pointer.id = inserted.spec_file_id
              ORDER BY pointer.spec_type ASC
            `,
            AppliedEditRow,
          );

          return rows.map((row) => ({
            revisionId: row.revision_id,
            specFileId: row.spec_file_id,
            revisionNumber: row.revision_number,
            specType: row.spec_type,
            fileName: row.file_name,
          }));
        } catch (error) {
          if (!isAllocationCollision(error) || attempt >= MAX_BATCH_ATTEMPTS) throw error;
        }
      }
    },

    /**
     * Rejects a whole batch and writes nothing else (task 118 AC-1; the M4 contract re-asserted).
     *
     * No revision, no pointer move, not even a no-op update of the files: after this every
     * referenced document is byte-for-byte what it was. Returns how many rows it claimed, so a
     * second submission of the same decision is distinguishable from the first.
     */
    async rejectBatch(scope: OwnerScope, editBatchId: string): Promise<number> {
      if (!UUID.test(editBatchId)) return 0;

      const rows = await queryRows(
        db,
        sql`
          UPDATE ${proposedChanges}
          SET status = 'rejected', decided_at = now()
          WHERE ${proposedChanges}.edit_batch_id = ${editBatchId}::uuid
            AND ${proposedChanges}.status = 'pending'
            AND ${proposedChanges}.spec_file_id IN (
              SELECT ${specFiles}.id FROM ${specFiles}
              JOIN ${projects} ON ${projects}.id = ${specFiles}.project_id
              WHERE ${projects}.owner_id = ${scope.userId}::uuid
            )
          RETURNING ${proposedChanges}.id
        `,
        z.object({ id: z.uuid() }),
      );

      return rows.length;
    },
  };
}

/** How many times the batch apply retries a revision-number collision. Mirrors the appender's. */
const MAX_BATCH_ATTEMPTS = 5;

const AppliedEditRow = z.object({
  revision_id: z.uuid(),
  spec_file_id: z.uuid(),
  revision_number: z.number().int().positive(),
  spec_type: z.string(),
  file_name: z.string(),
});

/** One file's new revision, after a batch was applied. */
export interface AppliedEdit {
  revisionId: string;
  specFileId: string;
  revisionNumber: number;
  specType: string;
  fileName: string;
}

export interface ProposeBatchInput {
  /** Names the batch. Generated by the caller, because the run that produced it is named too. */
  editBatchId: string;
  instruction: string;
  files: readonly { specFileId: string; content: string }[];
}

export type ProposeBatchOutcome =
  | { status: 'proposed'; editBatchId: string; files: readonly ProposedBatchFile[] }
  | { status: 'pending-decision' }
  | { status: 'removes-required-section'; fileName: string; sections: readonly string[] }
  | { status: 'no-change' }
  | { status: 'not-found' };

export interface ProposedBatchFile {
  specFileId: string;
  fileName: string;
  baseRevision: number;
  unifiedDiff: string;
  added: number;
  removed: number;
}

/** The same collision the revision appender retries — the number was taken between read and write. */
function isAllocationCollision(error: unknown): boolean {
  const parts: string[] = [];
  for (let current: unknown = error; current instanceof Error; current = current.cause) {
    parts.push(current.message);
  }

  return /spec_revisions_file_revision_unique|duplicate key/i.test(parts.join(' | '));
}

interface CurrentRevision {
  revisionNumber: number;
  content: string;
  specType: string;
  /** Plain string: it is a label on the diff header, not a value anything branches on. */
  fileName: string;
}

/** The file's newest revision, owner-scoped — the left-hand side of every diff. */
async function currentRevision(
  db: SchemaDatabase,
  scope: OwnerScope,
  specFileId: string,
): Promise<CurrentRevision | null> {
  if (!UUID.test(specFileId)) return null;

  const rows = await queryRows(
    db,
    sql`
      SELECT ${specRevisions}.revision_number, ${specRevisions}.content,
             ${specFiles}.spec_type, ${specFiles}.file_name
      FROM ${specRevisions}
      JOIN ${specFiles} ON ${specFiles}.id = ${specRevisions}.spec_file_id
      JOIN ${projects} ON ${projects}.id = ${specFiles}.project_id
      WHERE ${specRevisions}.spec_file_id = ${specFileId}::uuid
        AND ${projects}.owner_id = ${scope.userId}::uuid
      ORDER BY ${specRevisions}.revision_number DESC
      LIMIT 1
    `,
    z.object({
      revision_number: z.number().int().positive(),
      content: z.string(),
      spec_type: z.string(),
      file_name: z.string(),
    }),
  );

  const row = rows[0];
  if (row === undefined) return null;

  return {
    revisionNumber: row.revision_number,
    content: row.content,
    specType: row.spec_type,
    fileName: row.file_name,
  };
}

export type ProposedChangeService = ReturnType<typeof createProposedChangeService>;
