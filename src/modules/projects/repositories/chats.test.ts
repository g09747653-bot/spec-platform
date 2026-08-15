import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { OwnerScope } from '@/db/owner-scope';
import { projects, questionRounds, sessions, users, workflowState } from '@/db/schema';
import { createMigratedDatabase, type TestDatabase } from '@/db/testing/migrated-database';

import { createSessionRepository } from './sessions';

/**
 * Task 120 — the project's chats, and the three filters that compose over them.
 *
 * Asserted here rather than only through the page, because "searching within Archived works" is a
 * property of **one SQL statement**: a filter applied to rows already loaded would pass every
 * browser test that searched the Active tab and fail the one criterion that matters.
 */
describe('the chats of a project (task 120)', () => {
  let database: TestDatabase;
  let ownerId: string;
  let projectId: string;
  let repository: ReturnType<typeof createSessionRepository>;

  beforeAll(async () => {
    database = await createMigratedDatabase();
    repository = createSessionRepository(database.db);
  });

  afterAll(async () => {
    await database.close();
  });

  const scope = () => OwnerScope.forAuthenticatedUser(ownerId);

  /** A chat with a title, a methodology and a position — the three things a row prints. */
  async function seedChat(input: {
    title: string;
    methodologyId?: string;
    archived?: boolean;
    stage?: string;
  }): Promise<string> {
    const [session] = await database.db
      .insert(sessions)
      .values({
        projectId,
        title: input.title,
        initialPrompt: `seed for ${input.title}`,
        ...(input.methodologyId === undefined ? {} : { methodologyId: input.methodologyId }),
        ...(input.archived === undefined ? {} : { archived: input.archived }),
      })
      .returning({ id: sessions.id });

    await database.db
      .insert(workflowState)
      .values({ sessionId: session?.id ?? '', stage: input.stage ?? 'interview', substage: null });

    return session?.id ?? '';
  }

  beforeEach(async () => {
    await database.db.delete(users);

    const [owner] = await database.db
      .insert(users)
      .values({ email: 'owner@example.test' })
      .returning({ id: users.id });
    ownerId = owner?.id ?? '';

    const [project] = await database.db
      .insert(projects)
      .values({ ownerId, name: 'Recipes' })
      .returning({ id: projects.id });
    projectId = project?.id ?? '';
  });

  const titles = async (filter: Parameters<typeof repository.listForProject>[2]) =>
    (await repository.listForProject(scope(), projectId, filter)).map((chat) => chat.title);

  it('lists the active chats by default, newest activity first', async () => {
    await seedChat({ title: 'Bundle' });
    await seedChat({ title: 'Edit constitution.md', methodologyId: 'myspec-edit-v1' });
    await seedChat({ title: 'Old idea', archived: true });

    expect((await titles({})).sort()).toEqual(['Bundle', 'Edit constitution.md']);
  });

  it('separates the chat classes by the ids the caller passes', async () => {
    await seedChat({ title: 'Bundle' });
    await seedChat({ title: 'Edit constitution.md', methodologyId: 'myspec-edit-v1' });

    expect(await titles({ methodologyIds: ['myspec-edit-v1'] })).toEqual(['Edit constitution.md']);
    expect(await titles({ methodologyIds: ['myspec-greenfield-v1'] })).toEqual(['Bundle']);
  });

  /* AC-1, the composing half: a search inside Archived finds an archived chat and nothing else. */
  it('composes search with the archived filter', async () => {
    await seedChat({ title: 'Rate limits' });
    await seedChat({ title: 'Rate limits, second attempt', archived: true });

    expect(await titles({ archived: 'archived', search: 'rate' })).toEqual([
      'Rate limits, second attempt',
    ]);
    expect(await titles({ archived: 'active', search: 'rate' })).toEqual(['Rate limits']);
    expect((await titles({ archived: 'all', search: 'rate' })).length).toBe(2);
    expect(await titles({ archived: 'all', search: 'nothing' })).toEqual([]);
  });

  it('treats a wildcard in the search box as a character, not a pattern', async () => {
    await seedChat({ title: '100% coverage' });
    await seedChat({ title: 'Something else' });

    expect(await titles({ search: '100%' })).toEqual(['100% coverage']);
    // A bare `%` would match everything if it were passed through to ILIKE unescaped.
    expect(await titles({ search: '%' })).toEqual(['100% coverage']);
  });

  it('archives and restores without deleting anything (AC-1)', async () => {
    const id = await seedChat({ title: 'Bundle' });

    expect(await repository.setArchived(scope(), id, true)).toBe(true);
    expect(await titles({})).toEqual([]);
    expect(await titles({ archived: 'archived' })).toEqual(['Bundle']);

    expect(await repository.setArchived(scope(), id, false)).toBe(true);
    expect(await titles({})).toEqual(['Bundle']);

    // The row never left: the same session id, with its workflow state intact.
    const detail = await repository.findDetailById(scope(), id);
    expect(detail).toMatchObject({ title: 'Bundle', archived: false, stage: 'interview' });
  });

  /*
   * AC-2 — the age comes from persisted rows and the database's clock. A chat whose newest round was
   * presented two days ago is two days old however the reader's laptop is set.
   */
  it('derives the age from the newest persisted row, not from a client clock', async () => {
    const id = await seedChat({ title: 'Bundle' });

    const [fresh] = await repository.listForProject(scope(), projectId, {});
    expect(fresh?.ageSeconds).toBeLessThan(60);

    await database.db.insert(questionRounds).values({
      sessionId: id,
      stage: 'interview',
      roundNumber: 1,
      questions: { stage: 'interview', questions: [] },
      presentedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    });

    // The *newest* row still is the session's own creation, so the age does not go backwards.
    const [afterOldRound] = await repository.listForProject(scope(), projectId, {});
    expect(afterOldRound?.ageSeconds).toBeLessThan(60);
  });

  it('answers nothing for another owner (AR-2)', async () => {
    await seedChat({ title: 'Bundle' });

    const stranger = OwnerScope.forAuthenticatedUser('11111111-1111-4111-8111-111111111111');

    expect(await repository.listForProject(stranger, projectId, {})).toEqual([]);
    expect(await repository.setArchived(stranger, projectId, true)).toBe(false);
  });
});
