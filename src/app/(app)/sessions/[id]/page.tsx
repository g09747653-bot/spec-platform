import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { getEnv } from '@/config/env';
import { getDatabase } from '@/db/client';
import type { OwnerScope } from '@/db/owner-scope';
import { AUTO_MODEL, modelRegistry } from '@/modules/adapters/llm';
import { createGenerationStore } from '@/modules/adapters/llm/generation-store';
import { requireOwnerScope } from '@/modules/projects/auth/scope';
import { createAttachmentRepository } from '@/modules/projects/repositories/attachments';
import { createProjectRepository } from '@/modules/projects/repositories/projects';
import {
  createSessionRepository,
  type SessionDetail,
} from '@/modules/projects/repositories/sessions';
import { bundlePlan, methodologyConfig } from '@/modules/methodologies';
import { diffLines, formatUnifiedDiff } from '@/modules/specs/diff';
import { resolveExportMode } from '@/modules/specs/export/resolve-mode';
import { isSpecType } from '@/modules/specs/model/spec-files';
import { createProposedChangeService } from '@/modules/specs/proposed-changes/proposed-change-service';
import { createRevisionRepository } from '@/modules/specs/repositories/revisions';
import { createSpecFileRepository } from '@/modules/specs/repositories/spec-files';
import { registeredCapabilityIds } from '@/modules/workflow/capabilities';
import { qualityExportPort } from '@/modules/workflow/quality-port';
import { canAskAnotherRound, evaluateTransition } from '@/modules/workflow/evaluate-transition';
import { roundBudgetFor } from '@/modules/workflow/gates/round-budget';
import { isAskingStage, type StagePosition } from '@/modules/workflow/model/stages';
import { forwardDoors, nextPosition } from '@/modules/workflow/next-position';
import { assembleWorkflowSnapshot } from '@/modules/workflow/snapshot-assembler';
import { unmetNeedNames, type WorkflowSnapshot } from '@/modules/workflow/snapshot';
import { buildFeed } from '@/modules/web/feed/build-feed';
import { bundleSlug, methodologyLabel } from '@/modules/web/feed/labels';
import { SessionFeed } from '@/modules/web/feed/session-feed';
import type { StageActionsModel, TransitionTargetModel } from '@/modules/web/feed/stage-actions';
import { MethodologyBadge } from '@/modules/web/feed/methodology-badge';
import { StepPills } from '@/modules/web/feed/step-pills';
import type { PendingProposalModel } from '@/modules/web/feed/proposal-block';
import { Attachments, type AttachmentModel } from '@/modules/web/session/attachments';
import { CONDITION_COPY, STILL_NEEDED } from '@/modules/web/session/gate-copy';
import { stageLabel } from '@/modules/web/session/stage-display';
import { ExportPanel } from '@/modules/web/session/export-panel';
import { LocalWorkspace, SessionSidebar } from '@/modules/web/session/sidebar';
import { BrandLoader } from '@/modules/web/theme/brand-loader';
import { SpecsPanel, type SpecFileModel } from '@/modules/web/session/specs-panel';

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
function labelFor(
  from: StagePosition,
  to: StagePosition,
  methodologyId: string | null | undefined,
): string {
  if (to.stage === 'complete') return 'Finish and seal the session';
  if (to.substage === 'generate') return 'Proceed to drafting';
  // Approval permits this move (FR-009 AC-3) and entering it is what produces the review
  // (FR-010 AC-1), so the door is offered rather than opened as a side effect of approving.
  if (to.substage === 'review') return 'Proceed to review';
  if (from.stage === 'complete') return 'Re-open for the Quality stage';

  /*
   * The methodology's own name for the door (task 132; checklist row `1.4-6`). Until now this was
   * the canonical seven, so a brownfield session offered «Proceed to Constitution» under a step pill
   * reading «Proposal» — two names for one position, and the louder of them ours rather than the
   * workflow's.
   */
  return `Proceed to ${stageLabel(to.stage, methodologyId, to.substage)}`;
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

  return targetModel(snapshot, to, labelFor(snapshot.position, to, snapshot.methodologyId));
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

/**
 * The sidebar's Specs rows, derived from the revisions the feed already read (task 119).
 *
 * No extra query: the feed source carries every revision of the project, and "how many, and is the
 * newest approved" is a fold over rows already in hand. That is also what makes the section live —
 * a new revision changes the feed and this list in the same render, from the same data (AC-2).
 */
function specsPanelFiles(
  revisions: readonly {
    specFileId: string;
    specType: string;
    revisionNumber: number;
    approved: boolean;
  }[],
): SpecFileModel[] {
  const byType = new Map<string, SpecFileModel>();

  for (const revision of revisions) {
    const current = byType.get(revision.specType);

    // "Approved" is a property of the newest revision, not of any of them: a file whose latest
    // revision awaits a decision is not approved, however many approved ones precede it (FR-009).
    if (current === undefined || revision.revisionNumber >= current.revisionCount) {
      byType.set(revision.specType, {
        // Carried, so the row can link into the viewer (task 122).
        specFileId: revision.specFileId,
        specType: revision.specType,
        revisionCount: revision.revisionNumber,
        approved: revision.approved,
      });
    }
  }

  return [...byType.values()];
}

/**
 * The pending proposal card's model: the instruction, and one diff per file it touches.
 *
 * Addressed by the id the block carries. For a cross-file edit that id is one member of the batch,
 * and the other members are found through it — so the card's contents and the decision it sends are
 * derived from the same row, and cannot describe a different set from the one Approve applies.
 */
async function pendingProposalModel(
  proposals: ReturnType<typeof createProposedChangeService>,
  scope: Awaited<ReturnType<typeof requireOwnerScope>>,
  proposedChangeId: string,
): Promise<PendingProposalModel | null> {
  const proposal = await proposals.findOwned(scope, proposedChangeId);
  if (proposal === null) return null;

  const members =
    proposal.editBatchId === null
      ? [proposal]
      : (await proposals.batchMembers(scope, proposal.editBatchId)).filter(
          (member) => member.status === 'pending',
        );

  const files: { fileName: string; unifiedDiff: string; added: number; removed: number }[] = [];

  for (const member of members) {
    const diff = await proposals.diffFor(scope, member);
    if (diff === null) continue;

    files.push({
      fileName: member.fileName,
      unifiedDiff: diff.unifiedDiff,
      added: diff.diff.added,
      removed: diff.diff.removed,
    });
  }

  if (files.length === 0) return null;

  return { proposedChangeId, instruction: proposal.instruction, files };
}

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scope = await requireOwnerScope();
  const db = getDatabase();

  /*
   * Addressed by **session** id since А-6: a project holds several chats, so "the session of this
   * project" stopped being a thing one could look up. The ownership resolution is unchanged — the
   * query carries the owner predicate through two joins, so another user's session id is not found
   * exactly as a session that never existed (AR-2).
   */
  const session = await createSessionRepository(db).findDetailById(scope, id);
  if (session === null) notFound();

  /*
   * The loader begins **here**, and not a line earlier (task 125).
   *
   * A Suspense boundary is where the response body starts streaming, and a response that has begun
   * cannot change its status code. `notFound()` above therefore has to run before this boundary is
   * reached, or a session belonging to someone else would answer `200` with the not-found page
   * inside it — a soft 404, and a weaker answer than AR-2/NFR-005 AC-2 asks for. That is exactly why
   * this is a boundary in the page rather than a `loading.tsx`: the route file convention puts the
   * fallback above the whole segment, ownership check included.
   */
  return (
    <Suspense fallback={<BrandLoader label="Opening the session…" />}>
      <SessionBody session={session} scope={scope} />
    </Suspense>
  );
}

