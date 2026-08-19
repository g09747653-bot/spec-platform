import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as EnvModule from '@/config/env';
import { OwnerScope } from '@/db/owner-scope';
import {
  answers,
  autonomousRuns,
  projects,
  questionRounds,
  sessionMessages,
  sessions,
  users,
  workflowState,
} from '@/db/schema';
import { createMigratedDatabase, type TestDatabase } from '@/db/testing/migrated-database';

/**
 * **Stop, pressed while a step is inside its model call** (task 145; the red-team pass of gate 146).
 *
 * The Architect's requirement is exact: «Stop в любой момент → сессия продолжается вручную ровно с
 * этой позиции, без потерь и без «доигрывания» начатого шага». The window this file holds open is
 * the one that makes the second half hard — a step claims its turn, then spends a minute inside a
 * model call, and the Stop pressed during that minute arrives *after* the claim. The claim cannot
 * see it.
 *
 * The route's first design had exactly that hole, and this file is the reason it does not any more:
 * the second guard (`stillRunning`, re-read immediately before the dispatch) was added because this
 * test failed, not because the window was reasoned about. Which is the argument for keeping it —
 * the property it asserts cannot be seen by reading, only by holding the call open.
 *
 * A separate file from `route.test.ts` because the driver agent must be replaced at module scope,
 * and the identity test next door needs the real one: two mocks of the same module in one file is
 * two different products under test.
 */
vi.mock('@/modules/projects/auth/scope', () => ({
  currentOwnerScope: vi.fn(),
  requireOwnerScope: vi.fn(),
}));

vi.mock('@/db/client', () => ({ getDatabase: vi.fn() }));

vi.mock('@/modules/web/i18n/server-locale', async () => {
  const { translator } = await import('@/modules/web/i18n/translate');

  return {
    currentLocale: () => Promise.resolve('en'),
    serverT: () => Promise.resolve(translator('en')),
  };
});

import { TEST_ENV } from '@/config/testing/test-env';

vi.mock('@/config/env', async (importOriginal) => {
  const actual = await importOriginal<typeof EnvModule>();

  return { ...actual, getEnv: () => actual.parseEnv(TEST_ENV) };
});

/**
 * The driver agent, holdable.
 *
 * `entered` resolves when the fake answer call is reached, and the call then waits on `release`. One
 * hold per arming, so the step that follows the held one is not held too.
 */
const held: {
  armed: boolean;
  entered: (() => void) | null;
  release: (() => void) | null;
} = { armed: false, entered: null, release: null };

vi.mock('@/modules/agents/autonomous/driver-agent', () => ({
  createDriverAgent: () => ({
    answerRound: async (input: { questions: readonly { id: string }[] }) => {
      if (held.armed) {
        held.armed = false;
        held.entered?.();
        await new Promise<void>((resolve) => {
          held.release = resolve;
        });
      }

      return {
        kind: 'draft' as const,
        promptId: 'driver.answer.v1',
        draft: {
          answers: input.questions.map((question) => ({ questionId: question.id, optionIds: [] })),
          rationale: 'answered from the description',
        },
      };
    },
    selectFindings: () =>
      Promise.resolve({
        kind: 'draft' as const,
        promptId: 'driver.review.v1',
        draft: { keepIds: [], rationale: 'none earn a rewrite' },
      }),
  }),
}));

import { getDatabase } from '@/db/client';
import { currentOwnerScope } from '@/modules/projects/auth/scope';

import { DELETE as stopDriver, POST as startDriver } from './route';
import { POST as takeStep } from './step/route';

const ORIGIN = 'http://test.local';

