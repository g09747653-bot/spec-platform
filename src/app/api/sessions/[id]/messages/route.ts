import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import { getDatabase } from '@/db/client';
import { AllProvidersFailedError } from '@/modules/adapters/llm';
import { createDefaultAdapter } from '@/modules/adapters/llm/default-adapter';
import { assembleContext } from '@/modules/agents/context-assembler';
import { resolveDecisionIntent } from '@/modules/agents/decision-intent/resolve';
import { collectContextSources } from '@/modules/agents/spec/collect-context';
import { assemblePrompt } from '@/modules/prompts';
import { currentOwnerScope } from '@/modules/projects/auth/scope';
import { createSessionRepository } from '@/modules/projects/repositories/sessions';
import {
  describePending,
  findPendingDecision,
  isDecidable,
  type DecidableKind,
  type PendingDecision,
} from '@/modules/specs/pending-decision';
import { errorResponse, jsonResponse } from '@/modules/web/api/responses';
import { pendingRoundId } from '@/modules/workflow/pending-action';
import { createWorkflowStateRepository } from '@/modules/workflow/repositories/workflow-state';

import { POST as decideProposal } from '../../../proposed-changes/[id]/decision/route';
import { POST as decideReview } from '../../../reviews/[id]/decision/route';
import { POST as decideSpec } from '../../../specs/[specFileId]/decision/route';

/**
 * `POST /api/sessions/:id/messages` — typing a decision instead of clicking it (task 62; FR-009
 * AC-6/AC-7; SC-14).
 *
 * The handler does **not** implement any decision. It resolves the message against the pending card
 * and then calls the very same route handler the card's button would have called, with the very
 * same body. That is how the task's three criteria hold:
 *
 * - *"A typed approval produces the identical persisted state as clicking approve"* — because it is
 *   literally the same function on the same input, not a second implementation kept in step.
 * - *"The audit trail does not distinguish card-driven from chat-driven decisions"* — because there
 *   is nothing to distinguish: no branch, no flag, no second write path. Recording the provenance
 *   would take deliberate extra work, which is the strongest form this criterion can take.
 * - *"An unresolved message leaves the pending card rendered unchanged"* — because an unresolved
 *   message never reaches a dispatch at all, and the response echoes the same `pendingAction` the
 *   page would render on a reload.
 *
 * Everything hard about this lives in `resolveDecisionIntent`, which abstains by default and is the
 * only thing standing between a typed sentence and the human approval gate of P2.
 */
const ChatMessage = z.object({ text: z.string().trim().min(1).max(8000) });

/**
 * The session's pending card, resolved the same way the page resolves it (task 75).
 *
 * The pending question round comes from `workflow_state`, which `specs` may not read, so it is
 * fetched here and passed in. One resolver, one precedence, two callers — which is what makes "a
 * typed decision applies to the card on screen" true rather than usually true.
 */
async function currentPending(
  db: ReturnType<typeof getDatabase>,
  scope: NonNullable<Awaited<ReturnType<typeof currentOwnerScope>>>,
  session: { id: string; projectId: string },
): Promise<PendingDecision> {
  const state = await createWorkflowStateRepository(db).find(session.id);

  return findPendingDecision(
    db,
    scope,
    session.projectId,
    state === null ? null : pendingRoundId(state.pendingAction),
  );
}

/** The `pendingAction` the client re-renders — the same shape whether or not anything was applied. */
function pendingActionOf(pending: PendingDecision): Record<string, unknown> | null {
  if (pending === null) return null;

  switch (pending.kind) {
    case 'question-round':
      return { kind: 'question-round', roundId: pending.roundId };
    case 'diff':
      return { kind: 'diff', proposedChangeId: pending.proposedChangeId };
    case 'review':
      return { kind: 'review', reviewId: pending.reviewId };
    case 'spec':
      return {
        kind: 'spec',
        specFileId: pending.specFileId,
        revisionNumber: pending.revisionNumber,
      };
  }
}

/**
 * Calls the endpoint the card would have called.
 *
 * A real `Request` against the real handler, deliberately: anything cheaper — reaching past the
 * handler into a service, say — would be a second path that could drift from the first, and "the
 * identical persisted state" would become a promise rather than a consequence.
 */
