import { z } from 'zod';

import { getDatabase } from '@/db/client';
import { AUTO_MODEL } from '@/modules/adapters/llm';
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
const PatchRequest = z
  .object({
    archived: z.boolean().optional(),
    /**
     * The model this chat's agent calls use (task 121). `auto` is a value, not an absence: it means
     * the failover chain, which is what the session started with and what А-3 requires Auto to mean.
     */
    modelId: z.string().min(1).max(64).optional(),
  })
  .refine(
    (body) => body.archived !== undefined || body.modelId !== undefined,
    'Say what to change: archived, or modelId.',
  );

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const scope = await currentOwnerScope();
  if (scope === null) return errorResponse('UNAUTHENTICATED');

  const { id: sessionId } = await params;

  const body: unknown = await request.json().catch(() => null);
  const parsed = PatchRequest.safeParse(body);

  if (!parsed.success) {
    return errorResponse('VALIDATION_FAILED', {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  // The owner predicate rides in each UPDATE, so another user's session id changes nothing and is
  // reported as not found (AR-2).
  const sessions = createSessionRepository(getDatabase());
  let updated = false;

  if (parsed.data.archived !== undefined) {
    updated = await sessions.setArchived(scope, sessionId, parsed.data.archived);
  }

  if (parsed.data.modelId !== undefined) {
    /*
     * `auto` is stored as `null`, so the column has one representation of "no choice" rather than
     * two — otherwise `pinnedProvider` would have to know about a magic string as well as about
     * null, and one of the two would eventually be handled somewhere the other is not.
     */
    updated = await sessions.setModel(
      scope,
      sessionId,
      parsed.data.modelId === AUTO_MODEL ? null : parsed.data.modelId,
    );
  }

  if (!updated) return errorResponse('NOT_FOUND');

  return jsonResponse({ sessionId, ...parsed.data });
}
