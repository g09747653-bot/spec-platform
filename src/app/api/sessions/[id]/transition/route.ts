import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import { getEnv } from '@/config/env';
import type { SchemaDatabase } from '@/db';
import { getDatabase } from '@/db/client';
import type { OwnerScope } from '@/db/owner-scope';
import { AllProvidersFailedError } from '@/modules/adapters/llm';
import { createDefaultAdapter } from '@/modules/adapters/llm/default-adapter';
import { createReviewAgent } from '@/modules/agents/review/review-agent';
import { methodologyConfig } from '@/modules/methodologies';
import { currentOwnerScope } from '@/modules/projects/auth/scope';
import { describeQuestionSet } from '@/modules/projects/create-chat';
import { createInterviewRepository } from '@/modules/projects/repositories/interview';
import { createProjectRepository } from '@/modules/projects/repositories/projects';
import {
  createSessionRepository,
  type OwnedSession,
} from '@/modules/projects/repositories/sessions';
import { lintSpecDocument, type LintFinding } from '@/modules/specs/lint';
import { isCoreSpecType, type CoreSpecType } from '@/modules/specs/model/spec-files';
import {
  createReviewRepository,
  type StoredReviewItem,
} from '@/modules/specs/repositories/reviews';
import { createRevisionRepository } from '@/modules/specs/repositories/revisions';
import { createSpecFileRepository } from '@/modules/specs/repositories/spec-files';
import { errorResponse, jsonResponse, type ErrorCode } from '@/modules/web/api/responses';
import { applyTransition } from '@/modules/workflow/apply-transition';
import { registeredCapabilityIds } from '@/modules/workflow/capabilities';
import {
  isAskingStage,
  isSpecStage,
  STAGES,
  SUBSTAGES,
  type StagePosition,
} from '@/modules/workflow/model/stages';
import type { ReasonCode } from '@/modules/workflow/reason-codes';
import type { WorkflowPosition } from '@/modules/workflow/repositories/workflow-state';

/**
 * `POST /api/sessions/:id/transition` — the one door through which a session moves (task 29;
 * FR-007 AC-6; NFR-012 AC-4).
 *
 * The handler owns nothing but plumbing: ownership, body validation, and the mapping from the
 * engine's verdict to the HTTP vocabulary. Whether the movement is legal is decided entirely by
 * `evaluateTransition` inside `applyTransition`; a rejection returns 409 with the machine-readable
 * reason and leaves the persisted state untouched.
 */
const TransitionRequest = z.object({
  toStage: z.enum(STAGES),
  toSubstage: z.enum(SUBSTAGES).optional(),
});

/**
 * Turns a deterministic finding into a board item (task 114; А-3 У-3).
 *
 * `blocking` and `confidence: 10` are not a judgement about importance — they are what a
 * *measurement* looks like on a card built for opinions. A cross-reference either resolves or it
 * does not; there is no version of that finding the reviewer is 7/10 sure about. `source: 'linter'`
 * is what lets the card say so instead of printing a confidence score that would be theatre.
 */
function asBoardItem(finding: LintFinding): StoredReviewItem {
  return {
    id: finding.id,
    sectionPath: finding.sectionPath,
    title: finding.title,
    body: finding.body,
    suggestion: finding.suggestion,
    confidence: 10,
    severity: 'blocking',
    source: 'linter',
  };
}

/**
 * The deterministic pass over the approved revision (task 114).
 *
 * Reads the previous **approved** revision (identifier stability) and the rest of the approved
 * bundle (cross-references, and requirement→task traceability for a tasks document). Everything it
 * needs is already persisted, so it costs no model call — which is why it runs before the review
 * agent and survives it: a board with linter findings and no model opinion is still a useful board.
 */
async function lintApprovedRevision(
  db: SchemaDatabase,
  scope: OwnerScope,
  projectId: string,
  specType: CoreSpecType,
  approved: { id: string; specFileId: string; revisionNumber: number; content: string },
): Promise<StoredReviewItem[]> {
  const revisions = createRevisionRepository(db);

  const history = await revisions.history(approved.specFileId);
  const earlier = history.filter(
    (revision) => revision.approved && revision.revisionNumber < approved.revisionNumber,
  );
  const previousContent = earlier[earlier.length - 1]?.content ?? null;

  const bundle: Record<string, string> = {};
  for (const file of await createSpecFileRepository(db).approvedForExport(scope, projectId)) {
    bundle[file.specType] = file.content;
  }

  return lintSpecDocument({
    specType,
    content: approved.content,
    previousContent,
    bundle,
  }).map(asBoardItem);
}

/**
 * The Describe card of an Edit chat, created once per stage entry (task 118).
 *
 * The Edit workflow's second step is a sentence the user finishes, and the reference product opens
 * it prefilled: «I want to update spec {bundle} to …». That prefill is the session's own
 * `initial_prompt` — stored at the Reference step and shown here — so the card and the record cannot
 * drift into two different accounts of what the chat is about.
 *
 * Idempotent by round number: entering `collect` again after a backward step re-presents the round
 * that is already there rather than stacking a second identical question, exactly as
 * `ensureStageReview` re-presents its board.
 */
