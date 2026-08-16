import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import { getDatabase } from '@/db/client';
import { AllProvidersFailedError } from '@/modules/adapters/llm';
import { createDefaultAdapter } from '@/modules/adapters/llm/default-adapter';
import type { ContextReference } from '@/modules/agents/context-assembler';
import { resolveDecisionIntent } from '@/modules/agents/decision-intent/resolve';
import { describePacking, packPrompt } from '@/modules/agents/pack-prompt';
import { collectContextSources } from '@/modules/agents/spec/collect-context';
import { assemblePrompt } from '@/modules/prompts';
import { currentOwnerScope } from '@/modules/projects/auth/scope';
import { createAttachmentRepository } from '@/modules/projects/repositories/attachments';
import { createSessionRepository } from '@/modules/projects/repositories/sessions';
import { createRevisionRepository } from '@/modules/specs/repositories/revisions';
import { createSpecFileRepository } from '@/modules/specs/repositories/spec-files';
import {
  describePending,
  findPendingDecision,
  isDecidable,
  type DecidableKind,
  type PendingDecision,
} from '@/modules/specs/pending-decision';
import {
  CHAT_STREAM_CONTENT_TYPE,
  encodeChatEvent,
  type ChatEvent,
} from '@/modules/web/api/chat-protocol';
import { errorResponse } from '@/modules/web/api/responses';
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
const ChatMessage = z.object({
  text: z.string().trim().min(1).max(8000),
  /**
   * Documents the message named with an `@` reference (task 121), as ids the composer resolved.
   *
   * Ids rather than names because a name is ambiguous and unverifiable; every id below is checked
   * against **this session's** project before it is read, so a reference to another owner's file
   * resolves to nothing rather than to their content.
   */
  referenceIds: z.array(z.string().min(1)).max(10).default([]),
});

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

/**
 * The documents an `@` reference names, read through the same owner-scoped repositories as
 * everything else (task 121).
 *
 * Two id namespaces, because there are two kinds of thing to point at: `spec:<specFileId>` is a
 * bundle file at its **newest** revision — what the user is looking at, approved or not — and
 * `attachment:<id>` is a document they uploaded. An id that resolves to nothing is dropped here and
 * reported by the composer, which is what makes a dangling reference a visible notice rather than a
 * silently thinner prompt (AC-2).
 *
 * Ownership is not re-implemented: every lookup carries the scope, and the spec file is additionally
 * required to belong to *this session's project*, so a valid id from another project of the same
 * owner is refused too.
 */
async function resolveReferences(
  db: ReturnType<typeof getDatabase>,
  scope: NonNullable<Awaited<ReturnType<typeof currentOwnerScope>>>,
  session: { id: string; projectId: string },
  referenceIds: readonly string[],
): Promise<ContextReference[]> {
  if (referenceIds.length === 0) return [];

  const specFiles = createSpecFileRepository(db);
  const revisions = createRevisionRepository(db);
  const attachments = await createAttachmentRepository(db).listForSession(scope, session.id);

  const resolved: ContextReference[] = [];

  for (const reference of referenceIds) {
    const separator = reference.indexOf(':');
    const kind = reference.slice(0, separator);
    const id = reference.slice(separator + 1);

    if (kind === 'spec') {
      const file = await specFiles.findById(scope, id);
      if (file?.projectId !== session.projectId) continue;

      const latest = await revisions.latest(file.id);
      if (latest === null) continue;

      resolved.push({ name: file.fileName, content: latest.content });
      continue;
    }

    if (kind === 'attachment') {
      const attachment = attachments.find((candidate) => candidate.id === id);
      if (attachment?.extractedText == null || attachment.extractedText === '') continue;

      resolved.push({ name: attachment.fileName, content: attachment.extractedText });
    }
  }

  return resolved;
}

/**
 * The assistant's reply when the message was not a decision (FR-009 AC-6; task 109).
 *
 * `onDelta` is what turns a reply that appears into one that arrives: the adapter already streams,
 * and the only thing missing was somewhere for the pieces to go. The complete text is still
 * returned, so a caller that ignores the deltas gets exactly what it got before.
 */
