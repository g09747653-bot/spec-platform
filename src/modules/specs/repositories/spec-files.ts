import { sql } from 'drizzle-orm';
import { z } from 'zod';

import type { SchemaDatabase } from '@/db';
import type { OwnerScope } from '@/db/owner-scope';
import { projects, specFiles, specRevisions } from '@/db/schema';
import { queryRows } from '@/db/sql';

import { fileNamesForMode, type ExportMode } from '../model/export';
import { isSpecType, type SpecFileName, type SpecType } from '../model/spec-files';
import { revisionOriginForMode } from '../export/resolve-mode';

/**
 * Owner-scoped access to spec files and their exportable content (NFR-005; AR-2).
 *
 * Ownership of a nested resource is resolved **in SQL**, as a join predicate, never by fetching the row
 * and comparing afterwards (solution.md — Security Architecture). A spec file is two joins from
 * `projects.owner_id`, and both queries below carry that join, so another user's `specFileId` is
 * indistinguishable from one that does not exist.
 *
 * Once a lookup here has returned an id, the append-only writes in `RevisionRepository` operate on an
 * identifier whose ownership the database has already established.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SpecFileRow = z.object({
  id: z.uuid(),
  project_id: z.uuid(),
  spec_type: z.string(),
  file_name: z.string(),
  current_revision: z.number().int().nonnegative(),
});

const ExportRow = z.object({
  id: z.uuid(),
  spec_type: z.string(),
  file_name: z.string(),
  content: z.string(),
  revision_number: z.number().int().positive(),
});

export interface OwnedSpecFile {
  id: string;
  projectId: string;
  specType: SpecType;
  fileName: SpecFileName;
  currentRevision: number;
}

export interface ExportableFile {
  /** The spec file's id — what a per-file action (copy, FR-016) addresses it by. */
  specFileId: string;
  specType: SpecType;
  fileName: SpecFileName;
  content: string;
  revisionNumber: number;
}

function toOwnedSpecFile(row: z.infer<typeof SpecFileRow>): OwnedSpecFile {
  if (!isSpecType(row.spec_type)) {
    throw new Error(`spec_files.spec_type holds an unknown type: ${row.spec_type}`);
  }

  return {
    id: row.id,
    projectId: row.project_id,
    specType: row.spec_type,
    fileName: `${row.spec_type}.md`,
    currentRevision: row.current_revision,
  };
}

