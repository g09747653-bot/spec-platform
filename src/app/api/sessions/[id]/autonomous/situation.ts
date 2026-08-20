import { createHash } from 'node:crypto';

import { getEnv } from '@/config/env';
import type { SchemaDatabase } from '@/db';
import type { OwnerScope } from '@/db/owner-scope';
import { createGenerationStore } from '@/modules/adapters/llm';
import { methodologyConfig, stageOf } from '@/modules/methodologies';
import { countSeedWords, type AutonomousSituation } from '@/modules/agents/autonomous/policy';
import type { AutonomousRun } from '@/modules/projects/repositories/autonomous-runs';
import { createInterviewRepository } from '@/modules/projects/repositories/interview';
import type { OwnedSession } from '@/modules/projects/repositories/sessions';
import { findPendingDecision, type PendingDecision } from '@/modules/specs/pending-decision';
import { createRevisionRepository } from '@/modules/specs/repositories/revisions';
import {
  createReviewRepository,
  type StoredReviewItem,
} from '@/modules/specs/repositories/reviews';
import { createSpecFileRepository } from '@/modules/specs/repositories/spec-files';
import { canAskAnotherRound, evaluateTransition } from '@/modules/workflow/evaluate-transition';
import { isAskingStage } from '@/modules/workflow/model/stages';
import { nextPosition } from '@/modules/workflow/next-position';
import { pendingRoundId } from '@/modules/workflow/pending-action';
import { createWorkflowStateRepository } from '@/modules/workflow/repositories/workflow-state';
import { assembleWorkflowSnapshot } from '@/modules/workflow/snapshot-assembler';
import { registeredCapabilityIds } from '@/modules/workflow/capabilities';

/** One question of the round on screen, narrowed to what an answer needs. */
export interface DriverQuestionView {
  id: string;
  text: string;
  type: 'single' | 'multiple';
  options: readonly { id: string; label: string; recommended?: boolean | undefined }[];
}

/**
 * Everything the driver's policy reads, gathered from the same rows the page renders from
 * (task 145).
 *
 * The gathering is deliberately **the page's own reasoning, not a second one**: the asking stage,
 * the round budget, the forward door and its verdict are computed here exactly as
 * `app/(app)/sessions/[id]/page.tsx` computes them, from the same functions. That is what makes
 * «the driver presses the controls a person would press» a consequence rather than a promise — if
 * the two ever disagreed, the driver would be walking a session the page cannot show.
 *
 * What the snapshot cannot answer is fetched beside it, because the snapshot deliberately carries
 * none of it: the pending card, the run in flight, the rewrite a board asked for, and the number of
 * rewrites a file has already had.
 */
export interface DriverContext {
  situation: AutonomousSituation;
  /** Where the session stood when this context was read — what the driver's notes name. */
  position: { stage: string; substage: string | null };
  /** A digest of everything a move could change — the loop detector's whole input. */
  fingerprint: string;
  /** The round on screen, when there is one, with the ids the answer must come from. */
  round: { id: string; questions: readonly DriverQuestionView[] } | null;
  /** The board on screen, when there is one, split the way a decision needs it. */
  board: {
    id: string;
    specType: string;
    blocking: readonly StoredReviewItem[];
    advisory: readonly StoredReviewItem[];
  } | null;
}

/**
 * A stable digest of the session's observable state.
 *
 * Every field is something a move is supposed to change. That is the point: two consecutive steps
 * producing the same digest means the second one changed nothing a person could see, which is what
 * a runaway loop looks like from outside. Hashing rather than storing the tuple keeps the column
 * bounded, and `sha256` rather than a cheaper digest because a collision here would silently switch
 * the loop detector off.
 */
function fingerprintOf(parts: readonly (string | number | boolean | null)[]): string {
  return createHash('sha256')
    .update(parts.map((part) => String(part)).join('|'))
    .digest('hex');
}

