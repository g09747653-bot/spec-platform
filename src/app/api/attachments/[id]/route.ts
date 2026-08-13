import { getEnv } from '@/config/env';
import { getDatabase } from '@/db/client';
import { createDefaultParsing } from '@/modules/adapters/parsing';
import { createDefaultStorage } from '@/modules/adapters/storage';
import { createAttachmentService } from '@/modules/projects/attachments/service';
import { currentOwnerScope } from '@/modules/projects/auth/scope';
import { errorResponse } from '@/modules/web/api/responses';

/**
 * `DELETE /api/attachments/:id` — remove an attachment (task 68; FR-004 AC-7).
 *
 * No ownership check here, and that is the point: the service's repository resolves the attachment
 * through its session to `projects.owner_id` inside the DELETE statement itself. An id belonging to
 * someone else deletes nothing and answers `NOT_FOUND` — the same answer as an id that never existed
 * (AR-2).
 *
 * Removal excludes the document from *subsequent* generations and touches no existing revision. A
 * spec generated while the file was attached keeps its `context_attachment_ids` and its content:
 * revisions are immutable (DR-2), and rewriting history to match a later decision is precisely what
 * A4 forbids.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const scope = await currentOwnerScope();
  if (scope === null) return errorResponse('UNAUTHENTICATED');

  const { id } = await params;
  const env = getEnv();
  const storage = createDefaultStorage(env);

  const service = createAttachmentService({
    db: getDatabase(),
    storage,
    parsing: createDefaultParsing((blobKey) => storage.read(scope, blobKey), env),
    limits: { maxBytes: env.MAX_UPLOAD_BYTES, allowedTypes: env.ALLOWED_UPLOAD_TYPES },
  });

  const removed = await service.remove(scope, id);

  return removed ? new Response(null, { status: 204 }) : errorResponse('NOT_FOUND');
}
