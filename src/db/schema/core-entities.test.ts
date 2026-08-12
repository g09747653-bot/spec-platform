import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { projects, sessions, users, workflowState } from '@/db/schema';
import {
  appliedMigrationCount,
  captureDatabaseError,
  createMigratedDatabase,
  inRepoMigrationCount,
  type TestDatabase,
} from '@/db/testing/migrated-database';

/**
 * Task 11 — the core entities, asserted against a real PostgreSQL instance.
 *
 * The acceptance criteria are database properties ("migration applies cleanly and rolls forward",
 * "`projects.owner_id` is a non-null foreign key"), so they are asserted by making the database
 * accept or refuse statements, not by inspecting TypeScript types.
 */
describe('core entity schema (task 11)', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createMigratedDatabase();
  });

  afterAll(async () => {
    await database.close();
  });

  const createUser = async (email: string) => {
    const [row] = await database.db.insert(users).values({ email }).returning();
    if (row === undefined) throw new Error('insert returned no row');
    return row;
  };

  const createProject = async (ownerId: string, name = 'Spec Platform') => {
    const [row] = await database.db.insert(projects).values({ ownerId, name }).returning();
    if (row === undefined) throw new Error('insert returned no row');
    return row;
  };

  it('applies every migration cleanly and is idempotent on an existing database', async () => {
    // The instance is already migrated by `beforeAll`; a second run must add nothing. This is the
    // "rolls forward on an existing database" half of the acceptance criteria — the deploy step
    // runs the same migrator against a database that already carries earlier migrations.
    await expect(database.migrateAgain()).resolves.toBeUndefined();

    // Asserted against the journal rather than a hard-coded count, so adding a migration does not
    // require editing this test — only failing to apply one does.
    expect(await appliedMigrationCount(database)).toBe(inRepoMigrationCount());
  });

  it('rejects a project whose owner is null', async () => {
    const message = await captureDatabaseError(() =>
      database.exec(`INSERT INTO projects (owner_id, name) VALUES (NULL, 'orphan')`),
    );

    expect(message).toMatch(/owner_id/);
    expect(message).toMatch(/not-null|null value/i);
  });

  it('rejects a project whose owner does not exist', async () => {
    const message = await captureDatabaseError(() =>
      database.exec(
        `INSERT INTO projects (owner_id, name)
         VALUES ('00000000-0000-0000-0000-000000000000', 'no such owner')`,
      ),
    );

    expect(message).toMatch(/projects_owner_id_users_id_fk|foreign key/i);
  });

  it('cascades a user deletion through project, session and workflow state (DR-6)', async () => {
    const owner = await createUser('cascade@example.test');
    const project = await createProject(owner.id);
    const [session] = await database.db
      .insert(sessions)
      .values({ projectId: project.id, initialPrompt: 'build me a thing' })
      .returning();
    if (session === undefined) throw new Error('insert returned no row');
    await database.db
      .insert(workflowState)
      .values({ sessionId: session.id, stage: 'interview', substage: null });

    await database.db.delete(users).where(sql`${users.id} = ${owner.id}`);

    expect(await database.db.select().from(projects)).toHaveLength(0);
    expect(await database.db.select().from(sessions)).toHaveLength(0);
    expect(await database.db.select().from(workflowState)).toHaveLength(0);
  });

  it('holds one session per project (ERD: PROJECTS ||--|| SESSIONS)', async () => {
    const owner = await createUser('one-session@example.test');
    const project = await createProject(owner.id);

    await database.db.insert(sessions).values({ projectId: project.id, initialPrompt: 'first' });

    const message = await captureDatabaseError(() =>
      database.db.insert(sessions).values({ projectId: project.id, initialPrompt: 'second' }),
    );

    expect(message).toMatch(/sessions_project_id_unique|duplicate key/i);
  });

  it('stores the prompt verbatim, including newlines and leading spaces (FR-003 AC-1)', async () => {
    const owner = await createUser('verbatim@example.test');
    const project = await createProject(owner.id);
    const prompt = '  a platform for\n\nspecs — with "quotes" and \\backslashes\t';

    const [row] = await database.db
      .insert(sessions)
      .values({ projectId: project.id, initialPrompt: prompt })
      .returning();

    expect(row?.initialPrompt).toBe(prompt);
    expect(row?.summary).toBeNull();
    expect(row?.qualityEnabled).toBe(false);
    expect(row?.completionCount).toBe(0);
  });

  describe('workflow_state stage constraints (constitution A2)', () => {
    let sessionId: string;

    beforeAll(async () => {
      const owner = await createUser('stages@example.test');
      const project = await createProject(owner.id);
      const [session] = await database.db
        .insert(sessions)
        .values({ projectId: project.id, initialPrompt: 'stage rules' })
        .returning();
      if (session === undefined) throw new Error('insert returned no row');
      sessionId = session.id;
    });

    const setState = (stage: string, substage: string | null) =>
      database.exec(
        `INSERT INTO workflow_state (session_id, stage, substage)
         VALUES ('${sessionId}', '${stage}', ${substage === null ? 'NULL' : `'${substage}'`})
         ON CONFLICT (session_id) DO UPDATE SET stage = EXCLUDED.stage, substage = EXCLUDED.substage`,
      );

    it('accepts every legal stage/substage pair', async () => {
      for (const stage of ['constitution', 'requirements', 'solution', 'tasks', 'quality']) {
        for (const substage of ['collect', 'generate', 'review']) {
          expect(await captureDatabaseError(() => setState(stage, substage))).toBeUndefined();
        }
      }

      for (const stage of ['interview', 'complete']) {
        expect(await captureDatabaseError(() => setState(stage, null))).toBeUndefined();
      }
    });

    it('rejects a stage outside the seven states', async () => {
      const message = await captureDatabaseError(() => setState('enrichment', 'collect'));

      expect(message).toMatch(/workflow_state_stage_valid/);
    });

    it('rejects a substage on the interview, which has none', async () => {
      const message = await captureDatabaseError(() => setState('interview', 'collect'));

      expect(message).toMatch(/workflow_state_substage_valid/);
    });

    it('rejects a spec stage with no substage', async () => {
      const message = await captureDatabaseError(() => setState('requirements', null));

      expect(message).toMatch(/workflow_state_substage_valid/);
    });

    it('rejects an unknown substage', async () => {
      const message = await captureDatabaseError(() => setState('tasks', 'enrich'));

      expect(message).toMatch(/workflow_state_substage_valid/);
    });

    it('starts a session at version 1 for optimistic concurrency', async () => {
      await setState('interview', null);

      const [row] = await database.db.select().from(workflowState);

      expect(row?.version).toBe(1);
      expect(row?.pendingAction).toBeNull();
    });
  });
});
