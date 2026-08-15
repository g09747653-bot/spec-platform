import { getEnv } from '@/config/env';
import { getDatabase } from '@/db/client';
import type { OwnerScope } from '@/db/owner-scope';
import {
  createGenerationStore,
  type GenerationStore,
  type LlmAdapter,
} from '@/modules/adapters/llm';
import { createDefaultAdapter } from '@/modules/adapters/llm/default-adapter';
import type { EditDocument } from '@/modules/agents/edit/edit-agent';
import { runEdit } from '@/modules/agents/edit/run-edit';
import { createDefaultResearch } from '@/modules/adapters/research';
import {
  assembleContext,
  selectedFeedback,
  type ContextFeedback,
} from '@/modules/agents/context-assembler';
import { performResearch } from '@/modules/agents/spec/research-step';
import { reviseInstruction } from '@/modules/agents/revision/revision-agent';
import { createRevisionNoteAgent } from '@/modules/agents/revision/revision-note';
import { collectContextSources } from '@/modules/agents/spec/collect-context';
import { runGeneration } from '@/modules/agents/spec/run-generation';
import { targetSpecType } from '@/modules/agents/spec/target-spec-type';
import { methodologyConfig, stageOf } from '@/modules/methodologies';
import { currentOwnerScope } from '@/modules/projects/auth/scope';
import { referenceOptionId, REFERENCE_QUESTION_ID } from '@/modules/projects/create-chat';
import { createInterviewRepository } from '@/modules/projects/repositories/interview';
import { createProjectRepository } from '@/modules/projects/repositories/projects';
import {
  createSessionRepository,
  type OwnedSession,
} from '@/modules/projects/repositories/sessions';
import type { SpecType } from '@/modules/specs/model/spec-files';
import { createReviewRepository } from '@/modules/specs/repositories/reviews';
import { createRevisionRepository } from '@/modules/specs/repositories/revisions';
import { createSpecFileRepository } from '@/modules/specs/repositories/spec-files';
import { applyTransition } from '@/modules/workflow/apply-transition';
import { registeredCapabilityIds } from '@/modules/workflow/capabilities';
import { isSpecStage, type AskingStage } from '@/modules/workflow/model/stages';
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

/**
 * Writes the writer's paragraph onto the board whose decision it explains (task 113).
 *
 * Everything it needs is already resolved by the caller except the board itself, which it finds the
 * same way the context did: the request-changes review standing on this file's latest revision. The
 * whole function is best-effort by construction — every failure path returns rather than throws, so
 * a revision is never lost to a paragraph about it.
 */
async function writeRevisionNote(input: {
  db: ReturnType<typeof getDatabase>;
  scope: OwnerScope;
  adapter: LlmAdapter;
  projectId: string;
  specType: SpecType;
  contentLanguage: string | null;
  points: readonly ContextFeedback[];
  runId: string;
}): Promise<void> {
  try {
    const file = await createSpecFileRepository(input.db).findByProjectAndType(
      input.scope,
      input.projectId,
      input.specType,
    );
    if (file === null) return;

    const reviews = createReviewRepository(input.db);
    const board = await reviews.requestedChangesForFile(input.scope, file.id);
    if (board?.revisionNote !== null) return;

    const current = await createRevisionRepository(input.db).latestApproved(file.id);
    if (current === null) return;

    const note = await createRevisionNoteAgent(input.adapter).note({
      specType: input.specType,
      points: input.points,
      specContent: current.content,
      contentLanguage: input.contentLanguage,
      runId: input.runId,
    });

    if (note !== '') await reviews.noteRevision(board.id, note);
  } catch (error) {
    // Server-side only, and never fatal: the revision is the work, the paragraph is the account
    // of it (FR-018 AC-7 — nothing here reaches the browser).
    console.warn('revision note not produced', { specType: input.specType, error });
  }
}

/**
 * The Review step of an Edit chat: propose, do not write (task 118).
 *
 * Three reads decide what the model is asked, and all three come from persisted state:
 *
 * - **which documents** — the option ids the Reference round recorded, resolved back to spec files
 *   through the bundle plan of the chat that produced them;
 * - **what to change** — the words the user wrote at Describe;
 * - **the current text** — the newest *approved* revision of each referenced file, which is the same
 *   text the Reference step required to exist.
 *
 * The stream carries the same events a spec generation does, so the card, the counter and the stop
 * control on the page are the ones that already exist. What it never carries is a `complete` with a
 * revision number, because no revision was written: the answer is a batch of proposals, and the
 * user decides on it.
 */