export async function assembleDriverContext(
  db: SchemaDatabase,
  scope: OwnerScope,
  session: OwnedSession,
  run: AutonomousRun,
): Promise<DriverContext | null> {
  const env = getEnv();

  const assembled = await assembleWorkflowSnapshot(db, session.id, {
    roundBudget: env.MAX_ROUNDS_PER_STAGE,
    capabilities: registeredCapabilityIds(),
  });
  if (assembled === null) return null;

  const { snapshot } = assembled;
  const { position } = snapshot;

  const state = await createWorkflowStateRepository(db).find(session.id);
  if (state === null) return null;

  const specFiles = createSpecFileRepository(db);
  const reviews = createReviewRepository(db);

  /*
   * **The card in front of *this* chat**, which is not always the card `findPendingDecision` names.
   *
   * That function answers project-wide, deliberately and correctly for what it was built for: the
   * chat endpoint has to resolve a typed «approve» against whatever card the page is showing, and
   * since М9п a project can hold a Generate chat and an Edit chat at once. A driver is a different
   * question. It walks **one** session's graph, and the red-team pass showed what the project-wide
   * answer costs it: with an Edit chat open beside it, a driver at `constitution/generate` reads the
   * *other* chat's unapproved `tasks` draft as its own pending card, approves it, and decides a board
   * that belongs to a conversation it is not having.
   *
   * So the precedence is kept — a pending round, then a proposed change, then a board, then an
   * unapproved draft — and only the *scope* of the last two is narrowed to the file this position is
   * standing on. A proposal still stops the driver whoever it belongs to, which is the conservative
   * direction: refusing to decide someone's diff costs a stop, deciding it costs their change.
   */
  const stageFile =
    position.substage === null
      ? null
      : await specFiles.findByProjectAndType(scope, session.projectId, position.stage);

  const pending = await pendingForThisChat({
    db,
    scope,
    session,
    pendingRoundId: pendingRoundId(state.pendingAction),
    stageFile: stageFile === null ? null : { id: stageFile.id, fileName: stageFile.fileName },
    reviews,
  });

  const generationInFlight = await createGenerationStore(db).activeRunForSession(session.id);

  const askingStage =
    (position.stage === 'interview' || position.substage === 'collect') &&
    isAskingStage(position.stage)
      ? position.stage
      : null;

  const to = nextPosition(snapshot);
  const verdict = to === null ? null : evaluateTransition(snapshot, to);

  /*
   * Whether this position drafts a **document** at all.
   *
   * An Edit chat's working stage declares `document: null` — it produces proposed changes, not
   * revisions — and every «is the document approved?» question is therefore meaningless there. It is
   * worse than meaningless: `specApproved` is keyed by spec type and scoped to the *project*, so an
   * Edit chat over an existing bundle read the Generate chat's approved `constitution.md` as its own
   * finished work, skipped drafting entirely and sealed a session with nothing in it. Asking the
   * configuration first is what turns that into the right behaviour — the stage drafts, the driver
   * generates, the proposals it produces become a pending diff, and the diff is a person's to decide.
   */
  const producesDocument =
    position.substage !== null &&
    stageOf(methodologyConfig(session.methodologyId), position.stage)?.document != null;

  /*
   * The rewrite a board asked for, resolved as the **feed** resolves it and not as the project does:
   * a request-changes decision standing on the latest revision of *this stage's* file. The
   * project-wide reading (`currentFile`, the most recently revised file anywhere in the project) is
   * what the export and the viewer want; for a driver it means missing a rewrite its own stage owes
   * because another file was touched later, or redrafting an approved document because a different
   * one owes something. Both surfaces that render this apply the same `specType === position.stage`
   * clause; the driver had dropped it.
   */
  const owedBoard =
    stageFile === null || !producesDocument
      ? null
      : await reviews.requestedChangesForFile(scope, stageFile.id);

  let round: DriverContext['round'] = null;
  if (pending !== null && pending.kind === 'question-round') {
    const stored = await createInterviewRepository(db).findRoundById(pending.roundId);
    if (stored !== null) {
      round = { id: stored.id, questions: questionsOf(stored.questions) };
    }
  }

  let board: DriverContext['board'] = null;
  let pendingReview: Extract<AutonomousSituation['pending'], { kind: 'review' }> | null = null;

  if (pending !== null && pending.kind === 'review') {
    const stored = await reviews.findById(scope, pending.reviewId);
    if (stored !== null) {
      const blocking = stored.items.filter((item) => item.severity === 'blocking');
      const advisory = stored.items.filter((item) => item.severity !== 'blocking');
      const cyclesUsed = await reviews.countRequestedChanges(scope, stored.specFileId);

      board = { id: stored.id, specType: stored.specType, blocking, advisory };
      pendingReview = {
        kind: 'review',
        reviewId: stored.id,
        hasBlocking: blocking.length > 0,
        cyclesLeft: Math.max(env.MAX_REVISION_CYCLES_PER_STAGE - cyclesUsed, 0),
      };
    }
  }

  const situation: AutonomousSituation = {
    seedWords: countSeedWords(session.initialPrompt),
    sealed: position.stage === 'complete',
    generationInFlight: generationInFlight === null ? null : { runId: generationInFlight.runId },
    pending:
      pending === null
        ? null
        : pending.kind === 'question-round'
          ? { kind: 'question-round', roundId: pending.roundId }
          : pending.kind === 'diff'
            ? { kind: 'diff', proposedChangeId: pending.proposedChangeId }
            : pending.kind === 'spec'
              ? {
                  kind: 'spec',
                  specFileId: pending.specFileId,
                  revisionNumber: pending.revisionNumber,
                }
              : pendingReview,
    asking: askingStage !== null,
    canAskMore: askingStage !== null && canAskAnotherRound(snapshot, askingStage).allowed,
    canGenerate: position.substage === 'generate',
    /*
     * `specApproved` is keyed by spec stage; away from one — and on a stage that drafts no document
     * at all — there is nothing to be approved.
     */
    documentApproved:
      position.substage !== null && producesDocument && snapshot.specApproved[position.stage],
    revisionOwed: owedBoard !== null,
    target:
      to === null || verdict === null
        ? null
        : { toStage: to.stage, toSubstage: to.substage, ready: verdict.allowed },
    steps: run.steps,
    stepBudget: env.MAX_AUTONOMOUS_STEPS,
    idleSteps: 0,
    fruitlessAsks: run.fruitlessAsks,
  };

  const fingerprint = fingerprintOf([
    position.stage,
    position.substage,
    state.version,
    situation.pending === null
      ? 'none'
      : `${situation.pending.kind}:${pendingKeyOf(situation.pending)}`,
    situation.generationInFlight?.runId ?? 'none',
    situation.documentApproved,
    situation.revisionOwed,
    askingStage === null ? 'none' : String(snapshot.answeredRounds[askingStage]),
  ]);

  /*
   * The idle count is decided **before** the move, against the digest the previous step recorded: a
   * run whose stored fingerprint still describes the session is a run whose last move changed
   * nothing. A first step has nothing to compare against and is never idle.
   *
   * **Two settlements are not evidence of a loop** (task 170), and the count is *carried* over both
   * rather than reset — earlier idle observations were real and stay on the record:
   *
   * - a claim that was never settled (`step_outcome IS NULL`) is a step that counted itself and then
   *   never came back: a process killed mid-move, which on this product means the operator
   *   restarting the stack while the driver was inside a model call. Its digest necessarily still
   *   describes the session, because the move it promised never happened, and charging the run for a
   *   step it did not take is what the M15а walk paid for — with `MAX_IDLE_STEPS` at two, one
   *   restart plus one honest fruitless ask ended the journey as «I was going round in circles»;
   * - a `fruitless-ask` is an interviewer that produced no round. Bounded, but by its own budget
   *   (`MAX_FRUITLESS_ASKS`) and with its own ending, because asking again is what a person does.
   */
  situation.idleSteps =
    run.fingerprint === null || fingerprint !== run.fingerprint
      ? 0
      : run.stepOutcome === null || run.stepOutcome === 'fruitless-ask'
        ? run.idleSteps
        : run.idleSteps + 1;

  return { situation, position, fingerprint, round, board };
}

