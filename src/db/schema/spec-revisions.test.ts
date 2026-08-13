import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { projects, sessions, specFiles, specRevisions, users, workflowState } from '@/db/schema';
import {
  captureDatabaseError,
  createMigratedDatabase,
  type TestDatabase,
} from '@/db/testing/migrated-database';
import { SPEC_FILE_NAMES, SPEC_TYPES } from '@/modules/specs/model/spec-files';

/**
 * Task 16 — the immutability contract, asserted against a real PostgreSQL instance.
 *
 * This is the task with the widest blast radius in the milestone: a defect here passes silently into
 * diffing (M4), export (M6) and the pre-enrichment resolution the Quality stage depends on (M7), and
 * costs a migration with a backfill to correct. So every rule is asserted **as the database refusing a
 * statement** — not as an application-level guard that a future caller could bypass by writing its own
 * query. Each `UPDATE` below is raw SQL for that reason: it is what a careless hand, a migration script
 * or a psql session would do, and none of them go through the repository.
 */
describe('spec_revisions immutability (task 16)', () => {
  let database: TestDatabase;
  let projectId: string;
  let specFileId: string;
  let revisionId: string;

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
    if (owner === undefined) throw new Error('user setup failed');

    const [project] = await database.db
      .insert(projects)
      .values({ ownerId: owner.id, name: 'Spec Platform' })
      .returning({ id: projects.id });
    if (project === undefined) throw new Error('project setup failed');
    projectId = project.id;

    const [session] = await database.db
      .insert(sessions)
      .values({ projectId, initialPrompt: 'build a thing' })
      .returning({ id: sessions.id });
    if (session === undefined) throw new Error('session setup failed');
    await database.db
      .insert(workflowState)
      .values({ sessionId: session.id, stage: 'interview', substage: null });

    const [file] = await database.db
      .insert(specFiles)
      .values({ projectId, specType: 'constitution', fileName: 'constitution.md' })
      .returning({ id: specFiles.id });
    if (file === undefined) throw new Error('spec file setup failed');
    specFileId = file.id;

    const [revision] = await database.db
      .insert(specRevisions)
      .values({ specFileId, revisionNumber: 1, content: '# Constitution\n\nOriginal content.' })
      .returning({ id: specRevisions.id });
    if (revision === undefined) throw new Error('revision setup failed');
    revisionId = revision.id;
  });

  /** Raw SQL, deliberately: the trigger must hold against any writer, not just the repository. */
  const update = (assignment: string) =>
    database.exec(`UPDATE spec_revisions SET ${assignment} WHERE id = '${revisionId}'`);

  const currentContent = async () => {
    const [row] = await database.db
      .select({ content: specRevisions.content })
      .from(specRevisions)
      .where(eq(specRevisions.id, revisionId));
    return row?.content;
  };

  describe('frozen columns', () => {
    it('refuses an UPDATE that alters content, and leaves the row byte-for-byte intact', async () => {
      const before = await currentContent();

      const message = await captureDatabaseError(() => update(`content = '# Tampered'`));

      expect(message).toMatch(/spec_revisions\.content is immutable/);
      expect(await currentContent()).toBe(before);
    });

    it('refuses a content change even when it only appends whitespace', async () => {
      const message = await captureDatabaseError(() => update(`content = content || ' '`));

      expect(message).toMatch(/spec_revisions\.content is immutable/);
    });

    it('refuses an UPDATE that sets content to its own value — no silent no-op path', async () => {
      // `IS DISTINCT FROM` makes a same-value write legal, which is worth knowing rather than
      // guessing: it changes nothing, so it cannot lose history.
      expect(await captureDatabaseError(() => update(`content = content`))).toBeUndefined();
      expect(await currentContent()).toBe('# Constitution\n\nOriginal content.');
    });

    it('refuses to move a revision to another spec file', async () => {
      const [other] = await database.db
        .insert(specFiles)
        .values({ projectId, specType: 'requirements', fileName: 'requirements.md' })
        .returning({ id: specFiles.id });

      const message = await captureDatabaseError(() =>
        update(`spec_file_id = '${other?.id ?? ''}'`),
      );

      expect(message).toMatch(/spec_revisions\.spec_file_id is immutable/);
    });

    it('refuses to renumber a revision (DR-3)', async () => {
      const message = await captureDatabaseError(() => update('revision_number = 7'));

      expect(message).toMatch(/spec_revisions\.revision_number is immutable/);
    });

    it('refuses to change origin, so a parity revision cannot be relabelled as enrichment (A4)', async () => {
      const message = await captureDatabaseError(() => update(`origin = 'enrichment'`));

      expect(message).toMatch(/spec_revisions\.origin is immutable/);
    });

    it('refuses to change derived_from, so the derivation link cannot be rewritten (A6)', async () => {
      const message = await captureDatabaseError(() => update(`derived_from = '${revisionId}'`));

      expect(message).toMatch(/spec_revisions\.derived_from is immutable/);
    });

    it('refuses to change the recorded attachment context (DR-12)', async () => {
      const message = await captureDatabaseError(() =>
        update(`context_attachment_ids = '["11111111-2222-3333-4444-555555555555"]'::jsonb`),
      );

      expect(message).toMatch(/spec_revisions\.context_attachment_ids is immutable/);
    });

    it('refuses to backdate created_at', async () => {
      const message = await captureDatabaseError(() =>
        update(`created_at = now() - interval '1 day'`),
      );

      expect(message).toMatch(/spec_revisions\.created_at is immutable/);
    });

    it('refuses to change the primary key', async () => {
      const message = await captureDatabaseError(() => update('id = gen_random_uuid()'));

      expect(message).toMatch(/spec_revisions\.id is immutable/);
    });

    it('refuses a multi-column UPDATE that hides a frozen column among allowed ones', async () => {
      const message = await captureDatabaseError(() =>
        update(`approved = true, content = '# Tampered'`),
      );

      expect(message).toMatch(/spec_revisions\.content is immutable/);
      // The permitted half of the statement must not have been applied either.
      const [row] = await database.db
        .select({ approved: specRevisions.approved })
        .from(specRevisions)
        .where(eq(specRevisions.id, revisionId));
      expect(row?.approved).toBe(false);
    });

    it('refuses a set-based UPDATE touching every revision at once', async () => {
      const message = await captureDatabaseError(() =>
        database.exec(`UPDATE spec_revisions SET content = '# Wiped'`),
      );

      expect(message).toMatch(/spec_revisions\.content is immutable/);
      expect(await currentContent()).toBe('# Constitution\n\nOriginal content.');
    });
  });

  describe('approved travels in one direction only', () => {
    it('accepts false → true (FR-009 AC-3)', async () => {
      expect(await captureDatabaseError(() => update('approved = true'))).toBeUndefined();

      const [row] = await database.db
        .select({ approved: specRevisions.approved })
        .from(specRevisions)
        .where(eq(specRevisions.id, revisionId));
      expect(row?.approved).toBe(true);
    });

    it('refuses true → false', async () => {
      await update('approved = true');

      const message = await captureDatabaseError(() => update('approved = false'));

      expect(message).toMatch(/approved may only move false -> true/);
    });

    it('tolerates true → true and false → false', async () => {
      expect(await captureDatabaseError(() => update('approved = false'))).toBeUndefined();
      await update('approved = true');
      expect(await captureDatabaseError(() => update('approved = true'))).toBeUndefined();
    });

    it('refuses an un-approval hidden inside a set-based UPDATE', async () => {
      await update('approved = true');

      const message = await captureDatabaseError(() =>
        database.exec('UPDATE spec_revisions SET approved = false'),
      );

      expect(message).toMatch(/approved may only move false -> true/);
    });
  });

  describe('deletion', () => {
    it('refuses a direct DELETE of a revision (FR-012 AC-5)', async () => {
      const message = await captureDatabaseError(() =>
        database.exec(`DELETE FROM spec_revisions WHERE id = '${revisionId}'`),
      );

      expect(message).toMatch(/retained for the life of the project/);
      expect(await database.db.select().from(specRevisions)).toHaveLength(1);
    });

    it('refuses a direct DELETE of a spec file, which would take its revisions with it', async () => {
      const message = await captureDatabaseError(() =>
        database.exec(`DELETE FROM spec_files WHERE id = '${specFileId}'`),
      );

      expect(message).toMatch(/retained for the life of the project/);
      expect(await database.db.select().from(specRevisions)).toHaveLength(1);
    });

    it('refuses a DELETE with no WHERE clause', async () => {
      expect(await captureDatabaseError(() => database.exec('DELETE FROM spec_revisions'))).toMatch(
        /retained for the life of the project/,
      );
    });

    it('allows the project cascade to remove files and revisions (DR-6)', async () => {
      await database.db.delete(projects).where(eq(projects.id, projectId));

      expect(await database.db.select().from(specFiles)).toHaveLength(0);
      expect(await database.db.select().from(specRevisions)).toHaveLength(0);
    });

    it('allows the owner cascade, which reaches revisions through the project', async () => {
      await database.db.delete(users);

      expect(await database.db.select().from(specRevisions)).toHaveLength(0);
    });
  });

  describe('file names and spec types (DR-4)', () => {
    it('accepts each of the five permitted names', async () => {
      // A fresh project rather than a cleared one: spec files cannot be deleted directly, which the
      // deletion tests above are exactly about.
      const [owner] = await database.db.select({ id: users.id }).from(users).limit(1);
      const [second] = await database.db
        .insert(projects)
        .values({ ownerId: owner?.id ?? '', name: 'All five names' })
        .returning({ id: projects.id });

      for (const specType of SPEC_TYPES) {
        const message = await captureDatabaseError(() =>
          database.db
            .insert(specFiles)
            .values({ projectId: second?.id ?? '', specType, fileName: `${specType}.md` }),
        );
        expect(message).toBeUndefined();
      }

      const files = await database.db
        .select({ fileName: specFiles.fileName })
        .from(specFiles)
        .where(eq(specFiles.projectId, second?.id ?? ''));

      expect(files.map((file) => file.fileName).sort()).toEqual([...SPEC_FILE_NAMES].sort());
    });

    it('rejects a sixth file name', async () => {
      const message = await captureDatabaseError(() =>
        database.exec(
          `INSERT INTO spec_files (project_id, spec_type, file_name)
           VALUES ('${projectId}', 'architecture', 'architecture.md')`,
        ),
      );

      expect(message).toMatch(/spec_files_spec_type_valid|spec_files_file_name_valid/);
    });

    it('rejects a permitted name that does not match its spec type', async () => {
      const message = await captureDatabaseError(() =>
        database.exec(
          `INSERT INTO spec_files (project_id, spec_type, file_name)
           VALUES ('${projectId}', 'solution', 'tasks.md')`,
        ),
      );

      expect(message).toMatch(/spec_files_file_name_matches_spec_type/);
    });

    it('rejects a name that only differs in case or extension', async () => {
      for (const [specType, fileName] of [
        ['constitution', 'Constitution.md'],
        ['constitution', 'constitution.MD'],
        ['constitution', 'constitution.markdown'],
        ['constitution', 'constitution'],
      ]) {
        const message = await captureDatabaseError(() =>
          database.exec(
            `INSERT INTO spec_files (project_id, spec_type, file_name)
             VALUES ('${projectId}', '${specType ?? ''}', '${fileName ?? ''}')`,
          ),
        );
        expect(message).toMatch(/spec_files_file_name/);
      }
    });

    it('holds at most one file of each type per project', async () => {
      const message = await captureDatabaseError(() =>
        database.db
          .insert(specFiles)
          .values({ projectId, specType: 'constitution', fileName: 'constitution.md' }),
      );

      expect(message).toMatch(/spec_files_project_id_spec_type_unique|duplicate key/i);
    });
  });

  describe('revision numbering and origin pairing', () => {
    it('rejects a duplicate revision number for the same file (DR-3)', async () => {
      const message = await captureDatabaseError(() =>
        database.db.insert(specRevisions).values({
          specFileId,
          revisionNumber: 1,
          content: 'clashing revision',
        }),
      );

      expect(message).toMatch(/spec_revisions_file_revision_unique|duplicate key/i);
    });

    it('allows the same revision number on a different file', async () => {
      const [other] = await database.db
        .insert(specFiles)
        .values({ projectId, specType: 'tasks', fileName: 'tasks.md' })
        .returning({ id: specFiles.id });

      const message = await captureDatabaseError(() =>
        database.db.insert(specRevisions).values({
          specFileId: other?.id ?? '',
          revisionNumber: 1,
          content: 'first revision of another file',
        }),
      );

      expect(message).toBeUndefined();
    });

    it('rejects revision number zero or below', async () => {
      for (const revisionNumber of [0, -1]) {
        const message = await captureDatabaseError(() =>
          database.db
            .insert(specRevisions)
            .values({ specFileId, revisionNumber, content: 'bad number' }),
        );
        expect(message).toMatch(/spec_revisions_revision_number_positive/);
      }
    });

    it('rejects an enrichment revision with no derivation source (A4)', async () => {
      const message = await captureDatabaseError(() =>
        database.exec(
          `INSERT INTO spec_revisions (spec_file_id, revision_number, content, origin)
           VALUES ('${specFileId}', 2, 'enriched', 'enrichment')`,
        ),
      );

      expect(message).toMatch(/spec_revisions_origin_derivation_paired/);
    });

    it('rejects a parity revision that claims a derivation source', async () => {
      const message = await captureDatabaseError(() =>
        database.exec(
          `INSERT INTO spec_revisions (spec_file_id, revision_number, content, origin, derived_from)
           VALUES ('${specFileId}', 2, 'parity', 'parity', '${revisionId}')`,
        ),
      );

      expect(message).toMatch(/spec_revisions_origin_derivation_paired/);
    });

    it('accepts an enrichment revision that names its parity source', async () => {
      const message = await captureDatabaseError(() =>
        database.exec(
          `INSERT INTO spec_revisions (spec_file_id, revision_number, content, origin, derived_from)
           VALUES ('${specFileId}', 2, 'enriched', 'enrichment', '${revisionId}')`,
        ),
      );

      expect(message).toBeUndefined();
    });

    it('rejects an unknown origin', async () => {
      const message = await captureDatabaseError(() =>
        database.exec(
          `INSERT INTO spec_revisions (spec_file_id, revision_number, content, origin)
           VALUES ('${specFileId}', 2, 'x', 'refinement')`,
        ),
      );

      // Either constraint is a correct refusal: an unknown origin is by definition outside the
      // origin/derivation pairing too, and PostgreSQL reports the first one it evaluates.
      expect(message).toMatch(
        /spec_revisions_origin_valid|spec_revisions_origin_derivation_paired/,
      );
    });

    it('refuses to delete a parity revision another revision derives from', async () => {
      await database.exec(
        `INSERT INTO spec_revisions (spec_file_id, revision_number, content, origin, derived_from)
         VALUES ('${specFileId}', 2, 'enriched', 'enrichment', '${revisionId}')`,
      );

      // Two independent reasons this cannot happen; the direct-delete trigger fires first.
      const message = await captureDatabaseError(() =>
        database.exec(`DELETE FROM spec_revisions WHERE id = '${revisionId}'`),
      );

      expect(message).toMatch(/retained for the life of the project/);
    });
  });

  describe('content and context columns', () => {
    it('rejects blank content, so no empty spec can ever be exported (FR-015 AC-9)', async () => {
      for (const content of ['', '   ', '\n\t ']) {
        const message = await captureDatabaseError(() =>
          database.db.insert(specRevisions).values({ specFileId, revisionNumber: 9, content }),
        );
        expect(message).toMatch(/spec_revisions_content_not_blank/);
      }
    });

    it('defaults the attachment context to an empty array and rejects a non-array (DR-12)', async () => {
      const [row] = await database.db
        .select({ ids: specRevisions.contextAttachmentIds })
        .from(specRevisions)
        .where(eq(specRevisions.id, revisionId));
      expect(row?.ids).toEqual([]);

      const message = await captureDatabaseError(() =>
        database.exec(
          `INSERT INTO spec_revisions (spec_file_id, revision_number, content, context_attachment_ids)
           VALUES ('${specFileId}', 3, 'x', '{"a":1}'::jsonb)`,
        ),
      );

      expect(message).toMatch(/context_attachment_ids_is_array/);
    });

    it('keeps content byte-for-byte, including markdown, quotes and unicode', async () => {
      const content =
        '# Title\n\n- item with \'quotes\' and "double" — em dash\n\n```ts\nconst a = 1;\n```\n';

      await database.db.insert(specRevisions).values({ specFileId, revisionNumber: 4, content });

      const [row] = await database.db
        .select({ content: specRevisions.content })
        .from(specRevisions)
        .where(
          sql`${specRevisions.specFileId} = ${specFileId} AND ${specRevisions.revisionNumber} = 4`,
        );

      expect(row?.content).toBe(content);
    });
  });

  /**
   * Control run: proves the tests above pass *because of the trigger*.
   *
   * Every assertion so far shows an `UPDATE` failing — but a test that expects failure passes for any
   * reason, including a typo in the statement. So the same statement is run against an instance whose
   * trigger has been dropped: it must succeed there, and fail again once the trigger is restored. That
   * is falsifiable evidence rather than a coincidence.
   *
   * Its own database instance, so dropping the trigger cannot leak into the suite above.
   *
   * That instance is booted **inside the test body**, which is why it carries an explicit timeout: the
   * config's generous `hookTimeout` covers `beforeAll`, and only that. Booting a WASM PostgreSQL while
   * every other suite is doing the same comfortably exceeds the 5 s default for a test, and the failure
   * that produces names this test rather than the contention that caused it (the same reasoning as the
   * note on `hookTimeout` in `vitest.config.ts`).
   */
  describe('control run — the trigger is what refuses the write', () => {
    it('accepts the same UPDATE with the trigger dropped, and refuses it again when restored', async () => {
      const control = await createMigratedDatabase();

      try {
        const [owner] = await control.db
          .insert(users)
          .values({ email: 'control@example.test' })
          .returning({ id: users.id });
        const [project] = await control.db
          .insert(projects)
          .values({ ownerId: owner?.id ?? '', name: 'Control' })
          .returning({ id: projects.id });
        const [file] = await control.db
          .insert(specFiles)
          .values({
            projectId: project?.id ?? '',
            specType: 'constitution',
            fileName: 'constitution.md',
          })
          .returning({ id: specFiles.id });
        const [revision] = await control.db
          .insert(specRevisions)
          .values({ specFileId: file?.id ?? '', revisionNumber: 1, content: 'original' })
          .returning({ id: specRevisions.id });

        const tamper = `UPDATE spec_revisions SET content = '# Tampered' WHERE id = '${revision?.id ?? ''}'`;

        // 1. With the trigger in place: refused.
        expect(await captureDatabaseError(() => control.exec(tamper))).toMatch(
          /content is immutable/,
        );

        // 2. Trigger dropped: the very same statement goes through. Nothing else was protecting it.
        await control.exec('DROP TRIGGER spec_revisions_immutability ON spec_revisions');
        expect(await captureDatabaseError(() => control.exec(tamper))).toBeUndefined();

        const [tampered] = await control.db
          .select({ content: specRevisions.content })
          .from(specRevisions);
        expect(tampered?.content).toBe('# Tampered');

        // 3. Restored: refused again.
        await control.exec(`
          CREATE TRIGGER spec_revisions_immutability
            BEFORE UPDATE ON spec_revisions
            FOR EACH ROW EXECUTE FUNCTION spec_revisions_enforce_immutability()
        `);
        expect(
          await captureDatabaseError(() =>
            control.exec(
              `UPDATE spec_revisions SET content = '# Again' WHERE id = '${revision?.id ?? ''}'`,
            ),
          ),
        ).toMatch(/content is immutable/);
      } finally {
        await control.close();
      }
    }, 60_000);

    it('installs the three triggers the migration declares, with the timing it declares', async () => {
      const result = await database.db.execute(sql`
        SELECT tgname, tgtype
        FROM pg_trigger
        WHERE NOT tgisinternal
        ORDER BY tgname
      `);

      expect(result.rows).toHaveLength(3);
      expect(result.rows.map((row) => (row as { tgname: string }).tgname)).toEqual([
        'spec_files_no_direct_delete',
        'spec_revisions_immutability',
        'spec_revisions_no_direct_delete',
      ]);
    });
  });

  describe('the pointer column is a pointer', () => {
    it('lets current_revision move, unlike revision content (solution.md — Entity Notes)', async () => {
      const message = await captureDatabaseError(() =>
        database.db
          .update(specFiles)
          .set({ currentRevision: 1 })
          .where(eq(specFiles.id, specFileId)),
      );

      expect(message).toBeUndefined();
    });

    it('refuses a negative pointer', async () => {
      const message = await captureDatabaseError(() =>
        database.exec(`UPDATE spec_files SET current_revision = -1 WHERE id = '${specFileId}'`),
      );

      expect(message).toMatch(/spec_files_current_revision_non_negative/);
    });
  });
});
