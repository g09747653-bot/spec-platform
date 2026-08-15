import { notFound } from 'next/navigation';

import { getEnv } from '@/config/env';
import { getDatabase } from '@/db/client';
import { createGenerationStore } from '@/modules/adapters/llm/generation-store';
import { QuestionSetSchema } from '@/modules/agents/schemas/question-set';
import { requireOwnerScope } from '@/modules/projects/auth/scope';
import { createAttachmentRepository } from '@/modules/projects/repositories/attachments';
import {
  createInterviewRepository,
  FALLBACK_QUESTION_ID_PREFIX,
  type AnsweredRound,
} from '@/modules/projects/repositories/interview';
import { createProjectRepository } from '@/modules/projects/repositories/projects';
import { resolveExportMode } from '@/modules/specs/export/resolve-mode';
import { fileNamesForMode } from '@/modules/specs/model/export';
import { isSpecType } from '@/modules/specs/model/spec-files';
import { createProposedChangeService } from '@/modules/specs/proposed-changes/proposed-change-service';
import { createReviewRepository } from '@/modules/specs/repositories/reviews';
import { createRevisionRepository } from '@/modules/specs/repositories/revisions';
import { createSpecFileRepository } from '@/modules/specs/repositories/spec-files';
import { registeredCapabilityIds } from '@/modules/workflow/capabilities';
import { qualityExportPort } from '@/modules/workflow/quality-port';
import { canAskAnotherRound, evaluateTransition } from '@/modules/workflow/evaluate-transition';
import { isAskingStage, type StagePosition } from '@/modules/workflow/model/stages';
import { nextPosition } from '@/modules/workflow/next-position';
import { pendingRoundId } from '@/modules/workflow/pending-action';
import { createWorkflowStateRepository } from '@/modules/workflow/repositories/workflow-state';
import { assembleWorkflowSnapshot } from '@/modules/workflow/snapshot-assembler';
import { unmetNeedNames, type WorkflowSnapshot } from '@/modules/workflow/snapshot';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/modules/web';
import {
  AnswerHistory,
  type AnsweredQuestionModel,
  type AnsweredRoundModel,
} from '@/modules/web/session/answer-history';
import { Attachments, type AttachmentModel } from '@/modules/web/session/attachments';
import { ChatPanel } from '@/modules/web/session/chat-panel';
import { CONDITION_COPY, STILL_NEEDED } from '@/modules/web/session/gate-copy';
import { DiffCard, type PendingProposalModel } from '@/modules/web/session/diff-card';
import { ExportPanel } from '@/modules/web/session/export-panel';
import { InterviewPanel, type TransitionTargetModel } from '@/modules/web/session/interview-panel';
import type { QuestionRoundModel } from '@/modules/web/session/question-round';
import { ReviewBoard, type ReviewBoardModel } from '@/modules/web/session/review-board';
import { SpecCard } from '@/modules/web/session/spec-card';
import { StageRail } from '@/modules/web/session/stage-rail';

/**
 * The session surface for one project.
 *
 * **Not found and not owned are the same answer** (AR-2; NFR-005 AC-2): the repository query carries the
 * owner predicate, so a project belonging to someone else returns `null` exactly as a project that never
 * existed, and both render `notFound()`. There is no branch here that could distinguish them, which is
 * what makes 404-not-403 a property of the code rather than a promise.
 *
 * Everything on the page is rendered from persisted state, so a reload restores the same position, the
 * same pending question card and the same gate verdicts (FR-017 AC-1/AC-3/AC-4). The page evaluates
 * gates only to *present* their state; enforcement lives behind the transition endpoint (P1).
 */

/**
 * How a target position reads to a person.
 *
 * The position itself comes from `nextPosition` in `workflow`, which is the same forward map the
 * engine's table describes; only the wording is decided here, because wording is presentation.
 */
function labelFor(from: StagePosition, to: StagePosition): string {
  if (to.stage === 'complete') return 'Finish and seal the session';
  if (to.substage === 'generate') return 'Proceed to drafting';
  // Approval permits this move (FR-009 AC-3) and entering it is what produces the review
  // (FR-010 AC-1), so the door is offered rather than opened as a side effect of approving.
  if (to.substage === 'review') return 'Proceed to review';
  if (from.stage === 'complete') return 'Re-open for the Quality stage';

  return `Proceed to ${to.stage}`;
}

/**
 * Turns a stored round and its answer rows into something a person can read (task 75; FR-017 AC-2).
 *
 * Option **ids** are what the answer rows hold, so the question set is re-parsed to name them: a
 * history that showed `q-audience-solo-devs` would restore the answer without restoring the answer.
 * A direct fallback answer (FR-005 AC-10) carries no question id at all — its `need:<name>` key is
 * the question — so it is labelled from the need rather than dropped.
 */