async function answer(
  db: ReturnType<typeof getDatabase>,
  scope: NonNullable<Awaited<ReturnType<typeof currentOwnerScope>>>,
  session: {
    id: string;
    projectId: string;
    initialPrompt: string;
    contentLanguage: string | null;
    /** The chat's model choice (task 121) — `null` is Auto, the failover chain. */
    modelId: string | null;
  },
  pending: PendingDecision,
  text: string,
  referenceIds: readonly string[],
  onDelta: (piece: string) => void,
): Promise<string> {
  const collected = await collectContextSources(db, scope, {
    sessionId: session.id,
    projectId: session.projectId,
    initialPrompt: session.initialPrompt,
  });
  // Answering a question writes no revision, so the context set is not recorded anywhere here.
  const references = await resolveReferences(db, scope, session, referenceIds);
  const sources =
    references.length === 0 ? collected.sources : { ...collected.sources, references };

  const build = (context: string) =>
    assemblePrompt(
      'chat.answer.v1',
      {
        message: text,
        pendingDescription: describePending(pending),
        context,
      },
      // У-1: an answer in the conversation is in the language of the conversation (task 108).
      { contentLanguage: session.contentLanguage },
    );

  try {
    const result = await createDefaultAdapter(undefined, {
      modelId: session.modelId,
    }).generateStreaming({
      // Packed for the provider that answers (А-8): a chat reply carries the same session state a
      // generation does, so the same window is the same problem.
      messages: (target) => {
        const packed = packPrompt({ build, sources, target, label: 'chat-answer' });
        console.info(describePacking(packed.record));
        return packed.messages;
      },
      runId: randomUUID(),
      onChunk: onDelta,
    });

    return result.text.trim();
  } catch (error) {
    if (!(error instanceof AllProvidersFailedError)) throw error;

    // An outage costs the answer, never the card: the decision stays exactly where it was (P5).
    return 'I could not answer that just now. Your pending decision is untouched — please try again.';
  }
}

/**
 * The chat response: newline-delimited events, whose **last one is the documented contract**.
 *
 * `applied`, `result` and `pendingAction` are the three fields solution.md describes, on the same
 * route with the same status; anything ahead of the result event is the reply arriving early rather
 * than a second protocol. A client that read only the final line would behave exactly as the one
 * this replaced — which is what makes streaming additive here rather than a new API.
 *
 * `enqueue` is guarded because a reader that leaves closes the stream underneath us: a delta with
 * nowhere to go is not an error, it is a person who navigated away.
 */
function chatStream(
  immediate: readonly ChatEvent[],
  produce?: (send: (event: ChatEvent) => void) => Promise<ChatEvent>,
): Response {
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      let open = true;

      const send = (event: ChatEvent) => {
        if (!open) return;

        try {
          controller.enqueue(encoder.encode(encodeChatEvent(event)));
        } catch {
          open = false;
        }
      };

      try {
        for (const event of immediate) send(event);
        if (produce !== undefined) send(await produce(send));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': CHAT_STREAM_CONTENT_TYPE, 'Cache-Control': 'no-store' },
  });
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
        adapter: createDefaultAdapter(undefined, { modelId: session.modelId }),
        runId: randomUUID(),
      })
    : { intent: null, reason: 'no-pending' as const };

  const dispatched =
    !isDecidable(pending) || resolution.intent === null
      ? null
      : await dispatch(pending, resolution.intent.action, resolution.intent.editPrompt, request);

  /*
   * **Every write is finished before the body opens** (task 109).
   *
   * The reply streams, and that is worth having — but a decision applied from inside a response
   * body would be a decision whose completion depends on someone reading it. Resolving and
   * dispatching above the stream keeps the persisted outcome a property of the request, exactly as
   * it was before this route streamed anything; what happens inside the stream is a model call that
   * writes nothing, so a reader who walks away costs the answer and nothing else (P5).
   */
  if (dispatched?.ok === true && resolution.intent !== null && isDecidable(pending)) {
    const result: unknown = await dispatched.json().catch(() => null);

    return chatStream([
      {
        type: 'result',
        applied: { kind: pending.kind, action: resolution.intent.action },
        result,
        // Re-derived after the decision, so the client learns what is pending *now* (AC-4).
        pendingAction: pendingActionOf(await currentPending(db, scope, session)),
      },
    ]);
  }

  /*
   * Nothing was applied — either the message was not a decision, or the resolver named an action
   * this card cannot take from chat. Both leave the card exactly as it was, which is the abstaining
   * outcome, and both get an answer (FR-009 AC-6).
   */
  return chatStream([], async (send) => ({
    type: 'result',
    applied: null,
    reply: await answer(
      db,
      scope,
      session,
      pending,
      parsed.data.text,
      parsed.data.referenceIds,
      (piece) => {
        send({ type: 'delta', text: piece });
      },
    ),
    // Unchanged, and stated so the client re-renders exactly what it had (AC-2).
    pendingAction: pendingActionOf(pending),
  }));
}
