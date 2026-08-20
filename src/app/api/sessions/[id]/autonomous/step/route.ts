import { randomUUID } from 'node:crypto';

import { getEnv } from '@/config/env';
import { getDatabase } from '@/db/client';
import { AllProvidersFailedError } from '@/modules/adapters/llm';
import { createDefaultAdapter } from '@/modules/adapters/llm/default-adapter';
import { createDriverAgent } from '@/modules/agents/autonomous/driver-agent';
import { resolveAnswers, resolveSelectedItems } from '@/modules/agents/autonomous/driver-draft';
import { nextMove, type AutonomousMove } from '@/modules/agents/autonomous/policy';
import type { AutonomousStepOutcome, AutonomousStopReason } from '@/modules/projects/autonomy';
import { currentOwnerScope } from '@/modules/projects/auth/scope';
import { createAutonomousRunRepository } from '@/modules/projects/repositories/autonomous-runs';
import { createSessionMessageRepository } from '@/modules/projects/repositories/session-messages';
import { createInterviewRepository } from '@/modules/projects/repositories/interview';
import {
  createSessionRepository,
  type OwnedSession,
} from '@/modules/projects/repositories/sessions';
import { errorResponse, jsonResponse } from '@/modules/web/api/responses';
import { serverT } from '@/modules/web/i18n/server-locale';
import { stageLabel } from '@/modules/web/session/stage-display';
import { createWorkflowStateRepository } from '@/modules/workflow/repositories/workflow-state';

import {
  dispatchAnswers,
  dispatchApprove,
  dispatchAskRound,
  dispatchAwaitGeneration,
  dispatchGenerate,
  dispatchReviewDecision,
  dispatchTransition,
  RUN_STOPPED,
  type DispatchOutcome,
} from '../dispatch';
import { assembleDriverContext, type DriverContext } from '../situation';

/**
 * `POST /api/sessions/:id/autonomous/step` — **one** move of an autonomous run (task 145; А-7).
 *
 * One move per request, and the whole design follows from that choice.
 *
 * *Why not a loop inside one request?* Because sovereignty has to be cheap. A run that lived inside a
 * single long request would have to be interrupted to be stopped, and «interrupt» is exactly what
 * this product refuses to make anyone rely on: `Stop` here does not race a socket, it writes a row,
 * and the next step reads it. The AC's «Stop mid-run converts to manual cleanly» is then a property
 * of ordinary bookkeeping rather than of cancellation working. It also makes the run *watchable* —
 * between two steps the page has re-read the feed, so a person sees the session move.
 *
 * *What makes a step atomic?* **Two guards, and both are needed.**
 *
 * The first is `recordStep`, which claims the run's `version` before any work begins. It counts the
 * step against the budget and refuses a tick holding a stale read.
 *
 * It is deliberately **not** a lease, and the distinction is worth stating because a comment
 * claiming otherwise would be believed: two browser tabs on one session can both tick, both call a
 * model, and both dispatch. What stops that from writing anything twice is not this row — it is the
 * endpoints, every one of which already arbitrates two humans doing the same thing at once
 * (`pending_action` on a round, `version` on a transition, `decision IS NULL` on a board, the
 * one-run-per-session guard on a generation). The driver is another user, so it is refused the same
 * way, and the losing step reports a move that did not land. A lease here would add a timeout to
 * guess at, and would be a second answer to a question the machine already answers.
 *
 * The second is `stillRunning`, checked immediately before the move is dispatched and after the
 * model call that prepared it. The first guard alone is not enough, and the red-team pass proved it
 * rather than argued it: a step claims its turn, spends a minute inside a model call, and a `Stop`
 * pressed during that minute arrives *after* the claim — so the claim cannot see it, and the move
 * lands on a session the person has already taken back. The second guard closes exactly that window,
 * and it is why every branch of `perform` routes its dispatch through `guarded` rather than calling
 * a `dispatchX` directly: a branch that forgot would be visible as the one that did not.
 *
 * What remains, and is named rather than hidden: a **generation already streaming** when Stop is
 * pressed finishes writing. Its chunks are durable and its revision is the session's own work
 * (P5), and the manual surface owns it from that moment with its own `Stop` — the same control it
 * would have had if a person had started it.
 *
 * *Where is the model?* Inside two moves and nowhere else. `nextMove` is a pure function of
 * persisted facts and it alone decides what happens; the driver agent is asked only which options to
 * tick and which advisory findings to keep, and both answers are intersected with what was on screen
 * before they are sent. Constitution P1 is therefore satisfied in the strong direction: no prompt in
 * this milestone asks a model what to do next.
 */