async function ensureDescribeRound(
  db: SchemaDatabase,
  session: OwnedSession,
  position: WorkflowPosition,
): Promise<void> {
  if (position.substage !== 'collect') return;
  if (methodologyConfig(session.methodologyId).chatClass !== 'edit') return;
  if (!isAskingStage(position.stage)) return;

  const interview = createInterviewRepository(db);
  const existing = await interview.latestRound(session.id, position.stage);
  if (existing !== null) return;

  await interview.createRound({
    sessionId: session.id,
    stage: position.stage,
    roundNumber: 1,
    questions: describeQuestionSet(position.stage),
    declaredNeeds: ['requested-change'],
  });
}

/**
 * Produces the review of a stage's approved spec on entry to `review` (task 56; FR-010 AC-1;
 * task 114 for the deterministic half).
 *
 * Returns the review's id, or `null` when this transition is not an entry into `review`, when the
 * stage has no approved revision, or when there is nothing at all to show.
 *
 * **A review that cannot be produced is not a failed transition.** The session has legitimately
 * moved, the approved revision is durable, and the board simply has nothing to show yet. Undoing a
 * gated, permitted move to protect an advisory artifact would trade the user's progress for a
 * second opinion, which is the wrong way round (P5).
 *
 * **The two halves of a board are not equally fragile.** The linters read the document and answer;
 * the reviewer asks a model and may get nothing. So the linters run first and their findings are
 * kept whatever happens next: an exhausted provider chain now costs the *opinions*, not the
 * measurements, and a session on a bad day still gets told that FR-042 resolves to nothing.
 *
 * `create` is idempotent per revision, so re-entering `review` after a backward step re-presents the
 * same review rather than replacing it — the content is immutable, so a second review of the same
 * bytes could only ever disagree with the one the user is already looking at.
 */
async function ensureStageReview(
  db: SchemaDatabase,
  scope: OwnerScope,
  projectId: string,
  position: WorkflowPosition,
  /** The session's content language (У-1; task 108) — findings are prose the user has to read. */
  contentLanguage: string | null,
  /** The chat's model choice (task 121): a board is an agent call like any other. */
  modelId: string | null,
): Promise<string | null> {
  if (position.substage !== 'review' || !isCoreSpecType(position.stage)) return null;

  const specFile = await createSpecFileRepository(db).findByProjectAndType(
    scope,
    projectId,
    position.stage,
  );
  if (specFile === null) return null;

  const approved = await createRevisionRepository(db).latestApproved(specFile.id);
  if (approved === null) return null;

  const reviews = createReviewRepository(db);
  const linterItems = await lintApprovedRevision(db, scope, projectId, position.stage, approved);

  /*
   * What a re-review is verifying (task 113; Эталон §1.3).
   *
   * When this stage has been round the loop, the previous board carries the points the user ticked,
   * and the reviewer is asked whether the new text actually applies them — «Verifying the revision
   * against the four items you selected». Only the ticked ones are passed, and the unticked ones are
   * not mentioned at all: what a prompt is told, it acts on, which is the reasoning task 57 wrote
   * into the context assembler's feedback filter and the reason a declined point cannot be
   * re-litigated by construction rather than by instruction.
   *
   * `lastRequestedChangesForFile`, not `requestedChangesForFile`: by the time a re-review runs the
   * revision exists, so the query that answers "what must the next generation apply?" has gone quiet.
   */
  const previous = await reviews.lastRequestedChangesForFile(scope, specFile.id);
  const verifying =
    previous === null || previous.specRevisionId === approved.id
      ? []
      : previous.items
          .filter((item) => (previous.selectedItemIds ?? []).includes(item.id))
          .map((item) => ({
            sectionPath: item.sectionPath,
            title: item.title,
            suggestion: item.suggestion,
          }));

  // The configured chain, with failover, exactly as generation uses it: the review agent needs no
  // provider of its own and no configuration of its own (A3; P7).
  const agent = createReviewAgent(createDefaultAdapter(undefined, { modelId }));

  /*
   * The exhausted-chain case is caught here rather than allowed to propagate, and that is the whole
   * of the paragraph above made real: `AllProvidersFailedError` escaping this function would turn a
   * permitted, already-persisted transition into a 500, losing the user's position to protect an
   * advisory artifact. The board is simply empty until they step back in.
   */
  let review;
  try {
    review = await agent.review({
      specType: position.stage,
      specContent: approved.content,
      contentLanguage,
      verifying,
      runId: randomUUID(),
    });
  } catch (error) {
    if (!(error instanceof AllProvidersFailedError)) throw error;
    review = null;
  }

  const opinion = review?.kind === 'review' ? review : null;

  /*
   * Machine findings first, and a model finding that borrowed a linter's id is dropped rather than
   * stored beside it. Two items with one id would make `selected_item_ids` ambiguous, which is the
   * one thing FR-010 AC-7 cannot survive — and between a measurement and an opinion wearing its
   * name, the measurement is the one to keep.
   */
  const machineIds = new Set(linterItems.map((item) => item.id));
  const items = [
    ...linterItems,
    ...(opinion?.items ?? []).filter((item) => !machineIds.has(item.id)),
  ];

  // Nothing measured and nothing said: there is no board to show, and the transition still stands.
  if (items.length === 0 && opinion === null) return null;

  const stored = await reviews.create({
    specRevisionId: approved.id,
    /*
     * A blocking item and a passing verdict cannot both be true — the artifact schema refuses that
     * combination for the model's own findings, and a linter finding is no less blocking for having
     * arrived from a different producer.
     */
    outcome: items.some((item) => item.severity === 'blocking')
      ? 'needs_revision'
      : (opinion?.artifact.verdict ?? 'pass'),
    summary: opinion?.artifact.summary ?? machineOnlySummary(linterItems.length),
    items,
  });

  return stored.id;
}

