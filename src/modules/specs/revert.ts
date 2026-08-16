import type { SchemaDatabase } from '@/db';

import { createRevisionRepository, type SpecRevision } from './repositories/revisions';

/**
 * «Go back to previous step», as an append (task 127; Эталон §5.1).
 *
 * **A revert is a new revision, never an unwind.** The immutability triggers of task 16 make that
 * structural rather than careful: nothing can rewrite or delete a revision, so the only thing
 * "going back" can mean here is Rev N+1 whose content equals Rev N-1. History keeps all three, and
 * the file that was reverted can itself be reverted — which is what makes the operation safe to
 * offer on a phrase.
 *
 * The revision is written **approved** and stamped with the chat that asked for it. Both follow from
 * what the user did: they read the diff between the two revisions on the card and said apply, which
 * is the same decision the Edit flow's diff card takes (P2; FR-009 AC-1), and «which conversation
 * produced this?» has to stay answerable now that a project holds several (А-6).
 */
export type RevertOutcome =
  | { status: 'reverted'; revision: SpecRevision; restoredFrom: number }
  /** One revision, or none: there is no earlier content to restore. */
  | { status: 'no-predecessor' }
  | { status: 'not-found' };

export async function revertToPreviousRevision(
  db: SchemaDatabase,
  input: { specFileId: string; sourceSessionId: string },
): Promise<RevertOutcome> {
  const revisions = createRevisionRepository(db);
  const history = await revisions.history(input.specFileId);

  if (history.length === 0) return { status: 'not-found' };
  if (history.length < 2) return { status: 'no-predecessor' };

  /*
   * Newest first or oldest first is the repository's business, not this function's: sorting by the
   * number the database allocated is the only ordering that cannot be wrong.
   */
  const ordered = [...history].sort((a, b) => a.revisionNumber - b.revisionNumber);
  const previous = ordered.at(-2);
  if (previous === undefined) return { status: 'no-predecessor' };

  const appended = await revisions.append({
    specFileId: input.specFileId,
    content: previous.content,
    sourceSessionId: input.sourceSessionId,
  });

  await revisions.approve(appended.id);

  return {
    status: 'reverted',
    revision: { ...appended, approved: true },
    restoredFrom: previous.revisionNumber,
  };
}
