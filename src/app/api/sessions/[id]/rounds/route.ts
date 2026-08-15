import { randomUUID } from 'node:crypto';

import { getEnv } from '@/config/env';
import { getDatabase } from '@/db/client';
import { AllProvidersFailedError } from '@/modules/adapters/llm';
import { createDefaultAdapter } from '@/modules/adapters/llm/default-adapter';
import { createInterviewAgent } from '@/modules/agents/interview/interview-agent';
import { QuestionSetSchema } from '@/modules/agents/schemas/question-set';
import { currentOwnerScope } from '@/modules/projects/auth/scope';
import { createInterviewRepository } from '@/modules/projects/repositories/interview';
import { createProjectRepository } from '@/modules/projects/repositories/projects';
import { createSessionRepository } from '@/modules/projects/repositories/sessions';
import { registeredCapabilityIds } from '@/modules/workflow/capabilities';
import { canAskAnotherRound } from '@/modules/workflow/evaluate-transition';
import { isAskingStage } from '@/modules/workflow/model/stages';
import { pendingQuestionRound, pendingRoundId } from '@/modules/workflow/pending-action';
import { createWorkflowStateRepository } from '@/modules/workflow/repositories/workflow-state';
import { assembleWorkflowSnapshot } from '@/modules/workflow/snapshot-assembler';
import { satisfiedNeedNames, unmetNeedNames } from '@/modules/workflow/snapshot';
import { errorResponse, jsonResponse } from '@/modules/web/api/responses';