/**
 * Everything the session page reads and renders once the session is known to exist and to be this
 * user's. Split out only so the fallback above has something to suspend on — see the note there.
 */
async function SessionBody({ session, scope }: { session: SessionDetail; scope: OwnerScope }) {
  const db = getDatabase();

  /*
   * The export estimate, resolved through the same mode machinery the endpoint uses (task 73). The
   * panel replaces both lists with the endpoint's own manifest once a download happens, so this is
   * what the user sees *before* deciding, never what is claimed about a produced archive.
   */
  const exportMode = resolveExportMode('default', qualityExportPort());
  const specFileRepository = createSpecFileRepository(db);

  /*
   * The bundle the *session's methodology* promises (task 117). Names come from the plan, so the
   * panel, the sidebar and the archive cannot disagree about what belongs in the bundle or about
   * what a missing file is called.
   */
  /*
   * The bundle a chat shows is the bundle its **project** promises, so an Edit chat — whose own
   * methodology writes no documents at all — lists the four files it is editing rather than nothing.
   * The generate chat and the edit chat on one project therefore agree about what the bundle is,
   * which is the only answer that could be right: there is one bundle.
   */
  const bundleMethodologyId =
    methodologyConfig(session.methodologyId).chatClass === 'edit'
      ? ((await createProjectRepository(db).findById(scope, session.projectId))?.methodologyId ??
        session.methodologyId)
      : session.methodologyId;

  const plan = bundlePlan(methodologyConfig(bundleMethodologyId), exportMode);
  const exportable = await specFileRepository.approvedForExport(
    scope,
    session.projectId,
    exportMode,
    plan.map((entry) => entry.specType),
  );
  /*
   * The bundle's files, in the plan's order, each carrying the revision the export resolves to.
   *
   * The revision number travels with the row rather than being looked up again for the completion
   * panel (task 126): the handoff prompt has to name the revision that would actually be exported,
   * and asking a second query for "the latest" would answer a different question after enrichment.
   */
  const handoffFiles = plan.flatMap((entry) => {
    const file = exportable.find((candidate) => candidate.specType === entry.specType);

    return file === undefined
      ? []
      : [
          {
            specFileId: file.specFileId,
            fileName: entry.fileName,
            revisionNumber: file.revisionNumber,
          },
        ];
  });
  const exportFiles = handoffFiles.map((file) => ({
    specFileId: file.specFileId,
    fileName: file.fileName,
  }));
  const omittedFiles = plan
    .filter((entry) => !exportFiles.some((file) => file.fileName === entry.fileName))
    .map((entry) => entry.fileName);

  const [source, attachments, snapshotResult, activeRun, bundleRevisions] = await Promise.all([
    assembleFeedSource(db, scope, session),
    createAttachmentRepository(db).listForSession(scope, session.id),
    assembleWorkflowSnapshot(db, session.id, {
      roundBudget: getEnv().MAX_ROUNDS_PER_STAGE,
      capabilities: registeredCapabilityIds(),
    }),
    /*
     * A generation still in flight when this page renders (round 5, Р-3; D-99/D-101). Stated by the
     * server so the card that would have duplicated it is `Stop` before a line of the page's own
     * JavaScript has run.
     */
    createGenerationStore(db).activeRunForSession(session.id),
    /*
     * The sidebar's Specs section describes **the bundle**, not this chat's contribution to it: an
     * Edit chat that has touched one file must still show the other three as approved, because they
     * are. The feed is per-chat (А-6); the bundle is per-project, and this is that read.
     */
    createRevisionRepository(db).projectHistory(scope, session.projectId),
  ]);

  const feed = buildFeed(source);

  /** The bundle's files as rows, so a reference can name one by the id the endpoint reads. */
  const bundleFiles = [
    ...new Map(
      bundleRevisions.map((revision) => [
        revision.specType,
        { specType: revision.specType, specFileId: revision.specFileId },
      ]),
    ).values(),
  ];

  /*
   * The document the session is working on: the newest revision of the file most recently written.
   * Its text is loaded here rather than fetched by the card, because approving a document you cannot
   * read is not a decision, and a decision that waits on a fetch is a decision that can fail to load.
   */
  const revisions = createRevisionRepository(db);
  const positionStage = session.substage === null ? null : session.stage;

  /*
   * An Edit chat writes no document of its own, so "the file this position is drafting" has no
   * answer for it — its `constitution` position is the working stage of a three-step graph, not a
   * constitution. Asking anyway would put the project's real constitution under an approval card
   * that belongs to another conversation.
   */
  const editChat = methodologyConfig(session.methodologyId).chatClass === 'edit';

  const currentFile = editChat
    ? null
    : positionStage !== null && isSpecType(positionStage)
      ? await specFileRepository.findByProjectAndType(scope, session.projectId, positionStage)
      : await specFileRepository.currentFile(scope, session.projectId);

  const latest = currentFile === null ? null : await revisions.latest(currentFile.id);

  /*
   * What «Go back to previous step» would go back to (task 127; Эталон §5.1).
   *
   * **The last document this conversation changed** — read from `source_session_id`, which is the
   * column that exists to answer exactly this now that a project holds several chats (А-6). An Edit
   * chat writes no document of its own, so "the current file" is not a thing it has; what it has is
   * the file it last touched. A generate chat falls back to the document it is working on.
   *
   * `null` when the file has one revision: there is no earlier content, and an offer whose only
   * outcome is a refusal is not an offer.
   */
  const lastTouched = bundleRevisions
    .filter((revision) => revision.sourceSessionId === session.id)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];

  const revertFileId = lastTouched?.specFileId ?? currentFile?.id ?? null;
  const revertHistory = revertFileId === null ? [] : await revisions.history(revertFileId);
  const revertOrdered = [...revertHistory].sort((a, b) => a.revisionNumber - b.revisionNumber);
  const revertCurrent = revertOrdered.at(-1);
  const revertPrevious = revertOrdered.at(-2);

  const revert =
    revertFileId === null || revertCurrent === undefined || revertPrevious === undefined
      ? null
      : {
          specFileId: revertFileId,
          fileName:
            lastTouched?.fileName ??
            plan.find((entry) => entry.specType === currentFile?.specType)?.fileName ??
            'the document',
          currentRevision: revertCurrent.revisionNumber,
          previousRevision: revertPrevious.revisionNumber,
          unifiedDiff: formatUnifiedDiff(
            diffLines(revertCurrent.content, revertPrevious.content),
            lastTouched?.fileName ?? 'document.md',
          ),
        };

  /*
   * The pending refinement or edit, if this chat has one (task 60, task 118; FR-011 AC-3/AC-6).
   *
   * Each diff is recomputed against the revision its proposal was based on, so the card shows what
   * the user was offered even if the file has since moved on — a diff against "whatever is current
   * now" would silently change what accepting means. For a cross-file edit that is one diff per
   * touched file, decided as one set.
   */
  const proposals = createProposedChangeService(db);
  const pendingBlock = feed.blocks.find(
    (block): block is Extract<typeof block, { kind: 'proposal' }> =>
      block.kind === 'proposal' && block.status === 'pending',
  );

  const proposalModel: PendingProposalModel | null =
    pendingBlock === undefined
      ? null
      : await pendingProposalModel(proposals, scope, pendingBlock.proposedChangeId);

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
    /*
     * **The number the gate enforces**, not the environment default (task 132; checklist row
     * `1.4-7`). `roundBudgetFor` was exported for exactly this and never called from a surface, so a
     * brownfield session — budget 2 in its configuration — printed «0 of 3 question rounds
     * answered» and then found the third ask refused. That is D-97 verbatim, one milestone later.
     *
     * Away from an asking position there is no stage to be budgeted, and the panel prints neither
     * line; the environment default is what it falls back to, exactly as before.
     */
    roundBudget:
      snapshot !== null && askingStage !== null
        ? roundBudgetFor(snapshot, askingStage)
        : (snapshot?.roundBudget ?? 0),
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
          <h1 className="text-h2" data-testid="session-project-name">
            {session.projectName}
          </h1>
          {/*
           * The chat's own name beside the project's (А-6). A project holds several conversations
           * now, so a header that named only the project would be the same header on all of them.
           */}
          <span className="text-foreground-muted text-sm" data-testid="session-title">
            {session.title}
          </span>
          <MethodologyBadge methodologyId={session.methodologyId} />
          <Link
            href={`/projects/${session.projectId}`}
            className="text-foreground-muted text-xs hover:underline"
            data-testid="back-to-project"
          >
            All chats
          </Link>
        </div>
        <StepPills
          currentStage={session.stage}
          currentSubstage={session.substage}
          qualityEnabled={session.qualityEnabled}
          methodologyId={session.methodologyId}
        />
      </header>

      {/*
        `auto` rather than a fixed `20rem` (task 133; row `1.5-3`): the sidebar owns its width, and a
        track that did not follow it made the resize handle work in one direction only.
      */}
      <div className="grid min-h-0 gap-6 lg:grid-cols-[minmax(0,1fr)_auto]">
        <SessionFeed
          sessionId={session.id}
          feed={feed}
          methodologyId={session.methodologyId}
          deadlineMs={requestDeadlineMs()}
          actions={actions}
          primaryRevisionId={latest?.id ?? null}
          primaryContent={latest?.content ?? null}
          proposal={proposalModel}
          refineFileId={latest === null ? null : (currentFile?.id ?? null)}
          revert={revert}
          canGenerate={position.substage === 'generate'}
          describePrefill={editChat ? session.initialPrompt : null}
          /*
           * What an `@` may name (task 121): the bundle's promised files and this chat's documents.
           * The plan rather than the written files, so a document that does not exist yet is
           * offered and honestly labelled — the alternative is a menu that changes shape as the
           * session goes on, where the absence of a name reads as "there is no such document".
           */
          references={[
            ...plan.map((entry) => {
              const file = bundleFiles.find((candidate) => candidate.specType === entry.specType);

              return {
                id: `spec:${file?.specFileId ?? entry.specType}`,
                name: entry.fileName,
                kind: 'spec' as const,
                ...(file === undefined ? { empty: true } : {}),
              };
            }),
            ...attachments.map((attachment) => ({
              id: `attachment:${attachment.id}`,
              name: attachment.fileName,
              kind: 'attachment' as const,
            })),
          ]}
          models={modelRegistry()}
          selectedModel={session.modelId ?? AUTO_MODEL}
          activeRun={
            activeRun === null ? null : { runId: activeRun.runId, attempt: activeRun.attempt }
          }
          /*
           * The completion panel's model (task 126). Every field is the bundle's own: the slug the
           * document cards already print, the badge parts of the session's methodology, and the
           * files with the revisions the export would resolve to — so the handoff prompt describes
           * this bundle and no other.
           */
          completion={{
            projectId: session.projectId,
            bundleName: bundleSlug(session.projectName),
            methodologyLabel: methodologyLabel(bundleMethodologyId),
            files: handoffFiles,
            omittedFiles,
            exportMode,
          }}
        />

        <SessionSidebar>
          <SpecsPanel plan={plan} files={specsPanelFiles(bundleRevisions)} />

          <LocalWorkspace />

          <Attachments
            sessionId={session.id}
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
            projectId={session.projectId}
            mode={exportMode}
            files={exportFiles}
            omittedFiles={omittedFiles}
            // The methodology's own plan, so the panel's sentence counts this bundle (task 133).
            planned={plan.length}
          />
        </SessionSidebar>
      </div>
    </section>
  );
}
