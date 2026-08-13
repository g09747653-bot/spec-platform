import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { parseEnv } from '@/config/env';
import { testEnv } from '@/config/testing/test-env';
import { OwnerScope } from '@/db/owner-scope';
import { generationChunks, generationRuns, projects, sessions, users } from '@/db/schema';
import { createMigratedDatabase, type TestDatabase } from '@/db/testing/migrated-database';

import { createDefaultAdapter } from '../default-adapter';
import { createGenerationStore } from '../generation-store';
import { createStreamRecorder } from '../stream-recorder';

/**
 * The adapter layer against a real database (task 52).
 *
 * The recorder's own suite proves the *policy* — when a batch is cut, what a restart throws away —
 * against a fake store. This proves the policy actually reaches PostgreSQL: that batches become rows,
 * that a restart deletes them and renumbers, that `first_token_at` is stamped once and cleared on
 * failover, and that a resume cursor returns exactly the tail it should. Those are SQL claims, and a
 * fake store cannot make them.
 *
 * No live provider call appears anywhere here, and the last case makes that mechanical rather than
 * asserted: the configured chain is exercised with `fetch` replaced by a landmine.
 */
describe('the generation store (task 52)', () => {
  let database: TestDatabase;
  let ownerId: string;
  let sessionId: string;
  let runId: string;

  beforeAll(async () => {
    database = await createMigratedDatabase();
  });

  afterAll(async () => {
    await database.close();
  });

  const store = () => createGenerationStore(database.db);

  beforeEach(async () => {
    await database.db.delete(users);

    const [owner] = await database.db
      .insert(users)
      .values({ email: 'owner@example.test' })
      .returning({ id: users.id });
    ownerId = owner?.id ?? '';

    const [project] = await database.db
      .insert(projects)
      .values({ ownerId, name: 'Adapter store' })
      .returning({ id: projects.id });

    const [session] = await database.db
      .insert(sessions)
      .values({ projectId: project?.id ?? '', initialPrompt: 'A prompt' })
      .returning({ id: sessions.id });
    sessionId = session?.id ?? '';

    const run = await store().createRun(sessionId, 'constitution');
    runId = run.id;
  });

  it('opens a run carrying the project it belongs to, which resume needs', async () => {
    const run = await store().findRunForOwner(OwnerScope.forAuthenticatedUser(ownerId), runId);

    expect(run?.projectId).not.toBe('');
    expect(run?.sessionId).toBe(sessionId);
    expect(run?.status).toBe('running');
  });

  it('writes batches as rows and reads back the tail above a cursor', async () => {
    const recorder = createStreamRecorder({ runId, store: store(), batchMs: 60_000 });

    for (const word of ['alpha ', 'beta ', 'gamma ']) {
      recorder.delta(word);
      await recorder.flush();
    }

    const rows = await database.db
      .select()
      .from(generationChunks)
      .where(eq(generationChunks.runId, runId));
    expect(rows).toHaveLength(3);

    const tail = await store().chunksAfter(runId, 0);
    expect(tail.map((chunk) => chunk.delta)).toEqual(['beta ', 'gamma ']);
    expect(await store().chunksAfter(runId, 2)).toEqual([]);
  });

  it('stamps first_token_at once, and leaves it alone on later deltas (SC-1)', async () => {
    const recorder = createStreamRecorder({ runId, store: store(), batchMs: 60_000 });

    recorder.delta('first');
    await recorder.flush();
    const [afterFirst] = await database.db
      .select()
      .from(generationRuns)
      .where(eq(generationRuns.id, runId));

    recorder.delta('second');
    await recorder.flush();
    const [afterSecond] = await database.db
      .select()
      .from(generationRuns)
      .where(eq(generationRuns.id, runId));

    expect(afterFirst?.firstTokenAt).not.toBeNull();
    expect(afterSecond?.firstTokenAt?.getTime()).toBe(afterFirst?.firstTokenAt?.getTime());
  });

  it('clears the stamp and the rows on a restart, then renumbers from zero (D-9)', async () => {
    const recorder = createStreamRecorder({ runId, store: store(), batchMs: 60_000 });

    recorder.delta('abandoned output');
    await recorder.flush();
    await recorder.restart();

    const [cleared] = await database.db
      .select()
      .from(generationRuns)
      .where(eq(generationRuns.id, runId));
    expect(cleared?.firstTokenAt).toBeNull();
    expect(
      await database.db.select().from(generationChunks).where(eq(generationChunks.runId, runId)),
    ).toEqual([]);

    recorder.delta('the real output');
    await recorder.flush();

    const rows = await database.db
      .select()
      .from(generationChunks)
      .where(eq(generationChunks.runId, runId));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.sequence).toBe(0);
    expect(rows[0]?.delta).toBe('the real output');
  });

  it('prunes the log when the run completes, because the revision is the record now', async () => {
    const recorder = createStreamRecorder({ runId, store: store(), batchMs: 60_000 });

    recorder.delta('the whole document');
    await store().markComplete(runId, 'google', 1);
    await recorder.complete();

    expect(await store().chunksAfter(runId, -1)).toEqual([]);

    const [run] = await database.db
      .select()
      .from(generationRuns)
      .where(eq(generationRuns.id, runId));
    expect(run?.status).toBe('complete');
    expect(run?.providerUsed).toBe('google');
  });

  it('records a failed run without a completion time', async () => {
    await store().markFailed(runId, 3);

    const state = await store().statusOf(runId);
    expect(state).toEqual({ status: 'failed', attempt: 3 });
  });
});

describe('no automated test reaches a vendor (IR-001-AC-5; NFR-012 AC-5)', () => {
  it('generates through the configured chain with fetch replaced by a landmine', async () => {
    const original = globalThis.fetch;
    let calls = 0;

    globalThis.fetch = () => {
      calls += 1;
      throw new Error('a test tried to make a network call');
    };

    try {
      // The chain configured for the end-to-end suite: the deterministic double, no key, no network.
      const adapter = createDefaultAdapter(parseEnv(testEnv({ LLM_PROVIDER_ORDER: 'stub' })));

      const result = await adapter.generateStreaming({
        messages: [{ role: 'user', content: '1. ## Alpha\n2. ## Beta' }],
        runId: 'no-network',
      });

      expect(result.providerUsed).toBe('stub');
      expect(result.text).toContain('Alpha');
      expect(calls).toBe(0);
    } finally {
      globalThis.fetch = original;
    }
  });
});
