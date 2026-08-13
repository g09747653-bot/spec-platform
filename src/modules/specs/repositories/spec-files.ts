import { sql } from 'drizzle-orm';
import { z } from 'zod';

import type { SchemaDatabase } from '@/db';
import type { OwnerScope } from '@/db/owner-scope';
import { projects, specFiles, specRevisions } from '@/db/schema';
import { queryRows } from '@/db/sql';

import { isSpecType, type SpecFileName, type SpecType } from '../model/spec-files';

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
     * The file this session is working on: the one most recently written to.
     *
     * The walking skeleton has one spec card, so "most recently written" is the file whose pointer moved
     * last. From task 24 the stage decides, and this becomes a lookup by spec type.
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
          ORDER BY ${specFiles}.current_revision DESC, ${specFiles}.spec_type ASC
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
     * What a default-mode export contains: for each file of this project, its latest **approved,
     * pre-enrichment** revision (FR-015 AC-2; A6).
     *
     * `DISTINCT ON` does the resolution in the database — one row per spec type, the highest revision
     * number first. `origin = 'parity'` is what makes it *pre-enrichment* by definition rather than by
     * a date comparison, which is the point of marking revisions in the first place (A4).
     *
     * Files with no approved revision simply do not appear: the omission list is computed by the caller
     * from what is missing, so nothing empty can be emitted (FR-015 AC-6/AC-9).
     */
    async approvedForExport(scope: OwnerScope, projectId: string): Promise<ExportableFile[]> {
      if (!UUID.test(projectId)) return [];

      const rows = await queryRows(
        db,
        sql`
          SELECT DISTINCT ON (${specFiles}.spec_type)
                 ${specFiles}.spec_type, ${specFiles}.file_name,
                 ${specRevisions}.content, ${specRevisions}.revision_number
          FROM ${specFiles}
          JOIN ${projects} ON ${projects}.id = ${specFiles}.project_id
          JOIN ${specRevisions} ON ${specRevisions}.spec_file_id = ${specFiles}.id
          WHERE ${specFiles}.project_id = ${projectId}::uuid
            AND ${projects}.owner_id = ${scope.userId}::uuid
            AND ${specRevisions}.approved = true
            AND ${specRevisions}.origin = 'parity'
          ORDER BY ${specFiles}.spec_type, ${specRevisions}.revision_number DESC
        `,
        ExportRow,
      );

      return rows.map((row) => {
        if (!isSpecType(row.spec_type)) {
          throw new Error(`spec_files.spec_type holds an unknown type: ${row.spec_type}`);
        }

        return {
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
