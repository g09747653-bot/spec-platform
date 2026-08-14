import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  projects,
  reviewFeedback,
  sessions,
  specFiles,
  specRevisions,
  users,
  workflowState,
} from '@/db/schema';
import { createMigratedDatabase, type TestDatabase } from '@/db/testing/migrated-database';

import { applyTransition } from './apply-transition';
import type { SnapshotAssemblyOptions } from './snapshot-assembler';

/**
 * Task 28 — applyTransition against a real database.
 *
 * Two properties, both stated in the acceptance criteria: nothing is persisted unless
 * `evaluateTransition` allowed it, and two concurrent transitions produce exactly one success and
 * one `CONFLICT`. The version token is what turns the read-evaluate-write sequence into an atomic
 * decision: the write fires only against the version the gate evaluated.
 */
const OPTIONS: SnapshotAssemblyOptions = { roundBudget: 3, capabilities: [] };

describe('applyTransition (task 28)', () => {
  let database: TestDatabase;
  let sessionId: string;
  let projectId: string;

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
      .values({ ownerId: owner?.id ?? '', name: 'Transitions' })
      .returning({ id: projects.id });
    projectId = project?.id ?? '';

    const [session] = await database.db
      .insert(sessions)
      .values({ projectId, initialPrompt: 'Build a spec platform', summary: 'Summarised.' })
      .returning({ id: sessions.id });
    sessionId = session?.id ?? '';

    await database.db.insert(workflowState).values({ sessionId, stage: 'interview' });
  });

  async function moveTo(stage: string, substage: string | null, version = 1): Promise<void> {
    await database.db
      .update(workflowState)
      .set({ stage, substage, version })
      .where(eq(workflowState.sessionId, sessionId));
  }

  async function approveConstitution(): Promise<void> {
    const [file] = await database.db
      .insert(specFiles)
      .values({ projectId, specType: 'constitution', fileName: 'constitution.md' })
      .returning({ id: specFiles.id });
    const [revision] = await database.db
      .insert(specRevisions)
      .values({ specFileId: file?.id ?? '', revisionNumber: 1, content: '# Constitution' })
      .returning({ id: specRevisions.id });
    await database.db
      .update(specRevisions)
      .set({ approved: true })
      .where(eq(specRevisions.id, revision?.id ?? ''));
  }

  async function currentState(): Promise<{
    stage: string;
    substage: string | null;
    version: number;
  }> {
    const [row] = await database.db
      .select({
        stage: workflowState.stage,
        substage: workflowState.substage,
        version: workflowState.version,
      })
      .from(workflowState)
      .where(eq(workflowState.sessionId, sessionId));

    if (row === undefined) throw new Error('workflow state disappeared');
    return row;
  }

  it('persists an allowed transition and bumps the version', async () => {
    await moveTo('constitution', 'generate');
    await approveConstitution();

    const outcome = await applyTransition(
      database.db,
      sessionId,
      { stage: 'constitution', substage: 'review' },
      OPTIONS,
    );

    expect(outcome.status).toBe('applied');
    if (outcome.status === 'applied') {
      expect(outcome.position.stage).toBe('constitution');
      expect(outcome.position.substage).toBe('review');
      expect(outcome.position.version).toBe(2);
    }

    expect(await currentState()).toEqual({
      stage: 'constitution',
      substage: 'review',
      version: 2,
    });
  });

  it('persists nothing when the gate refuses (AC: no transition unless allowed)', async () => {
    await moveTo('constitution', 'generate');
    // No approved revision: the approval gate must hold.

    const outcome = await applyTransition(
      database.db,
      sessionId,
      { stage: 'constitution', substage: 'review' },
      OPTIONS,
    );

    expect(outcome).toMatchObject({ status: 'rejected', reason: 'SPEC_NOT_APPROVED' });
    expect(await currentState()).toEqual({
      stage: 'constitution',
      substage: 'generate',
      version: 1,
    });
  });

  it('refuses the interview exit with the unmet conditions named (FR-006 AC-2)', async () => {
    // Grounding input and summary exist; no interview round has been answered — and until the
    // task 31 tables land, none can be, so the engine fails closed on exactly that condition.
    const outcome = await applyTransition(
      database.db,
      sessionId,
      { stage: 'constitution', substage: 'collect' },
      OPTIONS,
    );

    expect(outcome).toMatchObject({ status: 'rejected', reason: 'INTERVIEW_INCOMPLETE' });
    if (outcome.status === 'rejected' && !outcome.result.allowed) {
      expect(outcome.result.unmet).toEqual(['answered-round']);
    }

    expect((await currentState()).stage).toBe('interview');
  });

  it('rejects an untabled movement with TRANSITION_NOT_IN_TABLE and moves nothing', async () => {
    await moveTo('constitution', 'generate');

    const outcome = await applyTransition(
      database.db,
      sessionId,
      { stage: 'tasks', substage: 'review' },
      OPTIONS,
    );

    expect(outcome).toMatchObject({ status: 'rejected', reason: 'TRANSITION_NOT_IN_TABLE' });
    expect((await currentState()).version).toBe(1);
  });

  it('produces exactly one success and one conflict for two concurrent transitions (AC)', async () => {
    await moveTo('constitution', 'generate');
    await approveConstitution();

    const target = { stage: 'constitution', substage: 'review' } as const;
    const [first, second] = await Promise.all([
      applyTransition(database.db, sessionId, target, OPTIONS),
      applyTransition(database.db, sessionId, target, OPTIONS),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual(['applied', 'conflict']);

    // One advance, not two: the version moved exactly once.
    expect(await currentState()).toEqual({
      stage: 'constitution',
      substage: 'review',
      version: 2,
    });
  });

  it('is not-found for an unknown session', async () => {
    const outcome = await applyTransition(
      database.db,
      '11111111-2222-3333-4444-555555555555',
      { stage: 'constitution', substage: 'collect' },
      OPTIONS,
    );

    expect(outcome).toEqual({ status: 'not-found' });
  });

  /**
   * Task 78 — completion, and what it costs to reach it (FR-020 AC-1/AC-2/AC-9/AC-10).
   *
   * The gates themselves are covered exhaustively by the matrix suite, from literals. What can only
   * be asserted here is what a real transition *writes*: the position, the count, and — for a
   * refusal — nothing at all.
   */
  describe('completion and the seal', () => {
    /** Approves one revision of `specType`, which is what `completionGate` counts (AC-2). */
    async function approveFile(specType: string): Promise<void> {
      const [file] = await database.db
        .insert(specFiles)
        .values({ projectId, specType, fileName: `${specType}.md` })
        .returning({ id: specFiles.id });
      const [revision] = await database.db
        .insert(specRevisions)
        .values({ specFileId: file?.id ?? '', revisionNumber: 1, content: `# ${specType}` })
        .returning({ id: specRevisions.id });
      await database.db
        .update(specRevisions)
        .set({ approved: true })
        .where(eq(specRevisions.id, revision?.id ?? ''));
      await database.db.insert(reviewFeedback).values({
        specRevisionId: revision?.id ?? '',
        outcome: 'pass',
        items: [],
        decision: 'accept',
        decidedAt: new Date(),
      });
    }

    const completionCount = async (): Promise<number> => {
      const [row] = await database.db
        .select({ count: sessions.completionCount })
        .from(sessions)
        .where(eq(sessions.id, sessionId));

      return row?.count ?? -1;
    };

    /*
     * The tasks review is decided and `solution` is not approved: `tasksToComplete` checks the
     * review first, so leaving that undecided too would produce `REVIEW_NOT_DECIDED` and this test
     * would pass without ever reaching the completion gate. Its first draft did exactly that.
     */
    it('refuses completion while a required file has no approved revision (AC-2)', async () => {
      await moveTo('tasks', 'review');
      await approveFile('constitution');
      await approveFile('requirements');
      await approveFile('tasks');

      const outcome = await applyTransition(
        database.db,
        sessionId,
        { stage: 'complete', substage: null },
        OPTIONS,
      );

      expect(outcome).toMatchObject({ status: 'rejected', reason: 'SPEC_MISSING' });
      expect(await currentState()).toMatchObject({ stage: 'tasks', substage: 'review' });
      expect(await completionCount()).toBe(0);
    });

    it('completes when every file of the bundle is approved and the review is decided (AC-1)', async () => {
      await moveTo('tasks', 'review');
      for (const specType of ['constitution', 'requirements', 'solution', 'tasks']) {
        await approveFile(specType);
      }

      const outcome = await applyTransition(
        database.db,
        sessionId,
        { stage: 'complete', substage: null },
        OPTIONS,
      );

      expect(outcome.status).toBe('applied');
      expect(await currentState()).toMatchObject({ stage: 'complete', substage: null });
      expect(await completionCount()).toBe(1);
    });

    it('seals: every movement out of complete is refused and writes nothing (AC-9)', async () => {
      await moveTo('complete', null);

      for (const target of [
        { stage: 'interview', substage: null },
        { stage: 'tasks', substage: 'review' },
        { stage: 'constitution', substage: 'collect' },
      ] as const) {
        const outcome = await applyTransition(database.db, sessionId, target, OPTIONS);

        expect(outcome, `${target.stage} must be refused`).toMatchObject({
          status: 'rejected',
          reason: 'SESSION_SEALED',
        });
      }

      /*
       * The one tabled exit is refused too, and its reason is the more specific one: with no module
       * installed there is no Quality stage to re-enter at all, so `CAPABILITY_NOT_REGISTERED`
       * outranks the seal. AC-9 asks for "a reason identifying the rejected transition", and this is
       * the truer of the two — the session is sealed *and* the destination does not exist.
       */
      expect(
        await applyTransition(
          database.db,
          sessionId,
          { stage: 'quality', substage: 'collect' },
          OPTIONS,
        ),
      ).toMatchObject({ status: 'rejected', reason: 'CAPABILITY_NOT_REGISTERED' });

      expect(await currentState()).toEqual({ stage: 'complete', substage: null, version: 1 });
      expect(await completionCount()).toBe(0);
    });

    /*
     * AC-10: a session may complete more than once. The count is history, not position — which is
     * exactly why it is a counter rather than a boolean, and why the increment sits after the
     * version-guarded update rather than before it.
     */
    it('counts each arrival at complete, and a refused arrival not at all', async () => {
      await moveTo('tasks', 'review');
      for (const specType of ['constitution', 'requirements', 'solution', 'tasks']) {
        await approveFile(specType);
      }

      await applyTransition(database.db, sessionId, { stage: 'complete', substage: null }, OPTIONS);
      expect(await completionCount()).toBe(1);

      // A second, refused attempt from the sealed position must not move the count.
      await applyTransition(database.db, sessionId, { stage: 'complete', substage: null }, OPTIONS);
      expect(await completionCount()).toBe(1);

      // Re-entry and return, the way FR-020 AC-5/AC-7 describe it.
      await database.db
        .update(sessions)
        .set({ qualityEnabled: true })
        .where(eq(sessions.id, sessionId));
      const withQuality: SnapshotAssemblyOptions = { roundBudget: 3, capabilities: ['quality'] };

      await applyTransition(
        database.db,
        sessionId,
        { stage: 'quality', substage: 'collect' },
        withQuality,
      );
      expect((await currentState()).stage).toBe('quality');

      await moveTo('quality', 'review', (await currentState()).version);
      await approveFile('quality');

      await applyTransition(
        database.db,
        sessionId,
        { stage: 'complete', substage: null },
        withQuality,
      );

      expect((await currentState()).stage).toBe('complete');
      expect(await completionCount()).toBe(2);
    });

    it('leaves every prior revision intact across a re-entry (AC-10)', async () => {
      await moveTo('tasks', 'review');
      for (const specType of ['constitution', 'requirements', 'solution', 'tasks']) {
        await approveFile(specType);
      }

      const before = await database.db.select().from(specRevisions);

      await applyTransition(database.db, sessionId, { stage: 'complete', substage: null }, OPTIONS);
      await database.db
        .update(sessions)
        .set({ qualityEnabled: true })
        .where(eq(sessions.id, sessionId));
      await applyTransition(
        database.db,
        sessionId,
        { stage: 'quality', substage: 'collect' },
        { roundBudget: 3, capabilities: ['quality'] },
      );

      expect(await database.db.select().from(specRevisions)).toEqual(before);
    });
  });
});
