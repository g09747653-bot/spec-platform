import type { SchemaDatabase } from '@/db';
import type { OwnerScope } from '@/db/owner-scope';

import { createProposedChangeService } from './proposed-changes/proposed-change-service';
import { createReviewRepository } from './repositories/reviews';
import { createRevisionRepository } from './repositories/revisions';
import { createSpecFileRepository } from './repositories/spec-files';

/**
 * What this session is waiting on — the one answer (tasks 62, 75; FR-009 AC-7; FR-017 AC-3/AC-4).
 *
 * FR-017 names four kinds of pending user action, and resume is only correct if the page and the
 * chat endpoint agree about which one is in front of the user. Two answers to that question is one
 * too many: a typed "approve" would apply to a different card than the one on screen, and a reload
 * would re-present a card the server does not think is pending. So the answer is derived **here**,
 * once, from persisted state — the same state the page renders from — rather than tracked as
 * separate session state that could drift.
 *
 * **Precedence is fixed, and each step of it is a rule from the requirements:**
 *
 * 1. **A pending question round.** While one is presented, generation is blocked (FR-005 AC-4), so
 *    nothing else can have become pending since. It is unambiguously the card on screen.
 * 2. **A pending proposed change.** While one is outstanding the workflow does not advance and no
 *    other change may be applied to that file (FR-011 AC-6).
 * 3. **A pending review**, then **an unapproved revision**. Entering review is what produces the
 *    board (FR-010 AC-1), so a board and an undecided draft cannot both be current — but ordering
 *    them explicitly is what makes "the card the user is looking at" a lookup rather than a guess.
 *
 * **The round is passed in, not read.** `question_rounds` belongs to `projects` and `workflow_state`
 * to `workflow`, and `specs` may import neither (constitution A1). Passing the id keeps the
 * precedence rule in one place without inventing a cross-module read: every caller already holds it.
 */
export type PendingDecision =
  | { kind: 'question-round'; roundId: string }
  | { kind: 'diff'; proposedChangeId: string; specFileId: string; fileName: string }
  | { kind: 'review'; reviewId: string; specFileId: string; specType: string }
  | { kind: 'spec'; specFileId: string; revisionNumber: number; fileName: string }
  | null;

/** The kinds a typed message can decide. A question round is answered, not decided. */
export type DecidableKind = 'diff' | 'review' | 'spec';

export function isDecidable(
  pending: PendingDecision,
): pending is Extract<PendingDecision, { kind: DecidableKind }> {
  return pending !== null && pending.kind !== 'question-round';
}

export async function findPendingDecision(
  db: SchemaDatabase,
  scope: OwnerScope,
  projectId: string,
  pendingRoundId: string | null = null,
): Promise<PendingDecision> {
  if (pendingRoundId !== null) return { kind: 'question-round', roundId: pendingRoundId };

  /*
   * Proposals are looked up across the **project**, not only the file the session is working on.
   * The late-attachment action of task 69 can start a refinement on a file the session has already
   * moved past, and the page has rendered that card project-wide since M5 — so a file-scoped lookup
   * here would have chat and the page disagreeing about the very card on screen.
   */
  const proposal = await createProposedChangeService(db).pendingForProject(scope, projectId);
  if (proposal !== null) {
    return {
      kind: 'diff',
      proposedChangeId: proposal.id,
      specFileId: proposal.specFileId,
      fileName: proposal.fileName,
    };
  }

  const specFiles = createSpecFileRepository(db);
  const currentFile = await specFiles.currentFile(scope, projectId);
  if (currentFile === null) return null;

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
    case 'question-round':
      return 'a set of questions is waiting to be answered';
    case 'diff':
      return `a proposed change to ${pending.fileName} is awaiting accept or reject`;
    case 'review':
      return `the automated review of ${pending.specType} is awaiting accept, ignore or request-changes`;
    case 'spec':
      return `revision ${String(pending.revisionNumber)} of ${pending.fileName} is awaiting approval`;
  }
}
