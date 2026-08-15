import { getDatabase } from '@/db/client';
import { currentOwnerScope } from '@/modules/projects/auth/scope';
import { createProjectRepository } from '@/modules/projects/repositories/projects';
import { createExportService } from '@/modules/specs/export/export-service';
import { isExportMode } from '@/modules/specs/model/export';
import { errorResponse } from '@/modules/web/api/responses';
import { qualityExportPort } from '@/modules/workflow/quality-port';

/**
 * `GET /api/projects/:id/export?mode=` — the bundle as a ZIP (tasks 22, 72; FR-015).
 *
 * The archive carries only spec markdown. Everything *about* the export — which mode resolved it, and
 * which files were omitted for want of an approved revision — travels in headers, because putting a
 * manifest inside the archive would break "exactly four files" (AC-5, AC-8).
 *
 * An incomplete bundle still downloads (AC-6). That is a deliberate product decision, not laxity: the
 * user's work is theirs to take at any point, and a refusal here would be the dead end the project
 * exists to avoid.
 *
 * **`mode` is a request, not an instruction.** An unknown or absent value reads as `default` rather
 * than as an error: the parity bundle is the safe answer to every unclear question about export
 * (constitution P3), and with no Quality capability registered the service forces `default` anyway.
 * The mode that was actually used comes back in the response, so a client never has to assume.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const scope = await currentOwnerScope();
  if (scope === null) return errorResponse('UNAUTHENTICATED');

  const { id: projectId } = await params;
  const db = getDatabase();

  const project = await createProjectRepository(db).findById(scope, projectId);
  if (project === null) return errorResponse('NOT_FOUND');

  const requested = new URL(request.url).searchParams.get('mode') ?? '';
  const mode = isExportMode(requested) ? requested : 'default';

  const outcome = await createExportService(db).resolveExport(
    scope,
    projectId,
    mode,
    qualityExportPort(),
    project.methodologyId,
  );

  if (!outcome.ok) return errorResponse(outcome.reason);

  const bundle = outcome.result;

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