interface StepReport {
  /** The move this step chose. */
  kind: AutonomousMove['kind'];
  /** Whether the move landed. */
  moved: boolean;
  /** True when the run is over. */
  done: boolean;
  stopReason: AutonomousStopReason | null;
  /** Steps taken so far, so a caller can see progress without a second read. */
  steps: number;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const scope = await currentOwnerScope();
  if (scope === null) return errorResponse('UNAUTHENTICATED');

  const { id: sessionId } = await params;
  const db = getDatabase();

  const session = await createSessionRepository(db).findById(scope, sessionId);
  if (session === null) return errorResponse('NOT_FOUND');

  const runs = createAutonomousRunRepository(db);
  const run = await runs.findLive(session.id);
  /*
   * No live run is not an error and must not read as one: it is the ordinary state of a session
   * whose driver has stopped, and the page ticks one more time after pressing Stop. Answering with a
   * finished report rather than a 409 is what lets the ticker end quietly.
   */
  if (run === null) return jsonResponse(report('stop', false, true, null, 0));

  const context = await assembleDriverContext(db, scope, session, run);
  if (context === null) return errorResponse('NOT_FOUND');

  const move = nextMove(context.situation);
  const t = await serverT();

  if (move.kind === 'stop') {
    await stopRun(db, session, run.id, move.reason, t);
    return jsonResponse(report(move.kind, false, true, move.reason, run.steps));
  }

  /* The first guard: everything above this line is a read, and this is where the step is counted. */
  const claimed = await runs.recordStep({
    runId: run.id,
    expectedVersion: run.version,
    fingerprint: context.fingerprint,
    idleSteps: context.situation.idleSteps,
  });

  if (claimed === null) return errorResponse('CONFLICT');

  /*
   * **The claim is a promise to move; this is where the promise is kept** (task 170).
   *
   * Every exit below sets it and the `finally` writes it, so «how did that step end?» is answered in
   * one place rather than at six returns. The value that matters most is the one nobody writes: a
   * process killed between the claim above and the settle below leaves `step_outcome` null, and that
   * is exactly how the next boot tells a restart from a loop — see `situation.ts`.
   */
  let settlement: AutonomousStepOutcome = 'refused';
  const origin = new URL(request.url).origin;

  try {
    /*
     * The second guard, as a closure so `perform` cannot be called without one. It re-reads the run
     * rather than trusting the claim: between the claim and this line lies the model call, which is
     * where a person presses Stop.
     */
    const stillRunning = async (): Promise<boolean> => {
      const live = await runs.findLive(session.id);
      return live !== null && live.id === run.id;
    };

    let outcome: DispatchOutcome;
    let note: string | null;

    try {
      const performed = await perform(db, session, context, move, origin, t, stillRunning);
      outcome = performed.outcome;
      note = performed.note;
    } catch (error) {
      /*
       * An exhausted provider chain is a normal event in the life of a session (FR-018, Д-6), and
       * for an autonomous run it is a named ending rather than a 500: the person comes back to a
       * session that says the model could not answer, standing exactly where it stopped.
       */
      if (!(error instanceof AllProvidersFailedError)) throw error;

      await stopRun(db, session, run.id, 'provider-failed', t);
      return jsonResponse(report(move.kind, false, true, 'provider-failed', claimed.steps));
    }

    /*
     * The move was prepared and abandoned: the run was stopped while it was being prepared. Nothing
     * was sent, so there is nothing to say about it — and in particular no note, because a note
     * about an act that did not happen is worse than silence. The ending is already in the feed,
     * written by whoever stopped the run.
     */
    if (outcome.code === RUN_STOPPED.code) {
      const stopped = await runs.findById(run.id);
      return jsonResponse(
        report(move.kind, false, true, stopped?.stopReason ?? null, claimed.steps),
      );
    }

    if (note !== null) await appendDriverNote(db, session.id, note);

    if (outcome.ok) {
      settlement = 'landed';
      return jsonResponse(report(move.kind, true, false, null, claimed.steps));
    }

    /*
     * An ask that produced no round is neither a landing nor a loop, and it is settled as itself so
     * the loop detector leaves it alone and its own budget bounds it (task 170).
     */
    if (outcome.code === 'NO_ROUND_TO_ASK') settlement = 'fruitless-ask';

    /*
     * A lost race is worth another tick; a refusal is an ending. The distinction is the endpoint's
     * own code, never the status, because 409 covers both (`dispatch.ts` reads it).
     */
    if (outcome.retryable) {
      return jsonResponse(report(move.kind, false, false, null, claimed.steps));
    }

    const reason = endingFor(outcome);
    await stopRun(db, session, run.id, reason, t);

    return jsonResponse(report(move.kind, false, true, reason, claimed.steps));
  } finally {
    await runs.settleStep(run.id, settlement);
  }
}

