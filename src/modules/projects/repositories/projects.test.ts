import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { projects, sessions, users, workflowState } from '@/db/schema';
import { createMigratedDatabase, type TestDatabase } from '@/db/testing/migrated-database';

import { OwnerScope } from '@/db/owner-scope';
import { createProjectRepository, type ProjectRepository } from './projects';
import { createSessionRepository, type SessionRepository } from './sessions';

/**
 * Task 13 — owner scoping, asserted where it has to hold: in the SQL.
 *
 * Two users exist in every case, and the assertion is always the same shape — the second user's
 * request for the first user's row comes back empty rather than forbidden (NFR-005 AC-2; AR-2).
 */
describe('owner-scoped repositories (task 13)', () => {
  let database: TestDatabase;
  let projectRepository: ProjectRepository;
  let sessionRepository: SessionRepository;
  let alice: OwnerScope;
  let bob: OwnerScope;

  beforeAll(async () => {
    database = await createMigratedDatabase();
    projectRepository = createProjectRepository(database.db);
    sessionRepository = createSessionRepository(database.db);
  });

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    await database.db.delete(users);

    const inserted = await database.db
      .insert(users)
      .values([{ email: 'alice@example.test' }, { email: 'bob@example.test' }])
      .returning({ id: users.id });

    const [aliceRow, bobRow] = inserted;
    if (aliceRow === undefined || bobRow === undefined) throw new Error('user setup failed');

    alice = OwnerScope.forAuthenticatedUser(aliceRow.id);
    bob = OwnerScope.forAuthenticatedUser(bobRow.id);
  });

  describe('createFromPrompt', () => {
    it('creates project, session and workflow state in the interview stage (FR-002 AC-2, FR-003 AC-1)', async () => {
      const { projectId, sessionId } = await projectRepository.createFromPrompt(alice, {
        name: 'Recipe app',
        prompt: 'a recipe app for cooks who hate scrolling',
      });

      const detail = await projectRepository.findById(alice, projectId);

      expect(detail).not.toBeNull();
      expect(detail?.sessionId).toBe(sessionId);
      expect(detail?.stage).toBe('interview');
      expect(detail?.substage).toBeNull();
      expect(detail?.initialPrompt).toBe('a recipe app for cooks who hate scrolling');
      expect(detail?.version).toBe(1);
    });

    it('stores the prompt verbatim, whitespace, quotes and all (FR-003 AC-1)', async () => {
      const prompt = "line one\n  line two — with 'quotes' and a ; semicolon";
      const { projectId } = await projectRepository.createFromPrompt(alice, {
        name: 'Verbatim',
        prompt,
      });

      expect((await projectRepository.findById(alice, projectId))?.initialPrompt).toBe(prompt);
    });

    it('leaves nothing behind when the statement cannot complete', async () => {
      const orphan = OwnerScope.forAuthenticatedUser('00000000-0000-0000-0000-000000000000');

      await expect(
        projectRepository.createFromPrompt(orphan, { name: 'No owner', prompt: 'x' }),
      ).rejects.toThrow();

      // The three inserts are one statement, so a failed foreign key rolls the whole thing back.
      expect(await database.db.select().from(projects)).toHaveLength(0);
      expect(await database.db.select().from(sessions)).toHaveLength(0);
      expect(await database.db.select().from(workflowState)).toHaveLength(0);
    });
  });

  describe('list', () => {
    it('shows only the caller’s own projects (FR-002 AC-1; NFR-005 AC-1)', async () => {
      await projectRepository.createFromPrompt(alice, { name: 'Alice one', prompt: 'a' });
      await projectRepository.createFromPrompt(alice, { name: 'Alice two', prompt: 'b' });
      await projectRepository.createFromPrompt(bob, { name: 'Bob one', prompt: 'c' });

      const forAlice = await projectRepository.list(alice);
      const forBob = await projectRepository.list(bob);

      expect(forAlice.map((project) => project.name).sort()).toEqual(['Alice one', 'Alice two']);
      expect(forBob.map((project) => project.name)).toEqual(['Bob one']);
    });

    it('carries the name, stage and last-updated time the list renders', async () => {
      await projectRepository.createFromPrompt(alice, { name: 'Shape', prompt: 'a' });

      const [summary] = await projectRepository.list(alice);

      expect(summary?.name).toBe('Shape');
      expect(summary?.stage).toBe('interview');
      expect(summary?.updatedAt).toBeInstanceOf(Date);
    });

    it('orders by last touched, most recent first', async () => {
      const first = await projectRepository.createFromPrompt(alice, { name: 'Older', prompt: 'a' });
      await projectRepository.createFromPrompt(alice, { name: 'Newer', prompt: 'b' });

      await projectRepository.touch(alice, first.projectId);

      expect((await projectRepository.list(alice)).map((project) => project.name)).toEqual([
        'Older',
        'Newer',
      ]);
    });

    it('returns an empty list rather than every project when the owner has none', async () => {
      await projectRepository.createFromPrompt(bob, { name: 'Bob only', prompt: 'c' });

      expect(await projectRepository.list(alice)).toEqual([]);
    });
  });

  describe('findById', () => {
    it('returns nothing for another user’s project, not the row (NFR-005 AC-2)', async () => {
      const { projectId } = await projectRepository.createFromPrompt(alice, {
        name: 'Private',
        prompt: 'secret idea',
      });

      expect(await projectRepository.findById(bob, projectId)).toBeNull();
    });

    it('returns nothing for a well-formed identifier that names no project', async () => {
      expect(
        await projectRepository.findById(alice, '11111111-2222-3333-4444-555555555555'),
      ).toBeNull();
    });

    it('returns nothing for a malformed identifier instead of failing the request', async () => {
      expect(await projectRepository.findById(alice, 'not-a-uuid')).toBeNull();
      expect(await projectRepository.findById(alice, '')).toBeNull();
    });
  });

  describe('touch', () => {
    it('refuses to move another user’s project and says so', async () => {
      const { projectId } = await projectRepository.createFromPrompt(alice, {
        name: 'Private',
        prompt: 'x',
      });
      const before = await database.db
        .select({ updatedAt: projects.updatedAt })
        .from(projects)
        .where(eq(projects.id, projectId));

      expect(await projectRepository.touch(bob, projectId)).toBe(false);

      const after = await database.db
        .select({ updatedAt: projects.updatedAt })
        .from(projects)
        .where(eq(projects.id, projectId));

      expect(after[0]?.updatedAt).toEqual(before[0]?.updatedAt);
    });
  });

  describe('session lookup', () => {
    it('resolves a session through its project owner', async () => {
      const { sessionId } = await projectRepository.createFromPrompt(alice, {
        name: 'Session',
        prompt: 'grounding input',
      });

      const session = await sessionRepository.findById(alice, sessionId);

      expect(session?.id).toBe(sessionId);
      expect(session?.initialPrompt).toBe('grounding input');
      expect(session?.stage).toBe('interview');
      expect(session?.qualityEnabled).toBe(false);
    });

    it('does not resolve another user’s session id (NFR-005 AC-2)', async () => {
      const { sessionId } = await projectRepository.createFromPrompt(alice, {
        name: 'Session',
        prompt: 'x',
      });

      expect(await sessionRepository.findById(bob, sessionId)).toBeNull();
    });

    it('does not resolve a malformed session id', async () => {
      expect(await sessionRepository.findById(alice, 'nope')).toBeNull();
    });
  });

  describe('OwnerScope', () => {
    it('cannot be built from an empty user id', () => {
      expect(() => OwnerScope.forAuthenticatedUser('')).toThrow(/authenticated user id/);
      expect(() => OwnerScope.forAuthenticatedUser('   ')).toThrow(/authenticated user id/);
    });
  });
});