/** What the board says when the chain gave nothing and only the linters have spoken (task 114). */
function machineOnlySummary(findings: number): string {
  return findings === 1
    ? 'The automated checks found one problem in this document. The AI reviewer could not be reached, so nothing here is its opinion.'
    : `The automated checks found ${String(findings)} problems in this document. The AI reviewer could not be reached, so nothing here is its opinion.`;
}

/** Reasons that are their own HTTP code in the solution's error table; the rest are GATE_REJECTED. */
const STANDALONE_REASONS: Partial<Record<ReasonCode, ErrorCode>> = {
  CAPABILITY_NOT_REGISTERED: 'CAPABILITY_NOT_REGISTERED',
  ROUND_LIMIT_REACHED: 'ROUND_LIMIT_REACHED',
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const scope = await currentOwnerScope();
  if (scope === null) return errorResponse('UNAUTHENTICATED');

  const { id: sessionId } = await params;
  const db = getDatabase();

  // The join in this lookup is the authorisation: a session that is not the caller's is simply
  // not found (AR-2), and nothing below runs for it.
  const session = await createSessionRepository(db).findById(scope, sessionId);
  if (session === null) return errorResponse('NOT_FOUND');

  const body: unknown = await request.json().catch(() => null);
  const parsed = TransitionRequest.safeParse(body);

  if (!parsed.success) {
    return errorResponse('VALIDATION_FAILED', {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  // A target must be a real position before the table is even consulted: a spec stage carries a
  // substage, `interview` and `complete` never do. A malformed pair is a bad request, not an
  // illegal transition — the table only ever sees positions that exist.
  const { toStage, toSubstage } = parsed.data;
  let to: StagePosition;

  if (isSpecStage(toStage)) {
    if (toSubstage === undefined) {
      return errorResponse('VALIDATION_FAILED', {
        issues: [{ path: 'toSubstage', message: `${toStage} requires a substage` }],
      });
    }
    to = { stage: toStage, substage: toSubstage };
  } else {
    if (toSubstage !== undefined) {
      return errorResponse('VALIDATION_FAILED', {
        issues: [{ path: 'toSubstage', message: `${toStage} has no substages` }],
      });
    }
    to = { stage: toStage, substage: null };
  }

  const outcome = await applyTransition(db, session.id, to, {
    roundBudget: getEnv().MAX_ROUNDS_PER_STAGE,
    capabilities: registeredCapabilityIds(),
  });

  switch (outcome.status) {
    case 'applied': {
      await createProjectRepository(db).touch(scope, session.projectId);

      // FR-010 AC-1: entering `review` is what produces the review — not approving, which merely
      // permits the move (FR-009 AC-3). AC-8's "a revised spec, once approved, gets a fresh review"
      // follows without a branch: the review is keyed to a revision, so re-entering review after a
      // new approval reviews the new content by construction.
      const reviewId = await ensureStageReview(
        db,
        scope,
        session.projectId,
        outcome.position,
        session.contentLanguage,
        session.modelId,
      );

      /*
       * The Describe step of an Edit chat (task 118), presented on arrival.
       *
       * Same shape as `ensureStageReview` above and for the same reason: the card a position owes
       * the user is produced by *entering* the position, not by the user asking for it — an Edit
       * chat that landed in Describe with nothing on screen would be a step with no step in it.
       *
       * Unlike the review it costs no model call: the question is the same one every time and its
       * prefill comes from the session's own stored prompt, so there is nothing here that can hang,
       * fail over, or need a counter beside it.
       */
      await ensureDescribeRound(db, session, outcome.position);

      return jsonResponse({
        stage: outcome.position.stage,
        substage: outcome.position.substage,
        version: outcome.position.version,
        ...(reviewId === null ? {} : { reviewId }),
      });
    }
    case 'rejected': {
      const code = STANDALONE_REASONS[outcome.reason] ?? 'GATE_REJECTED';

      // The reason code is the payload (NFR-012 AC-4); `unmet` names the interview conditions
      // still outstanding when the reason is INTERVIEW_INCOMPLETE (FR-006 AC-2).
      return errorResponse(code, {
        reason: outcome.reason,
        ...(!outcome.result.allowed && outcome.result.unmet !== undefined
          ? { unmet: outcome.result.unmet }
          : {}),
      });
    }
    case 'conflict':
      return errorResponse('CONFLICT');
    case 'not-found':
      return errorResponse('NOT_FOUND');
  }
}