const post = (url: string) =>
  new Request(`${ORIGIN}${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

const asJson = async (response: Response): Promise<Record<string, unknown>> =>
  (await response.json()) as Record<string, unknown>;

const SEED =
  'A tool that tracks which grant applications a small charity owes and drafts reminders';

describe('a step held open inside its model call', () => {
  let database: TestDatabase;
  let ownerId: string;

  beforeAll(async () => {
    database = await createMigratedDatabase();
    vi.mocked(getDatabase).mockReturnValue(
      database.db as unknown as ReturnType<typeof getDatabase>,
    );
  }, 60_000);

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    held.armed = false;
    held.entered = null;
    held.release = null;

    await database.db.delete(users);
    const [owner] = await database.db
      .insert(users)
      .values({ email: 'owner@example.test' })
      .returning({ id: users.id });
    ownerId = owner?.id ?? '';
    vi.mocked(currentOwnerScope).mockResolvedValue(OwnerScope.forAuthenticatedUser(ownerId));
  });

  const params = (id: string) => ({ params: Promise.resolve({ id }) });

  /** A session standing on an unanswered round, so the next step is an `answer-round`. */
  async function sessionAwaitingAnAnswer(name: string): Promise<string> {
    const [project] = await database.db
      .insert(projects)
      .values({ ownerId, name })
      .returning({ id: projects.id });

    const [session] = await database.db
      .insert(sessions)
      .values({ projectId: project?.id ?? '', title: name, initialPrompt: SEED })
      .returning({ id: sessions.id });

    const sessionId = session?.id ?? '';
    await database.db.insert(workflowState).values({ sessionId, stage: 'interview' });

    await startDriver(post(`/api/sessions/${sessionId}/autonomous`), params(sessionId));
    // The first step asks the round; the second would answer it.
    await takeStep(post(`/api/sessions/${sessionId}/autonomous/step`), params(sessionId));

    return sessionId;
  }

  it('dispatches nothing once Stop lands, however far the step had got', async () => {
    const sessionId = await sessionAwaitingAnAnswer('stopped mid-call');

    const [state] = await database.db
      .select()
      .from(workflowState)
      .where(eq(workflowState.sessionId, sessionId));
    const [round] = await database.db
      .select()
      .from(questionRounds)
      .where(eq(questionRounds.sessionId, sessionId));

    // The answering step, held inside the model call.
    held.armed = true;
    const entered = new Promise<void>((resolve) => {
      held.entered = resolve;
    });
    const answering = takeStep(
      post(`/api/sessions/${sessionId}/autonomous/step`),
      params(sessionId),
    );
    await entered;

    // The person presses Stop while the model is still thinking.
    const stopped = await stopDriver(
      post(`/api/sessions/${sessionId}/autonomous`),
      params(sessionId),
    );
    expect((await asJson(stopped)).stopped).toBe(true);

    held.release?.();
    const report = await asJson(await answering);

    // The step reports an ending, not a move.
    expect(report).toMatchObject({ moved: false, done: true, stopReason: 'stopped-by-user' });

    // Nothing was written: the round is exactly as unanswered as it was.
    const written = await database.db
      .select()
      .from(answers)
      .where(eq(answers.roundId, round?.id ?? ''));
    expect(written).toHaveLength(0);

    // …and the position is untouched, which is «continues from exactly this place».
    const [after] = await database.db
      .select()
      .from(workflowState)
      .where(eq(workflowState.sessionId, sessionId));
    expect(after?.stage).toBe(state?.stage);
    expect(after?.substage).toBe(state?.substage);
    expect(after?.version).toBe(state?.version);

    /*
     * The feed says one thing about the ending and nothing about the move that did not happen. A
     * note about an act nobody took would be worse than silence — it is the transparency requirement
     * pointing at a lie.
     */
    const notes = await database.db
      .select()
      .from(sessionMessages)
      .where(eq(sessionMessages.sessionId, sessionId))
      .orderBy(asc(sessionMessages.createdAt));

    const driverNotes = notes.filter((note) => note.origin === 'driver');
    expect(driverNotes).toHaveLength(2);
    expect(driverNotes.at(-1)?.body).toContain('Stopped at your request');
  });

  /**
   * Two ticks overlapping — two browser tabs on one session.
   *
   * The property is **not** that one of them is refused before it starts: the run's `version` is a
   * counter and a liveness check, not a lease, and both ticks do reach a model. It is that the
   * *machine* refuses the second write, exactly as it refuses two people answering one round — the
   * driver is another user and gets no privilege here either. So one step lands, one reports a move
   * that did not, and the round carries one answer per question rather than two.
   */
  it('lets the endpoints arbitrate two overlapping ticks, as they would two people', async () => {
    const sessionId = await sessionAwaitingAnAnswer('overlapping ticks');

    held.armed = true;
    const entered = new Promise<void>((resolve) => {
      held.entered = resolve;
    });
    const first = takeStep(post(`/api/sessions/${sessionId}/autonomous/step`), params(sessionId));
    await entered;

    // A second tick arrives while the first is still inside its model call.
    const second = await asJson(
      await takeStep(post(`/api/sessions/${sessionId}/autonomous/step`), params(sessionId)),
    );

    held.release?.();
    const firstReport = await asJson(await first);

    const landed = [firstReport, second].filter((report) => report.moved === true);
    expect(landed, 'exactly one of two overlapping ticks may write').toHaveLength(1);

    const [round] = await database.db
      .select()
      .from(questionRounds)
      .where(eq(questionRounds.sessionId, sessionId));
    const written = await database.db
      .select()
      .from(answers)
      .where(eq(answers.roundId, round?.id ?? ''));

    expect(written.length).toBeGreaterThan(0);
    const questionIds = written.map((answer) => answer.questionId);
    expect(new Set(questionIds).size, 'a question was answered twice').toBe(questionIds.length);

    // Both ticks are counted, because both spent a turn — the budget measures work, not success.
    const [run] = await database.db
      .select()
      .from(autonomousRuns)
      .where(eq(autonomousRuns.sessionId, sessionId));
    expect(run?.steps).toBe(3);
  });
});
