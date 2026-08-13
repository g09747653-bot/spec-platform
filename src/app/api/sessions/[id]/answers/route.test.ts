import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as EnvModule from '@/config/env';
import { OwnerScope } from '@/db/owner-scope';
import {
  answers as answersTable,
  informationNeeds,
  projects,
  sessions,
  users,
  workflowState,
} from '@/db/schema';
import { createMigratedDatabase, type TestDatabase } from '@/db/testing/migrated-database';

vi.mock('@/modules/projects/auth/scope', () => ({
  currentOwnerScope: vi.fn(),
  requireOwnerScope: vi.fn(),
}));

vi.mock('@/db/client', () => ({ getDatabase: vi.fn() }));

import { TEST_ENV } from '@/config/testing/test-env';

vi.mock('@/config/env', async (importOriginal) => {
  const actual = await importOriginal<typeof EnvModule>();

  return {
    ...actual,
    getEnv: () => actual.parseEnv(TEST_ENV),
  };
});

import { getDatabase } from '@/db/client';
import { currentOwnerScope } from '@/modules/projects/auth/scope';

import { POST as postTransition } from '../transition/route';
import { POST as postRound } from '../rounds/route';

import { POST as postAnswers } from './route';

/**
 * The interview loop end to end at the handler level (tasks 35–38), against real PostgreSQL:
 *
 *   ask → answer the card → needs satisfied, summary persisted, pending consumed
 *       → the interview exit gate opens exactly then (task 38), through the real transition
 *         endpoint — refused before, permitted after (FR-006 AC-1..AC-4)
 *   ask → reply in free text → narrower follow-up round (task 36)
 *       → budget exhausted → named unmet needs → direct fallback answers (task 37).
 */
const asJson = async (response: Response): Promise<Record<string, unknown>> =>
  (await response.json()) as Record<string, unknown>;

interface RoundPayload {
  roundId: string;
  roundNumber: number;
  questions: {
    questions: {
      id: string;
      type: 'single' | 'multiple';
      options: { id: string }[];
      informationNeeds: string[];
    }[];
  };
}

