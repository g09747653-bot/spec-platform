import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { generationChunks, generationRuns, projects, sessions, users } from '@/db/schema';
import {
  captureDatabaseError,
  createMigratedDatabase,
  type TestDatabase,
} from '@/db/testing/migrated-database';

/**
 * Task 44 — the generation tables as the database enforces them.
 *
 * Constraints and cascades are database behaviour, so they are asserted against a real PostgreSQL
 * instance running the shipped migrations (D-13). The interesting ones are not the obvious ones: a
 * run that claims completion without a timestamp would make the resume endpoint's "already finished"
 * answer a guess, and a duplicate sequence would make replay ambiguous.
 */
describe('generation schema (task 44)', () => {
  let database: TestDatabase;
  let sessionId: string;

  beforeAll(async () => {
    database = await createMigratedDatabase();
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
    const [project] = await database.db
      .insert(projects)
      .values({ ownerId: owner?.id ?? '', name: 'Generation' })
      .returning({ id: projects.id });
    const [session] = await database.db
      .insert(sessions)
      .values({ projectId: project?.id ?? '', initialPrompt: 'a prompt' })
      .returning({ id: sessions.id });
    sessionId = session?.id ?? '';
  });

  async function insertRun(values: Record<string, unknown> = {}): Promise<string> {
    const [run] = await database.db
      .insert(generationRuns)
      .values({ sessionId, stage: 'constitution', ...values })
      .returning({ id: generationRuns.id });

    return run?.id ?? '';
  }

  it('opens a run as running, with no provider, no first token and no completion', async () => {
    const runId = await insertRun();
    const [row] = await database.db
      .select()
      .from(generationRuns)
      .where(eq(generationRuns.id, runId));

    expect(row?.status).toBe('running');
    expect(row?.attempt).toBe(1);
    expect(row?.providerUsed).toBeNull();
    expect(row?.firstTokenAt).toBeNull();
    expect(row?.completedAt).toBeNull();
  });

  it('rejects a stage outside the asking vocabulary', async () => {
    const error = await captureDatabaseError(() => insertRun({ stage: 'complete' }));
    expect(error).toMatch(/generation_runs_stage_valid/i);
  });

  it('rejects a status outside the run lifecycle', async () => {
    const error = await captureDatabaseError(() => insertRun({ status: 'cancelled' }));
    expect(error).toMatch(/generation_runs_status_valid/i);
  });

  it('refuses a complete run without a completion time or a provider', async () => {
    const missingBoth = await captureDatabaseError(() => insertRun({ status: 'complete' }));
    expect(missingBoth).toMatch(/generation_runs_completion_paired/i);

    const missingProvider = await captureDatabaseError(() =>
      insertRun({ status: 'complete', completedAt: new Date() }),
    );
    expect(missingProvider).toMatch(/generation_runs_completion_paired/i);
  });

  it('refuses a completion time on a run that has not completed', async () => {
    const error = await captureDatabaseError(() =>
      insertRun({ status: 'running', completedAt: new Date() }),
    );
    expect(error).toMatch(/generation_runs_completion_paired/i);
  });

  it('accepts a complete run carrying both, which is what the latency series reads', async () => {
    const runId = await insertRun({
      status: 'complete',
      providerUsed: 'google',
      completedAt: new Date(),
      firstTokenAt: new Date(),
    });

    const [row] = await database.db
      .select()
      .from(generationRuns)
      .where(eq(generationRuns.id, runId));

    expect(row?.completedAt).not.toBeNull();
    expect(row?.firstTokenAt).not.toBeNull();
  });

  /**
   * Regression: a `first_token_at >= created_at` constraint was written and then removed (D-47).
   *
   * It compared two different clocks — the database's `now()` against the application's idea of when
   * the first delta arrived — and it failed intermittently in the suite for exactly that reason. On a
   * deployment where the app and the database are separate machines, the same skew would reject a
   * legitimate stamp in the middle of a user's generation. The stamp is a measurement; it must never
   * be able to fail a request.
   */
  it('accepts a first token stamped from the application clock, whatever the skew', async () => {
    const runId = await insertRun({ firstTokenAt: new Date('2020-01-01T00:00:00.000Z') });

    const [row] = await database.db
      .select()
      .from(generationRuns)
      .where(eq(generationRuns.id, runId));

    expect(row?.firstTokenAt).not.toBeNull();
  });

  it('refuses an attempt number below one', async () => {
    const error = await captureDatabaseError(() => insertRun({ attempt: 0 }));
    expect(error).toMatch(/generation_runs_attempt_positive/i);
  });

  describe('chunks', () => {
    it('numbers from zero and refuses a duplicate sequence within a run', async () => {
      const runId = await insertRun();

      await database.db.insert(generationChunks).values({ runId, sequence: 0, delta: 'hello ' });
      await database.db.insert(generationChunks).values({ runId, sequence: 1, delta: 'world' });

      const error = await captureDatabaseError(() =>
        database.db.insert(generationChunks).values({ runId, sequence: 1, delta: 'again' }),
      );
      expect(error).toMatch(/generation_chunks_run_sequence_unique|duplicate key/i);
    });

    it('lets two runs use the same sequence numbers', async () => {
      const first = await insertRun();
      const second = await insertRun();

      await database.db.insert(generationChunks).values({ runId: first, sequence: 0, delta: 'a' });
      await database.db.insert(generationChunks).values({ runId: second, sequence: 0, delta: 'b' });

      const rows = await database.db.select().from(generationChunks);
      expect(rows).toHaveLength(2);
    });

    it('refuses a negative sequence and an empty delta', async () => {
      const runId = await insertRun();

      expect(
        await captureDatabaseError(() =>
          database.db.insert(generationChunks).values({ runId, sequence: -1, delta: 'x' }),
        ),
      ).toMatch(/generation_chunks_sequence_non_negative/i);

      expect(
        await captureDatabaseError(() =>
          database.db.insert(generationChunks).values({ runId, sequence: 0, delta: '' }),
        ),
      ).toMatch(/generation_chunks_delta_not_empty/i);
    });

    it('disappears with its run, and the run disappears with its project (DR-6)', async () => {
      const runId = await insertRun();
      await database.db.insert(generationChunks).values({ runId, sequence: 0, delta: 'text' });

      await database.db.delete(users);

      expect(await database.db.select().from(generationRuns)).toEqual([]);
      expect(await database.db.select().from(generationChunks)).toEqual([]);
    });
  });
});
