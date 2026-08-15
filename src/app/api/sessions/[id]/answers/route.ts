import { randomUUID } from 'node:crypto';

import { z } from 'zod';

import { getEnv } from '@/config/env';
import { getDatabase } from '@/db/client';
import { AllProvidersFailedError } from '@/modules/adapters/llm';
import { createDefaultAdapter } from '@/modules/adapters/llm/default-adapter';
import { createInterviewAgent } from '@/modules/agents/interview/interview-agent';
import { createReplyAssessor } from '@/modules/agents/interview/reply-assessment';
import { createSummaryAgent } from '@/modules/agents/interview/summary-agent';
import {
  QuestionSetSchema,
  type QuestionSet,
  type QuestionSetQuestion,
} from '@/modules/agents/schemas/question-set';
import { currentOwnerScope } from '@/modules/projects/auth/scope';
import {
  createInterviewRepository,
  type CardAnswerItem,
  type InterviewRepository,
  type StoredRound,
} from '@/modules/projects/repositories/interview';
import { createProjectRepository } from '@/modules/projects/repositories/projects';
import {
  createSessionRepository,
  type OwnedSession,
} from '@/modules/projects/repositories/sessions';
import type { OwnerScope } from '@/db/owner-scope';
import type { SchemaDatabase } from '@/db';
import { registeredCapabilityIds } from '@/modules/workflow/capabilities';
import { canAskAnotherRound } from '@/modules/workflow/evaluate-transition';
import { isAskingStage, type AskingStage } from '@/modules/workflow/model/stages';
import { pendingQuestionRound, pendingRoundId } from '@/modules/workflow/pending-action';
import { createWorkflowStateRepository } from '@/modules/workflow/repositories/workflow-state';
import { assembleWorkflowSnapshot } from '@/modules/workflow/snapshot-assembler';
import { satisfiedNeedNames, unmetNeedNames } from '@/modules/workflow/snapshot';
import { errorResponse, jsonResponse } from '@/modules/web/api/responses';

/**
 * `POST /api/sessions/:id/answers` — everything the user can say back to the interview
 * (tasks 35–38; FR-005 AC-5/AC-6/AC-8/AC-10/AC-11).
 *
 * Three submission shapes, one route, because all three are "the user answering":
 *
 * - **card** — the round's questions answered through the MCQ card. Option ids and free text are
 *   validated against the persisted round payload, persisted in one statement, and every need the
 *   round declared is marked satisfied (AC-8). Answers are durable before anything else happens
 *   (NFR-003 AC-1).
 * - **reply** — free text instead of the card (AC-6, task 36). The reply is persisted as an
 *   answer of the pending round, an assessment marks the needs it demonstrably satisfied, and the
 *   interview either asks a narrower follow-up (budget permitting) or lets the stage proceed.
 * - **fallback** — direct answers to named unmet needs (AC-10, task 37): recorded against the
 *   stage's latest round in the `need:` namespace and marked satisfied, so exhausting the budget
 *   never strands the session.
 *
 * During the grounding interview every accepted submission refreshes the session summary
 * (task 38) — which is the third condition of the exit gate, persisted here and read by the gate
 * from the database only (FR-006 AC-4).
 */
const CardSubmission = z.object({
  roundId: z.uuid(),
  answers: z
    .array(
      z.object({
        questionId: z.string().min(1),
        selectedOptionIds: z.array(z.string().min(1)).default([]),
        freeText: z.string().max(4000).optional(),
      }),
    )
    .min(1),
});

const ReplySubmission = z.object({
  roundId: z.uuid(),
  reply: z.string().trim().min(1).max(8000),
});

const FallbackSubmission = z.object({
  fallback: z
    .array(
      z.object({
        name: z.string().min(1),
        text: z.string().trim().min(1).max(4000),
      }),
    )
    .min(1),
});

const AnswersRequest = z.union([CardSubmission, ReplySubmission, FallbackSubmission]);

const declaredNeedsOf = (set: QuestionSet): string[] => [
  ...new Set(set.questions.flatMap((question) => question.informationNeeds)),
];