/**
 * `POST /api/sessions/:id/rounds` — "ask the next round" (the Interview Round Sequence of
 * solution.md, given a route; D-36).
 *
 * The order of checks is the sequence diagram verbatim:
 *
 * 1. a pending round is re-presented, never duplicated (FR-017 AC-3);
 * 2. the budget gate speaks next — exhausted means `ROUND_LIMIT_REACHED` carrying the unmet
 *    needs, which is exactly what the fallback panel renders (FR-005 AC-10, task 37);
 * 3. only then does the agent draft, and its draft is persisted solely after schema validation —
 *    an invalid draft surfaces `DRAFT_INVALID` with nothing stored.
 *
 * Asking is content, not control: nothing in here advances the workflow position.
 */
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

  const assembled = await assembleWorkflowSnapshot(db, session.id, {
    roundBudget: getEnv().MAX_ROUNDS_PER_STAGE,
    capabilities: registeredCapabilityIds(),
  });
  if (assembled === null) return errorResponse('NOT_FOUND');

  const { snapshot } = assembled;
  const { position } = snapshot;

  // Questions are asked in the grounding interview and in a spec stage's `collect` — nowhere
  // else (FR-005 AC-1). Elsewhere the answer is descriptive, not an error: there is simply no
  // collection under way, and no round is created.
  const collecting =
    position.stage === 'interview' ||
    (position.substage !== null && position.substage === 'collect');
  if (!collecting || !isAskingStage(position.stage)) {
    return jsonResponse({ kind: 'not-collecting' });
  }
  const stage = position.stage;

  const workflowStateRepository = createWorkflowStateRepository(db);
  const interviewRepository = createInterviewRepository(db);

  const state = await workflowStateRepository.find(session.id);
  if (state === null) return errorResponse('NOT_FOUND');

  // A pending round is re-presented verbatim (FR-017 AC-3). If its answers already landed —
  // a clear-pending write lost a race — the state self-heals here instead of blocking the user.
  const pendingId = pendingRoundId(state.pendingAction);
  if (pendingId !== null) {
    const pending = await interviewRepository.findRoundById(pendingId);

    if (pending !== null && pending.sessionId === session.id && !pending.answered) {
      return jsonResponse({
        kind: 'round',
        roundId: pending.id,
        roundNumber: pending.roundNumber,
        questions: pending.questions,
      });
    }

    const cleared = await workflowStateRepository.setPendingAction(session.id, null, state.version);
    if (cleared === null) return errorResponse('CONFLICT');
    state.version = cleared.version;
  }

  const budget = canAskAnotherRound(snapshot, stage);
  if (!budget.allowed) {
    return errorResponse('ROUND_LIMIT_REACHED', {
      reason: budget.reason,
      unmetNeeds: unmetNeedNames(snapshot, stage),
    });
  }

  const latest = await interviewRepository.latestRound(session.id, stage);
  const nextRoundNumber = (latest?.roundNumber ?? 0) + 1;

  /*
   * The configured provider chain — the same one generation, review and refinement use (round 2, Д-3).
   *
   * This line used to construct a test double, with a Milestone 2 comment promising that tasks 42–45
   * would swap the composition root. Those tasks swapped every other agent and left the interview
   * behind, so on a deployment paying for a real model **every interview question ever asked came
   * from a hardcoded fixture** — including the "what should the constitution document emphasise?"
   * that the M6 gate walk reported. No test caught it: they all point the chain at the stub anyway,
   * so both worlds looked identical from inside the suite.
   */
  const agent = createInterviewAgent(createDefaultAdapter(undefined, { modelId: session.modelId }));

  /*
   * An exhausted provider chain is an answer, not a crash (round 2, Д-6).
   *
   * The live gate walk found this endpoint returning **500** when the chain ran out: the error
   * escaped, Next turned it into an unhandled failure, and the client got a bare status with no code
   * to branch on and no message worth showing. A generation that could not happen is a normal event
   * in the life of a session (FR-018), and the session must survive it — the transition route has
   * caught the same error since M4; the interview was simply never given the same treatment.
   */
  let outcome;

  try {
    outcome = await agent.draftRound({
      stage,
      // У-5: how the questions are worded, from the session's stored profile (task 106).
      audience: session.audienceProfile,
      // У-1: the session's own language, read from the column, never re-detected (task 108).
      contentLanguage: session.contentLanguage,
      roundNumber: nextRoundNumber,
      initialPrompt: session.initialPrompt,
      summary: session.summary,
      satisfiedNeeds: satisfiedNeedNames(snapshot, stage),
      unmetNeeds: unmetNeedNames(snapshot, stage),
      runId: randomUUID(),
    });
  } catch (error) {
    if (!(error instanceof AllProvidersFailedError)) throw error;

    return errorResponse('GENERATION_FAILED', {
      reason: error.overloaded ? 'overloaded' : 'providers',
      message: error.overloaded
        ? 'The service is busy right now. Nothing has been lost — try again in a minute.'
        : 'The questions could not be drafted just now. Nothing has been lost — try again.',
    });
  }

  if (outcome.kind === 'draft-invalid') {
    return errorResponse('DRAFT_INVALID', { issues: outcome.issues });
  }

  if (outcome.kind === 'nothing-to-ask') {
    return jsonResponse({
      kind: 'collect-complete',
      unmetNeeds: unmetNeedNames(snapshot, stage),
    });
  }

  // Persisted payloads are always schema-valid — the parse here is the write-side guarantee the
  // read side (McqCard, answer validation) relies on.
  const validated = QuestionSetSchema.parse(outcome.set);

  const round = await interviewRepository.createRound({
    sessionId: session.id,
    stage,
    roundNumber: nextRoundNumber,
    questions: validated,
    declaredNeeds: outcome.declaredNeeds,
  });

  const claimed = await workflowStateRepository.setPendingAction(
    session.id,
    pendingQuestionRound(round.id),
    state.version,
  );

  if (claimed === null) {
    // Another request moved the state between our read and this claim. The round row is removed
    // (it was never presented) and the caller retries against the fresh state.
    await interviewRepository.deleteUnansweredRound(round.id);
    return errorResponse('CONFLICT');
  }

  await createProjectRepository(db).touch(scope, session.projectId);

  return jsonResponse(
    {
      kind: 'round',
      roundId: round.id,
      roundNumber: nextRoundNumber,
      questions: validated,
    },
    201,
  );
}
