import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { projects, sessions, users, workflowState } from '@/db/schema';
import { createMigratedDatabase, type TestDatabase } from '@/db/testing/migrated-database';

import { createWorkflowStateRepository, type WorkflowStateRepository } from './workflow-state';

/**
 * Task 19 — the persisted workflow position.
 *
 * The acceptance criteria are "the rail reflects the persisted stage after a reload" and "stage and
 * substage are readable from a single query". A reload is a fresh read of the same row, which is what
 * every case here performs: write, then read as a new caller would.
 */
describe('workflow state persistence (task 19)', () => {
  let database: TestDatabase;
  let repository: WorkflowStateRepository;
  let sessionId: string;

  beforeAll(async () => {
    database = await createMigratedDatabase();
    repository = createWorkflowStateRepository(database.db);
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
      .values({ ownerId: owner?.id ?? '', name: 'Workflow' })
      .returning({ id: projects.id });
    const [session] = await database.db
      .insert(sessions)
      .values({ projectId: project?.id ?? '', initialPrompt: 'a prompt' })
      .returning({ id: sessions.id });
    sessionId = session?.id ?? '';

    await database.db
      .insert(workflowState)
      .values({ sessionId, stage: 'interview', substage: null });
  });

  it('reads stage, substage, pending action and version in one query (AC-2)', async () => {
    const position = await repository.find(sessionId);

    expect(position).toEqual({
      stage: 'interview',
      substage: null,
      version: 1,
      pendingAction: null,
    });
  });

  it('returns nothing for a session that has no state', async () => {
    expect(await repository.find('11111111-2222-3333-4444-555555555555')).toBeNull();
  });

  it('survives a reload: a later read sees the advanced position (AC-1)', async () => {
    await repository.advance(sessionId, { stage: 'constitution', substage: 'collect' }, 1);

    // A fresh repository over a fresh connection is what a reloaded page amounts to.
    const afterReload = await createWorkflowStateRepository(database.db).find(sessionId);

    expect(afterReload?.stage).toBe('constitution');
    expect(afterReload?.substage).toBe('collect');
    expect(afterReload?.version).toBe(2);
  });

  it('carries the pending action across a reload, so the same card is re-presented (FR-017 AC-4)', async () => {
    const pending = { kind: 'spec', specFileId: 'abc', revisionNumber: 1 };

    await repository.advance(
      sessionId,
      { stage: 'constitution', substage: 'generate' },
      1,
      pending,
    );

    expect((await repository.find(sessionId))?.pendingAction).toEqual(pending);
  });

  it('refuses a stale write instead of double-advancing (CONFLICT)', async () => {
    const first = await repository.advance(
      sessionId,
      { stage: 'constitution', substage: 'collect' },
      1,
    );
    expect(first?.version).toBe(2);

    // A second request that read version 1 before the first one landed.
    const stale = await repository.advance(
      sessionId,
      { stage: 'requirements', substage: 'collect' },
      1,
    );

    expect(stale).toBeNull();
    expect((await repository.find(sessionId))?.stage).toBe('constitution');
  });

  it('lets the caller retry with the version it just read', async () => {
    await repository.advance(sessionId, { stage: 'constitution', substage: 'collect' }, 1);
    const current = await repository.find(sessionId);

    const retried = await repository.advance(
      sessionId,
      { stage: 'constitution', substage: 'generate' },
      current?.version ?? 0,
    );

    expect(retried?.substage).toBe('generate');
    expect(retried?.version).toBe(3);
  });

  it('clears the pending action when a transition does not set one', async () => {
    await repository.advance(sessionId, { stage: 'constitution', substage: 'generate' }, 1, {
      kind: 'spec',
    });
    await repository.advance(sessionId, { stage: 'constitution', substage: 'review' }, 2);

    expect((await repository.find(sessionId))?.pendingAction).toBeNull();
  });

  it('sets and clears the pending action under the same version guard (FR-017 AC-3)', async () => {
    const pending = { kind: 'question-round', roundId: '11111111-2222-3333-4444-555555555555' };

    const claimed = await repository.setPendingAction(sessionId, pending, 1);
    expect(claimed?.pendingAction).toEqual(pending);
    expect(claimed?.version).toBe(2);
    expect(claimed?.stage).toBe('interview');

    // A stale claim loses, exactly like a stale transition.
    expect(await repository.setPendingAction(sessionId, null, 1)).toBeNull();

    const cleared = await repository.setPendingAction(sessionId, null, 2);
    expect(cleared?.pendingAction).toBeNull();
    expect(cleared?.version).toBe(3);
  });

  it('a pending-action claim and a transition racing on one version produce one winner', async () => {
    const [claim, advance] = await Promise.all([
      repository.setPendingAction(sessionId, { kind: 'question-round', roundId: 'x' }, 1),
      repository.advance(sessionId, { stage: 'constitution', substage: 'collect' }, 1),
    ]);

    expect([claim, advance].filter((outcome) => outcome !== null)).toHaveLength(1);
  });

  it('cannot write a position the stage model forbids — the database refuses it', async () => {
    // `interview` has no substages (constitution A2). The repository does not re-check this: the CHECK
    // constraint of task 11 is the single enforcement point, and this asserts it is still wired up.
    await expect(
      database.db
        .update(workflowState)
        .set({ stage: 'interview', substage: 'collect', version: 2 }),
    ).rejects.toThrow();
  });
});
