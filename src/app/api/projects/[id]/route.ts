import { z } from 'zod';

import { getDatabase } from '@/db/client';
import { createDefaultStorage } from '@/modules/adapters/storage';
import { currentOwnerScope } from '@/modules/projects/auth/scope';
import { createAttachmentRepository } from '@/modules/projects/repositories/attachments';
import { createProjectRepository } from '@/modules/projects/repositories/projects';
import { errorResponse, jsonResponse } from '@/modules/web/api/responses';

/**
 * `PATCH /api/projects/:id` — rename (task 76; FR-002 AC-3).
 * `DELETE /api/projects/:id` — permanent cascade delete (FR-002 AC-4/AC-5; DR-6; DR-7).
 *
 * Both resolve the `OwnerScope` and hand it to a repository whose statements carry
 * `owner_id = :userId`, so a project belonging to someone else is not found rather than forbidden
 * (AR-2). Neither accepts an owner identifier from the client.
 *
 * **Where the confirmation lives.** FR-002 AC-4 requires an explicit confirmation stating that
 * deletion is permanent. A confirmation is a *human* act, so the dialog is the interface's job — but
 * a bare `DELETE` that any script could fire is not a confirmation of anything, so the request also
 * carries `?confirm=permanent`. It is not security; it is the difference between a request that
 * meant to do this and one that arrived by accident, and it keeps AC-4 from being satisfiable by a
 * client that simply forgot to ask.
 */
const RenameRequest = z.object({
  name: z.string().trim().min(1, 'a project needs a name').max(200),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const scope = await currentOwnerScope();
  if (scope === null) return errorResponse('UNAUTHENTICATED');

  const { id: projectId } = await params;

  const body: unknown = await request.json().catch(() => null);
  const parsed = RenameRequest.safeParse(body);

  if (!parsed.success) {
    return errorResponse('VALIDATION_FAILED', {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  const renamed = await createProjectRepository(getDatabase()).rename(
    scope,
    projectId,
    parsed.data.name,
  );

  if (!renamed) return errorResponse('NOT_FOUND');

  return jsonResponse({ id: projectId, name: parsed.data.name });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const scope = await currentOwnerScope();
  if (scope === null) return errorResponse('UNAUTHENTICATED');

  const { id: projectId } = await params;

  if (new URL(request.url).searchParams.get('confirm') !== 'permanent') {
    return errorResponse('VALIDATION_FAILED', {
      issues: [{ path: 'confirm', message: 'deletion is permanent and must be confirmed' }],
    });
  }

  const db = getDatabase();

  /*
   * The keys are read **before** the rows are deleted, because the cascade takes the only record of
   * which objects belonged to this project with it. Deleting the objects first would be worse: a
   * failure between the two would leave rows pointing at storage that is already gone, and every
   * later read of those attachments would be a broken promise rather than a missing one.
   */
  const blobKeys = await createAttachmentRepository(db).blobKeysForProject(scope, projectId);

  const deleted = await createProjectRepository(db).remove(scope, projectId);
  if (!deleted) return errorResponse('NOT_FOUND');

  /*
   * IR-005-AC-3: the stored objects go too. A failure here is logged and does not fail the request —
   * solution.md is explicit that the database cascade still completes and orphans are swept later,
   * because the alternative is a user who cannot delete their own project because a third party is
   * having a bad day. The rows are already gone, so nothing in the application can reach the objects.
   */
  if (blobKeys.length > 0) {
    try {
      await createDefaultStorage().deleteMany(blobKeys);
    } catch (error) {
      console.error('blob cleanup after project deletion failed', {
        projectId,
        keys: blobKeys.length,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return new Response(null, { status: 204 });
}
