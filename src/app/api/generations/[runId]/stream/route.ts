import { getDatabase } from '@/db/client';
import { createGenerationStore } from '@/modules/adapters/llm';
import { currentOwnerScope } from '@/modules/projects/auth/scope';
import { createSpecFileRepository } from '@/modules/specs/repositories/spec-files';
import { createRevisionRepository } from '@/modules/specs/repositories/revisions';
import { isCoreSpecType } from '@/modules/specs/model/spec-files';
import { withHeartbeat } from '@/modules/web/api/heartbeat';
import { errorResponse } from '@/modules/web/api/responses';
import {
  encodeEvent,
  GENERATION_STREAM_CONTENT_TYPE,
  type GenerationEvent,
} from '@/modules/web/api/stream-protocol';

/**
 * `GET /api/generations/:runId/stream?from=<seq>&attempt=<n>` — resume (task 47; FR-017; NFR-003
 * AC-3; SC-3, SC-5).
 *
 * **Ownership first, always.** The run is resolved through run → session → project → owner before a
 * single byte is replayed, so another user's `runId` is answered exactly as a `runId` that never
 * existed (NFR-005 AC-2; AR-2). Nothing about the run — not its stage, not its existence — is
 * observable to anyone else.
 *
 * **How "attach to the live stream" is implemented.** Generation runs inside one long-lived function
 * invocation (D-15), and a resume request is a *different* invocation, possibly on a different
 * machine. There is no in-memory stream to join, and the constitution rules out the worker tier or
 * queue that would provide one. The durable chunk log is the channel: this handler replays what the
 * client has not seen and then follows the log until the run leaves its running state. That is why the
 * log exists (D-7), and why batches are persisted before they are emitted — everything the client
 * rendered is already here, so a reconnect can neither miss text nor be handed it twice.
 *
 * **`(attempt, sequence)`, not `sequence`.** A failover resets sequences to zero, so a bare sequence
 * does not identify a position. A client resuming with an older attempt is told to discard what it has
 * rendered — the same `restart` it would have received had it stayed connected (D-9).
 */

/** Poll cadence, matched to the recorder's flush cadence: faster would mostly find nothing. */
const POLL_MS = 250;

/** Ceiling on how long one resume invocation follows a run before the client reconnects. */
const FOLLOW_LIMIT_MS = 5 * 60 * 1000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function GET(
  request: Request,
  { params }: { params: Promise<{ runId: string }> },
): Promise<Response> {
  const scope = await currentOwnerScope();
  if (scope === null) return errorResponse('UNAUTHENTICATED');

  const { runId } = await params;
  const db = getDatabase();
  const store = createGenerationStore(db);

  const run = await store.findRunForOwner(scope, runId);
  if (run === null) return errorResponse('NOT_FOUND');

  const url = new URL(request.url);
  const from = Number.parseInt(url.searchParams.get('from') ?? '-1', 10);
  const requestedAttempt = Number.parseInt(url.searchParams.get('attempt') ?? '1', 10);

  const cursorStart = Number.isFinite(from) && from >= 0 ? from : -1;
  const clientAttempt =
    Number.isFinite(requestedAttempt) && requestedAttempt >= 1 ? requestedAttempt : 1;

  const encoder = new TextEncoder();
  const abort = new AbortController();

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      /* Read through a function: `send` closes this from inside the loop, so a narrowed value from an
       * earlier line says nothing about its value now. */
      const isOpen = () => open;

      const emit = (event: GenerationEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(encodeEvent(event)));
        } catch {
          open = false;
        }
      };

      /*
       * A resume connection is silent for exactly as long as the run it is following is (round 5,
       * Р-4; А-9): the loop below polls the durable log every 250 ms and sends nothing at all while
       * there is nothing new in it. Without a heartbeat that is indistinguishable from a dead
       * socket, and the reader that reconnected here would drop this connection too — spending its
       * backoff ladder on a run that is producing perfectly well, just slowly.
       */
      const beat = withHeartbeat(emit);
      const send = beat.send;

      /**
       * The completed run's card.
       *
       * `generation_runs` records no revision id — the ERD deliberately does not link them — so the
       * card is resolved the way the page itself resolves it: the current revision of the file this
       * stage writes. A client that resumes long after a later regeneration therefore sees the
       * revision that is actually pending, which is the one it must decide on (FR-017 AC-4).
       */
      const sendComplete = async (): Promise<void> => {
        if (!isCoreSpecType(run.stage)) return;

        const specFile = await createSpecFileRepository(db).findByProjectAndType(
          scope,
          run.projectId,
          run.stage,
        );
        if (specFile === null) return;

        const revision = await createRevisionRepository(db).latest(specFile.id);
        if (revision === null) return;

        send({
          type: 'complete',
          specFileId: specFile.id,
          revisionNumber: revision.revisionNumber,
        });
      };

      try {
        let attempt = run.attempt;
        let cursor = cursorStart;

        send({ type: 'run', runId: run.id, stage: run.stage, attempt });

        // The client is reading an attempt that has since been abandoned: what it has on screen came
        // from a provider whose output was discarded, and none of it is coming back.
        if (attempt > clientAttempt) {
          send({ type: 'restart', reason: 'provider_failover', attempt });
          cursor = -1;
        }

        const deadline = Date.now() + FOLLOW_LIMIT_MS;

        for (;;) {
          for (const chunk of await store.chunksAfter(run.id, cursor)) {
            send({ type: 'delta', sequence: chunk.sequence, text: chunk.delta });
            cursor = chunk.sequence;
          }

          const state = await store.statusOf(run.id);

          if (state === null || state.status === 'complete') {
            await sendComplete();
            return;
          }

          if (state.status === 'failed') {
            send({
              type: 'error',
              code: 'GENERATION_FAILED',
              message: 'Generation did not complete. Your answers and approved specs are safe.',
              retryable: true,
            });
            return;
          }

          if (state.attempt > attempt) {
            attempt = state.attempt;
            send({ type: 'restart', reason: 'provider_failover', attempt });
            cursor = -1;
            continue;
          }

          if (!isOpen() || abort.signal.aborted || Date.now() >= deadline) return;

          await sleep(POLL_MS);
        }
      } finally {
        beat.stop();
        open = false;
        controller.close();
      }
    },

    cancel() {
      abort.abort();
    },
  });

  return new Response(body, {
    status: 200,
    headers: {
      'content-type': GENERATION_STREAM_CONTENT_TYPE,
      'cache-control': 'no-store, no-transform',
      'x-accel-buffering': 'no',
    },
  });
}
