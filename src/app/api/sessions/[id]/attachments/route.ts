import { getEnv } from '@/config/env';
import { getDatabase } from '@/db/client';
import { createDefaultParsing } from '@/modules/adapters/parsing';
import { createDefaultStorage } from '@/modules/adapters/storage';
import { createLateAttachmentAnalyzer } from '@/modules/projects/attachments/late-analyzer';
import { createAttachmentService } from '@/modules/projects/attachments/service';
import { currentOwnerScope } from '@/modules/projects/auth/scope';
import { createProjectRepository } from '@/modules/projects/repositories/projects';
import { createSessionRepository } from '@/modules/projects/repositories/sessions';
import { errorResponse, jsonResponse, uploadRejectedResponse } from '@/modules/web/api/responses';

/**
 * `POST /api/sessions/:id/attachments` — upload a grounding document (task 68; FR-004).
 *
 * The composition root for the upload path: it builds the storage adapter, the extractor registry and
 * the service, and owns nothing else. The order that matters — guard, then store, then record, then
 * extract — belongs to the service (SC-9, DR-8), so there is one place it can be got right.
 *
 * **Extraction reads the object back rather than the bytes in hand.** One extra read per upload, and
 * it buys the guarantee that the persisted text corresponds to *what was stored* rather than to what
 * arrived: a store that truncated or rewrote the object would otherwise leave a session grounded in
 * text no file contains.
 *
 * A late attachment does not modify anything by itself (FR-004 AC-10) — analysis of what it affects is
 * task 69, computed from `context_attachment_ids` on the persisted revisions.
 */

/**
 * A body this much larger than the file limit is refused before it is buffered.
 *
 * `Content-Length` covers the whole multipart envelope — boundaries, part headers, the file — so it
 * cannot be compared against the file limit exactly. This is a coarse early exit that keeps an
 * enormous request from being read into memory at all; the exact size checks happen in the guard,
 * against the part's own length and then against the bytes themselves.
 */
const MULTIPART_ENVELOPE_ALLOWANCE = 64 * 1024;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const scope = await currentOwnerScope();
  if (scope === null) return errorResponse('UNAUTHENTICATED');

  const { id: sessionId } = await params;
  const env = getEnv();
  const db = getDatabase();

  const session = await createSessionRepository(db).findById(scope, sessionId);
  if (session === null) return errorResponse('NOT_FOUND');

  const declaredLength = Number(request.headers.get('content-length') ?? Number.NaN);

  if (
    Number.isFinite(declaredLength) &&
    declaredLength > env.MAX_UPLOAD_BYTES + MULTIPART_ENVELOPE_ALLOWANCE
  ) {
    return uploadRejectedResponse(
      'size',
      `That file is larger than the ${(env.MAX_UPLOAD_BYTES / 1_048_576).toFixed(1)} MB upload limit.`,
    );
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get('file');

  if (!(file instanceof File)) {
    return errorResponse('VALIDATION_FAILED', {
      issues: [{ path: 'file', message: 'a file part named "file" is required' }],
    });
  }

  const storage = createDefaultStorage(env);
  const service = createAttachmentService({
    db,
    storage,
    parsing: createDefaultParsing((blobKey) => storage.read(scope, blobKey), env),
    limits: { maxBytes: env.MAX_UPLOAD_BYTES, allowedTypes: env.ALLOWED_UPLOAD_TYPES },
  });

  const outcome = await service.upload(scope, {
    sessionId: session.id,
    fileName: file.name,
    declaredType: file.type,
    declaredSizeBytes: file.size,
    bytes: new Uint8Array(await file.arrayBuffer()),
    attachedAtStage: session.stage,
  });

  switch (outcome.status) {
    case 'rejected':
      return uploadRejectedResponse(outcome.reason, outcome.message);
    case 'not-found':
      return errorResponse('NOT_FOUND');
    case 'stored': {
      await createProjectRepository(db).touch(scope, session.projectId);

      /*
       * Which approved files predate this document (task 69; FR-004 AC-9).
       *
       * Read-only, and computed after the upload rather than as part of it: the analysis is a report,
       * and nothing about it may change a file. AC-10 is explicit that a late attachment never
       * modifies an approved spec — the user is offered a refinement, which is a proposal they still
       * have to accept.
       */
      const impact = await createLateAttachmentAnalyzer(db).analyze(
        scope,
        session.id,
        outcome.attachment.id,
      );

      return jsonResponse(
        { attachment: outcome.attachment, affectedFiles: impact.affectedFiles },
        201,
      );
    }
  }
}