/**
 * The pending card of one chat, in `findPendingDecision`'s own precedence.
 *
 * The first two arms are that function's verbatim: a presented round outranks everything, and a
 * proposed change outranks the rest. The last two differ only in scope — they ask about the file
 * this position is standing on rather than about the project's most recently written one — which is
 * the whole of the correction, and the reason this is not simply a call into `specs`.
 */
async function pendingForThisChat(input: {
  db: SchemaDatabase;
  scope: OwnerScope;
  session: OwnedSession;
  pendingRoundId: string | null;
  stageFile: { id: string; fileName: string } | null;
  reviews: ReturnType<typeof createReviewRepository>;
}): Promise<PendingDecision> {
  if (input.pendingRoundId !== null) {
    return { kind: 'question-round', roundId: input.pendingRoundId };
  }

  /*
   * Proposals stay project-wide, and that is deliberate rather than an oversight: a pending change
   * blocks the whole bundle whichever chat proposed it, and the driver's answer to one is to stop.
   * Narrowing it would let a driver walk past a decision somebody is waiting to make.
   */
  const projectWide = await findPendingDecision(input.db, input.scope, input.session.projectId);
  if (projectWide !== null && projectWide.kind === 'diff') return projectWide;

  const stageFile = input.stageFile;
  if (stageFile === null) return null;

  const review = await input.reviews.pendingForFile(input.scope, stageFile.id);
  if (review !== null) {
    return {
      kind: 'review',
      reviewId: review.id,
      specFileId: stageFile.id,
      specType: review.specType,
    };
  }

  const latest = await createRevisionRepository(input.db).latest(stageFile.id);
  if (latest !== null && !latest.approved) {
    return {
      kind: 'spec',
      specFileId: stageFile.id,
      revisionNumber: latest.revisionNumber,
      fileName: stageFile.fileName,
    };
  }

  return null;
}

