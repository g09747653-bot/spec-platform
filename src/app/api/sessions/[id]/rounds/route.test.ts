import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as EnvModule from '@/config/env';
import { OwnerScope } from '@/db/owner-scope';
import { projects, sessions, users, workflowState } from '@/db/schema';
import { createMigratedDatabase, type TestDatabase } from '@/db/testing/migrated-database';
import { createInterviewRepository } from '@/modules/projects/repositories/interview';

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

import { POST } from './route';

/**
 * The ask-a-round endpoint (D-36; FR-005 AC-10; FR-017 AC-3; task 27 at the HTTP level).
 */
const asJson = async (response: Response): Promise<Record<string, unknown>> =>
  (await response.json()) as Record<string, unknown>;

const ask = (sessionId: string): Promise<Response> =>
  POST(new Request('http://test.local/rounds', { method: 'POST' }), {
    params: Promise.resolve({ id: sessionId }),
  });

describe('POST /api/sessions/:id/rounds', () => {
  let database: TestDatabase;
  let ownerId: string;
  let sessionId: string;

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
      .values({ ownerId, name: 'Rounds' })
      .returning({ id: projects.id });
    const [session] = await database.db
      .insert(sessions)
      .values({ projectId: project?.id ?? '', initialPrompt: 'Build a spec platform' })
      .returning({ id: sessions.id });
    sessionId = session?.id ?? '';

    await database.db.insert(workflowState).values({ sessionId, stage: 'interview' });

    vi.mocked(currentOwnerScope).mockResolvedValue(OwnerScope.forAuthenticatedUser(ownerId));
  });

  it('creates round 1, registers its needs, and marks it pending', async () => {
    const response = await ask(sessionId);

    expect(response.status).toBe(201);
    const body = await asJson(response);
    expect(body.kind).toBe('round');
    expect(body.roundNumber).toBe(1);

    const [state] = await database.db
      .select({ pendingAction: workflowState.pendingAction, version: workflowState.version })
      .from(workflowState)
      .where(eq(workflowState.sessionId, sessionId));
    expect(state?.pendingAction).toMatchObject({ kind: 'question-round' });
    expect(state?.version).toBe(2);
  });

  it('re-presents the same pending round instead of drafting another (FR-017 AC-3)', async () => {
    const first = await asJson(await ask(sessionId));

    const second = await ask(sessionId);
    expect(second.status).toBe(200);
    const body = await asJson(second);

    expect(body.roundId).toBe(first.roundId);
    expect(body.roundNumber).toBe(1);
  });

  it('refuses the fourth round with ROUND_LIMIT_REACHED naming the unmet needs (FR-005 AC-10)', async () => {
    const interviewRepository = createInterviewRepository(database.db);

    // Three answered rounds, none of their needs marked satisfied — the exhaustion-with-unmet
    // state the fallback panel exists for.
    for (let roundNumber = 1; roundNumber <= 3; roundNumber += 1) {
      const asked = await asJson(await ask(sessionId));
      expect(asked.kind).toBe('round');
      await interviewRepository.addReplyAnswer(
        String(asked.roundId),
        `answer ${String(roundNumber)}`,
      );

      // Consume the pending card the way the answers route would.
      const { createWorkflowStateRepository } =
        await import('@/modules/workflow/repositories/workflow-state');
      const stateRepository = createWorkflowStateRepository(database.db);
      const state = await stateRepository.find(sessionId);
      if (state !== null) await stateRepository.setPendingAction(sessionId, null, state.version);
    }

    const fourth = await ask(sessionId);
    expect(fourth.status).toBe(409);
    const body = await asJson(fourth);

    expect(body).toMatchObject({ error: { code: 'ROUND_LIMIT_REACHED' } });
    const details = (body.error as { details: { unmetNeeds: string[] } }).details;
    expect(details.unmetNeeds.sort()).toEqual([
      'constraints',
      'core-problem',
      'success-criteria',
      'target-users',
    ]);
  });

  it('self-heals a pending pointer left on an answered round', async () => {
    const first = await asJson(await ask(sessionId));
    await createInterviewRepository(database.db).addReplyAnswer(String(first.roundId), 'done');

    // The pointer still names round 1, but round 1 is answered — asking again must move on.
    const next = await ask(sessionId);
    expect(next.status).toBe(201);
    expect((await asJson(next)).roundNumber).toBe(2);
  });

  it('is descriptive, not creative, outside a collecting position', async () => {
    await database.db
      .update(workflowState)
      .set({ stage: 'constitution', substage: 'generate' })
      .where(eq(workflowState.sessionId, sessionId));

    const response = await ask(sessionId);
    expect(response.status).toBe(200);
    expect((await asJson(response)).kind).toBe('not-collecting');
  });

  it('asks per stage: a constitution collect position gets constitution questions', async () => {
    await database.db
      .update(workflowState)
      .set({ stage: 'constitution', substage: 'collect' })
      .where(eq(workflowState.sessionId, sessionId));

    const body = await asJson(await ask(sessionId));

    expect(body.kind).toBe('round');
    const questions = (body.questions as { questions: { id: string }[] }).questions;
    expect(questions[0]?.id).toBe('q-constitution-scope');
  });

  it('answers 401 unauthenticated and 404 for a foreign session', async () => {
    vi.mocked(currentOwnerScope).mockResolvedValueOnce(null);
    expect((await ask(sessionId)).status).toBe(401);

    const [stranger] = await database.db
      .insert(users)
      .values({ email: 'stranger@example.test' })
      .returning({ id: users.id });
    vi.mocked(currentOwnerScope).mockResolvedValue(
      OwnerScope.forAuthenticatedUser(stranger?.id ?? ''),
    );
    expect((await ask(sessionId)).status).toBe(404);
  });
});
