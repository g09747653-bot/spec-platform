import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { projects, sessions, specFiles, specRevisions, users, workflowState } from '@/db/schema';
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
});
