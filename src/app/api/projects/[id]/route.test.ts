import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { OwnerScope } from '@/db/owner-scope';
import {
  answers,
  attachments,
  exportRecords,
  informationNeeds,
  projects,
  proposedChanges,
  questionRounds,
  reviewFeedback,
  sessions,
  specFiles,
  specRevisions,
  users,
  workflowState,
} from '@/db/schema';
import { createMigratedDatabase, type TestDatabase } from '@/db/testing/migrated-database';
import type * as StorageModule from '@/modules/adapters/storage';

/**
 * Task 76 — rename and permanent delete (FR-002 AC-3..AC-5; DR-6; DR-7; IR-005-AC-3).
 *
 * The deletion criterion is "no row **or blob object** for the project remains", so the assertions
 * count rows in every table below a project *and* read the store back. A test that only checked the
 * project row would pass against a cascade that had quietly stopped reaching one of the tables.
 */
vi.mock('@/modules/projects/auth/scope', () => ({
  currentOwnerScope: vi.fn(),
  requireOwnerScope: vi.fn(),
}));

vi.mock('@/db/client', () => ({ getDatabase: vi.fn() }));

vi.mock('@/modules/adapters/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof StorageModule>();
  return { ...actual, createDefaultStorage: vi.fn() };
});

import { getDatabase } from '@/db/client';
import { createDefaultStorage, createMemoryStorage } from '@/modules/adapters/storage';
import { currentOwnerScope } from '@/modules/projects/auth/scope';
import { createRevisionRepository } from '@/modules/specs/repositories/revisions';

import { DELETE, PATCH } from './route';

