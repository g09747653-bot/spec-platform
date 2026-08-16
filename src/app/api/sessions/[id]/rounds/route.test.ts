import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as EnvModule from '@/config/env';
import { OwnerScope } from '@/db/owner-scope';
import { projects, sessions, users, workflowState } from '@/db/schema';
import { createMigratedDatabase, type TestDatabase } from '@/db/testing/migrated-database';
import {
  AllProvidersFailedError,
  promptMessages,
  stubInterviewRoundDocument,
  UNPACKED_TARGET,
} from '@/modules/adapters/llm';
import type * as AdapterModule from '@/modules/adapters/llm/default-adapter';
import { createInterviewRepository } from '@/modules/projects/repositories/interview';

vi.mock('@/modules/projects/auth/scope', () => ({
  currentOwnerScope: vi.fn(),
  requireOwnerScope: vi.fn(),
}));

vi.mock('@/db/client', () => ({ getDatabase: vi.fn() }));

vi.mock('@/modules/adapters/llm/default-adapter', async (importOriginal) => {
  const actual = await importOriginal<typeof AdapterModule>();
  return { ...actual, createDefaultAdapter: vi.fn(actual.createDefaultAdapter) };
});

import { TEST_ENV } from '@/config/testing/test-env';

vi.mock('@/config/env', async (importOriginal) => {
  const actual = await importOriginal<typeof EnvModule>();

  return {
    ...actual,
    getEnv: () => actual.parseEnv(TEST_ENV),
  };
});

import { getDatabase } from '@/db/client';
import { createDefaultAdapter } from '@/modules/adapters/llm/default-adapter';
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

  /**
   * Round 2, Д-6 — an exhausted provider chain is an answer, not a crash.
   *
   * Found by the live gate walk: with the provider out of quota this endpoint returned **500**. The
   * error escaped, Next turned it into an unhandled failure, and the client got a bare status with no
   * code to branch on. A generation that could not happen is an ordinary event in the life of a
   * session (FR-018) — the transition route has caught the same error since M4, and the interview was
   * simply never given the same treatment.
   */
  describe('when every provider fails (round 2, Д-6)', () => {
    it('answers GENERATION_FAILED rather than throwing a 500', async () => {
      vi.mocked(createDefaultAdapter).mockReturnValue({
        generateStreaming: () => Promise.reject(new AllProvidersFailedError(1)),
      });

      const response = await ask(sessionId);

      expect(response.status).toBe(502);
      expect(await response.json()).toMatchObject({ error: { code: 'GENERATION_FAILED' } });
    });

    it('says the service is busy when the chain was exhausted by rate limiting', async () => {
      vi.mocked(createDefaultAdapter).mockReturnValue({
        generateStreaming: () => Promise.reject(new AllProvidersFailedError(4, true)),
      });

      const response = await ask(sessionId);
      const body = (await response.json()) as { error: { details: { reason: string } } };

      expect(body.error.details.reason).toBe('overloaded');
    });

    it('persists no round when the draft never arrived', async () => {
      vi.mocked(createDefaultAdapter).mockReturnValue({
        generateStreaming: () => Promise.reject(new AllProvidersFailedError(1)),
      });

      await ask(sessionId);

      expect(await createInterviewRepository(database.db).roundsForSession(sessionId)).toEqual([]);
    });
  });

  /**
   * Round 4, Р-1 (D-94) — an unusable draft costs a sample, not a round.
   *
   * The M6 walk on a local model lost about a quarter of its question rounds this way, and two of the
   * three failures seen were a valid document with one character too many after it. Both layers are
   * asserted from the outside here, where it matters: what the user gets back.
   */
  describe('an unusable draft (round 4, Р-1)', () => {
    /** An adapter that answers each call from a script, and counts the calls. */
    function scripted(...documents: string[]): { calls: () => number } {
      let count = 0;

      vi.mocked(createDefaultAdapter).mockReturnValue({
        generateStreaming: () => {
          const document = documents[count] ?? '';
          count += 1;

          return Promise.resolve({ text: document, providerUsed: 'google', attempts: 1 });
        },
      });

      return { calls: () => count };
    }

    it('takes a draft the model ended with one character too many, first time', async () => {
      const script = scripted(`${stubInterviewRoundDocument('interview', 1)}.`);

      const response = await ask(sessionId);

      expect(response.status).toBe(201);
      expect((await asJson(response)).kind).toBe('round');
      // No second sample: the tail was never a reason to throw the round away.
      expect(script.calls()).toBe(1);
    });

    it('drafts once more before the user is told anything', async () => {
      const script = scripted('not json at all', stubInterviewRoundDocument('interview', 1));

      const response = await ask(sessionId);

      expect(response.status).toBe(201);
      expect((await asJson(response)).kind).toBe('round');
      expect(script.calls()).toBe(2);
      expect(await createInterviewRepository(database.db).roundsForSession(sessionId)).toHaveLength(
        1,
      );
    });

    it('surfaces DRAFT_INVALID when the second draft is unusable too, with nothing persisted', async () => {
      const script = scripted('not json at all', '{"stage": "interview", "questions": "nope"}');

      const response = await ask(sessionId);

      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({ error: { code: 'DRAFT_INVALID' } });
      // Exactly one retry — a third sample would only make the wait longer.
      expect(script.calls()).toBe(2);
      expect(await createInterviewRepository(database.db).roundsForSession(sessionId)).toEqual([]);
    });
  });
  /**
   * У-1 and У-5 reaching a model (tasks 106, 108).
   *
   * The unit tests prove the prompt layer words the instruction correctly; this proves the *chain* —
   * column, repository, route, agent, prompt — carries what is stored to the request that is
   * actually made. Both are needed: a perfect instruction nobody passes is worth nothing, and the
   * two halves fail in different places.
   */
  describe('what the session tells the model about itself', () => {
    /** Captures the system prompt of the one call the route makes. */
    function capture(): { system: () => string } {
      let seen = '';

      vi.mocked(createDefaultAdapter).mockReturnValue({
        generateStreaming: (request) => {
          const system = promptMessages(request, UNPACKED_TARGET).find(
            (message) => message.role === 'system',
          )?.content;
          seen = typeof system === 'string' ? system : '';

          return Promise.resolve({
            text: stubInterviewRoundDocument('interview', 1),
            providerUsed: 'google',
            attempts: 1,
          });
        },
      });

      return { system: () => seen };
    }

    async function setSession(fields: Record<string, string | null>): Promise<void> {
      await database.db.update(sessions).set(fields).where(eq(sessions.id, sessionId));
    }

    it('asks in the language the seed was written in (У-1)', async () => {
      await setSession({ contentLanguage: 'ru' });
      const russian = capture();
      await ask(sessionId);

      expect(russian.system()).toContain('Russian');
      expect(russian.system()).toContain('never translate them');
    });

    it('asks in English when that is what the seed was (У-1)', async () => {
      await setSession({ contentLanguage: 'en' });
      const english = capture();
      await ask(sessionId);

      expect(english.system()).toContain('English');
      expect(english.system()).not.toContain('Russian');
    });

    it('mirrors the user when the language could not be told (У-1)', async () => {
      await setSession({ contentLanguage: null });
      const unknown = capture();
      await ask(sessionId);

      expect(unknown.system()).toContain('the same language the user wrote their own description');
    });

    it('speaks in the register the audience profile asked for (У-5)', async () => {
      await setSession({ audienceProfile: 'technical' });
      const technical = capture();
      await ask(sessionId);

      expect(technical.system()).toContain('comfortable with engineering vocabulary');
      expect(technical.system()).not.toContain('They are not technical');
    });
  });
});