function report(
  kind: AutonomousMove['kind'],
  moved: boolean,
  done: boolean,
  stopReason: AutonomousStopReason | null,
  steps: number,
): StepReport {
  return { kind, moved, done, stopReason, steps };
}

/**
 * Which named ending a refusal is.
 *
 * Only two codes carry their own meaning here — a model that could not draft, and a rewrite budget
 * that is spent — and everything else is the machine's gate saying no, which is one honest answer
 * rather than nine. Guessing finer distinctions from an error code would put words in the gate's
 * mouth.
 */
function endingFor(outcome: DispatchOutcome): AutonomousStopReason {
  if (outcome.code === 'GENERATION_FAILED' || outcome.code === 'DRAFT_INVALID') {
    return 'provider-failed';
  }

  /*
   * The gate's own reason, not the endpoint's code. `GATE_REJECTED` covers both the spent rewrite
   * budget and every other refusal the review decision can raise (a transition rejected after the
   * decision is already persisted, for one), and reporting the second as the first would tell the
   * reader a budget ran out that did not.
   */
  if (outcome.reason === 'REVISION_LIMIT_REACHED') return 'revision-budget';

  /*
   * The interviewer has nothing left to ask and the door is still shut. That is the fallback panel's
   * state — the one where a person supplies what the model could not extract — reached from the
   * other side, so it gets the same ending the policy gives it rather than «the step was refused».
   */
  if (outcome.code === 'NO_ROUND_TO_ASK' || outcome.code === 'ROUND_LIMIT_REACHED') {
    return 'needs-unanswered';
  }

  return 'gate-refused';
}

/** The one place a run ends: the row is stopped, and the feed is told why in one sentence. */
async function stopRun(
  db: ReturnType<typeof getDatabase>,
  session: { id: string },
  runId: string,
  reason: AutonomousStopReason,
  t: Awaited<ReturnType<typeof serverT>>,
): Promise<void> {
  const stopped = await createAutonomousRunRepository(db).stop(runId, reason);
  /*
   * Only the call that actually ended the run writes the note. A Stop press and a step finishing at
   * the same moment race here, and exactly one of them matched a live row — the other finds `ended`
   * false and says nothing, so the feed carries one ending rather than two.
   */
  if (stopped?.ended !== true) return;

  await appendDriverNote(
    db,
    session.id,
    reason === 'step-budget'
      ? t('feed.driver.stop.step-budget', { count: getEnv().MAX_AUTONOMOUS_STEPS })
      : t(STOP_PHRASE[reason]),
  );
}

const STOP_PHRASE = {
  completed: 'feed.driver.stop.completed',
  'stopped-by-user': 'feed.driver.stop.stopped-by-user',
  'seed-too-thin': 'feed.driver.stop.seed-too-thin',
  'needs-unanswered': 'feed.driver.stop.needs-unanswered',
  'revision-budget': 'feed.driver.stop.revision-budget',
  'step-budget': 'feed.driver.stop.step-budget',
  stalled: 'feed.driver.stop.stalled',
  'gate-refused': 'feed.driver.stop.gate-refused',
  'provider-failed': 'feed.driver.stop.provider-failed',
  'human-decision-pending': 'feed.driver.stop.human-decision-pending',
} as const satisfies Record<AutonomousStopReason, `feed.driver.stop.${string}`>;