function toAnsweredRound(round: AnsweredRound): AnsweredRoundModel {
  const set = QuestionSetSchema.safeParse(round.questions);
  const questions = set.success ? set.data.questions : [];

  const entries = round.answers.map((answer): AnsweredQuestionModel => {
    const asked = questions.find((question) => question.id === answer.questionId);

    const labels = answer.selectedOptionIds.map((optionId) => {
      const option = asked?.options.find((candidate) => candidate.id === optionId);
      return option?.label ?? optionId;
    });

    const parts = [...labels, ...(answer.freeText === null ? [] : [answer.freeText])];

    return {
      question:
        asked?.text ??
        (answer.questionId?.startsWith(FALLBACK_QUESTION_ID_PREFIX) === true
          ? answer.questionId.slice(FALLBACK_QUESTION_ID_PREFIX.length)
          : 'Your reply'),
      answer: parts.length === 0 ? '—' : parts.join(', '),
    };
  });

  return {
    roundId: round.id,
    stage: round.stage,
    roundNumber: round.roundNumber,
    entries,
  };
}

/**
 * Where "proceed" leads from the current position, for the panel's door button.
 *
 * Round 5, Р-3 item 4: the wording of a refusal comes from `gate-copy`, which is keyed by the whole
 * `ReasonCode` union. The chain of ternaries this replaced covered four reasons and fell through to
 * the **raw code** for the other five, so an exhausted question budget told its owner
 * `still needed: ROUND_LIMIT_REACHED`.
 */
function nextTarget(snapshot: WorkflowSnapshot): TransitionTargetModel | null {
  const to = nextPosition(snapshot);
  if (to === null) return null;

  const label = labelFor(snapshot.position, to);

  const verdict = evaluateTransition(snapshot, to);
  const unmet: string[] = verdict.allowed
    ? []
    : (verdict.unmet?.map((condition) => CONDITION_COPY[condition]) ?? [
        STILL_NEEDED[verdict.reason],
      ]);

  return {
    label,
    toStage: to.stage,
    toSubstage: to.substage,
    ready: verdict.allowed,
    unmet,
  };
}

/**
 * How long the page keeps believing the server is still working on a request (round 5, Р-3).
 *
 * Derived from the server's own worst case rather than guessed: entering `review` runs the review
 * agent inside the transition request, and that agent is bounded by `LLM_REQUEST_TIMEOUT_MS` for
 * each provider it tries in turn. Past that sum plus a margin the server cannot still be working,
 * so a request still in flight is a request that will never answer.
 *
 * It is a backstop, not a waiting time: `stop-waiting` is on screen from the first second, so the
 * user decides how long to wait and this only decides when the page stops pretending.
 */
