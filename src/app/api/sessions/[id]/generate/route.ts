import { getEnv } from '@/config/env';
import { getDatabase } from '@/db/client';
import { createGenerationStore } from '@/modules/adapters/llm';
import { createDefaultAdapter } from '@/modules/adapters/llm/default-adapter';
import { assembleContext, selectedFeedback } from '@/modules/agents/context-assembler';
import { reviseInstruction } from '@/modules/agents/revision/revision-agent';
import { collectContextSources } from '@/modules/agents/spec/collect-context';
import { runGeneration } from '@/modules/agents/spec/run-generation';
import { targetSpecType } from '@/modules/agents/spec/target-spec-type';
import { currentOwnerScope } from '@/modules/projects/auth/scope';
import { createProjectRepository } from '@/modules/projects/repositories/projects';
import { createSessionRepository } from '@/modules/projects/repositories/sessions';
import { applyTransition } from '@/modules/workflow/apply-transition';
import { registeredCapabilityIds } from '@/modules/workflow/capabilities';
import { isSpecStage } from '@/modules/workflow/model/stages';
import type { ReasonCode } from '@/modules/workflow/reason-codes';
import { errorResponse, type ErrorCode } from '@/modules/web/api/responses';
import {
  encodeEvent,
  GENERATION_STREAM_CONTENT_TYPE,
  type GenerationEvent,
} from '@/modules/web/api/stream-protocol';

/**
 * `POST /api/sessions/:id/generate` — the streaming generation path (task 45; FR-008; A5).
 *
 * The order of the first three steps is the whole point of the handler:
 *
 * 1. resolve the owner (a session that is not the caller's is not found — AR-2);
 * 2. **check the gate**, which happens before a provider is even constructed, so a rejected
 *    transition costs nothing and returns 409 with its reason code (FR-008 AC-1; NFR-012 AC-4);
 * 3. open the run and the stream, and only then call a model.
 *
 * After the stream opens, HTTP status is settled and every outcome — including total provider failure
 * — is an `error` event on a 200 response. A failure that arrives after the headers is not a different
 * kind of failure to the user; it is the same card with a retry on it (FR-018 AC-2/AC-3).
 *
 * Retrying is deliberately not a separate endpoint. A session already sitting in `generate` needs no
 * transition, so calling this again resumes from the same workflow position with the same context and
 * no duplicated stage (FR-018 AC-6).
 */

/** Reasons that are their own HTTP code in the solution's error table; the rest are GATE_REJECTED. */
const STANDALONE_REASONS: Partial<Record<ReasonCode, ErrorCode>> = {
  CAPABILITY_NOT_REGISTERED: 'CAPABILITY_NOT_REGISTERED',
  ROUND_LIMIT_REACHED: 'ROUND_LIMIT_REACHED',
};

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const scope = await currentOwnerScope();
  if (scope === null) return errorResponse('UNAUTHENTICATED');

  const { id: sessionId } = await params;
  const db = getDatabase();

  const session = await createSessionRepository(db).findById(scope, sessionId);
  if (session === null) return errorResponse('NOT_FOUND');

  // Generation belongs to a spec stage. From `interview` there is no such position to move to, so
  // the request is refused by the same vocabulary the transition table uses.
  if (!isSpecStage(session.stage)) {
    return errorResponse('GATE_REJECTED', { reason: 'TRANSITION_NOT_IN_TABLE' });
  }

  const stage = session.stage;

  if (session.substage !== 'generate') {
    const outcome = await applyTransition(
      db,
      session.id,
      { stage, substage: 'generate' },
      {
        roundBudget: getEnv().MAX_ROUNDS_PER_STAGE,
        capabilities: registeredCapabilityIds(),
      },
    );

    switch (outcome.status) {
      case 'rejected':
        return errorResponse(STANDALONE_REASONS[outcome.reason] ?? 'GATE_REJECTED', {
          reason: outcome.reason,
          ...(!outcome.result.allowed && outcome.result.unmet !== undefined
            ? { unmet: outcome.result.unmet }
            : {}),
        });
      case 'conflict':
        return errorResponse('CONFLICT');
      case 'not-found':
        return errorResponse('NOT_FOUND');
      case 'applied':
        break;
    }
  }

  const specType = targetSpecType(stage);
  const store = createGenerationStore(db);

  // Assembled before the stream opens, so a context that cannot be read is an error the client gets
  // as a status code rather than as a half-written document (FR-008 AC-6).
  //
  // Passing `specType` is what makes this a *revision* when the review board sent the stage back:
  // the sources then carry the review's items and the user's selection, and the assembler includes
  // only the ticked ones (task 57; FR-010 AC-6/AC-7).
  const sources = await collectContextSources(db, scope, {
    sessionId: session.id,
    projectId: session.projectId,
    initialPrompt: session.initialPrompt,
    specType,
  });
  const context = assembleContext(sources);
  const applied = sources.feedback === undefined ? [] : selectedFeedback(sources.feedback);

  const run = await store.createRun(session.id, stage);

  const adapter = createDefaultAdapter();

  const encoder = new TextEncoder();
  const abort = new AbortController();

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;

      const send = (event: GenerationEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(encodeEvent(event)));
        } catch {
          // The client is gone. Stop writing; the run keeps going only as long as its own signal.
          open = false;
        }
      };

      // `run` is always first: it is what the client stores in order to resume (FR-017).
      send({ type: 'run', runId: run.id, stage, attempt: 1 });

      try {
        const outcome = await runGeneration({
          db,
          adapter,
          store,
          runId: run.id,
          projectId: session.projectId,
          specType,
          initialPrompt: session.initialPrompt,
          context: context.text,
          ...(applied.length === 0 ? {} : { changeInstruction: reviseInstruction(applied.length) }),
          signal: abort.signal,
          progress: {
            delta: (sequence, text) => {
              send({ type: 'delta', sequence, text });
            },
            restart: (attempt) => {
              send({ type: 'restart', reason: 'provider_failover', attempt });
            },
          },
        });

        if (outcome.status === 'complete') {
          await createProjectRepository(db).touch(scope, session.projectId);

          send({
            type: 'complete',
            specFileId: outcome.specFileId,
            revisionNumber: outcome.revisionNumber,
          });
        } else {
          // Sanitised on purpose: no provider name, no vendor payload, no stack (FR-018 AC-7).
          send({
            type: 'error',
            code: outcome.code,
            message: 'Generation did not complete. Your answers and approved specs are safe.',
            retryable: true,
          });
        }
      } catch {
        send({
          type: 'error',
          code: 'GENERATION_FAILED',
          message: 'Generation did not complete. Your answers and approved specs are safe.',
          retryable: true,
        });
      } finally {
        open = false;
        controller.close();
      }
    },

    cancel() {
      // The browser went away mid-generation. Stop the provider call rather than paying for output
      // nobody will read; the run row and its chunks stay, and the client resumes against them.
      abort.abort(new Error('client disconnected'));
    },
  });

  return new Response(body, {
    status: 200,
    headers: {
      'content-type': GENERATION_STREAM_CONTENT_TYPE,
      'cache-control': 'no-store, no-transform',
      // Proxies that buffer would defeat streaming entirely (A5; NFR-002).
      'x-accel-buffering': 'no',
    },
  });
}
