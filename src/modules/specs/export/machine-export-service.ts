import type { SchemaDatabase } from '@/db';
import type { OwnerScope } from '@/db/owner-scope';
import { exportRecords } from '@/db/schema';

import { MACHINE_EXPORT_RECORD_MODE } from '../model/export';
import { CORE_SPEC_TYPES } from '../model/spec-files';
import { createSpecFileRepository } from '../repositories/spec-files';

import { assembleMachineBundle, type MachineBundleResult } from './machine-bundle';

/**
 * The machine export boundary (task 150; А-20).
 *
 * A sibling of `resolveExport`, deliberately not a branch inside it: the ZIP path must stay
 * byte-identical to what it was, and the cleanest proof is that no line of it changed. What the two
 * boundaries share is the discipline — the same repository resolution, and an `ExportRecord` written
 * on the same call that produced the archive, so the log never claims a download that did not
 * happen and never misses one that did.
 *
 * **Always the default-mode revisions.** The machine bundle is the parity content in the loop's
 * shape (бандл A0); quality enrichment has no seat in the contract, so there is no mode to resolve
 * and no staleness question to ask. An absent document is omitted and reported, exactly as the ZIP
 * reports it — an incomplete bundle still downloads (FR-015's rule, kept on purpose).
 */
export function createMachineExportService(db: SchemaDatabase) {
  return {
    async resolveMachineExport(scope: OwnerScope, projectId: string): Promise<MachineBundleResult> {
      const files = await createSpecFileRepository(db).approvedForExport(
        scope,
        projectId,
        'default',
        [...CORE_SPEC_TYPES],
      );

      const result = assembleMachineBundle(files, projectId);

      await db.insert(exportRecords).values({
        projectId,
        mode: MACHINE_EXPORT_RECORD_MODE,
        includedFiles: result.included,
        omittedFiles: result.omitted,
      });

      return result;
    },
  };
}

export type MachineExportService = ReturnType<typeof createMachineExportService>;
