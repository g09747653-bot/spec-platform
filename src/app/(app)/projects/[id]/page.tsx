import { notFound } from 'next/navigation';

import { getEnv } from '@/config/env';
import { getDatabase } from '@/db/client';
import { createGenerationStore } from '@/modules/adapters/llm/generation-store';
import { requireOwnerScope } from '@/modules/projects/auth/scope';
import { createAttachmentRepository } from '@/modules/projects/repositories/attachments';
import { createProjectRepository } from '@/modules/projects/repositories/projects';
import { resolveExportMode } from '@/modules/specs/export/resolve-mode';
import { fileNamesForMode } from '@/modules/specs/model/export';
import { isSpecType } from '@/modules/specs/model/spec-files';
import { createProposedChangeService } from '@/modules/specs/proposed-changes/proposed-change-service';
import { createRevisionRepository } from '@/modules/specs/repositories/revisions';
import { createSpecFileRepository } from '@/modules/specs/repositories/spec-files';
import { registeredCapabilityIds } from '@/modules/workflow/capabilities';
import { qualityExportPort } from '@/modules/workflow/quality-port';
import { canAskAnotherRound, evaluateTransition } from '@/modules/workflow/evaluate-transition';
import { isAskingStage, type StagePosition } from '@/modules/workflow/model/stages';
import { forwardDoors, nextPosition } from '@/modules/workflow/next-position';
import { assembleWorkflowSnapshot } from '@/modules/workflow/snapshot-assembler';
import { unmetNeedNames, type WorkflowSnapshot } from '@/modules/workflow/snapshot';
import { buildFeed } from '@/modules/web/feed/build-feed';
import { SessionFeed } from '@/modules/web/feed/session-feed';
import type { StageActionsModel, TransitionTargetModel } from '@/modules/web/feed/stage-actions';
import { MethodologyBadge } from '@/modules/web/feed/methodology-badge';
import { StepPills } from '@/modules/web/feed/step-pills';
import type { PendingProposalModel } from '@/modules/web/feed/proposal-block';
import { Attachments, type AttachmentModel } from '@/modules/web/session/attachments';
import { CONDITION_COPY, STILL_NEEDED } from '@/modules/web/session/gate-copy';
import { stageLabel } from '@/modules/web/session/stage-display';
import { ExportPanel } from '@/modules/web/session/export-panel';

import { assembleFeedSource } from './feed-source';

/**
 * The session surface for one project — one conversation, from the seed prompt to the bundle
 * (task 105; Эталон §1.1).
 *
 * **Not found and not owned are the same answer** (AR-2; NFR-005 AC-2): the repository query carries
 * the owner predicate, so a project belonging to someone else returns `null` exactly as a project
 * that never existed, and both render `notFound()`. There is no branch here that could distinguish
 * them, which is what makes 404-not-403 a property of the code rather than a promise.
 *
 * Everything on the page is rendered from persisted state, so a reload restores the same feed, the
 * same pending card and the same gate verdicts (FR-017 AC-1/AC-3/AC-4). The page evaluates gates only
 * to *present* their state; enforcement lives behind the transition endpoint (P1).
 *
 * What changed in M7п is where things are, not what they are: the stage panels became blocks of a
 * feed, and the feed is a projection of exactly the rows those panels already read. No write path was
 * added — see `web/feed/build-feed.ts`.
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

  return `Proceed to ${stageLabel(to.stage)}`;
}

/**
 * Where "proceed" leads from the current position.
 *
 * Round 5, Р-3 item 4: the wording of a refusal comes from `gate-copy`, which is keyed by the whole
 * `ReasonCode` union. The chain of ternaries this replaced covered four reasons and fell through to
 * the **raw code** for the other five, so an exhausted question budget told its owner
 * `still needed: ROUND_LIMIT_REACHED`.
 */
function nextTarget(snapshot: WorkflowSnapshot): TransitionTargetModel | null {
  const to = nextPosition(snapshot);
  if (to === null) return null;

  return targetModel(snapshot, to, labelFor(snapshot.position, to));
}

