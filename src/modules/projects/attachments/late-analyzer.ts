import type { SchemaDatabase } from '@/db';
import type { OwnerScope } from '@/db/owner-scope';

import { createAttachmentRepository, type AffectedSpecFile } from '../repositories/attachments';

/**
 * `LateAttachmentAnalyzer` (task 69; FR-004 AC-9/AC-10/AC-11; DR-12).
 *
 * The question it answers is narrow and exact: **which already-approved files were generated without
 * this document in front of the agent?** Two properties make the answer trustworthy, and both are
 * deliberate:
 *
 * 1. **It is computed from persisted state, never inferred.** Every revision records the attachment
 *    set that existed when it was generated (DR-12), so the test is a set membership check on data
 *    the run itself wrote. The tempting alternative — compare the attachment's `uploaded_at` against
 *    the revision's `created_at` — is wrong in both directions: a revision written from a proposal
 *    made earlier would look newer than it is, and a document uploaded during a generation would look
 *    older. AC-11 exists precisely to forbid that inference.
 *
 * 2. **It changes nothing.** The analyzer reads. FR-004 AC-10 is explicit that a late attachment must
 *    never modify an approved file, and the cheapest way to guarantee that is for the code that
 *    detects the situation to have no write path at all — the user is offered a refinement, and a
 *    refinement is a proposal they still have to accept (FR-011).
 *
 * It lives in `projects` and returns plain file names rather than the `specs` module's `SpecFileName`:
 * `projects` may not import `specs` (constitution A1). The names are database-constrained to the five
 * permitted values on the way in, so a string here is not a weaker guarantee than the type would be —
 * it is the same guarantee, enforced one layer down.
 */

export interface LateAttachmentImpact {
  attachmentId: string;
  /**
   * The approved files that predate this document, in bundle order by name.
   *
   * Empty is the common case and is not a special one: attaching a document before anything has been
   * approved affects nothing, and the UI shows no notice.
   */
  affectedFiles: readonly AffectedSpecFile[];
}

export function createLateAttachmentAnalyzer(db: SchemaDatabase) {
  const attachments = createAttachmentRepository(db);

  return {
    async analyze(
      scope: OwnerScope,
      sessionId: string,
      attachmentId: string,
    ): Promise<LateAttachmentImpact> {
      const affectedFiles = await attachments.filesGeneratedWithout(scope, sessionId, attachmentId);

      return { attachmentId, affectedFiles };
    },
  };
}

export type LateAttachmentAnalyzer = ReturnType<typeof createLateAttachmentAnalyzer>;