describe('PATCH/DELETE /api/projects/:id (task 76)', () => {
  let database: TestDatabase;
  let storage: ReturnType<typeof createMemoryStorage>;
  let scope: OwnerScope;
  let projectId: string;
  let sessionId: string;

  const patch = (body: unknown): Promise<Response> =>
    PATCH(
      new Request('http://test.local/api/projects/x', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id: projectId }) },
    );

  const remove = (query = '?confirm=permanent'): Promise<Response> =>
    DELETE(new Request(`http://test.local/api/projects/x${query}`, { method: 'DELETE' }), {
      params: Promise.resolve({ id: projectId }),
    });

  beforeAll(async () => {
    database = await createMigratedDatabase();
    vi.mocked(getDatabase).mockReturnValue(
      database.db as unknown as ReturnType<typeof getDatabase>,
    );
  });

  afterAll(async () => {
    await database.close();
    vi.restoreAllMocks();
  });

  beforeEach(async () => {
    storage = createMemoryStorage();
    vi.mocked(createDefaultStorage).mockReturnValue(storage);

    await database.db.delete(users);

    const [owner] = await database.db
      .insert(users)
      .values({ email: 'owner@example.test' })
      .returning({ id: users.id });

    scope = OwnerScope.forAuthenticatedUser(owner?.id ?? '');
    vi.mocked(currentOwnerScope).mockResolvedValue(scope);

    const [project] = await database.db
      .insert(projects)
      .values({ ownerId: owner?.id ?? '', name: 'Original name' })
      .returning({ id: projects.id });

    projectId = project?.id ?? '';

    const [session] = await database.db
      .insert(sessions)
      .values({ projectId, initialPrompt: 'A project to rename and then delete' })
      .returning({ id: sessions.id });

    sessionId = session?.id ?? '';
    await database.db
      .insert(workflowState)
      .values({ sessionId, stage: 'constitution', substage: 'review' });
  });

  /** Fills every table below the project, so the cascade has something to fail to reach. */
  async function populate(): Promise<void> {
    const revisions = createRevisionRepository(database.db);
    const file = await revisions.ensureSpecFile(projectId, 'constitution');
    const revision = await revisions.append({ specFileId: file.id, content: '# Constitution' });
    await revisions.approve(revision.id);

    await database.db
      .insert(reviewFeedback)
      .values({ specRevisionId: revision.id, outcome: 'pass', items: [] });

    await database.db.insert(proposedChanges).values({
      specFileId: file.id,
      baseRevision: 1,
      proposedContent: '# Constitution\nproposed',
      instruction: 'Tighten it.',
    });

    const [round] = await database.db
      .insert(questionRounds)
      .values({ sessionId, stage: 'interview', roundNumber: 1, questions: { questions: [] } })
      .returning({ id: questionRounds.id });

    await database.db
      .insert(answers)
      .values({ roundId: round?.id ?? '', questionId: 'q1', selectedOptionIds: ['a'] });

    await database.db
      .insert(informationNeeds)
      .values({ sessionId, stage: 'interview', name: 'audience' });

    await database.db
      .insert(exportRecords)
      .values({ projectId, mode: 'default', includedFiles: [], omittedFiles: [] });

    const { blobKey } = await storage.put(scope, {
      sessionId,
      fileName: 'brief.pdf',
      contentType: 'application/pdf',
      bytes: new Uint8Array([1, 2, 3]),
    });

    await database.db.insert(attachments).values({
      sessionId,
      fileName: 'brief.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 3,
      blobKey,
      parseStatus: 'ok',
      extractedText: 'text',
      attachedAtStage: 'interview',
    });
  }

  describe('rename (AC-3)', () => {
    it('changes only the name', async () => {
      await populate();

      const before = {
        revisions: await database.db.select().from(specRevisions),
        state: await database.db.select().from(workflowState),
        session: await database.db.select().from(sessions),
      };

      const response = await patch({ name: 'A better name' });
      expect(response.status).toBe(200);

      const [row] = await database.db.select().from(projects).where(eq(projects.id, projectId));
      expect(row?.name).toBe('A better name');

      // Everything the criterion names, byte for byte.
      expect(await database.db.select().from(specRevisions)).toEqual(before.revisions);
      expect(await database.db.select().from(workflowState)).toEqual(before.state);
      expect(await database.db.select().from(sessions)).toEqual(before.session);
    });

    it('refuses a blank name rather than storing one', async () => {
      const response = await patch({ name: '   ' });

      expect(response.status).toBe(422);
      const [row] = await database.db.select().from(projects).where(eq(projects.id, projectId));
      expect(row?.name).toBe('Original name');
    });

    it('is 404 for a project the caller does not own (AR-2)', async () => {
      vi.mocked(currentOwnerScope).mockResolvedValue(
        OwnerScope.forAuthenticatedUser('11111111-1111-4111-8111-111111111111'),
      );

      expect((await patch({ name: 'Theirs now' })).status).toBe(404);

      const [row] = await database.db.select().from(projects).where(eq(projects.id, projectId));
      expect(row?.name).toBe('Original name');
    });
  });

  describe('delete (AC-4/AC-5)', () => {
    /*
     * AC-4 asks for an explicit confirmation. The dialog is the person's half; this is the request's
     * half — without it, "confirmed" would be a property of the client having behaved, and a delete
     * that arrived by accident would be indistinguishable from one that meant it.
     */
    it('refuses an unconfirmed delete and removes nothing', async () => {
      await populate();

      expect((await remove('')).status).toBe(422);
      expect((await remove('?confirm=yes')).status).toBe(422);

      expect(await database.db.select().from(projects)).toHaveLength(1);
      expect(storage.keys()).toHaveLength(1);
    });

    it('removes every row below the project, and the stored objects (AC-5; IR-005-AC-3)', async () => {
      await populate();

      const response = await remove();
      expect(response.status).toBe(204);

      for (const [name, table] of [
        ['projects', projects],
        ['sessions', sessions],
        ['workflow_state', workflowState],
        ['spec_files', specFiles],
        ['spec_revisions', specRevisions],
        ['review_feedback', reviewFeedback],
        ['proposed_changes', proposedChanges],
        ['question_rounds', questionRounds],
        ['answers', answers],
        ['information_needs', informationNeeds],
        ['attachments', attachments],
        ['export_records', exportRecords],
      ] as const) {
        expect(await database.db.select().from(table), `${name} still has rows`).toEqual([]);
      }

      expect(storage.keys()).toEqual([]);
    });

    it('is 404 for a project the caller does not own, and deletes nothing (AR-2)', async () => {
      await populate();

      vi.mocked(currentOwnerScope).mockResolvedValue(
        OwnerScope.forAuthenticatedUser('11111111-1111-4111-8111-111111111111'),
      );

      expect((await remove()).status).toBe(404);
      expect(await database.db.select().from(projects)).toHaveLength(1);
      expect(storage.keys()).toHaveLength(1);
    });

    /*
     * solution.md is explicit: a failed blob delete is logged, the cascade still completes, and the
     * orphans are swept later. The alternative is an owner who cannot delete their own project
     * because a third party is having a bad day.
     */
    it('completes the deletion even when the store refuses', async () => {
      await populate();

      vi.mocked(createDefaultStorage).mockReturnValue({
        ...storage,
        deleteMany: () => Promise.reject(new Error('storage unavailable')),
      });

      const response = await remove();

      expect(response.status).toBe(204);
      expect(await database.db.select().from(projects)).toEqual([]);
    });

    it('is 401 with no session at all', async () => {
      vi.mocked(currentOwnerScope).mockResolvedValue(null);

      expect((await remove()).status).toBe(401);
      expect((await patch({ name: 'x' })).status).toBe(401);
    });
  });
});
