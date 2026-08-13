import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { SchemaDatabase } from '@/db';
import { projects, sessions, specFiles, specRevisions, users, workflowState } from '@/db/schema';
import { createMigratedDatabase, type TestDatabase } from '@/db/testing/migrated-database';

import { assembleWorkflowSnapshot, type SnapshotAssemblyOptions } from './snapshot-assembler';

/**
 * Task 25 — the snapshot assembler against a real database.
 *
 * The engine's tests never touch this module: they build snapshots from literals. What must be
 * proven here is the other half of the contract — that persisted state maps onto exactly those
 * fields, that absent data reads as fail-closed defaults, and that assembly stays within its
 * documented query budget.
 */

/** Counts statements: every raw read in the assembler funnels through `execute`. */
function countingDatabase(real: SchemaDatabase, counter: { statements: number }): SchemaDatabase {
  return new Proxy(real, {
    get(target, property, receiver): unknown {
      if (property === 'execute') {
        return (statement: Parameters<SchemaDatabase['execute']>[0]) => {
          counter.statements += 1;
          return target.execute(statement);
        };
      }

      return Reflect.get(target, property, receiver);
    },
  });
}

const OPTIONS: SnapshotAssemblyOptions = { roundBudget: 3, capabilities: [] };

describe('workflow snapshot assembler (task 25)', () => {
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
      .values({ ownerId: owner?.id ?? '', name: 'Snapshot' })
      .returning({ id: projects.id });
    projectId = project?.id ?? '';

    const [session] = await database.db
      .insert(sessions)
      .values({ projectId, initialPrompt: 'Build a spec platform' })
      .returning({ id: sessions.id });
    sessionId = session?.id ?? '';

    await database.db.insert(workflowState).values({ sessionId, stage: 'interview' });
  });

  it('is null for a malformed or unknown session id', async () => {
    expect(await assembleWorkflowSnapshot(database.db, 'not-a-uuid', OPTIONS)).toBeNull();
    expect(
      await assembleWorkflowSnapshot(database.db, '11111111-2222-3333-4444-555555555555', OPTIONS),
    ).toBeNull();
  });

  it('reads a fresh interview session as the fail-closed baseline', async () => {
    const assembled = await assembleWorkflowSnapshot(database.db, sessionId, OPTIONS);

    expect(assembled).not.toBeNull();
    expect(assembled?.version).toBe(1);
    expect(assembled?.projectId).toBe(projectId);
    expect(assembled?.snapshot).toMatchObject({
      position: { stage: 'interview', substage: null },
      groundingInputRecorded: true,
      summaryPersisted: false,
      qualityEnabled: false,
      roundBudget: 3,
      capabilities: [],
      informationNeeds: [],
    });

    // No interview tables yet (they land with task 31): zero everywhere, never undefined.
    expect(assembled?.snapshot.answeredRounds).toMatchObject({ interview: 0, constitution: 0 });
    expect(assembled?.snapshot.specApproved).toEqual({
      constitution: false,
      requirements: false,
      solution: false,
      tasks: false,
      quality: false,
    });
    expect(assembled?.snapshot.reviewDecided).toMatchObject({ constitution: false });
  });

  it('treats a whitespace-only summary as no summary (FR-006 AC-1)', async () => {
    await database.db.update(sessions).set({ summary: '  \n\t ' });
    expect(
      (await assembleWorkflowSnapshot(database.db, sessionId, OPTIONS))?.snapshot.summaryPersisted,
    ).toBe(false);

    await database.db.update(sessions).set({ summary: 'A real summary.' });
    expect(
      (await assembleWorkflowSnapshot(database.db, sessionId, OPTIONS))?.snapshot.summaryPersisted,
    ).toBe(true);
  });

  it('distinguishes latest-approved from any-approved per file (FR-009 AC-4; FR-020 AC-2)', async () => {
    const [file] = await database.db
      .insert(specFiles)
      .values({ projectId, specType: 'constitution', fileName: 'constitution.md' })
      .returning({ id: specFiles.id });
    const fileId = file?.id ?? '';

    // Revision 1, then approved — the false → true move the trigger permits.
    const [first] = await database.db
      .insert(specRevisions)
      .values({ specFileId: fileId, revisionNumber: 1, content: '# One' })
      .returning({ id: specRevisions.id });
    await database.db
      .update(specRevisions)
      .set({ approved: true })
      .where(eq(specRevisions.id, first?.id ?? ''));

    const afterApproval = await assembleWorkflowSnapshot(database.db, sessionId, OPTIONS);
    expect(afterApproval?.snapshot.specApproved.constitution).toBe(true);
    expect(afterApproval?.snapshot.approvedRevisionExists.constitution).toBe(true);

    // A request-changes redraft: newer revision, unapproved. Latest-approved drops; history stays.
    await database.db
      .insert(specRevisions)
      .values({ specFileId: fileId, revisionNumber: 2, content: '# Two' });

    const afterRedraft = await assembleWorkflowSnapshot(database.db, sessionId, OPTIONS);
    expect(afterRedraft?.snapshot.specApproved.constitution).toBe(false);
    expect(afterRedraft?.snapshot.approvedRevisionExists.constitution).toBe(true);

    // Untouched files stay false on both maps.
    expect(afterRedraft?.snapshot.specApproved.requirements).toBe(false);
    expect(afterRedraft?.snapshot.approvedRevisionExists.requirements).toBe(false);
  });

  it('reads position, version and the quality flag as persisted', async () => {
    await database.db
      .update(workflowState)
      .set({ stage: 'constitution', substage: 'generate', version: 4 });
    await database.db.update(sessions).set({ qualityEnabled: true });

    const assembled = await assembleWorkflowSnapshot(database.db, sessionId, {
      roundBudget: 5,
      capabilities: ['quality'],
    });

    expect(assembled?.snapshot.position).toEqual({ stage: 'constitution', substage: 'generate' });
    expect(assembled?.version).toBe(4);
    expect(assembled?.snapshot.qualityEnabled).toBe(true);
    expect(assembled?.snapshot.roundBudget).toBe(5);
    expect(assembled?.snapshot.capabilities).toEqual(['quality']);
  });

  it('stays within the documented query budget', async () => {
    const counter = { statements: 0 };
    const counted = countingDatabase(database.db, counter);

    await assembleWorkflowSnapshot(counted, sessionId, OPTIONS);

    // Two statements today: session+position, approval flags. The task 31 tables add the two
    // interview reads; the documented ceiling is four.
    expect(counter.statements).toBeLessThanOrEqual(4);
    expect(counter.statements).toBe(2);
  });
});