/** One door, with the gate's current verdict on it. Presentation only — the server re-decides. */
function targetModel(
  snapshot: WorkflowSnapshot,
  to: StagePosition,
  label: string,
): TransitionTargetModel {
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
   * The export estimate, resolved through the same mode machinery the endpoint uses (task 73). The
   * panel replaces both lists with the endpoint's own manifest once a download happens, so this is
   * what the user sees *before* deciding, never what is claimed about a produced archive.
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

  const [source, attachments, snapshotResult, activeRun] = await Promise.all([
    assembleFeedSource(db, scope, project),
    createAttachmentRepository(db).listForSession(scope, project.sessionId),
    assembleWorkflowSnapshot(db, project.sessionId, {
      roundBudget: getEnv().MAX_ROUNDS_PER_STAGE,
      capabilities: registeredCapabilityIds(),
    }),
    /*
     * A generation still in flight when this page renders (round 5, Р-3; D-99/D-101). Stated by the
     * server so the card that would have duplicated it is `Stop` before a line of the page's own
     * JavaScript has run.
     */
    createGenerationStore(db).activeRunForSession(project.sessionId),
  ]);

  const feed = buildFeed(source);

  /*
   * The document the session is working on: the newest revision of the file most recently written.
   * Its text is loaded here rather than fetched by the card, because approving a document you cannot
   * read is not a decision, and a decision that waits on a fetch is a decision that can fail to load.
   */
  const revisions = createRevisionRepository(db);
  const positionStage = project.substage === null ? null : project.stage;

  const currentFile =
    positionStage !== null && isSpecType(positionStage)
      ? await specFileRepository.findByProjectAndType(scope, project.id, positionStage)
      : await specFileRepository.currentFile(scope, project.id);

  const latest = currentFile === null ? null : await revisions.latest(currentFile.id);

  /*
   * The pending refinement, if the project has one (task 60; FR-011 AC-3/AC-6). Its diff is recomputed
   * against the revision the proposal was based on, so the card shows what the user was offered even
   * if the file has since moved on — a diff against "whatever is current now" would silently change
   * what accepting means.
   */
  const proposals = createProposedChangeService(db);
  const pendingProposal = await proposals.pendingForProject(scope, project.id);
  const proposalDiff =
    pendingProposal === null ? null : await proposals.diffFor(scope, pendingProposal);

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

  const snapshot = snapshotResult?.snapshot ?? null;
  const position = snapshot?.position ?? feed.position;
  const askingStage =
    snapshot !== null &&
    (position.stage === 'interview' || position.substage === 'collect') &&
    isAskingStage(position.stage)
      ? position.stage
      : null;

  const actionsTarget = snapshot === null ? null : nextTarget(snapshot);

  const actions: StageActionsModel = {
    askingStage,
    canAskMore:
      snapshot !== null &&
      askingStage !== null &&
      canAskAnotherRound(snapshot, askingStage).allowed,
    answeredRounds:
      snapshot !== null && askingStage !== null ? snapshot.answeredRounds[askingStage] : 0,
    roundBudget: snapshot?.roundBudget ?? 0,
    unmetNeeds:
      snapshot !== null && askingStage !== null ? unmetNeedNames(snapshot, askingStage) : [],
    summaryPersisted: snapshot?.summaryPersisted ?? false,
    target: actionsTarget,
    /*
     * Every other forward door (task 117). The primary one is filtered out by position, not by
     * label, so a methodology with no fork simply has none — and the parity graph never does,
     * because its one fork is the Quality selection, which the session has already made.
     */
    alternates:
      snapshot === null
        ? []
        : forwardDoors(snapshot)
            .filter(
              (door) =>
                door.to.stage !== actionsTarget?.toStage ||
                door.to.substage !== actionsTarget.toSubstage,
            )
            .flatMap((door) => {
              return [targetModel(snapshot, door.to, door.label)];
            }),
  };

  return (
    <section className="flex min-h-0 flex-col gap-4" data-testid="session">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight" data-testid="session-project-name">
            {project.name}
          </h1>
          <MethodologyBadge methodologyId={project.methodologyId} />
        </div>
        <StepPills
          currentStage={project.stage}
          currentSubstage={project.substage}
          qualityEnabled={project.qualityEnabled}
          methodologyId={project.methodologyId}
        />
      </header>

      <div className="grid min-h-0 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <SessionFeed
          sessionId={project.sessionId}
          feed={feed}
          deadlineMs={requestDeadlineMs()}
          actions={actions}
          primaryRevisionId={latest?.id ?? null}
          primaryContent={latest?.content ?? null}
          proposal={proposalModel}
          refineFileId={latest === null ? null : (currentFile?.id ?? null)}
          canGenerate={position.substage === 'generate'}
          activeRun={
            activeRun === null ? null : { runId: activeRun.runId, attempt: activeRun.attempt }
          }
          bundleFileCount={exportFiles.length}
        />

        <aside className="flex flex-col gap-4">
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

          <ExportPanel
            projectId={project.id}
            mode={exportMode}
            files={exportFiles}
            omittedFiles={omittedFiles}
          />
        </aside>
      </div>
    </section>
  );
}