function requestDeadlineMs(): number {
  const env = getEnv();

  return env.LLM_REQUEST_TIMEOUT_MS * env.LLM_PROVIDER_ORDER.length + 15_000;
}

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scope = await requireOwnerScope();
  const db = getDatabase();

  const project = await createProjectRepository(db).findById(scope, id);
  if (project === null) notFound();

  /*
   * The export estimate, resolved through the same mode machinery the endpoint uses (task 73).
   *
   * With no Quality capability registered the mode is `default` and the expected set is the parity
   * four; the panel replaces both lists with the endpoint's own manifest once a download happens, so
   * this is what the user sees *before* deciding, never what is claimed about a produced archive.
   */
  const exportMode = resolveExportMode('default', qualityExportPort());
  const specFileRepository = createSpecFileRepository(db);
  const exportable = await specFileRepository.approvedForExport(scope, project.id, exportMode);
  const exportFiles = exportable.map((file) => ({
    specFileId: file.specFileId,
    fileName: file.fileName,
  }));
  const omittedFiles = fileNamesForMode(exportMode).filter(
    (name) => !exportFiles.some((file) => file.fileName === name),
  );

  /*
   * The card shows **the file the current stage owns**, and falls back to the most recently written
   * one where the position has no file of its own — the interview, and `complete`.
   *
   * Resolving by stage is what makes the journey continue past the first document: at
   * `requirements/generate` the requirements file does not exist yet, and a card resolved by "most
   * recently written" would show the approved constitution instead, with no way to generate anything.
   * That was a dead end, and it is exactly the lookup the M1 stand-in said would become a lookup by
   * spec type "from task 24".
   */
  const revisions = createRevisionRepository(db);
  const positionStage = project.substage === null ? null : project.stage;

  const currentFile =
    positionStage !== null && isSpecType(positionStage)
      ? await specFileRepository.findByProjectAndType(scope, project.id, positionStage)
      : await specFileRepository.currentFile(scope, project.id);

  const latest = currentFile === null ? null : await revisions.latest(currentFile.id);

  /*
   * The review board, when the approved revision has one awaiting a decision (task 55; FR-010 AC-4).
   * Rendered from persisted state like everything else here, so a reload shows the same pending
   * board rather than losing it — and the stored `severity` is what splits the two lists, so the
   * board never has to re-derive a classification the reviewer already made.
   */
  const pendingReview =
    currentFile === null
      ? null
      : await createReviewRepository(db).pendingForFile(scope, currentFile.id);

  const reviewModel: ReviewBoardModel | null =
    pendingReview === null
      ? null
      : {
          reviewId: pendingReview.id,
          outcome: pendingReview.outcome,
          mustfix: pendingReview.items.filter((entry) => entry.severity === 'blocking'),
          recommendations: pendingReview.items.filter((entry) => entry.severity === 'advisory'),
          decision: pendingReview.decision,
        };

  /*
   * The session's documents (task 68; FR-004 AC-6). Listed from persisted state like everything else,
   * so a reload shows the same set with the same parse outcomes — including the failures, which are
   * reported rather than hidden (AC-5).
   */
  const attachments = await createAttachmentRepository(db).listForSession(scope, project.sessionId);

  /* Everything the owner has already answered, restored on reopen (task 75; FR-017 AC-2/AC-5). */
  const answerHistory = (
    await createInterviewRepository(db).answeredHistory(project.sessionId)
  ).map(toAnsweredRound);

  // The interview surface renders from the same snapshot the gates evaluate (FR-017).
  const assembled = await assembleWorkflowSnapshot(db, project.sessionId, {
    roundBudget: getEnv().MAX_ROUNDS_PER_STAGE,
    capabilities: registeredCapabilityIds(),
  });

  /*
   * The pending refinement, if the file has one (task 60; FR-011 AC-3/AC-6). Its diff is recomputed
   * against the revision the proposal was based on, so the card shows what the user was offered even
   * if the file has since moved on — a diff against "whatever is current now" would silently change
   * what accepting means.
   *
   * Looked up across the **project**, not only the current file: the late-attachment action of task 69
   * can start a refinement on a file the session has already moved past, and a diff the user cannot
   * see is a decision they cannot make.
   */
  const pendingProposal = await createProposedChangeService(db).pendingForProject(
    scope,
    project.id,
  );

  const proposalDiff =
    pendingProposal === null
      ? null
      : await createProposedChangeService(db).diffFor(scope, pendingProposal);

  const proposalModel: PendingProposalModel | null =
    pendingProposal === null || proposalDiff === null
      ? null
      : {
          proposedChangeId: pendingProposal.id,
          fileName: pendingProposal.fileName,
          instruction: pendingProposal.instruction,
          unifiedDiff: proposalDiff.unifiedDiff,
          added: proposalDiff.diff.added,
          removed: proposalDiff.diff.removed,
        };

  /**
   * The door out of `generate` and out of `review`, shown on the spec card.
   *
   * It lives beside the document because the two decisions that open it — approving the draft, and
   * deciding the review — are taken there. At `tasks.review` the same control is what seals the
   * session (FR-020 AC-1): completion is a transition like every other, requested explicitly, and
   * refused by `completionGate` while any file of the bundle lacks an approved revision (AC-2).
   */
  const stageTarget =
    assembled !== null &&
    (assembled.snapshot.position.substage === 'generate' ||
      assembled.snapshot.position.substage === 'review')
      ? nextTarget(assembled.snapshot)
      : null;

  /** Whether the session is sealed — the terminal position, with its own surface (FR-020 AC-3). */
  const isComplete = assembled !== null && assembled.snapshot.position.stage === 'complete';

  /** The client's patience with a request, read off the server's own provider chain (round 5, Р-3). */
  const deadlineMs = requestDeadlineMs();

  /*
   * A generation still in flight when this page renders (round 5, Р-3).
   *
   * Round 4 made the run outlive its reader; without this the *page* still did not. Landing on a
   * session mid-generation showed an empty card with a Generate button, and taking it started a
   * second run over the same stage — the "no duplicates" half of the M3 resume rule, broken by a
   * page that simply did not know. The card reattaches to the durable chunk log instead.
   */
  const activeRun = await createGenerationStore(db).activeRunForSession(project.sessionId);

  let interview: {
    stage: string;
    pendingRound: QuestionRoundModel | null;
    canAskMore: boolean;
    answeredRounds: number;
    roundBudget: number;
    unmetNeeds: readonly string[];
    summaryPersisted: boolean;
    target: TransitionTargetModel | null;
  } | null = null;

  if (assembled !== null) {
    const { snapshot } = assembled;
    const { position } = snapshot;

    if (
      (position.stage === 'interview' || position.substage === 'collect') &&
      isAskingStage(position.stage)
    ) {
      const stage = position.stage;

      let pendingRound: QuestionRoundModel | null = null;
      const state = await createWorkflowStateRepository(db).find(project.sessionId);
      const roundId = state === null ? null : pendingRoundId(state.pendingAction);

      if (roundId !== null) {
        const stored = await createInterviewRepository(db).findRoundById(roundId);

        if (stored !== null && stored.sessionId === project.sessionId && !stored.answered) {
          const set = QuestionSetSchema.safeParse(stored.questions);

          if (set.success) {
            // Projection into the view model the card renders (web may not import agents).
            pendingRound = {
              roundId: stored.id,
              roundNumber: stored.roundNumber,
              stage: stored.stage,
              questions: set.data.questions.map((question) => ({
                id: question.id,
                text: question.text,
                type: question.type,
                options: question.options.map((option) => ({
                  id: option.id,
                  label: option.label,
                  ...(option.description === undefined ? {} : { description: option.description }),
                })),
                allowOther: question.allowOther,
              })),
            };
          }
        }
      }

      interview = {
        stage,
        pendingRound,
        canAskMore: canAskAnotherRound(snapshot, stage).allowed,
        answeredRounds: snapshot.answeredRounds[stage],
        roundBudget: snapshot.roundBudget,
        unmetNeeds: unmetNeedNames(snapshot, stage),
        summaryPersisted: snapshot.summaryPersisted,
        target: nextTarget(snapshot),
      };
    }
  }

  return (
    <section className="flex flex-col gap-6" data-testid="session">
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold tracking-tight" data-testid="session-project-name">
          {project.name}
        </h1>
        <StageRail
          currentStage={project.stage}
          currentSubstage={project.substage}
          qualityEnabled={project.qualityEnabled}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your prompt</CardTitle>
          <CardDescription>
            The grounding input for every stage of this session (FR-003 AC-3).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm whitespace-pre-wrap" data-testid="session-prompt">
            {project.initialPrompt}
          </p>
        </CardContent>
      </Card>

      <Attachments
        sessionId={project.sessionId}
        attachments={attachments.map((attachment): AttachmentModel => ({
          id: attachment.id,
          fileName: attachment.fileName,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.sizeBytes,
          parseStatus: attachment.parseStatus,
          parseReason: attachment.parseReason,
          attachedAtStage: attachment.attachedAtStage,
        }))}
      />

      <AnswerHistory rounds={answerHistory} />

      {interview !== null && (
        <InterviewPanel
          sessionId={project.sessionId}
          stage={interview.stage}
          pendingRound={interview.pendingRound}
          canAskMore={interview.canAskMore}
          answeredRounds={interview.answeredRounds}
          roundBudget={interview.roundBudget}
          unmetNeeds={interview.unmetNeeds}
          summaryPersisted={interview.summaryPersisted}
          target={interview.target}
          deadlineMs={deadlineMs}
        />
      )}

      {isComplete && (
        <Card data-testid="session-complete">
          <CardHeader>
            <CardTitle>The session is complete</CardTitle>
            <CardDescription>
              Every file in the bundle has an approved revision, and the workflow is sealed here: no
              stage reopens (FR-020 AC-9). The bundle is yours to download or copy below, and you
              can still refine any file in conversation — a refinement produces a new revision
              without moving the session (FR-020 AC-4).
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <SpecCard
        sessionId={project.sessionId}
        generationBlocked={interview !== null && interview.pendingRound !== null}
        /*
         * Only `generate` drafts (round 2, Д-4). Anywhere else the endpoint refuses on the
         * `collect → generate` gate, so the control is not offered — button state follows the
         * workflow, never a local request flag.
         */
        canGenerate={assembled !== null && assembled.snapshot.position.substage === 'generate'}
        target={stageTarget}
        deadlineMs={deadlineMs}
        /* Only the run this stage owns: a stale run from a stage already left is not this card's. */
        activeRun={
          activeRun !== null && activeRun.stage === positionStage
            ? { runId: activeRun.runId, attempt: activeRun.attempt }
            : null
        }
        revision={
          latest === null || currentFile === null
            ? null
            : {
                specFileId: currentFile.id,
                fileName: currentFile.fileName,
                revisionNumber: latest.revisionNumber,
                approved: latest.approved,
                content: latest.content,
              }
        }
      />

      {reviewModel !== null && <ReviewBoard review={reviewModel} />}

      {currentFile !== null && latest !== null && (
        <DiffCard specFileId={currentFile.id} proposal={proposalModel} />
      )}

      <ChatPanel
        sessionId={project.sessionId}
        hasPendingDecision={
          proposalModel !== null || reviewModel !== null || (latest !== null && !latest.approved)
        }
      />

      <ExportPanel
        projectId={project.id}
        mode={exportMode}
        files={exportFiles}
        omittedFiles={omittedFiles}
      />
    </section>
  );
}