/** Validates card answers against the round's persisted questions; returns items or a complaint. */
function matchAnswersToQuestions(
  set: QuestionSet,
  submitted: z.infer<typeof CardSubmission>['answers'],
): { ok: true; items: CardAnswerItem[] } | { ok: false; problem: string } {
  const byQuestion = new Map(submitted.map((item) => [item.questionId, item]));

  if (byQuestion.size !== submitted.length) {
    return { ok: false, problem: 'a question was answered twice' };
  }

  const knownIds = new Set(set.questions.map((question) => question.id));
  for (const item of submitted) {
    if (!knownIds.has(item.questionId)) {
      return { ok: false, problem: `unknown question: ${item.questionId}` };
    }
  }

  const items: CardAnswerItem[] = [];

  for (const question of set.questions) {
    const item = byQuestion.get(question.id);
    if (item === undefined) {
      return { ok: false, problem: `question not answered: ${question.id}` };
    }

    const optionIds = new Set(question.options.map((option) => option.id));
    for (const selected of item.selectedOptionIds) {
      if (!optionIds.has(selected)) {
        return { ok: false, problem: `unknown option ${selected} for question ${question.id}` };
      }
    }

    if (question.type === 'single' && item.selectedOptionIds.length > 1) {
      return { ok: false, problem: `question ${question.id} accepts one selection` };
    }

    const freeText = item.freeText?.trim() ?? '';
    if (item.selectedOptionIds.length === 0 && freeText === '') {
      return { ok: false, problem: `question ${question.id} was left empty` };
    }

    items.push({
      questionId: question.id,
      selectedOptionIds: [...new Set(item.selectedOptionIds)],
      freeText: freeText === '' ? undefined : freeText,
    });
  }

  return { ok: true, items };
}

/** Human-readable lines of what was answered — context for the summary prompt. */
function highlightAnswers(set: QuestionSet, items: readonly CardAnswerItem[]): string[] {
  const questionById = new Map<string, QuestionSetQuestion>(
    set.questions.map((question) => [question.id, question]),
  );

  return items.map((item) => {
    const question = questionById.get(item.questionId);
    if (question === undefined) return `${item.questionId}: ${item.freeText ?? ''}`;

    const labels = question.options
      .filter((option) => item.selectedOptionIds.includes(option.id))
      .map((option) => option.label);
    if (item.freeText !== undefined) labels.push(`"${item.freeText}"`);

    return `${question.text} — ${labels.join('; ')}`;
  });
}

async function refreshInterviewSummary(
  db: SchemaDatabase,
  scope: OwnerScope,
  session: OwnedSession,
  highlights: readonly string[],
): Promise<boolean> {
  const summariser = createSummaryAgent(
    createDefaultAdapter(undefined, { modelId: session.modelId }),
  );

  /*
   * An exhausted chain means "no summary yet", not "the submission failed" (round 2, Д-6).
   *
   * The answers are already durable by the time this runs (NFR-003 AC-1), so letting the error
   * escape would turn a successful, persisted submission into a 500 — the user would be told their
   * answers were lost while looking at a database that had kept them. The live gate walk found
   * exactly that. `false` is the honest report: the summary is the third condition of the interview
   * exit gate, and it is simply not met yet; the next submission tries again.
   */
  let summary: string | null;

  try {
    summary = await summariser.summarise({
      initialPrompt: session.initialPrompt,
      answeredHighlights: highlights,
      contentLanguage: session.contentLanguage,
      runId: randomUUID(),
    });
  } catch (error) {
    if (!(error instanceof AllProvidersFailedError)) throw error;
    return false;
  }

  if (summary === null) return false;

  return createSessionRepository(db).updateSummary(scope, session.id, summary);
}

