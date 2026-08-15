import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import type { SchemaDatabase } from '@/db';
import type { OwnerScope } from '@/db/owner-scope';
import { projects, proposedChanges, specFiles, specRevisions } from '@/db/schema';
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
  };
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