async function editReview(
  db: ReturnType<typeof getDatabase>,
  scope: OwnerScope,
  session: OwnedSession,
  stage: AskingStage,
  store: GenerationStore,
): Promise<Response> {
  const referenced = await referencedDocuments(db, scope, session);
  const instruction = await describedChange(db, session, stage);

  /*
   * Both refusals are gate-shaped rather than generation-shaped: nothing has been asked of a model,
   * and the answer names the step that is missing. A chat that reached `generate` without a
   * described change got there by a backward step, which is legal and recoverable.
   */
  if (referenced.length === 0) {
    return errorResponse('GATE_REJECTED', { reason: 'INTERVIEW_INCOMPLETE' });
  }
  if (instruction === null) {
    return errorResponse('GATE_REJECTED', { reason: 'NO_ANSWERED_ROUND' });
  }

  const run = await store.createRun(session.id, stage);
  const encoder = new TextEncoder();

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;

      const send = (event: GenerationEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(encodeEvent(event)));
        } catch {
          open = false;
        }
      };

      send({ type: 'run', runId: run.id, stage, attempt: 1 });

      try {
        const outcome = await runEdit({
          db,
          scope,
          adapter: createDefaultAdapter(undefined, { modelId: session.modelId }),
          store,
          runId: run.id,
          documents: referenced,
          instruction,
          contentLanguage: session.contentLanguage,
        });

        switch (outcome.status) {
          case 'proposed':
            await createProjectRepository(db).touch(scope, session.projectId);
            send({ type: 'complete', specFileId: run.id, revisionNumber: outcome.files.length });
            break;
          case 'no-change':
            send({
              type: 'error',
              code: 'NO_CHANGE',
              message:
                'Nothing in the referenced documents needed to change for that request. Describe the change differently, or reference another document.',
              retryable: true,
            });
            break;
          case 'failed':
            send({
              type: 'error',
              code: outcome.code,
              message: outcome.overloaded
                ? 'The service is busy right now. Nothing has been lost — try again in a minute.'
                : 'The edit could not be prepared. Your bundle is untouched.',
              retryable: true,
            });
            break;
        }
      } catch {
        send({
          type: 'error',
          code: 'GENERATION_FAILED',
          message: 'The edit could not be prepared. Your bundle is untouched.',
          retryable: true,
        });
      } finally {
        open = false;
        try {
          controller.close();
        } catch {
          // Already cancelled by a client that went away.
        }
      }
    },

    // Round 4, Р-2: a dropped reader is not an abandoned run. Same contract as a spec generation —
    // deliberately empty, because `send` stops writing on its own once the stream is gone.
    cancel() {
      return undefined;
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

/**
 * The documents an Edit chat referenced, with the text an edit would be based on.
 *
 * Resolved from the Reference round's answers rather than from a column, because the answers *are*
 * the record of the pick (task 118). The option ids were derived from file names, so the bundle plan
 * of the chat that produced the bundle maps them back to storage slots — the same plan the export
 * and the sidebar read, so all three agree on what `plan.md` means.
 */
async function referencedDocuments(
  db: ReturnType<typeof getDatabase>,
  scope: OwnerScope,
  session: OwnedSession,
): Promise<(EditDocument & { specFileId: string })[]> {
  const rounds = await createInterviewRepository(db).roundHistory(session.id);
  const reference = rounds.find((round) => round.stage === 'interview');
  if (reference === undefined) return [];

  const selected = new Set(
    reference.answers.flatMap((answer) =>
      answer.questionId === REFERENCE_QUESTION_ID ? answer.selectedOptionIds : [],
    ),
  );
  if (selected.size === 0) return [];

  const project = await createProjectRepository(db).findById(scope, session.projectId);
  if (project === null) return [];

  const config = methodologyConfig(project.methodologyId);
  const nameOf = new Map(
    config.stages.flatMap((entry) =>
      entry.document === null ? [] : [[entry.document.specType, entry.document.fileName] as const],
    ),
  );

  const approved = await createSpecFileRepository(db).approvedFiles(scope, session.projectId);

  return approved.flatMap((file) => {
    const fileName = nameOf.get(file.specType) ?? `${file.specType}.md`;
    if (!selected.has(referenceOptionId(fileName))) return [];

    return [{ specFileId: file.specFileId, fileName, content: file.content }];
  });
}

/** What the user asked for at Describe: the free text of the working stage's newest answered round. */
async function describedChange(
  db: ReturnType<typeof getDatabase>,
  session: OwnedSession,
  stage: AskingStage,
): Promise<string | null> {
  const rounds = await createInterviewRepository(db).roundHistory(session.id);

  const described = rounds
    .filter((round) => round.stage === stage)
    .flatMap((round) => round.answers)
    .map((answer) => answer.freeText?.trim() ?? '')
    .filter((text) => text !== '');

  return described[described.length - 1] ?? null;
}

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

  /*
   * Which document this stage writes, according to the session's methodology (task 117).
   *
   * `null` for the parity workflow — its documents declare `parity` structure, so the prompt and the
   * structural check are literally the paths M3 built. For a foreign methodology it carries the
   * template, the label and the section list together, so the writer is shown the shape it will be
   * judged against.
   */
  const methodology = methodologyConfig(session.methodologyId);
  const stageEntry = stageOf(methodology, stage);
  const document = stageEntry?.document ?? null;
  const documentLabel = methodology.steps.find((step) => step.stage === stage)?.label ?? specType;

  const store = createGenerationStore(db);

  /*
   * One generation per session at a time (round 5, Р-3; the M6 resume rule's "no duplicates").
   *
   * Since round 4 a run outlives the client that started it, so "nobody is reading it" stopped
   * meaning "it is not happening" — and this endpoint had no other idea of whether it was. A page
   * that offered Generate over a run already in flight therefore started a **second** run of the
   * same stage, and two generations racing to write the same file is a correctness defect, not a
   * wasted call. The page now reattaches instead of offering the button (D-99), but the guard
   * belongs here regardless: the invariant must not depend on every client knowing better.
   *
   * Answered as a stream error rather than a status code, because that is what this endpoint's
   * client reads: `retryable` is true, and the retry works the moment the run in flight ends.
   */
  const inFlight = await store.activeRunForSession(session.id);

  if (inFlight !== null) {
    return new Response(
      encodeEvent({
        type: 'error',
        code: 'GENERATION_IN_FLIGHT',
        message:
          'A generation for this stage is already running. Reload the page to follow it — nothing is lost.',
        retryable: true,
      }),
      { status: 200, headers: { 'content-type': GENERATION_STREAM_CONTENT_TYPE } },
    );
  }

  /*
   * An Edit chat's Review step (task 118).
   *
   * It shares this endpoint deliberately: from the workflow's point of view it is the same movement
   * — `collect → generate`, past the same gate, subject to the same one-run-at-a-time rule above,
   * answered on the same stream. What differs is entirely what the run *produces*: a spec run writes
   * a revision, an edit run writes a batch of proposals and no revision at all. Branching after the
   * guards rather than before them is what keeps that sentence true.
   */
  if (methodology.chatClass === 'edit') {
    return editReview(db, scope, session, stage, store);
  }

  // Assembled before the stream opens, so a context that cannot be read is an error the client gets
  // as a status code rather than as a half-written document (FR-008 AC-6).
  //
  // Passing `specType` is what makes this a *revision* when the review board sent the stage back:
  // the sources then carry the review's items and the user's selection, and the assembler includes
  // only the ticked ones (task 57; FR-010 AC-6/AC-7).
  const collected = await collectContextSources(db, scope, {
    sessionId: session.id,
    projectId: session.projectId,
    initialPrompt: session.initialPrompt,
    specType,
  });
  const { sources } = collected;
  const applied = sources.feedback === undefined ? [] : selectedFeedback(sources.feedback);

  const run = await store.createRun(session.id, stage);

  const adapter = createDefaultAdapter(undefined, { modelId: session.modelId });

  const encoder = new TextEncoder();

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;

      const send = (event: GenerationEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(encodeEvent(event)));
        } catch {
          // The client is gone. Stop writing — and keep generating (see `cancel` below).
          open = false;
        }
      };

      // `run` is always first: it is what the client stores in order to resume (FR-017).
      send({ type: 'run', runId: run.id, stage, attempt: 1 });

      try {
        /*
         * The paragraph that precedes Rev N+1 (task 113; Эталон §1.3).
         *
         * **Inside the stream, after the `run` event**, and both halves of that placement are
         * deliberate. Not in `POST /api/reviews/:id/decision`, because a model call there would put
         * minutes of waiting behind a card with no counter and no way out — the Р-3 wall, rebuilt
         * (D-96). Not before the stream opens either, because a client waiting on headers has no
         * run id yet and therefore nothing to reconnect to; after the `run` event the durable path
         * is armed and a dropped read is a reconnect rather than a loss (Р-2; D-95).
         *
         * Persisted on the **board**, not on the revision: it explains which points were ticked and
         * what the writer settled about them, and at the moment it is written the revision does not
         * exist. The feed renders it at the decision it explains, above the document it precedes.
         *
         * A note that cannot be produced is not a failed generation. It is prose about work that
         * happens anyway — the same trade `ensureStageReview` makes for a board it could not draw.
         */
        if (applied.length > 0) {
          await writeRevisionNote({
            db,
            scope,
            adapter,
            projectId: session.projectId,
            specType,
            contentLanguage: session.contentLanguage,
            points: applied,
            runId: run.id,
          });
        }

        /*
         * Live research (task 70; FR-019).
         *
         * **Inside the open stream**, so the activity is visible while it happens (AC-2): the
         * `research` event has been in the protocol since M3 waiting for exactly this, and the
         * indicator it drives is what distinguishes "reading the web" from "writing the document".
         *
         * **Before the model call**, because what it finds belongs in the prompt. The base context
         * was assembled before the stream opened; this adds a section to it.
         *
         * **Inside the `try`**, deliberately. The adapter resolves every error to "no result", so in
         * principle nothing here can throw — but "in principle" is a promise about code that will be
         * edited later, and the enclosing `try`/`finally` is what makes it structural: any throw
         * becomes the same sanitised error event as a failed generation, and the stream still closes.
         */
        send({ type: 'research', status: 'started' });
        const found = await performResearch(createDefaultResearch(), {
          specType,
          initialPrompt: session.initialPrompt,
        });
        send({ type: 'research', status: 'finished' });

        const context = assembleContext(
          found.pages.length === 0 ? sources : { ...sources, research: found.pages },
        );

        const outcome = await runGeneration({
          db,
          adapter,
          store,
          runId: run.id,
          projectId: session.projectId,
          specType,
          document,
          documentLabel,
          initialPrompt: session.initialPrompt,
          // У-1: documents are written in the language the user described the product in (task 108).
          contentLanguage: session.contentLanguage,
          context: context.text,
          // What the prompt was built from, recorded on the revision this run writes (DR-12).
          contextAttachmentIds: collected.contextAttachmentIds,
          // And which chat wrote it (task 118): a project holds several now (А-6).
          sourceSessionId: session.id,
          ...(applied.length === 0 ? {} : { changeInstruction: reviseInstruction(applied.length) }),
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
          /*
           * The reason, where reasons are allowed to be read (round 3).
           *
           * `GenerationOutcome` documents `reason` as being "for the server's eyes… telling them
           * apart in a log is what makes a systematic prompt problem visible" — and nothing logged
           * it, so the field was computed and dropped. This round is what that cost: a live walk
           * failed at generation and the difference between "the chain gave up" and "the document
           * was missing a required section" had to be reconstructed from a timing and an absent
           * revision. Server-side only, so nothing here reaches a browser (FR-018 AC-7).
           */
          console.error('generation failed', {
            runId: run.id,
            stage,
            reason: outcome.reason,
            attempts: outcome.attempts,
            detail: outcome.detail,
          });

          /*
           * Sanitised on purpose: no provider name, no vendor payload, no stack (FR-018 AC-7).
           *
           * Two messages, though, because they ask for different things from the reader (round 2,
           * Д-5). "Something went wrong" invites a retry that will fail the same way; "the service
           * is busy" invites the one thing that actually helps — waiting a moment. The M6 gate walk
           * was told the first while living the second.
           */
          send({
            type: 'error',
            code: outcome.code,
            message:
              outcome.overloaded === true
                ? 'The service is busy right now. Nothing has been lost — try again in a minute.'
                : 'Generation did not complete. Your answers and approved specs are safe.',
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
        try {
          controller.close();
        } catch {
          // Already cancelled by a client that went away. Closing a closed stream is not an event.
        }
      }
    },

    /**
     * The browser went away mid-generation — and the run carries on regardless (round 4, Р-2; D-95).
     *
     * It used to abort the provider call here, on the reasoning that nobody should pay for output
     * nobody will read. That reasoning had a hole the M6 gate fell into: the reader drops a
     * connection that has been silent for its idle deadline, which is a *reconnect*, not an
     * abandonment — so the abort killed the generation the client was still waiting for, the run
     * stayed `running` for ever with no producer behind it, and every reconnect found nothing.
     * Local models, whose first token can be a minute away, hit it on every long generation.
     *
     * So a dropped read is now what it always claimed to be: the run streams to its natural end,
     * validates, persists its revision and marks itself `complete` or `failed`. A reconnecting
     * reader finds a live producer; a tab closed for good still leaves the revision on the page it
     * comes back to (P5). Nothing runs unbounded — the chain's own budget
     * (`LLM_REQUEST_TIMEOUT_MS` per provider, times the chain) ends it either way, which is why
     * this needs no timer of its own.
     */
    cancel() {
      // Deliberately empty: `send` stops writing on its own once the stream is gone.
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