/** The round named by the body, provably belonging to this session and currently pending. */
async function resolvePendingRound(
  interviewRepository: InterviewRepository,
  session: OwnedSession,
  pendingAction: unknown,
  roundId: string,
): Promise<{ ok: true; round: StoredRound; set: QuestionSet } | { ok: false; response: Response }> {
  const round = await interviewRepository.findRoundById(roundId);
  if (round?.sessionId !== session.id) {
    return { ok: false, response: errorResponse('NOT_FOUND') };
  }

  if (pendingRoundId(pendingAction) !== round.id || round.answered) {
    return { ok: false, response: errorResponse('CONFLICT') };
  }

  const set = QuestionSetSchema.safeParse(round.questions);
  if (!set.success) {
    // A persisted payload that fails the schema means write-side validation drifted — loud.
    throw new Error(`round ${round.id} holds an invalid question payload`);
  }

  return { ok: true, round, set: set.data };
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

  const body: unknown = await request.json().catch(() => null);
  const parsed = AnswersRequest.safeParse(body);
  if (!parsed.success) {
    return errorResponse('VALIDATION_FAILED', {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  const workflowStateRepository = createWorkflowStateRepository(db);
  const interviewRepository = createInterviewRepository(db);
  const projectRepository = createProjectRepository(db);

  const state = await workflowStateRepository.find(session.id);
  if (state === null) return errorResponse('NOT_FOUND');

  const position =
    state.substage === null
      ? { stage: state.stage, substage: null }
      : { stage: state.stage, substage: state.substage };

  if (!isAskingStage(position.stage)) return errorResponse('CONFLICT');
  const stage: AskingStage = position.stage;

  const snapshotOptions = {
    roundBudget: getEnv().MAX_ROUNDS_PER_STAGE,
    capabilities: registeredCapabilityIds(),
  };

  // ——— Fallback: direct answers to named unmet needs (task 37) ———
  if ('fallback' in parsed.data) {
    const fallbackItems = parsed.data.fallback;

    const assembled = await assembleWorkflowSnapshot(db, session.id, snapshotOptions);
    if (assembled === null) return errorResponse('NOT_FOUND');

    const unmet = new Set(unmetNeedNames(assembled.snapshot, stage));
    const unknown = fallbackItems.filter((item) => !unmet.has(item.name));
    if (unknown.length > 0) {
      return errorResponse('VALIDATION_FAILED', {
        issues: unknown.map((item) => ({
          path: 'fallback',
          message: `not an unmet information need of this stage: ${item.name}`,
        })),
      });
    }

    const latest = await interviewRepository.latestRound(session.id, stage);
    if (latest === null) return errorResponse('CONFLICT');

    for (const item of fallbackItems) {
      await interviewRepository.addFallbackAnswer(latest.id, item.name, item.text);
    }
    await interviewRepository.markNeedsSatisfied(
      session.id,
      stage,
      fallbackItems.map((item) => item.name),
      latest.id,
    );

    let summaryPersisted = session.summary !== null;
    if (stage === 'interview') {
      summaryPersisted =
        (await refreshInterviewSummary(
          db,
          scope,
          session,
          fallbackItems.map((item) => `${item.name} — "${item.text}"`),
        )) || summaryPersisted;
    }

    await projectRepository.touch(scope, session.projectId);

    return jsonResponse({
      kind: 'fallback-recorded',
      satisfied: fallbackItems.map((item) => item.name),
      unmetNeeds: [...unmet].filter((name) => !fallbackItems.some((item) => item.name === name)),
      summaryPersisted,
    });
  }

  // ——— Card and reply both need the pending round resolved first ———
  const resolved = await resolvePendingRound(
    interviewRepository,
    session,
    state.pendingAction,
    parsed.data.roundId,
  );
  if (!resolved.ok) return resolved.response;

  const { round, set } = resolved;
  const declaredNeeds = declaredNeedsOf(set);

  // ——— Reply: free text instead of the card (task 36) ———
  if ('reply' in parsed.data) {
    await interviewRepository.addReplyAnswer(round.id, parsed.data.reply);

    const assessor = createReplyAssessor(
      createDefaultAdapter(undefined, { modelId: session.modelId }),
    );
    /*
     * The assessor is already documented as conservative — when in doubt it satisfies nothing. An
     * exhausted chain is the deepest possible doubt, so it takes the same branch rather than
     * escaping as a 500 over an answer that is already stored (round 2, Д-6).
     */
    let satisfied: readonly string[];

    try {
      satisfied = await assessor.assess({
        reply: parsed.data.reply,
        declaredNeeds,
        contentLanguage: session.contentLanguage,
        runId: randomUUID(),
      });
    } catch (error) {
      if (!(error instanceof AllProvidersFailedError)) throw error;
      satisfied = [];
    }
    await interviewRepository.markNeedsSatisfied(session.id, stage, satisfied, round.id);

    let summaryPersisted = session.summary !== null;
    if (stage === 'interview') {
      summaryPersisted =
        (await refreshInterviewSummary(db, scope, session, [
          `free-text reply — "${parsed.data.reply}"`,
        ])) || summaryPersisted;
    }

    // The reply answered the round; what happens next depends on budget and on what remains
    // open — a narrower follow-up, or nothing further (FR-005 AC-6).
    const assembled = await assembleWorkflowSnapshot(db, session.id, snapshotOptions);
    if (assembled === null) return errorResponse('NOT_FOUND');
    const unmetNow = unmetNeedNames(assembled.snapshot, stage);

    const clearPending = async (): Promise<void> => {
      const fresh = await workflowStateRepository.find(session.id);
      if (fresh !== null && pendingRoundId(fresh.pendingAction) === round.id) {
        await workflowStateRepository.setPendingAction(session.id, null, fresh.version);
      }
    };

    await projectRepository.touch(scope, session.projectId);

    if (!canAskAnotherRound(assembled.snapshot, stage).allowed) {
      await clearPending();
      return jsonResponse({ kind: 'limit', unmetNeeds: unmetNow, summaryPersisted });
    }

    const nextRoundNumber = round.roundNumber + 1;
    const agent = createInterviewAgent(
      createDefaultAdapter(undefined, { modelId: session.modelId }),
    );

    /*
     * A follow-up that could not be drafted is "nothing narrower to ask" — the branch immediately
     * below, which already exists for an unusable draft. The reply is answered and stored either
     * way, and the user can ask again from the panel (round 2, Д-6).
     */
    let outcome;

    try {
      outcome = await agent.draftRound({
        stage,
        // У-5: how the questions are worded, from the session's stored profile (task 106).
        audience: session.audienceProfile,
        roundNumber: nextRoundNumber,
        initialPrompt: session.initialPrompt,
        summary: session.summary,
        satisfiedNeeds: satisfiedNeedNames(assembled.snapshot, stage),
        unmetNeeds: unmetNow,
        freeTextReply: parsed.data.reply,
        runId: randomUUID(),
      });
    } catch (error) {
      if (!(error instanceof AllProvidersFailedError)) throw error;
      outcome = { kind: 'nothing-to-ask' } as const;
    }

    if (outcome.kind !== 'round') {
      // Nothing narrower to ask (or the draft was unusable — retriable via the ask button):
      // the round is answered, the card is consumed, the stage may proceed on its gates.
      await clearPending();
      return jsonResponse({ kind: 'proceed', unmetNeeds: unmetNow, summaryPersisted });
    }

    // The answered round was the stage's newest, so the follow-up takes the next number; a
    // collision under a concurrent ask resolves as CONFLICT via the unique constraint.
    const followUp = await interviewRepository.createRound({
      sessionId: session.id,
      stage,
      roundNumber: nextRoundNumber,
      questions: outcome.set,
      declaredNeeds: outcome.declaredNeeds,
    });

    const fresh = await workflowStateRepository.find(session.id);
    const claimed =
      fresh === null
        ? null
        : await workflowStateRepository.setPendingAction(
            session.id,
            pendingQuestionRound(followUp.id),
            fresh.version,
          );
    if (claimed === null) {
      await interviewRepository.deleteUnansweredRound(followUp.id);
      return errorResponse('CONFLICT');
    }

    return jsonResponse(
      {
        kind: 'follow-up',
        roundId: followUp.id,
        roundNumber: nextRoundNumber,
        questions: outcome.set,
        summaryPersisted,
      },
      201,
    );
  }

  // ——— Card submission (task 35) ———
  const matched = matchAnswersToQuestions(set, parsed.data.answers);
  if (!matched.ok) {
    return errorResponse('VALIDATION_FAILED', {
      issues: [{ path: 'answers', message: matched.problem }],
    });
  }

  // Durable before anything renders or advances (NFR-003 AC-1).
  await interviewRepository.submitCardAnswers(round.id, matched.items);

  // Answering the round satisfies every need it declared (FR-005 AC-8).
  await interviewRepository.markNeedsSatisfied(session.id, stage, declaredNeeds, round.id);

  let summaryPersisted = session.summary !== null;
  if (stage === 'interview') {
    summaryPersisted =
      (await refreshInterviewSummary(db, scope, session, highlightAnswers(set, matched.items))) ||
      summaryPersisted;
  }

  // Consuming the card. A lost race here is harmless: the rounds endpoint and the page treat an
  // answered pending round as consumed and self-heal the pointer.
  const freshState = await workflowStateRepository.find(session.id);
  if (freshState !== null && pendingRoundId(freshState.pendingAction) === round.id) {
    await workflowStateRepository.setPendingAction(session.id, null, freshState.version);
  }

  await projectRepository.touch(scope, session.projectId);

  return jsonResponse({
    kind: 'answered',
    roundId: round.id,
    satisfiedNeeds: declaredNeeds,
    summaryPersisted,
  });
}