async function dispatch(
  pending: Extract<PendingDecision, { kind: DecidableKind }>,
  action: string,
  editPrompt: string | undefined,
  request: Request,
): Promise<Response | null> {
  const call = (url: string, body: unknown) =>
    new Request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  const origin = new URL(request.url).origin;

  if (pending.kind === 'spec') {
    if (action === 'approve') {
      return decideSpec(
        call(`${origin}/api/specs/${pending.specFileId}/decision`, {
          decision: 'approve',
          revisionNumber: pending.revisionNumber,
        }),
        { params: Promise.resolve({ specFileId: pending.specFileId }) },
      );
    }

    if (action === 'reject' && editPrompt !== undefined) {
      return decideSpec(
        call(`${origin}/api/specs/${pending.specFileId}/decision`, {
          decision: 'request_changes',
          instruction: editPrompt,
        }),
        { params: Promise.resolve({ specFileId: pending.specFileId }) },
      );
    }

    return null;
  }

  if (pending.kind === 'review') {
    return decideReview(
      call(`${origin}/api/reviews/${pending.reviewId}/decision`, { decision: action }),
      { params: Promise.resolve({ id: pending.reviewId }) },
    );
  }

  return decideProposal(
    call(`${origin}/api/proposed-changes/${pending.proposedChangeId}/decision`, {
      decision: action,
    }),
    { params: Promise.resolve({ id: pending.proposedChangeId }) },
  );
}

/** The assistant's reply when the message was not a decision (FR-009 AC-6). */
async function answer(
  db: ReturnType<typeof getDatabase>,
  scope: NonNullable<Awaited<ReturnType<typeof currentOwnerScope>>>,
  session: { id: string; projectId: string; initialPrompt: string },
  pending: PendingDecision,
  text: string,
): Promise<string> {
  const collected = await collectContextSources(db, scope, {
    sessionId: session.id,
    projectId: session.projectId,
    initialPrompt: session.initialPrompt,
  });
  // Answering a question writes no revision, so the context set is not recorded anywhere here.
  const context = assembleContext(collected.sources);

  const prompt = assemblePrompt('chat.answer.v1', {
    message: text,
    pendingDescription: describePending(pending),
    context: context.text,
  });

  try {
    const result = await createDefaultAdapter().generateStreaming({
      messages: [
        { role: 'system', content: prompt.system },
        { role: 'user', content: prompt.user },
      ],
      runId: randomUUID(),
    });

    return result.text.trim();
  } catch (error) {
    if (!(error instanceof AllProvidersFailedError)) throw error;

    // An outage costs the answer, never the card: the decision stays exactly where it was (P5).
    return 'I could not answer that just now. Your pending decision is untouched — please try again.';
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const scope = await currentOwnerScope();
  if (scope === null) return errorResponse('UNAUTHENTICATED');

  const { id: sessionId } = await params;
  const db = getDatabase();

  // The join in this lookup is the authorisation: another user's session is not found (AR-2).
  const session = await createSessionRepository(db).findById(scope, sessionId);
  if (session === null) return errorResponse('NOT_FOUND');

  const body: unknown = await request.json().catch(() => null);
  const parsed = ChatMessage.safeParse(body);

  if (!parsed.success) {
    return errorResponse('VALIDATION_FAILED', {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  const pending = await currentPending(db, scope, session);

  /*
   * A pending question round is answered, not decided: there is no accept/reject to resolve, and the
   * round endpoint is where a free-text reply belongs (task 36). Treating it as undecidable here is
   * what stops a typed "approve" from reaching past the questions on screen and approving whichever
   * spec card happens to be behind them — which is exactly what a file-scoped, round-blind lookup
   * used to allow.
   */
  const resolution = isDecidable(pending)
    ? await resolveDecisionIntent({
        message: parsed.data.text,
        pending: pending.kind,
        adapter: createDefaultAdapter(),
        runId: randomUUID(),
      })
    : { intent: null, reason: 'no-pending' as const };

  if (!isDecidable(pending) || resolution.intent === null) {
    return jsonResponse({
      applied: null,
      reply: await answer(db, scope, session, pending, parsed.data.text),
      // Unchanged, and stated so the client re-renders exactly what it had (AC-2).
      pendingAction: pendingActionOf(pending),
    });
  }

  const dispatched = await dispatch(
    pending,
    resolution.intent.action,
    resolution.intent.editPrompt,
    request,
  );

  // Nothing to dispatch to — the resolver named an action this card cannot take from chat. The card
  // stays exactly as it was, which is the abstaining outcome by another route.
  if (dispatched?.ok !== true) {
    return jsonResponse({
      applied: null,
      reply: await answer(db, scope, session, pending, parsed.data.text),
      pendingAction: pendingActionOf(pending),
    });
  }

  const result: unknown = await dispatched.json().catch(() => null);

  return jsonResponse({
    applied: { kind: pending.kind, action: resolution.intent.action },
    result,
    // Re-derived after the decision, so the client learns what is pending *now* (FR-017 AC-4).
    pendingAction: pendingActionOf(await currentPending(db, scope, session)),
  });
}