describe('POST /api/sessions/:id/answers', () => {
  let database: TestDatabase;
  let ownerId: string;
  let sessionId: string;

  const ask = async (): Promise<RoundPayload> => {
    const response = await postRound(new Request('http://test.local/rounds', { method: 'POST' }), {
      params: Promise.resolve({ id: sessionId }),
    });
    const body = await asJson(response);
    expect(body.kind).toBe('round');

    return body as unknown as RoundPayload;
  };

  const submit = (body: unknown): Promise<Response> =>
    postAnswers(
      new Request('http://test.local/answers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id: sessionId }) },
    );

  const transition = (toStage: string, toSubstage?: string): Promise<Response> =>
    postTransition(
      new Request('http://test.local/transition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toStage, ...(toSubstage === undefined ? {} : { toSubstage }) }),
      }),
      { params: Promise.resolve({ id: sessionId }) },
    );

  /** Answers every question of a round through the card, picking each question's first option. */
  const answerCard = async (round: RoundPayload): Promise<Response> =>
    submit({
      roundId: round.roundId,
      answers: round.questions.questions.map((question) => ({
        questionId: question.id,
        selectedOptionIds: [question.options[0]?.id ?? ''],
      })),
    });

  beforeAll(async () => {
    database = await createMigratedDatabase();
    vi.mocked(getDatabase).mockReturnValue(
      database.db as unknown as ReturnType<typeof getDatabase>,
    );
  });

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    await database.db.delete(users);

    const [owner] = await database.db
      .insert(users)
      .values({ email: 'owner@example.test' })
      .returning({ id: users.id });
    ownerId = owner?.id ?? '';

    const [project] = await database.db
      .insert(projects)
      .values({ ownerId, name: 'Answers' })
      .returning({ id: projects.id });
    const [session] = await database.db
      .insert(sessions)
      .values({ projectId: project?.id ?? '', initialPrompt: 'Build a spec platform' })
      .returning({ id: sessions.id });
    sessionId = session?.id ?? '';

    await database.db.insert(workflowState).values({ sessionId, stage: 'interview' });

    vi.mocked(currentOwnerScope).mockResolvedValue(OwnerScope.forAuthenticatedUser(ownerId));
  });

  it('persists a card submission, satisfies the round needs, saves the summary, opens the gate', async () => {
    // Before anything: the interview exit is shut, naming what is missing (FR-006 AC-2).
    const shut = await transition('constitution', 'collect');
    expect(shut.status).toBe(409);
    expect(await asJson(shut)).toMatchObject({
      error: { details: { reason: 'INTERVIEW_INCOMPLETE', unmet: ['answered-round', 'summary'] } },
    });

    const round = await ask();
    const response = await answerCard(round);

    expect(response.status).toBe(200);
    expect(await asJson(response)).toMatchObject({
      kind: 'answered',
      satisfiedNeeds: ['target-users', 'core-problem'],
      summaryPersisted: true,
    });

    // Both option ids and free text are retained (DR-5) — here options; the reply case below
    // covers free text.
    const rows = await database.db
      .select({ questionId: answersTable.questionId })
      .from(answersTable);
    expect(rows).toHaveLength(2);

    // The round's declared needs are satisfied, attributed to this round (FR-005 AC-8).
    const needs = await database.db
      .select({ name: informationNeeds.name, satisfiedBy: informationNeeds.satisfiedByRound })
      .from(informationNeeds)
      .where(eq(informationNeeds.sessionId, sessionId));
    expect(needs.every((need) => need.satisfiedBy === round.roundId)).toBe(true);

    // The summary is persisted on the session (task 38) …
    const [session] = await database.db
      .select({ summary: sessions.summary })
      .from(sessions)
      .where(eq(sessions.id, sessionId));
    expect(session?.summary).not.toBeNull();

    // … the card is consumed (FR-017 AC-4 in reverse: nothing pending after the decision) …
    const [state] = await database.db
      .select({ pendingAction: workflowState.pendingAction })
      .from(workflowState)
      .where(eq(workflowState.sessionId, sessionId));
    expect(state?.pendingAction).toBeNull();

    // … and the same transition that was refused is now permitted (task 38; FR-006 AC-3).
    const open = await transition('constitution', 'collect');
    expect(open.status).toBe(200);
  });

  it('validates the card against the persisted round payload (FR-005 AC-2)', async () => {
    const round = await ask();
    const [first, second] = round.questions.questions;
    if (first === undefined || second === undefined) throw new Error('stub round changed');

    // Unknown question.
    expect(
      (
        await submit({
          roundId: round.roundId,
          answers: [{ questionId: 'q-invented', selectedOptionIds: ['x'] }],
        })
      ).status,
    ).toBe(422);

    // Unknown option.
    expect(
      (
        await submit({
          roundId: round.roundId,
          answers: [
            { questionId: first.id, selectedOptionIds: ['not-an-option'] },
            { questionId: second.id, selectedOptionIds: [second.options[0]?.id ?? ''] },
          ],
        })
      ).status,
    ).toBe(422);

    // Two selections on a single-select question.
    expect(
      (
        await submit({
          roundId: round.roundId,
          answers: [
            {
              questionId: first.id,
              selectedOptionIds: [first.options[0]?.id ?? '', first.options[1]?.id ?? ''],
            },
            { questionId: second.id, selectedOptionIds: [second.options[0]?.id ?? ''] },
          ],
        })
      ).status,
    ).toBe(422);

    // A question left out entirely.
    expect(
      (
        await submit({
          roundId: round.roundId,
          answers: [{ questionId: first.id, selectedOptionIds: [first.options[0]?.id ?? ''] }],
        })
      ).status,
    ).toBe(422);

    // Nothing was persisted along the way (NFR-003 AC-1 — all or nothing).
    expect(await database.db.select().from(answersTable)).toHaveLength(0);
  });

  it('accepts the free-text escape hatch as the whole answer (FR-005 AC-3)', async () => {
    const round = await ask();
    const [first, second] = round.questions.questions;
    if (first === undefined || second === undefined) throw new Error('stub round changed');

    const response = await submit({
      roundId: round.roundId,
      answers: [
        { questionId: first.id, selectedOptionIds: [], freeText: 'a niche you did not list' },
        { questionId: second.id, selectedOptionIds: [second.options[0]?.id ?? ''] },
      ],
    });

    expect(response.status).toBe(200);

    const rows = await database.db
      .select({ questionId: answersTable.questionId, freeText: answersTable.freeText })
      .from(answersTable);
    expect(rows.find((row) => row.questionId === first.id)?.freeText).toBe(
      'a niche you did not list',
    );
  });

  it('refuses a second decision on the same card with CONFLICT', async () => {
    const round = await ask();
    expect((await answerCard(round)).status).toBe(200);
    expect((await answerCard(round)).status).toBe(409);
  });

  it('handles a free-text reply with a narrower follow-up round (task 36; FR-005 AC-6)', async () => {
    const first = await ask();
    await answerCard(first);

    const second = await ask();
    expect(second.roundNumber).toBe(2);

    const response = await submit({
      roundId: second.roundId,
      reply: 'Success means an agent can build from the bundle unaided.',
    });

    expect(response.status).toBe(201);
    const body = await asJson(response);
    expect(body.kind).toBe('follow-up');
    expect(body.roundNumber).toBe(3);

    // The reply is never silently discarded (task 36 AC-1): it is an answer row of round 2.
    const rows = await database.db
      .select({ freeText: answersTable.freeText, questionId: answersTable.questionId })
      .from(answersTable);
    expect(
      rows.some(
        (row) =>
          row.questionId === null &&
          row.freeText === 'Success means an agent can build from the bundle unaided.',
      ),
    ).toBe(true);

    // The pending card is now the follow-up, not the replied-to round.
    const [state] = await database.db
      .select({ pendingAction: workflowState.pendingAction })
      .from(workflowState)
      .where(eq(workflowState.sessionId, sessionId));
    expect(state?.pendingAction).toMatchObject({ roundId: body.roundId });
  });

  it('exhausts the budget into the named-needs fallback, which unblocks directly (task 37)', async () => {
    // Round 1 answered by card; round 2 answered by reply (satisfying nothing, per the stub
    // assessor); round 3 — the narrower follow-up — answered by reply too. Three answered
    // rounds: the budget is spent, and what the replies left open is on record.
    const first = await ask();
    await answerCard(first);

    const second = await ask();
    const afterReply = await asJson(
      await submit({ roundId: second.roundId, reply: 'We ship on the mandated stack.' }),
    );
    expect(afterReply.kind).toBe('follow-up');

    const third = afterReply as unknown as RoundPayload;
    const limit = await asJson(
      await submit({ roundId: third.roundId, reply: 'One measure: no rewriting needed.' }),
    );

    expect(limit.kind).toBe('limit');
    expect((limit.unmetNeeds as string[]).sort()).toEqual(['constraints', 'success-criteria']);

    // The fourth ask is refused — and the fallback records the answers directly.
    const fourth = await postRound(new Request('http://test.local/rounds', { method: 'POST' }), {
      params: Promise.resolve({ id: sessionId }),
    });
    expect(fourth.status).toBe(409);

    const fallback = await submit({
      fallback: [
        { name: 'constraints', text: 'Mandated stack; fixed deadline.' },
        { name: 'success-criteria', text: 'A bundle a coding agent uses without rewriting.' },
      ],
    });
    expect(fallback.status).toBe(200);
    expect(await asJson(fallback)).toMatchObject({
      kind: 'fallback-recorded',
      satisfied: ['constraints', 'success-criteria'],
      unmetNeeds: [],
    });

    // Recorded in the documented namespace, satisfied in the register (FR-005 AC-10).
    const needRows = await database.db
      .select({ name: informationNeeds.name, satisfiedBy: informationNeeds.satisfiedByRound })
      .from(informationNeeds)
      .where(eq(informationNeeds.sessionId, sessionId));
    expect(needRows.every((need) => need.satisfiedBy !== null)).toBe(true);

    const fallbackRows = await database.db
      .select({ questionId: answersTable.questionId })
      .from(answersTable);
    expect(fallbackRows.map((row) => row.questionId)).toContain('need:constraints');
    expect(fallbackRows.map((row) => row.questionId)).toContain('need:success-criteria');
  });

  it('rejects a fallback answer for a need that is not unmet', async () => {
    const round = await ask();
    await answerCard(round);

    const response = await submit({
      fallback: [{ name: 'target-users', text: 'already answered' }],
    });

    expect(response.status).toBe(422);
  });

  it('keeps satisfied needs out of later rounds after a reload (FR-005 AC-9/AC-11)', async () => {
    const first = await ask();
    await answerCard(first);

    // A fresh ask derives satisfaction from persisted rounds — round 2 must not re-declare
    // target-users or core-problem.
    const second = await ask();
    const declared = second.questions.questions.flatMap((question) => question.informationNeeds);
    expect(declared.sort()).toEqual(['constraints', 'success-criteria']);
  });

  it('answers 404 for a round of another session and 401 unauthenticated', async () => {
    const round = await ask();

    vi.mocked(currentOwnerScope).mockResolvedValueOnce(null);
    expect((await answerCard(round)).status).toBe(401);

    const [stranger] = await database.db
      .insert(users)
      .values({ email: 'stranger@example.test' })
      .returning({ id: users.id });
    vi.mocked(currentOwnerScope).mockResolvedValue(
      OwnerScope.forAuthenticatedUser(stranger?.id ?? ''),
    );
    expect((await answerCard(round)).status).toBe(404);
  });
});
