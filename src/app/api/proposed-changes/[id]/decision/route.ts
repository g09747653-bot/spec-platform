import { z } from 'zod';

import { getDatabase } from '@/db/client';
import { currentOwnerScope } from '@/modules/projects/auth/scope';
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

  const revision = await createRevisionRepository(db).append({
    specFileId: proposal.specFileId,
    content: proposal.proposedContent,
  });
  await createProjectRepository(db).touch(scope, proposal.projectId);

  return jsonResponse({
    proposedChangeId: proposal.id,
    decision: 'accept',
    revisionId: revision.id,
    revisionNumber: revision.revisionNumber,
    approved: revision.approved,
  });
}
