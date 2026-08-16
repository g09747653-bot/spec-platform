import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { projects, sessions, specFiles, specRevisions, users, workflowState } from '@/db/schema';
import { createMigratedDatabase, type TestDatabase } from '@/db/testing/migrated-database';

import { createRevisionRepository } from './repositories/revisions';
import { revertToPreviousRevision } from './revert';

/**
 * Task 127 — «go back» is an append, and the history proves it.
 *
 * The acceptance criterion is three claims about the table, so they are asked of the table:
 *
 * - the new revision is **byte-equal** to the one before the current — not similar, equal;
 * - it is Rev N+1, and Rev N is **still there**, unchanged (task 16's triggers make anything else
 *   impossible, and this is the test that would notice if they were ever relaxed);
 * - the chat that asked is stamped on it, so «which conversation produced this?» stays answerable
 *   with several chats on a project (А-6).
 */
describe('reverting to the previous revision', () => {
  let database: TestDatabase;
  let editSessionId: string;
  let specFileId: string;

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
    const ownerId = owner?.id ?? '';

    const [project] = await database.db
      .insert(projects)
      .values({ ownerId, name: 'Bundle' })
      .returning({ id: projects.id });
    const projectId = project?.id ?? '';

    const [editSession] = await database.db
      .insert(sessions)
      .values({
        projectId,
        title: 'Edit constitution.md',
        initialPrompt: 'I want to update spec constitution.md to ',
        methodologyId: 'myspec-edit-v1',
      })
      .returning({ id: sessions.id });
    editSessionId = editSession?.id ?? '';
    await database.db
      .insert(workflowState)
      .values({ sessionId: editSessionId, stage: 'constitution', substage: 'generate' });

    const [file] = await database.db
      .insert(specFiles)
      .values({ projectId, specType: 'constitution', fileName: 'constitution.md' })
      .returning({ id: specFiles.id });
    specFileId = file?.id ?? '';
  });

  const append = async (content: string) =>
    createRevisionRepository(database.db).append({ specFileId, content });

  it('writes Rev N+1 byte-equal to Rev N-1, and leaves Rev N where it was', async () => {
    await append('# One\n\nThe original text.\n');
    const second = await append('# Two\n\nThe text after the edit.\n');

    const outcome = await revertToPreviousRevision(database.db, {
      specFileId,
      sourceSessionId: editSessionId,
    });

    expect(outcome.status).toBe('reverted');
    if (outcome.status !== 'reverted') return;

    expect(outcome.restoredFrom).toBe(1);
    expect(outcome.revision.revisionNumber).toBe(3);
    expect(outcome.revision.content).toBe('# One\n\nThe original text.\n');

    // All three, in order, with the middle one untouched: a revert is an append.
    const history = await createRevisionRepository(database.db).history(specFileId);
    expect(history.map((revision) => revision.revisionNumber).sort((a, b) => a - b)).toEqual([
      1, 2, 3,
    ]);
    expect(history.find((revision) => revision.revisionNumber === 2)?.content).toBe(second.content);
  });

  it('stamps the chat that asked for it', async () => {
    await append('# One\n');
    await append('# Two\n');

    const outcome = await revertToPreviousRevision(database.db, {
      specFileId,
      sourceSessionId: editSessionId,
    });
    expect(outcome.status).toBe('reverted');

    const rows = await database.db.select().from(specRevisions);
    const written = rows.find((row) => row.revisionNumber === 3);

    expect(written?.sourceSessionId).toBe(editSessionId);
    // Approved: the user read the diff on the card and said apply, which is the decision (P2).
    expect(written?.approved).toBe(true);
  });

  it('can itself be reverted, which is what makes going back safe to offer', async () => {
    await append('# One\n');
    await append('# Two\n');

    await revertToPreviousRevision(database.db, { specFileId, sourceSessionId: editSessionId });
    const again = await revertToPreviousRevision(database.db, {
      specFileId,
      sourceSessionId: editSessionId,
    });

    expect(again.status).toBe('reverted');
    if (again.status !== 'reverted') return;

    // Rev 4 restores Rev 2 — the text that was there before the first go-back.
    expect(again.revision.revisionNumber).toBe(4);
    expect(again.revision.content).toBe('# Two\n');
  });

  it('refuses when there is nothing earlier to go back to', async () => {
    await append('# Only\n');

    const outcome = await revertToPreviousRevision(database.db, {
      specFileId,
      sourceSessionId: editSessionId,
    });

    expect(outcome.status).toBe('no-predecessor');
    expect(await createRevisionRepository(database.db).history(specFileId)).toHaveLength(1);
  });

  it('says not-found for a file with no revisions at all', async () => {
    const outcome = await revertToPreviousRevision(database.db, {
      specFileId,
      sourceSessionId: editSessionId,
    });

    expect(outcome.status).toBe('not-found');
  });
});
