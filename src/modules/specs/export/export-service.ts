import type { SchemaDatabase } from '@/db';
import type { OwnerScope } from '@/db/owner-scope';
import { exportRecords } from '@/db/schema';

import type { ExportMode } from '../model/export';
import { createSpecFileRepository } from '../repositories/spec-files';

import { assembleBundle, type ExportResult } from './bundle';
import type { QualityPort } from './quality-port';
import { refuseIfStale, resolveExportMode, type ExportRefusal } from './resolve-mode';

/**
 * The export boundary (task 72; solution.md — `specs.resolveExport`; FR-015).
 *
 * One function produces an archive, and it is the only one — which is what makes the two guarantees
 * below properties of the code rather than of everyone remembering:
 *
 * - **Every export writes exactly one `ExportRecord`.** The write is on the path that produces the
 *   zip, not beside it. A route that assembled a bundle its own way could forget; there is no such
 *   route, because `assembleBundle` is reached from here and the record is written in the same call.
 * - **A refusal produces no archive and no record.** `EXPORT_STALE` returns before either, so the
 *   log never claims a download that did not happen.
 *
 * Ownership is resolved in SQL by the repository, as everywhere else: another user's project id
 * yields no rows, so it exports as an empty bundle only if the caller skipped the project lookup —
 * which the route does not (AR-2).
 */
export type ExportOutcome =
  { ok: true; result: ExportResult } | { ok: false; reason: ExportRefusal };

export function createExportService(db: SchemaDatabase) {
  return {
    /**
     * Resolves a declared mode to a concrete bundle, and records that it happened.
     *
     * The order is load-bearing. Mode is resolved first, because with no capability registered there
     * is no staleness question to ask (task 72 AC-3); staleness is asked second, so a refusal costs no
     * revision query; the record is written last, from the *resolved* mode and the *actual* file
     * lists, never from what was requested.
     */
    async resolveExport(
      scope: OwnerScope,
      projectId: string,
      requested: ExportMode,
      quality: QualityPort,
    ): Promise<ExportOutcome> {
      const mode = resolveExportMode(requested, quality);

      const refusal = await refuseIfStale(mode, projectId, quality);
      if (refusal !== null) return { ok: false, reason: refusal };

      const files = await createSpecFileRepository(db).approvedForExport(scope, projectId, mode);
      const result = assembleBundle(files, mode);

      await db.insert(exportRecords).values({
        projectId,
        mode: result.mode,
        /*
         * Both lists are written, the empty one included. "Nothing was omitted" and "omissions were
         * not recorded" are different facts, and a reader months later can only tell them apart if
         * the empty array is actually there.
         */
        includedFiles: result.included,
        omittedFiles: result.omitted,
      });

      return { ok: true, result };
    },
  };
}

export type ExportService = ReturnType<typeof createExportService>;
