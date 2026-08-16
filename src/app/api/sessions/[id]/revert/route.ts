import { z } from 'zod';

import { getDatabase } from '@/db/client';
import { currentOwnerScope } from '@/modules/projects/auth/scope';
import { createProjectRepository } from '@/modules/projects/repositories/projects';
import { createSessionRepository } from '@/modules/projects/repositories/sessions';
import { revertToPreviousRevision } from '@/modules/specs/revert';
import { createSpecFileRepository } from '@/modules/specs/repositories/spec-files';
import { errorResponse, jsonResponse } from '@/modules/web/api/responses';

/**
 * `POST /api/sessions/:id/revert` — «Go back to previous step» (task 127; Эталон §5.1).
 *
 * **Session-scoped, and that is the reason for the shape.** A revision records the chat that
 * produced it (А-6), and the source of a revision is a fact about who did the work — a
 * client-supplied one would be a claim. Addressing the route by session id makes the source
 * something the server resolves and the ownership join verifies, exactly as it does for answers and
 * transitions, rather than something the body asserts.
 *
 * Two ownership checks, both joins rather than comparisons: the session must be this user's, and so
 * must the file — and the file must belong to the session's project, so a valid id from another
 * project of the same user cannot be reverted from here.
 *
 * The revert itself writes nothing this endpoint decides: `revertToPreviousRevision` appends, and
 * the immutability triggers of task 16 are what make "append" the only available meaning of "go
 * back".
 */
const RevertRequest = z.object({ specFileId: z.uuid() });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const scope = await currentOwnerScope();
  if (scope === null) return errorResponse('UNAUTHENTICATED');

  const { id: sessionId } = await params;
  const db = getDatabase();

  const session = await createSessionRepository(db).findDetailById(scope, sessionId);
  if (session === null) return errorResponse('NOT_FOUND');

  const body: unknown = await request.json().catch(() => null);
  const parsed = RevertRequest.safeParse(body);

  if (!parsed.success) {
    return errorResponse('VALIDATION_FAILED', {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  const specFile = await createSpecFileRepository(db).findById(scope, parsed.data.specFileId);
  if (specFile?.projectId !== session.projectId) return errorResponse('NOT_FOUND');

  const outcome = await revertToPreviousRevision(db, {
    specFileId: specFile.id,
    sourceSessionId: session.id,
  });

  switch (outcome.status) {
    case 'reverted':
      await createProjectRepository(db).touch(scope, session.projectId);

      return jsonResponse({
        specFileId: specFile.id,
        revisionId: outcome.revision.id,
        revisionNumber: outcome.revision.revisionNumber,
        restoredFrom: outcome.restoredFrom,
      });

    case 'no-predecessor':
      return errorResponse('VALIDATION_FAILED', {
        issues: [
          {
            path: 'specFileId',
            message: 'there is no earlier revision of this document to go back to',
          },
        ],
      });

    case 'not-found':
      return errorResponse('NOT_FOUND');
  }
}
