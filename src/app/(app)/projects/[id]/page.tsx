import { notFound } from 'next/navigation';

import { getEnv } from '@/config/env';
import { getDatabase } from '@/db/client';
import { QuestionSetSchema } from '@/modules/agents/schemas/question-set';
import { requireOwnerScope } from '@/modules/projects/auth/scope';
import { createAttachmentRepository } from '@/modules/projects/repositories/attachments';
import { createInterviewRepository } from '@/modules/projects/repositories/interview';
import { createProjectRepository } from '@/modules/projects/repositories/projects';
import { CORE_SPEC_FILE_NAMES } from '@/modules/specs/model/spec-files';
import { createProposedChangeService } from '@/modules/specs/proposed-changes/proposed-change-service';
import { createReviewRepository } from '@/modules/specs/repositories/reviews';
import { createRevisionRepository } from '@/modules/specs/repositories/revisions';
import { createSpecFileRepository } from '@/modules/specs/repositories/spec-files';
import { registeredCapabilityIds } from '@/modules/workflow/capabilities';
import { canAskAnotherRound, evaluateTransition } from '@/modules/workflow/evaluate-transition';
import { isAskingStage, type StagePosition } from '@/modules/workflow/model/stages';
import { pendingRoundId } from '@/modules/workflow/pending-action';
import { createWorkflowStateRepository } from '@/modules/workflow/repositories/workflow-state';
import { assembleWorkflowSnapshot } from '@/modules/workflow/snapshot-assembler';
import { unmetNeedNames, type WorkflowSnapshot } from '@/modules/workflow/snapshot';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/modules/web';
import { Attachments, type AttachmentModel } from '@/modules/web/session/attachments';
import { ChatPanel } from '@/modules/web/session/chat-panel';
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

/** Where "proceed" leads from the current position, for the panel's door button. */
function nextTarget(snapshot: WorkflowSnapshot): TransitionTargetModel | null {
  const { position } = snapshot;

  let to: StagePosition | null = null;
  let label = '';

  if (position.stage === 'interview') {
    to = { stage: 'constitution', substage: 'collect' };
    label = 'Proceed to constitution';
  } else if (position.substage === 'collect') {
    to = { stage: position.stage, substage: 'generate' };
    label = 'Proceed to drafting';
  } else if (position.substage === 'generate') {
    // Approval permits this move (FR-009 AC-3) and entering it is what produces the review
    // (FR-010 AC-1), so the door is offered here rather than opened as a side effect of approving.
    to = { stage: position.stage, substage: 'review' };
    label = 'Proceed to review';
  }

  if (to === null) return null;

  const verdict = evaluateTransition(snapshot, to);
  const unmet: string[] = verdict.allowed
    ? []
    : (verdict.unmet?.map((condition) =>
        condition === 'grounding-input'
          ? 'the initial prompt'
          : condition === 'answered-round'
            ? 'one answered question round'
            : 'a session summary',
      ) ?? [
        verdict.reason === 'NO_ANSWERED_ROUND'
          ? 'one answered question round for this stage'
          : verdict.reason === 'SPEC_NOT_APPROVED'
            ? 'your approval of the current draft'
            : verdict.reason,
      ]);

  return {
    label,
    toStage: to.stage,
    toSubstage: to.substage,
    ready: verdict.allowed,
    unmet,
  };
}

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scope = await requireOwnerScope();
  const db = getDatabase();

  const project = await createProjectRepository(db).findById(scope, id);
  if (project === null) notFound();

  const specFileRepository = createSpecFileRepository(db);
  const exportable = await specFileRepository.approvedForExport(scope, project.id);
  const includedFiles = exportable.map((file) => file.fileName);
  const omittedFiles = CORE_SPEC_FILE_NAMES.filter((name) => !includedFiles.includes(name));

  // The card shows the newest revision of the file this session has generated, if any.
  const revisions = createRevisionRepository(db);
  const currentFile = await specFileRepository.currentFile(scope, project.id);
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

  /** The door out of `generate`, shown on the spec card rather than in the interview panel. */
  const draftingTarget =
    assembled !== null && assembled.snapshot.position.substage === 'generate'
      ? nextTarget(assembled.snapshot)
      : null;

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
        />
      )}

      <SpecCard
        sessionId={project.sessionId}
        generationBlocked={interview !== null && interview.pendingRound !== null}
        target={draftingTarget}
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
        includedFiles={includedFiles}
        omittedFiles={omittedFiles}
      />
    </section>
  );
}
