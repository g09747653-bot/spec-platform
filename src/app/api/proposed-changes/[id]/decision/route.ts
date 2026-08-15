import { z } from 'zod';

import { getDatabase } from '@/db/client';
import { currentOwnerScope } from '@/modules/projects/auth/scope';
import { createAttachmentRepository } from '@/modules/projects/repositories/attachments';
import { createProjectRepository } from '@/modules/projects/repositories/projects';
import { createProposedChangeService } from '@/modules/specs/proposed-changes/proposed-change-service';
import { createRevisionRepository } from '@/modules/specs/repositories/revisions';
import { errorResponse, jsonResponse } from '@/modules/web/api/responses';

/**
 * `POST /api/proposed-changes/:id/decision` — accept or reject the diff (task 60; FR-011 AC-3..AC-5).
 *
 * The asymmetry between the two decisions is the whole point:
 *
 * - **reject** marks the proposal rejected and writes **nothing else**. No revision, no touch of the
 *   file's content, not even a no-op update — the file is byte-for-byte what it was (AC-5; FR-012
 *   AC-6). The proposal row stays as the record that the user said no.
 * - **accept** appends exactly one revision carrying the proposed content, and the revision chain's
 *   existing rows are untouched because the database will not permit anything else (task 16).
 *
 * The order for accept is decide-then-write: `markDecided` is the conditional update that arbitrates
 * a double submission, so a second request finds the proposal already decided and appends nothing.
 * Writing first and marking second would let two racing accepts produce two revisions of the same
 * proposed text.
 */
const ProposalDecision = z.object({ decision: z.enum(['accept', 'reject']) });

/**
 * Accepting or rejecting a whole cross-file edit (task 118).
 *
 * Rejecting writes nothing but the statuses — every referenced document stays byte-for-byte what it
 * was, which is the M4 contract re-asserted at bundle scale. Accepting is one statement in the
 * service: either every touched file gains a revision or none does.
 *
 * `PENDING_DECISION` on an empty claim is the same answer the single-file path gives, and for the
 * same reason: the second of two submissions must find the work already done rather than repeat it.
 */
async function decideBatch(
  db: ReturnType<typeof getDatabase>,
  scope: NonNullable<Awaited<ReturnType<typeof currentOwnerScope>>>,
  editBatchId: string,
  decision: 'accept' | 'reject',
): Promise<Response> {
  const service = createProposedChangeService(db);
  const members = await service.batchMembers(scope, editBatchId);
  const projectId = members[0]?.projectId;

  if (projectId === undefined) return errorResponse('NOT_FOUND');

  if (decision === 'reject') {
    const rejected = await service.rejectBatch(scope, editBatchId);
    if (rejected === 0) return errorResponse('PENDING_DECISION', { editBatchId });

    return jsonResponse({ editBatchId, decision: 'reject', files: [] });
  }

  /*
   * The chat that produced this edit, stamped on every revision it writes.
   *
   * Resolved from the batch's own run rather than taken from the request: the source of a revision
   * is a fact about who did the work, and a client-supplied one would be a claim.
   */
  const session = await service.sessionForBatch(scope, editBatchId);
  if (session === null) return errorResponse('NOT_FOUND');

  const applied = await service.acceptBatch(scope, editBatchId, session);
  if (applied.length === 0) return errorResponse('PENDING_DECISION', { editBatchId });

  await createProjectRepository(db).touch(scope, projectId);

  return jsonResponse({
    editBatchId,
    decision: 'accept',
    files: applied.map((file) => ({
      specFileId: file.specFileId,
      fileName: file.fileName,
      revisionId: file.revisionId,
      revisionNumber: file.revisionNumber,
    })),
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const scope = await currentOwnerScope();
  if (scope === null) return errorResponse('UNAUTHENTICATED');

  const { id: proposalId } = await params;
  const db = getDatabase();
  const service = createProposedChangeService(db);

  // The join in this lookup is the authorisation: another owner's proposal is not found (AR-2).
  const proposal = await service.findOwned(scope, proposalId);
  if (proposal === null) return errorResponse('NOT_FOUND');

  const body: unknown = await request.json().catch(() => null);
  const parsed = ProposalDecision.safeParse(body);

  if (!parsed.success) {
    return errorResponse('VALIDATION_FAILED', {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  const { decision } = parsed.data;

  /*
   * A cross-file edit is decided as one thing (task 118).
   *
   * The card the user pressed shows several diffs and one pair of buttons, so the decision has to
   * cover the set — deciding member by member would let a reload land between two of them and leave
   * the bundle half-edited. Same endpoint, same body, same two answers: what changes is that the
   * proposal names a batch, and the service applies or refuses all of its members in one statement.
   */
  if (proposal.editBatchId !== null) {
    return decideBatch(db, scope, proposal.editBatchId, decision);
  }

  const claimed = await service.markDecided(
    proposal.id,
    decision === 'accept' ? 'accepted' : 'rejected',
  );

  // Already decided. Re-present rather than acting twice — the same answer whether the second
  // submission came from the card or from a typed message (task 62).
  if (!claimed) {
    return errorResponse('PENDING_DECISION', { proposedChangeId: proposal.id });
  }

  if (decision === 'reject') {
    return jsonResponse({
      proposedChangeId: proposal.id,
      decision: 'reject',
      revisionNumber: null,
    });
  }

  const projects = createProjectRepository(db);

  /*
   * The context set recorded on this revision is the one that existed **when the text was produced**,
   * not when it was accepted (DR-12).
   *
   * The distinction is not academic: a document attached between proposing and accepting was never in
   * front of the agent, and recording it here would make the file look as though it had already taken
   * that document into account — which is exactly the fact FR-004 AC-9 needs to be able to report.
   * The proposal's own timestamp is what answers the question, from persisted state.
   */
  const project = await projects.findById(scope, proposal.projectId);
  const contextAttachmentIds =
    project === null
      ? []
      : await createAttachmentRepository(db).idsForSession(
          scope,
          project.sessionId,
          proposal.createdAt,
        );

  const revision = await createRevisionRepository(db).append({
    specFileId: proposal.specFileId,
    content: proposal.proposedContent,
    contextAttachmentIds,
  });
  await projects.touch(scope, proposal.projectId);

  return jsonResponse({
    proposedChangeId: proposal.id,
    decision: 'accept',
    revisionId: revision.id,
    revisionNumber: revision.revisionNumber,
    approved: revision.approved,
  });
}
