import type { SchemaDatabase } from '@/db';
import type { OwnerScope } from '@/db/owner-scope';
import type { ParsingAdapter } from '@/modules/adapters/parsing';
import type { StorageAdapter } from '@/modules/adapters/storage';

import { createAttachmentRepository, type Attachment } from '../repositories/attachments';
import {
  guardUpload,
  type UploadCandidate,
  type UploadLimits,
  type UploadRejectionReason,
} from './upload-guard';

/**
 * `AttachmentService` — upload, parse, extract, remove (solution.md — `projects`; tasks 63–65).
 *
 * The order of the four steps is the whole of SC-9 and DR-8:
 *
 * 1. **guard** — a pure verdict, taken before the store is contacted at all;
 * 2. **put** — reached only on `ok`, so a rejected upload writes no bytes anywhere;
 * 3. **record** — the row exists in `pending` *before* extraction, so a crash mid-parse leaves a row
 *    pointing at the object rather than an object no cascade can find;
 * 4. **extract once**, with the result persisted, so no later generation re-parses the file (DR-8).
 *    The parsing adapter reads the object back rather than being handed the bytes that arrived: one
 *    extra read, and it buys the guarantee that the persisted text corresponds to *what was stored*.
 *    A store that truncated or rewrote the object would otherwise leave a session grounded in text
 *    that no file contains.
 *
 * The adapters arrive as parameters. Not for testability alone: `projects` may not construct its own
 * vendor clients (constitution A1, D-5), and the composition root that does is the route handler.
 */

export interface AttachmentServiceDeps {
  db: SchemaDatabase;
  storage: StorageAdapter;
  parsing: ParsingAdapter;
  limits: UploadLimits;
}

export type UploadOutcome =
  | { status: 'stored'; attachment: Attachment }
  | {
      status: 'rejected';
      code: 'UPLOAD_REJECTED';
      /** Which rule refused it — what the route maps to 413 or 415 (solution.md — Error Codes). */
      reason: UploadRejectionReason;
      message: string;
    }
  | { status: 'not-found' };

export interface UploadRequest extends UploadCandidate {
  sessionId: string;
  /** The stage the session is in right now — what FR-004 AC-6 lists next to the file. */
  attachedAtStage: string;
}

export function createAttachmentService(deps: AttachmentServiceDeps) {
  const repository = createAttachmentRepository(deps.db);

  return {
    async upload(scope: OwnerScope, request: UploadRequest): Promise<UploadOutcome> {
      const verdict = guardUpload(request, deps.limits);

      if (!verdict.ok) {
        return {
          status: 'rejected',
          code: verdict.code,
          reason: verdict.reason,
          message: verdict.message,
        };
      }

      /*
       * Ownership is established by the write itself, further down — but the bytes go to the store
       * first, so a session that is not the caller's would leave an orphan object behind. The store is
       * therefore asked for a key only after the row insert has proved the session is theirs… which it
       * cannot do without a key. The deadlock is resolved by making the orphan impossible instead:
       * the key is owner-prefixed, so a stranger's upload lands under *their own* prefix and is deleted
       * below when the insert finds no session of theirs to attach it to.
       */
      const { blobKey } = await deps.storage.put(scope, {
        sessionId: request.sessionId,
        fileName: request.fileName,
        contentType: verdict.mimeType,
        bytes: request.bytes,
      });

      const stored = await repository.recordUpload(scope, {
        sessionId: request.sessionId,
        fileName: request.fileName,
        mimeType: verdict.mimeType,
        sizeBytes: verdict.sizeBytes,
        blobKey,
        attachedAtStage: request.attachedAtStage,
      });

      if (stored === null) {
        await deps.storage.deleteMany([blobKey]);
        return { status: 'not-found' };
      }

      const outcome = await deps.parsing.extract({ blobKey, mimeType: verdict.mimeType });
      const recorded = await repository.recordExtraction(scope, stored.id, outcome);

      // The row was there a moment ago; if it is not now the session was deleted underneath us, and
      // the pending row went with it. Reporting the pre-extraction row would claim a state that no
      // longer exists.
      return recorded === null
        ? { status: 'not-found' }
        : { status: 'stored', attachment: recorded };
    },

    /** FR-004 AC-7 — the row first, then the bytes (see the repository's note on `remove`). */
    async remove(scope: OwnerScope, attachmentId: string): Promise<boolean> {
      const removed = await repository.remove(scope, attachmentId);

      if (removed === null) return false;

      try {
        await deps.storage.deleteMany([removed.blobKey]);
      } catch {
        /*
         * The object outlives its row. That is a reconciliation problem, not the user's: the
         * attachment is gone from every list and every generation, which is what they asked for
         * (solution.md — `adapters/storage`, Error Handling).
         */
      }

      return true;
    },

    list: (scope: OwnerScope, sessionId: string) => repository.listForSession(scope, sessionId),
  };
}

export type AttachmentService = ReturnType<typeof createAttachmentService>;
