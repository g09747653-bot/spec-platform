import { z } from 'zod';

import { getEnv } from '@/config/env';
import { getDatabase } from '@/db/client';
import { currentOwnerScope } from '@/modules/projects/auth/scope';
import { createProjectRepository } from '@/modules/projects/repositories/projects';
import { REVIEW_DECISIONS } from '@/modules/specs/model/review';
import { createReviewRepository } from '@/modules/specs/repositories/reviews';
import { errorResponse, jsonResponse } from '@/modules/web/api/responses';
import { applyTransition } from '@/modules/workflow/apply-transition';
import { registeredCapabilityIds } from '@/modules/workflow/capabilities';
import { canRequestChanges } from '@/modules/workflow/evaluate-transition';
import { isSpecStage } from '@/modules/workflow/model/stages';

/**
 * `POST /api/reviews/:id/decision` — the review gate (task 56; FR-010 AC-5/AC-6/AC-8).
 *
 * Three decisions, two destinations:
 *
 * - **accept** and **ignore** record the decision and nothing else. They do not advance the session;
 *   they make advancing *possible*, by satisfying `reviewGate` the next time a transition is
 *   evaluated. Deciding and moving stay two separate, separately gated acts — the same separation
 *   approval has carried since task 21, and the reason a decision can never advance a session past a
 *   gate that some other condition still fails.
 * - **request_changes** returns the stage to `generate` (AC-6), which is a backward transition and
 *   therefore always permitted (A2). It goes through `applyTransition` regardless, because the
 *   engine is the only thing allowed to move a session.
 *
 * The selection rule is stated three times over — here in `ReviewDecision`, in the table constraint,
 * and as a disabled button — and this is the layer that returns a message. `.refine` is what turns
 * "request changes with nothing ticked" into a 422 rather than a revision prompt with no feedback.
 */
const ReviewDecision = z
  .object({
    decision: z.enum(REVIEW_DECISIONS),
    selectedItemIds: z.array(z.string().min(1)).default([]),
  })
  .refine(
    (decision) => decision.decision !== 'request_changes' || decision.selectedItemIds.length > 0,
    {
      message: 'request_changes requires at least one selected feedback item',
      path: ['selectedItemIds'],
    },
  );

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const scope = await currentOwnerScope();
  if (scope === null) return errorResponse('UNAUTHENTICATED');

  const { id: reviewId } = await params;
  const db = getDatabase();
  const reviews = createReviewRepository(db);

  // The join in this lookup is the authorisation: another owner's review is simply not found (AR-2).
  const review = await reviews.findById(scope, reviewId);
  if (review === null) return errorResponse('NOT_FOUND');

  const body: unknown = await request.json().catch(() => null);
  const parsed = ReviewDecision.safeParse(body);

  if (!parsed.success) {
    return errorResponse('VALIDATION_FAILED', {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  const { decision, selectedItemIds } = parsed.data;

  /*
   * A selection that names an item this review does not contain is a stale card, not a filter: the
   * revision prompt would silently drop it (FR-010 AC-7 selects by id), and silently applying less
   * than the user ticked is precisely the failure that criterion exists to prevent.
   */
  if (decision === 'request_changes') {
    const known = new Set(review.items.map((item) => item.id));
    const unknown = selectedItemIds.filter((id) => !known.has(id));

    if (unknown.length > 0) {
      return errorResponse('VALIDATION_FAILED', {
        issues: [
          { path: 'selectedItemIds', message: `unknown feedback item: ${unknown[0] ?? ''}` },
        ],
      });
    }

    /*
     * The loop is bounded, and the bound is enforced here rather than on the transition (task 113).
     *
     * `review → generate` is a backward movement and stays unconditional (FR-007 AC-5; A2) — what is
     * budgeted is *asking for another machine-written revision*, which is this decision and only
     * this decision. Accept and ignore are unaffected, so an exhausted cycle is a fork rather than a
     * dead end, and the reason code carries the copy that says so (gate-copy).
     *
     * On the server, not only in the card: an invariant that depends on every client knowing it is
     * not an invariant (D-100).
     */
    const cycles = await reviews.countRequestedChanges(scope, review.specFileId);
    const budget = canRequestChanges(cycles, getEnv().MAX_REVISION_CYCLES_PER_STAGE);

    if (!budget.allowed) {
      return errorResponse('GATE_REJECTED', { reason: budget.reason });
    }
  }

  const decided = await reviews.decide(
    reviewId,
    decision,
    decision === 'request_changes' ? selectedItemIds : null,
  );

  // Already decided: the card the caller acted on is stale. Re-present it rather than overwriting a
  // decision the user already took — the same answer whether it arrived twice from the board or
  // once from the board and once from chat (task 62).
  if (decided === null) {
    return errorResponse('PENDING_DECISION', { decision: review.decision });
  }

  if (decision !== 'request_changes') {
    return jsonResponse({
      reviewId: decided.id,
      decision: decided.decision,
      selectedItemIds: decided.selectedItemIds,
      returnedToGenerate: false,
    });
  }

  const project = await createProjectRepository(db).findById(scope, review.projectId);
  if (project === null) return errorResponse('NOT_FOUND');

  // `quality.md` is the optional module's file and it owns its own review path (A6), so a
  // request-changes on it is answered by the capability code rather than served wrongly.
  if (!isSpecStage(review.specType)) return errorResponse('CAPABILITY_NOT_REGISTERED');

  const outcome = await applyTransition(
    db,
    project.sessionId,
    { stage: review.specType, substage: 'generate' },
    {
      roundBudget: getEnv().MAX_ROUNDS_PER_STAGE,
      capabilities: registeredCapabilityIds(),
    },
  );

  if (outcome.status === 'not-found') return errorResponse('NOT_FOUND');
  if (outcome.status === 'conflict') return errorResponse('CONFLICT');
  if (outcome.status === 'rejected') {
    return errorResponse('GATE_REJECTED', { reason: outcome.reason });
  }

  return jsonResponse({
    reviewId: decided.id,
    decision: decided.decision,
    selectedItemIds: decided.selectedItemIds,
    returnedToGenerate: true,
    position: outcome.position,
  });
}
