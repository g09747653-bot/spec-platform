import { createHash } from 'node:crypto';

import { getEnv } from '@/config/env';
import type { SchemaDatabase } from '@/db';
import type { OwnerScope } from '@/db/owner-scope';
import { createGenerationStore } from '@/modules/adapters/llm';
import { countSeedWords, type AutonomousSituation } from '@/modules/agents/autonomous/policy';
import type { AutonomousRun } from '@/modules/projects/repositories/autonomous-runs';
import { createInterviewRepository } from '@/modules/projects/repositories/interview';
import type { OwnedSession } from '@/modules/projects/repositories/sessions';
import { findPendingDecision } from '@/modules/specs/pending-decision';
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

  const pending = await findPendingDecision(
    db,
    scope,
    session.projectId,
    pendingRoundId(state.pendingAction),
  );

  const generationInFlight = await createGenerationStore(db).activeRunForSession(session.id);

  const askingStage =
    (position.stage === 'interview' || position.substage === 'collect') &&
    isAskingStage(position.stage)
      ? position.stage
      : null;

  const to = nextPosition(snapshot);
  const verdict = to === null ? null : evaluateTransition(snapshot, to);

  const specFiles = createSpecFileRepository(db);
  const reviews = createReviewRepository(db);

  /*
   * The rewrite a board asked for, resolved exactly as the feed resolves it: a request-changes
   * decision standing on this file's latest revision (`requestedChangesForFile`). It is the only
   * thing that distinguishes «this stage is finished drafting» from «this stage owes a rewrite»,
   * because a request-changes decision leaves the approved revision approved.
   */
  const currentFile = await specFiles.currentFile(scope, session.projectId);
  const owedBoard =
    currentFile === null ? null : await reviews.requestedChangesForFile(scope, currentFile.id);

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
     * `specApproved` is keyed by spec stage; away from one there is nothing to be approved, and the
     * lookup is guarded by the substage rather than by a cast — a position with a substage is a spec
     * stage, which is the shape `StagePosition` encodes.
     */
    documentApproved: position.substage !== null && snapshot.specApproved[position.stage],
    revisionOwed: owedBoard !== null,
    target:
      to === null || verdict === null
        ? null
        : { toStage: to.stage, toSubstage: to.substage, ready: verdict.allowed },
    steps: run.steps,
    stepBudget: env.MAX_AUTONOMOUS_STEPS,
    idleSteps: 0,
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
   */
  situation.idleSteps =
    run.fingerprint === null ? 0 : fingerprint === run.fingerprint ? run.idleSteps + 1 : 0;

  return { situation, position, fingerprint, round, board };
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
