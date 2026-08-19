import { getDatabase } from '@/db/client';
import { currentOwnerScope } from '@/modules/projects/auth/scope';
import { createProjectRepository } from '@/modules/projects/repositories/projects';
import { createMachineExportService } from '@/modules/specs/export/machine-export-service';
import { errorResponse } from '@/modules/web/api/responses';

/**
 * `GET /api/projects/:id/export/machine` — the bundle in the autonomous loop's shape (task 150).
 *
 * A ZIP of four entries under one `bundle/` directory: `constitution.md` and `architecture.md`
 * verbatim from the approved revisions, `requirements.json` and `tasks.json` derived from the same
 * revisions against the shared schema fixtures (`fixtures/spec-bundle/`). No mode parameter —
 * the machine bundle always resolves the default-mode revisions, which is the contract's whole
 * content (А-20) — and the same manifest headers the ZIP endpoint answers with, because a client
 * that reads one should be able to read the other.
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

  const bundle = await createMachineExportService(db).resolveMachineExport(scope, projectId);

  const fileName = `${project.name.replace(/[^\w.-]+/g, '-').replace(/^-|-$/g, '') || 'bundle'}-machine-bundle.zip`;

  return new Response(new Uint8Array(bundle.zip), {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Content-Length': String(bundle.zip.byteLength),
      'X-Spec-Export-Mode': 'machine',
      'X-Spec-Export-Included': bundle.included.join(','),
      'X-Spec-Export-Omitted': bundle.omitted.join(','),
      'Cache-Control': 'no-store',
    },
  });
}