/**
 * Appends the driver's account of what it just did.
 *
 * Stamped with the position **as it stands after the move**, which is the same rule every other
 * message row follows: `stage`/`substage` record where a message was written, and the driver's note
 * is written at the position the move left the session in. Read fresh rather than carried from the
 * situation, because half the moves change it.
 */
async function appendDriverNote(
  db: ReturnType<typeof getDatabase>,
  sessionId: string,
  body: string,
): Promise<void> {
  const state = await createWorkflowStateRepository(db).find(sessionId);
  if (state === null) return;

  await createSessionMessageRepository(db).append({
    sessionId,
    role: 'assistant',
    origin: 'driver',
    stage: state.stage,
    substage: state.substage,
    body,
  });
}

/** Carries out one move and, where the move is an answer or a decision, the line that explains it. */
async function perform(
  db: ReturnType<typeof getDatabase>,
  session: OwnedSession,
  context: DriverContext,
  move: Exclude<AutonomousMove, { kind: 'stop' }>,
  origin: string,
  t: Awaited<ReturnType<typeof serverT>>,
  stillRunning: StillRunning,
): Promise<{ outcome: DispatchOutcome; note: string | null }> {
  switch (move.kind) {
    case 'ask-round':
      return {
        outcome: await guarded(stillRunning, () => dispatchAskRound(origin, session.id)),
        note: null,
      };

    case 'await-generation':
      return {
        outcome: await guarded(stillRunning, () => dispatchAwaitGeneration(origin, move.runId)),
        note: null,
      };

    case 'generate':
      return {
        outcome: await guarded(stillRunning, () => dispatchGenerate(origin, session.id)),
        note: null,
      };

    case 'proceed':
      return {
        outcome: await guarded(stillRunning, () =>
          dispatchTransition(origin, session.id, move.toStage, move.toSubstage),
        ),
        note: null,
      };

    case 'approve-spec': {
      const outcome = await guarded(stillRunning, () =>
        dispatchApprove(origin, move.specFileId, move.revisionNumber),
      );
      if (!outcome.ok) return { outcome, note: null };

      return {
        outcome,
        note: t('feed.driver.approved', {
          document: stageLabel(t, context.position.stage, session.methodologyId, null),
          revision: move.revisionNumber,
        }),
      };
    }

    case 'answer-round':
      return answerRound(db, session, context, move.roundId, origin, t, stillRunning);

    case 'decide-review':
      return decideReview(db, session, context, move, origin, t, stillRunning);
  }
}

/** Whether the run this step belongs to is still the session's live one. */
type StillRunning = () => Promise<boolean>;

/**
 * The one place a move is sent.
 *
 * Every branch of `perform` goes through here, so «nothing is dispatched after Stop» is a property
 * of one function rather than of eight remembered checks.
 */
async function guarded(
  stillRunning: StillRunning,
  send: () => Promise<DispatchOutcome>,
): Promise<DispatchOutcome> {
  if (!(await stillRunning())) return RUN_STOPPED;

  return send();
}

async function answerRound(
  db: ReturnType<typeof getDatabase>,
  session: OwnedSession,
  context: DriverContext,
  roundId: string,
  origin: string,
  t: Awaited<ReturnType<typeof serverT>>,
  stillRunning: StillRunning,
): Promise<{ outcome: DispatchOutcome; note: string | null }> {
  const round = context.round;
  /*
   * The card said a round is pending and the row is gone or unreadable. Retryable rather than fatal:
   * the next tick re-reads, and `findPendingDecision` will have moved on.
   */
  if (round === null || round.questions.length === 0) {
    return { outcome: { ok: false, code: 'CONFLICT', reason: null, retryable: true }, note: null };
  }

  const agent = createDriverAgent(createDefaultAdapter(undefined, { modelId: session.modelId }));
  const drafted = await agent.answerRound({
    seed: session.initialPrompt,
    summary: session.summary,
    stage: stageLabel(t, context.position.stage, session.methodologyId, context.position.substage),
    questions: round.questions,
    contentLanguage: session.contentLanguage,
    runId: randomUUID(),
  });

  if (drafted.kind === 'draft-invalid') {
    return {
      outcome: { ok: false, code: 'DRAFT_INVALID', reason: null, retryable: false },
      note: null,
    };
  }

  const resolved = resolveAnswers(round.questions, drafted.draft);
  const outcome = await guarded(stillRunning, () =>
    dispatchAnswers(origin, session.id, { roundId, answers: resolved.answers }),
  );

  if (!outcome.ok) return { outcome, note: null };

  const roundNumber = await roundNumberOf(db, roundId);
  /*
   * Two admissions, because there are two different things to admit: the driver took the option the
   * round recommends, or it took the first one because the round recommended none. A run in which
   * every fallback was positional says so.
   */
  const positional = resolved.fallbacks - resolved.recommendedFallbacks;
  const fallbackClause =
    resolved.fallbacks === 0
      ? ''
      : positional === 0
        ? t('feed.driver.answered-fallback', { count: resolved.fallbacks })
        : t('feed.driver.answered-fallback-first', { count: resolved.fallbacks });

  const note =
    t('feed.driver.answered', { round: roundNumber, reason: drafted.draft.rationale }) +
    fallbackClause;

  return { outcome, note };
}