export function createSpecFileRepository(db: SchemaDatabase) {
  return {
    /** The spec file, or `null` when it belongs to someone else or does not exist. */
    async findById(scope: OwnerScope, specFileId: string): Promise<OwnedSpecFile | null> {
      if (!UUID.test(specFileId)) return null;

      const rows = await queryRows(
        db,
        sql`
          SELECT ${specFiles}.id, ${specFiles}.project_id, ${specFiles}.spec_type,
                 ${specFiles}.file_name, ${specFiles}.current_revision
          FROM ${specFiles}
          JOIN ${projects} ON ${projects}.id = ${specFiles}.project_id
          WHERE ${specFiles}.id = ${specFileId}::uuid AND ${projects}.owner_id = ${scope.userId}::uuid
        `,
        SpecFileRow,
      );

      const row = rows[0];
      return row === undefined ? null : toOwnedSpecFile(row);
    },

    /**
     * The file this session wrote to most recently.
     *
     * **Ordered by when the newest revision was written, not by its number** (task 80). The walking
     * skeleton had one spec file, so ordering on `current_revision` was indistinguishable from
     * ordering on time; with four it is wrong in the ordinary case. After the second stage generates,
     * two files stand at revision 1, the tie breaks on `spec_type` alphabetically, and the session
     * answers `constitution` while it is working on `requirements` — which is how the critical
     * journey found this.
     *
     * The caller that knows its stage should ask for that stage's file (`findByProjectAndType`); this
     * answers the question that has no stage attached, such as "which card is pending" on a session
     * sitting at `complete`.
     */
    async currentFile(scope: OwnerScope, projectId: string): Promise<OwnedSpecFile | null> {
      if (!UUID.test(projectId)) return null;

      const rows = await queryRows(
        db,
        sql`
          SELECT ${specFiles}.id, ${specFiles}.project_id, ${specFiles}.spec_type,
                 ${specFiles}.file_name, ${specFiles}.current_revision
          FROM ${specFiles}
          JOIN ${projects} ON ${projects}.id = ${specFiles}.project_id
          WHERE ${specFiles}.project_id = ${projectId}::uuid
            AND ${projects}.owner_id = ${scope.userId}::uuid
            AND ${specFiles}.current_revision > 0
          ORDER BY (
            SELECT MAX(${specRevisions}.created_at)
            FROM ${specRevisions}
            WHERE ${specRevisions}.spec_file_id = ${specFiles}.id
          ) DESC, ${specFiles}.spec_type ASC
          LIMIT 1
        `,
        SpecFileRow,
      );

      const row = rows[0];
      return row === undefined ? null : toOwnedSpecFile(row);
    },

    /**
     * The file a given stage writes, if it exists.
     *
     * A read, deliberately — `ensureSpecFile` creates, and a resume request answering "what did this
     * run produce?" must not bring a file into existence as a side effect of asking (task 47).
     */
    async findByProjectAndType(
      scope: OwnerScope,
      projectId: string,
      specType: SpecType,
    ): Promise<OwnedSpecFile | null> {
      if (!UUID.test(projectId)) return null;

      const rows = await queryRows(
        db,
        sql`
          SELECT ${specFiles}.id, ${specFiles}.project_id, ${specFiles}.spec_type,
                 ${specFiles}.file_name, ${specFiles}.current_revision
          FROM ${specFiles}
          JOIN ${projects} ON ${projects}.id = ${specFiles}.project_id
          WHERE ${specFiles}.project_id = ${projectId}::uuid
            AND ${specFiles}.spec_type = ${specType}
            AND ${projects}.owner_id = ${scope.userId}::uuid
        `,
        SpecFileRow,
      );

      const row = rows[0];
      return row === undefined ? null : toOwnedSpecFile(row);
    },

    /**
     * What an export of `mode` contains: for each file of this project, the revision that mode
     * resolves to (FR-015 AC-2/AC-3; A6).
     *
     * `DISTINCT ON` does the resolution in the database — one row per spec type, the highest revision
     * number first. The origin filter is what the mode decides, and it is the whole difference between
     * the two bundles: `parity` makes a default-mode export *pre-enrichment* by definition rather than
     * by a date comparison, which is the point of marking revisions in the first place (A4), and it
     * holds even on a session where enrichment has already run. Quality mode drops the filter, so the
     * enriched revision — always the newer one — answers wherever enrichment has run.
     *
     * The **file** filter is separate and equally load-bearing: a default-mode export does not select
     * `quality.md` at all, so the fifth file cannot reach the archive even as a row the assembler then
     * has to remember to drop (constitution P3).
     *
     * Files with no approved revision simply do not appear: the omission list is computed by the caller
     * from what is missing, so nothing empty can be emitted (FR-015 AC-6/AC-9).
     */
    async approvedForExport(
      scope: OwnerScope,
      projectId: string,
      mode: ExportMode = 'default',
    ): Promise<ExportableFile[]> {
      if (!UUID.test(projectId)) return [];

      const origin = revisionOriginForMode(mode);
      const originFilter =
        origin === 'any' ? sql`TRUE` : sql`${specRevisions}.origin = ${origin}::text`;

      const names = fileNamesForMode(mode);
      const nameList = sql.join(
        names.map((name) => sql`${name}`),
        sql`, `,
      );

      const rows = await queryRows(
        db,
        sql`
          SELECT DISTINCT ON (${specFiles}.spec_type)
                 ${specFiles}.id, ${specFiles}.spec_type, ${specFiles}.file_name,
                 ${specRevisions}.content, ${specRevisions}.revision_number
          FROM ${specFiles}
          JOIN ${projects} ON ${projects}.id = ${specFiles}.project_id
          JOIN ${specRevisions} ON ${specRevisions}.spec_file_id = ${specFiles}.id
          WHERE ${specFiles}.project_id = ${projectId}::uuid
            AND ${projects}.owner_id = ${scope.userId}::uuid
            AND ${specFiles}.file_name IN (${nameList})
            AND ${specRevisions}.approved = true
            AND ${originFilter}
          ORDER BY ${specFiles}.spec_type, ${specRevisions}.revision_number DESC
        `,
        ExportRow,
      );

      return rows.map((row) => {
        if (!isSpecType(row.spec_type)) {
          throw new Error(`spec_files.spec_type holds an unknown type: ${row.spec_type}`);
        }

        return {
          specFileId: row.id,
          specType: row.spec_type,
          fileName: `${row.spec_type}.md`,
          content: row.content,
          revisionNumber: row.revision_number,
        };
      });
    },
  };
}

export type SpecFileRepository = ReturnType<typeof createSpecFileRepository>;
