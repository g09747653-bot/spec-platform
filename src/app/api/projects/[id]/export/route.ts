import { getDatabase } from '@/db/client';
import { currentOwnerScope } from '@/modules/projects/auth/scope';
import { createProjectRepository } from '@/modules/projects/repositories/projects';
import { assembleBundle } from '@/modules/specs/export/bundle';
import { createSpecFileRepository } from '@/modules/specs/repositories/spec-files';
import { errorResponse } from '@/modules/web/api/responses';

/**
 * `GET /api/projects/:id/export` — the bundle as a ZIP (task 22; FR-015).
 *
 * The archive carries only spec markdown. Everything *about* the export — which mode resolved it, and
 * which files were omitted for want of an approved revision — travels in headers, because putting a
 * manifest inside the archive would break "exactly four files" (AC-5, AC-8).
 *
 * An incomplete bundle still downloads (AC-6). That is a deliberate product decision, not laxity: the
 * user's work is theirs to take at any point, and a refusal here would be the dead end the project
 * exists to avoid.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const scope = await currentOwnerScope();
  if (scope === null) return errorResponse('UNAUTHENTICATED');

  const { id: projectId } = await params;
  const db = getDatabase();

  const project = await createProjectRepository(db).findById(scope, projectId);
  if (project === null) return errorResponse('NOT_FOUND');

  const files = await createSpecFileRepository(db).approvedForExport(scope, projectId);

  /*
   * Milestone 1 exports in default mode only: `mode=quality` needs enriched revisions and the staleness
   * rule, which arrive with the Quality stage (M7). Resolving to `parity` revisions is already the
   * default-mode rule of A6, so nothing here changes when the other mode appears — it gains a branch.
   */
  const bundle = assembleBundle(files, 'default');

  const fileName = `${project.name.replace(/[^\w.-]+/g, '-').replace(/^-|-$/g, '') || 'bundle'}-specs.zip`;

  return new Response(new Uint8Array(bundle.zip), {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Content-Length': String(bundle.zip.byteLength),
      // FR-015 AC-4 and AC-7: the mode used, and every file left out, stated at the moment of download.
      'X-Spec-Export-Mode': bundle.mode,
      'X-Spec-Export-Included': bundle.included.join(','),
      'X-Spec-Export-Omitted': bundle.omitted.join(','),
      'Cache-Control': 'no-store',
    },
  });
}