async function decideReview(
  db: ReturnType<typeof getDatabase>,
  session: OwnedSession,
  context: DriverContext,
  move: Extract<AutonomousMove, { kind: 'decide-review' }>,
  origin: string,
  t: Awaited<ReturnType<typeof serverT>>,
  stillRunning: StillRunning,
): Promise<{ outcome: DispatchOutcome; note: string | null }> {
  const board = context.board;
  if (board === null) {
    return { outcome: { ok: false, code: 'CONFLICT', reason: null, retryable: true }, note: null };
  }

  /*
   * What the reader calls this document, not what the column stores it as. `specType` is a slot slug
   * — `constitution`, `solution` — and no card, path or ZIP entry in the product prints it: a
   * SpecKit session calls the same slot «Specify», and a Russian interface calls it «Требования».
   */
  const document = stageLabel(t, board.specType, session.methodologyId, null);

  if (move.decision === 'accept') {
    const outcome = await guarded(stillRunning, () =>
      dispatchReviewDecision(origin, move.reviewId, 'accept', []),
    );
    if (!outcome.ok) return { outcome, note: null };

    /*
     * Two different events wearing one decision. A board with nothing blocking is accepted because
     * it passed; a board still asking for changes is accepted because the file has no rewrites left,
     * and saying «nothing blocking» over it would be the driver misreporting its own reason.
     */
    const note =
      board.blocking.length === 0
        ? t('feed.driver.review-accepted', { document })
        : t('feed.driver.review-accepted-budget', {
            document,
            count: getEnv().MAX_REVISION_CYCLES_PER_STAGE,
          });

    return { outcome, note };
  }

  const agent = createDriverAgent(createDefaultAdapter(undefined, { modelId: session.modelId }));
  const drafted = await agent.selectFindings({
    seed: session.initialPrompt,
    specType: board.specType,
    blocking: board.blocking,
    advisory: board.advisory,
    contentLanguage: session.contentLanguage,
    runId: randomUUID(),
  });

  /*
   * A draft the model could not produce does not block the rewrite: the blocking findings were
   * always going in, and «which optional points to add» is the only thing that was open. An empty
   * selection is a real answer, so an unusable one degrades to it rather than ending the run.
   */
  const keepIds = drafted.kind === 'draft' ? drafted.draft.keepIds : [];
  const rationale =
    drafted.kind === 'draft' ? drafted.draft.rationale : t('feed.driver.no-selection');

  const selected = resolveSelectedItems(
    board.blocking.map((item) => item.id),
    board.advisory.map((item) => item.id),
    keepIds,
  );

  const outcome = await guarded(stillRunning, () =>
    dispatchReviewDecision(origin, move.reviewId, 'request_changes', selected),
  );

  if (!outcome.ok) return { outcome, note: null };

  return {
    outcome,
    note: t('feed.driver.review-changes', {
      document,
      count: selected.length,
      reason: rationale,
    }),
  };
}

/** The round's own number, for the note. A failure to read it is not worth failing the step over. */
async function roundNumberOf(db: ReturnType<typeof getDatabase>, roundId: string): Promise<number> {
  const round = await createInterviewRepository(db).findRoundById(roundId);
  return round?.roundNumber ?? 1;
}