function pendingKeyOf(pending: NonNullable<AutonomousSituation['pending']>): string {
  switch (pending.kind) {
    case 'question-round':
      return pending.roundId;
    case 'diff':
      return pending.proposedChangeId;
    case 'review':
      return pending.reviewId;
    case 'spec':
      return `${pending.specFileId}:${String(pending.revisionNumber)}`;
  }
}

/**
 * The persisted round, narrowed to what an answer needs.
 *
 * Read defensively rather than through `QuestionSetSchema`: the payload was validated on the way in
 * (the rounds route parses before it persists), and a driver that threw on a shape it did not expect
 * would turn a stale row into a 500 in the middle of a run. Anything it cannot read becomes a round
 * with no questions, which the caller treats as nothing to answer.
 */
function questionsOf(payload: unknown): DriverQuestionView[] {
  const questions =
    typeof payload === 'object' && payload !== null && 'questions' in payload
      ? payload.questions
      : null;

  if (!Array.isArray(questions)) return [];

  return questions.flatMap((entry: unknown) => {
    if (typeof entry !== 'object' || entry === null) return [];
    const record = entry as Record<string, unknown>;
    const id = typeof record.id === 'string' ? record.id : null;
    const text = typeof record.text === 'string' ? record.text : '';
    if (id === null) return [];

    const options = Array.isArray(record.options)
      ? record.options.flatMap((option: unknown) => {
          if (typeof option !== 'object' || option === null) return [];
          const holder = option as Record<string, unknown>;
          const optionId = typeof holder.id === 'string' ? holder.id : null;
          if (optionId === null) return [];

          return [
            {
              id: optionId,
              label: typeof holder.label === 'string' ? holder.label : optionId,
              recommended: holder.recommended === true,
            },
          ];
        })
      : [];

    return [{ id, text, type: record.type === 'multiple' ? 'multiple' : 'single', options }];
  });
}
