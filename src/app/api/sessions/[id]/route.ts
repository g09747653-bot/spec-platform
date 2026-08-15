import { z } from 'zod';

import { getDatabase } from '@/db/client';
import { currentOwnerScope } from '@/modules/projects/auth/scope';
import { createSessionRepository } from '@/modules/projects/repositories/sessions';
import { errorResponse, jsonResponse } from '@/modules/web/api/responses';

/**
 * `PATCH /api/sessions/:id` — archive or restore a chat (task 120).
 *
 * One boolean, both ways, and deliberately not two endpoints: archiving and restoring are the same
 * operation with different values, and a pair of verbs would invite the asymmetry the acceptance
 * criterion forbids — "archiving is reversible and never deletes" is easiest to keep true when the
 * only thing either call can do is set a column.
 *
 * Nothing below a session reads the flag. The bundle a chat produced stays exportable, its revisions
 * stay in history, and restoring returns the chat to the Active list exactly as it was.
 */
const ArchiveRequest = z.object({ archived: z.boolean() });

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const scope = await currentOwnerScope();
  if (scope === null) return errorResponse('UNAUTHENTICATED');

  const { id: sessionId } = await params;

  const body: unknown = await request.json().catch(() => null);
  const parsed = ArchiveRequest.safeParse(body);

  if (!parsed.success) {
    return errorResponse('VALIDATION_FAILED', {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  // The owner predicate rides in the UPDATE, so another user's session id changes nothing and is
  // reported as not found (AR-2).
  const updated = await createSessionRepository(getDatabase()).setArchived(
    scope,
    sessionId,
    parsed.data.archived,
  );

  if (!updated) return errorResponse('NOT_FOUND');

  return jsonResponse({ sessionId, archived: parsed.data.archived });
}
