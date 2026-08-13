import type { SchemaDatabase } from '@/db';
import type { OwnerScope } from '@/db/owner-scope';

import { createProposedChangeService } from './proposed-changes/proposed-change-service';
import { createReviewRepository } from './repositories/reviews';
import { createRevisionRepository } from './repositories/revisions';
import { createSpecFileRepository } from './repositories/spec-files';

/**
 * Which decision a session is actually waiting on (task 62; FR-009 AC-7; FR-017 AC-4).
 *
 * The chat endpoint and the page must agree about what is pending, or a typed decision would apply
 * to a different card than the one the user is looking at. So the answer is derived here, once,
 * from persisted state — the same source the page renders from — rather than tracked as a separate
 * piece of session state that could drift.
 *
 * **Precedence is fixed and narrow.** A pending proposed change comes first: while one is
 * outstanding the workflow does not advance and no other change may be applied to that file
 * (FR-011 AC-6), so it is unambiguously the card in front of the user. A pending review comes next,
 * then an unapproved revision. Ordering them explicitly is what makes "the card the user is looking
 * at" a lookup rather than a guess.
 */
export type PendingDecision =
  | { kind: 'diff'; proposedChangeId: string; specFileId: string; fileName: string }
  | { kind: 'review'; reviewId: string; specFileId: string; specType: string }
  | { kind: 'spec'; specFileId: string; revisionNumber: number; fileName: string }
  | null;

export async function findPendingDecision(
  db: SchemaDatabase,
  scope: OwnerScope,
  projectId: string,
): Promise<PendingDecision> {
  const specFiles = createSpecFileRepository(db);
  const currentFile = await specFiles.currentFile(scope, projectId);
  if (currentFile === null) return null;

  const proposal = await createProposedChangeService(db).pendingForFile(scope, currentFile.id);
  if (proposal !== null) {
    return {
      kind: 'diff',
      proposedChangeId: proposal.id,
      specFileId: currentFile.id,
      fileName: proposal.fileName,
    };
  }

  const review = await createReviewRepository(db).pendingForFile(scope, currentFile.id);
  if (review !== null) {
    return {
      kind: 'review',
      reviewId: review.id,
      specFileId: currentFile.id,
      specType: review.specType,
    };
  }

  const latest = await createRevisionRepository(db).latest(currentFile.id);
  if (latest !== null && !latest.approved) {
    return {
      kind: 'spec',
      specFileId: currentFile.id,
      revisionNumber: latest.revisionNumber,
      fileName: currentFile.fileName,
    };
  }

  return null;
}

/** A one-line description of the pending card, for the assistant's framing. */
export function describePending(pending: PendingDecision): string {
  if (pending === null) return 'nothing is awaiting a decision';

  switch (pending.kind) {
    case 'diff':
      return `a proposed change to ${pending.fileName} is awaiting accept or reject`;
    case 'review':
      return `the automated review of ${pending.specType} is awaiting accept, ignore or request-changes`;
    case 'spec':
      return `revision ${String(pending.revisionNumber)} of ${pending.fileName} is awaiting approval`;
  }
}
