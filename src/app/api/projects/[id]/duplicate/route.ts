import { getDatabase } from '@/db/client';
import { createDefaultStorage } from '@/modules/adapters/storage';
import { currentOwnerScope } from '@/modules/projects/auth/scope';
import { duplicateProject } from '@/modules/projects/duplicate';
import { errorResponse, jsonResponse } from '@/modules/web/api/responses';

/**
 * `POST /api/projects/:id/duplicate` — a fork of the project (task 77; FR-002 AC-6/AC-7).
 *
 * The copy belongs to the same owner and to nobody else: `duplicateProject` reads the source through
 * the owner predicate and writes the new rows under the same `owner_id`, so there is no parameter
 * here through which a project could be copied out of its owner's account.
 *
 * A duplicate of a project that is not the caller's is `NOT_FOUND`, exactly as reading it would be —
 * "you may not copy this" and "this does not exist" must be the same answer (AR-2).
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const scope = await currentOwnerScope();
  if (scope === null) return errorResponse('UNAUTHENTICATED');

  const { id: projectId } = await params;

  const duplicate = await duplicateProject(getDatabase(), scope, projectId, createDefaultStorage());

  if (duplicate === null) return errorResponse('NOT_FOUND');

  return jsonResponse(duplicate, 201);
}
