import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { generationRuns, projects, sessions, users } from '@/db/schema';
import { createMigratedDatabase, type TestDatabase } from '@/db/testing/migrated-database';

import { ORPHANED_RUN_REASON, sweepOrphanedGenerationRuns } from '../boot-sweep';
import { createGenerationStore, staleRunThresholdMs } from '../generation-store';

/**
 * The boot sweep of orphaned generation runs (task 168; Backlog B-1).
 *
 * The defect it closes is not "a stale row exists" — it is that the row makes the *session*
 * permanently ungeneratable: a terminal status is written by the producer alone, so a process that
 * died mid-generation leaves the one-run-at-a-time guard refusing every later generation forever.
 * The assertions therefore go through `activeRunForSession`, which is the predicate that guard
 * actually asks, rather than only through the status column.
 */
describe('the boot sweep of orphaned generation runs (task 168)', () => {
  let database: TestDatabase;
  let sessionId: string;

  beforeAll(async () => {
    database = await createMigratedDatabase();
  });

  afterAll(async () => {
    await database.close();
  });

  const store = () => createGenerationStore(database.db);

  /** Injects a run of a chosen age; the sweep judges by `created_at` and nothing else. */
  async function openRunAged(minutesAgo: number, status = 'running'): Promise<string> {
    const run = await store().createRun(sessionId, 'constitution');

    await database.db.execute(sql`
      UPDATE ${generationRuns}
      SET created_at = now() - make_interval(mins => ${minutesAgo}), status = ${status}
      WHERE id = ${run.id}::uuid
    `);

    return run.id;
  }

  const sweep = () =>
    sweepOrphanedGenerationRuns({
      db: database.db,
      perProviderTimeoutMs: 60_000,
      chainLength: 3,
      log: () => undefined,
    });

  beforeEach(async () => {
    await database.db.delete(users);

    const [owner] = await database.db
      .insert(users)
      .values({ email: 'owner@example.test' })
      .returning({ id: users.id });

    const [project] = await database.db
      .insert(projects)
      .values({ ownerId: owner?.id ?? '', name: 'Boot sweep' })
      .returning({ id: projects.id });

    const [session] = await database.db
      .insert(sessions)
      .values({ projectId: project?.id ?? '', initialPrompt: 'A prompt' })
      .returning({ id: sessions.id });
    sessionId = session?.id ?? '';
  });

  it('makes a session whose producer died generatable again', async () => {
    const runId = await openRunAged(120);

    expect(await store().activeRunForSession(sessionId)).not.toBeNull();

    expect(await sweep()).toBe(1);

    expect(await store().statusOf(runId)).toEqual({ status: 'failed', attempt: 1 });
    expect(await store().activeRunForSession(sessionId)).toBeNull();
  });

  it('closes a run that died mid-failover, not only one that never left the first provider', async () => {
    // `restarted` is in flight too — the guard asks for the complement of the terminal statuses,
    // and a chain that died between providers is exactly the population this sweep exists for.
    const runId = await openRunAged(120, 'restarted');

    expect(await sweep()).toBe(1);
    expect(await store().statusOf(runId)).toEqual({ status: 'failed', attempt: 1 });
  });

  it('leaves a live generation alone', async () => {
    const young = await openRunAged(5);

    expect(await sweep()).toBe(0);
    expect(await store().statusOf(young)).toEqual({ status: 'running', attempt: 1 });
    expect(await store().activeRunForSession(sessionId)).not.toBeNull();
  });

  it('does not touch runs that already reached a terminal status', async () => {
    const failed = await openRunAged(120, 'failed');

    await store().createRun(sessionId, 'requirements');
    const complete = await store().activeRunForSession(sessionId);
    await store().markComplete(complete?.runId ?? '', 'anthropic', 2);
    await database.db.execute(sql`
      UPDATE ${generationRuns}
      SET created_at = now() - make_interval(mins => 120)
      WHERE id = ${complete?.runId ?? ''}::uuid
    `);

    expect(await sweep()).toBe(0);
    expect(await store().statusOf(failed)).toEqual({ status: 'failed', attempt: 1 });
    expect((await store().statusOf(complete?.runId ?? ''))?.status).toBe('complete');
  });

  it('reports what it closed, and why, under a name', async () => {
    await openRunAged(120);
    const lines: { message: string; detail: Record<string, unknown> }[] = [];

    await sweepOrphanedGenerationRuns({
      db: database.db,
      perProviderTimeoutMs: 60_000,
      chainLength: 3,
      log: (message, detail) => lines.push({ message, detail }),
    });

    expect(lines).toHaveLength(1);
    expect(lines[0]?.detail).toMatchObject({ reason: ORPHANED_RUN_REASON, count: 1 });
  });

  it('says nothing when there is nothing to close', async () => {
    const lines: string[] = [];

    await sweepOrphanedGenerationRuns({
      db: database.db,
      perProviderTimeoutMs: 60_000,
      chainLength: 3,
      log: (message) => lines.push(message),
    });

    expect(lines).toEqual([]);
  });

  it('does not fail the boot when the database cannot be reached', async () => {
    const broken = {
      execute: () => Promise.reject(new Error('ECONNREFUSED')),
    } as unknown as TestDatabase['db'];
    const lines: string[] = [];

    await expect(
      sweepOrphanedGenerationRuns({
        db: broken,
        perProviderTimeoutMs: 60_000,
        chainLength: 3,
        log: (message) => lines.push(message),
      }),
    ).resolves.toBe(0);

    expect(lines).toEqual(['generation run sweep failed']);
  });
});

describe('the sweep threshold (task 168)', () => {
  it('stays well clear of the chain the deployment actually configured', () => {
    // Four providers at Ollama's kind of ceiling: the honest worst case is 4 x 300 s = 20 minutes,
    // and the threshold has to be decidedly beyond it rather than merely past the floor.
    expect(staleRunThresholdMs(300_000, 4)).toBe(300_000 * 4 * 4);
    expect(staleRunThresholdMs(300_000, 4)).toBeGreaterThan(300_000 * 4);
  });

  it('never drops below half an hour for a fast chain', () => {
    expect(staleRunThresholdMs(60_000, 1)).toBe(30 * 60_000);
    expect(staleRunThresholdMs(60_000, 3)).toBe(30 * 60_000);
  });

  it('treats an empty chain as one link rather than as zero patience', () => {
    expect(staleRunThresholdMs(60_000, 0)).toBe(30 * 60_000);
  });
});
