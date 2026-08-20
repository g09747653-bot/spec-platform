import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as EnvModule from '@/config/env';
import { OwnerScope } from '@/db/owner-scope';
import {
  autonomousRuns,
  projects,
  questionRounds,
  sessions,
  users,
  workflowState,
} from '@/db/schema';
import { createMigratedDatabase, type TestDatabase } from '@/db/testing/migrated-database';

/**
 * **A run that survives its own process dying, and an interviewer with nothing to ask** (task 170).
 *
 * The M15а gate walk restarted the whole stack mid-journey, as its own claim requires, and twice out
 * of two the driver came back and stopped: `stalled`, at `requirements/collect`, with the feed
 * saying «two steps in a row changed nothing — so I was going round in circles». Reading the evidence
 * directory the walk left behind (`.local/db-m15a-stalled-040556`) named two facts that together
 * produced it, and this file holds both open:
 *
 * 1. **A claim is not a move.** The step counts itself and stores its digest *before* it dispatches,
 *    so a process killed inside the model call leaves a row that looks exactly like a step which
 *    landed and changed nothing. The loop detector believed it, and a restart therefore cost one of
 *    the two slots the detector has.
 * 2. **An ask that drafts nothing is not a loop.** `POST /rounds` answers 200 with
 *    `{ kind: 'collect-complete' }` when the interviewer has nothing worth asking; the driver read
 *    the status, called it a landing, and the digest stayed put. The evidence run spent both of its
 *    remaining slots on exactly that — two asks, thirteen seconds, no round — while the
 *    `collect → generate` gate went on wanting an answered round.
 *
 * Neither is reachable from a healthy walk, which is why they are held here rather than left to the
 * live gate: the first needs a step frozen inside a model call, the second needs an interviewer that
 * answers empty on demand.
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
 * The interviewer, scripted per call.
 *
 * `script` is drained one entry per `draftRound`; `'hang'` never resolves, which is what a step
 * looks like from the database while the process that owns it is being killed.
 */
const script: ('hang' | 'empty' | 'round')[] = [];
let drafted = 0;

const roundFor = (stage: string) => ({
  kind: 'round' as const,
  promptId: 'interview.round.v1',
  repaired: false,
  declaredNeeds: ['scope'],
  set: {
    stage,
    questions: [
      {
        id: `q${String(drafted)}`,
        text: 'What should this cover?',
        type: 'single' as const,
        allowOther: true as const,
        informationNeeds: ['scope'],
        options: [
          { id: 'a', label: 'One thing', recommended: true },
          { id: 'b', label: 'Another thing' },
        ],
      },
    ],
  },
});

vi.mock('@/modules/agents/interview/interview-agent', () => ({
  createInterviewAgent: () => ({
    draftRound: async (input: { stage: string }) => {
      const next = script.shift() ?? 'round';
      drafted += 1;

      if (next === 'hang') await new Promise<void>(() => undefined);
      if (next === 'empty')
        return { kind: 'nothing-to-ask' as const, promptId: 'interview.round.v1' };

      return roundFor(input.stage);
    },
  }),
}));

import { getDatabase } from '@/db/client';
import { currentOwnerScope } from '@/modules/projects/auth/scope';
import { MAX_FRUITLESS_ASKS } from '@/modules/agents/autonomous/policy';

import { POST as startDriver } from './route';
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
  'A console planner that records errands with dates and marks them done, stored in a file';

describe('a driver whose process died mid-call, and one the interviewer will not answer', () => {
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
    script.length = 0;
    drafted = 0;

    await database.db.delete(users);
    const [owner] = await database.db
      .insert(users)
      .values({ email: 'owner@example.test' })
      .returning({ id: users.id });
    ownerId = owner?.id ?? '';
    vi.mocked(currentOwnerScope).mockResolvedValue(OwnerScope.forAuthenticatedUser(ownerId));
  });

  const params = (id: string) => ({ params: Promise.resolve({ id }) });

  /** A session standing at the interview with a live run and nothing asked yet. */
  async function drivenSession(name: string): Promise<string> {
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

    return sessionId;
  }

  const step = (sessionId: string) =>
    takeStep(post(`/api/sessions/${sessionId}/autonomous/step`), params(sessionId));

  const runOf = async (sessionId: string) => {
    const [run] = await database.db
      .select()
      .from(autonomousRuns)
      .where(eq(autonomousRuns.sessionId, sessionId));

    return run;
  };

  /**
   * The walk's own sequence, reproduced: the stack dies inside the round the driver was asking for,
   * the interviewer then answers empty twice, and the round after that must still be asked.
   *
   * Before task 170 this stopped at the third step with `stalled` — one slot spent by the death, one
   * by the first empty answer — and the walk's session was abandoned three documents short.
   */
  it('does not count a step its process never finished, nor an ask that drafted nothing', async () => {
    const sessionId = await drivenSession('killed mid-call');

    script.push('hang', 'empty', 'empty', 'round');

    // The step the restart kills. Never awaited: from the row's side, that is what dying looks like.
    void step(sessionId);
    await vi.waitFor(async () => {
      expect((await runOf(sessionId))?.steps).toBe(1);
    });

    const killed = await runOf(sessionId);
    expect(killed?.stepOutcome, 'a claim nobody settled is the shape of a dead process').toBeNull();

    // The stack is back. Two honest asks that draft nothing, then one that does.
    const first = await asJson(await step(sessionId));
    expect(first).toMatchObject({ kind: 'ask-round', moved: false, done: false });

    const second = await asJson(await step(sessionId));
    expect(second).toMatchObject({ kind: 'ask-round', moved: false, done: false });

    const third = await asJson(await step(sessionId));
    expect(third, 'the run must still be alive to ask a fourth time').toMatchObject({
      kind: 'ask-round',
      moved: true,
      done: false,
    });

    const rounds = await database.db
      .select()
      .from(questionRounds)
      .where(eq(questionRounds.sessionId, sessionId));
    expect(rounds, 'the round the interviewer finally drafted').toHaveLength(1);

    const run = await runOf(sessionId);
    expect(run?.status).toBe('running');
    expect(run?.stopReason).toBeNull();
    expect(run?.idleSteps, 'nothing here was a lap of a circle').toBe(0);
    expect(run?.fruitlessAsks, 'cleared by the ask that landed').toBe(0);
  });

  /**
   * The other side of the same coin: an interviewer that never produces a round must end the run,
   * and must end it saying what is true.
   *
   * `needs-unanswered` is the fallback panel's state — a person supplying what the model could not
   * extract — reached from the interviewer's side instead of from a spent round budget. `stalled`
   * would say the driver was walking in circles, which is a different and untrue claim about the
   * same three steps.
   */
  it('ends honestly when the interviewer keeps drafting nothing', async () => {
    const sessionId = await drivenSession('nothing to ask, ever');

    for (let ask = 0; ask < MAX_FRUITLESS_ASKS; ask += 1) script.push('empty');

    for (let ask = 0; ask < MAX_FRUITLESS_ASKS; ask += 1) {
      const report = await asJson(await step(sessionId));
      expect(report).toMatchObject({ kind: 'ask-round', moved: false, done: false });
    }

    const ending = await asJson(await step(sessionId));
    expect(ending).toMatchObject({ done: true, stopReason: 'needs-unanswered' });

    const run = await runOf(sessionId);
    expect(run?.stopReason).toBe('needs-unanswered');
    expect(run?.fruitlessAsks).toBe(MAX_FRUITLESS_ASKS);
  });
});
