import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { projects, proposedChanges, specFiles, specRevisions, users } from '@/db/schema';
import {
  captureDatabaseError,
  createMigratedDatabase,
  type TestDatabase,
} from '@/db/testing/migrated-database';
import { createRevisionRepository } from '@/modules/specs/repositories/revisions';
import { createSpecFileRepository } from '@/modules/specs/repositories/spec-files';
import { OwnerScope } from '@/db/owner-scope';

/**
 * Task 58 — the one-pending invariant and the isolation of proposals from spec content.
 *
 * Both acceptance criteria are about things that must be *impossible*, so both are asserted against
 * the mechanisms that make them impossible rather than against the code that currently respects
 * them: the partial unique index for DR-11, and every content-resolving query for DR-10.
 */
describe('proposed_changes (task 58)', () => {
  let database: TestDatabase;
  let ownerId: string;
  let projectId: string;
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
    ownerId = owner?.id ?? '';

    const [project] = await database.db
      .insert(projects)
      .values({ ownerId, name: 'Refinement' })
      .returning({ id: projects.id });
    projectId = project?.id ?? '';

    const [file] = await database.db
      .insert(specFiles)
      .values({ projectId, specType: 'constitution', fileName: 'constitution.md' })
      .returning({ id: specFiles.id });
    specFileId = file?.id ?? '';

    await database.db.insert(specRevisions).values({
      specFileId,
      revisionNumber: 1,
      content: '# Constitution\n\n## Purpose\n\nThe approved text.',
      approved: true,
    });
  });

  const propose = (values: Partial<typeof proposedChanges.$inferInsert> = {}) => {
    const row: typeof proposedChanges.$inferInsert = {
      specFileId,
      baseRevision: 1,
      proposedContent: '# Constitution\n\n## Purpose\n\nThe proposed text.',
      instruction: 'Tighten the purpose section.',
      ...values,
    };

    return database.db.insert(proposedChanges).values(row);
  };

  describe('AC-1 — a second pending proposal for the same file violates the index (DR-11)', () => {
    it('accepts the first pending proposal', async () => {
      expect(await captureDatabaseError(() => propose())).toBeUndefined();
    });

    it('rejects a second pending proposal for the same file', async () => {
      await propose();

      const message = await captureDatabaseError(() =>
        propose({ instruction: 'Something else entirely.' }),
      );

      expect(message).toMatch(/proposed_changes_one_pending_per_file|duplicate key/i);
    });

    it('rejects it however the second one arrives, including raw SQL', async () => {
      await propose();

      const message = await captureDatabaseError(() =>
        database.exec(
          `INSERT INTO proposed_changes (spec_file_id, base_revision, proposed_content, instruction)
           VALUES ('${specFileId}', 1, 'sneaking in', 'by hand')`,
        ),
      );

      expect(message).toMatch(/proposed_changes_one_pending_per_file|duplicate key/i);
    });

    it('allows a pending proposal on a different file of the same project', async () => {
      await propose();

      const [other] = await database.db
        .insert(specFiles)
        .values({ projectId, specType: 'requirements', fileName: 'requirements.md' })
        .returning({ id: specFiles.id });

      const message = await captureDatabaseError(() => propose({ specFileId: other?.id ?? '' }));

      expect(message).toBeUndefined();
    });

    it('allows a new proposal once the previous one is accepted', async () => {
      await propose();
      await database.db
        .update(proposedChanges)
        .set({ status: 'accepted', decidedAt: new Date() })
        .where(eq(proposedChanges.specFileId, specFileId));

      expect(await captureDatabaseError(() => propose())).toBeUndefined();
    });

    it('allows a new proposal once the previous one is rejected', async () => {
      await propose();
      await database.db
        .update(proposedChanges)
        .set({ status: 'rejected', decidedAt: new Date() })
        .where(eq(proposedChanges.specFileId, specFileId));

      expect(await captureDatabaseError(() => propose())).toBeUndefined();
    });

    it('lets a file accumulate any number of decided proposals', async () => {
      for (let n = 0; n < 3; n += 1) {
        await propose({ instruction: `Change number ${String(n)}` });
        await database.db
          .update(proposedChanges)
          .set({ status: 'rejected', decidedAt: new Date() })
          .where(eq(proposedChanges.status, 'pending'));
      }

      expect(await database.db.select().from(proposedChanges)).toHaveLength(3);
    });

    it('refuses to reopen a decided proposal while another is pending', async () => {
      await propose();
      await database.db
        .update(proposedChanges)
        .set({ status: 'rejected', decidedAt: new Date() })
        .where(eq(proposedChanges.status, 'pending'));
      await propose({ instruction: 'The current one.' });

      // Flipping the old row back to pending would give the file two undecided proposals.
      const message = await captureDatabaseError(() =>
        database.exec(
          `UPDATE proposed_changes SET status = 'pending', decided_at = NULL
           WHERE status = 'rejected'`,
        ),
      );

      expect(message).toMatch(/proposed_changes_one_pending_per_file|duplicate key/i);
    });

    /**
     * Control run: the index is what refuses the second insert.
     *
     * A test expecting an error passes for any error. Dropping the index and replaying the same two
     * inserts shows they are accepted without it — and that nothing else was quietly enforcing DR-11.
     */
    it('accepts a second pending proposal once the index is dropped, and refuses it again after', async () => {
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

        const insert = `INSERT INTO proposed_changes (spec_file_id, base_revision, proposed_content, instruction)
                        VALUES ('${file?.id ?? ''}', 1, 'proposed', 'instruction')`;

        await control.exec(insert);
        expect(await captureDatabaseError(() => control.exec(insert))).toMatch(
          /one_pending_per_file|duplicate key/i,
        );

        await control.exec('DROP INDEX proposed_changes_one_pending_per_file');
        expect(await captureDatabaseError(() => control.exec(insert))).toBeUndefined();
        expect(await control.db.select().from(proposedChanges)).toHaveLength(2);

        // Restoring it now fails precisely because the duplicate exists — which is the proof.
        expect(
          await captureDatabaseError(() =>
            control.exec(
              `CREATE UNIQUE INDEX proposed_changes_one_pending_per_file
                 ON proposed_changes (spec_file_id) WHERE status = 'pending'`,
            ),
          ),
        ).toMatch(/duplicate key|could not create unique index/i);
      } finally {
        await control.close();
      }
    });
  });

  describe('AC-2 — a proposal is never readable through any spec-content query path (DR-10)', () => {
    const PROPOSED = 'PROPOSAL-ONLY-MARKER: this text has not been accepted';

    beforeEach(async () => {
      await propose({ proposedContent: `# Constitution\n\n## Purpose\n\n${PROPOSED}` });
    });

    const scope = () => OwnerScope.forAuthenticatedUser(ownerId);

    it('does not appear in the revision history', async () => {
      const history = await createRevisionRepository(database.db).history(specFileId);

      expect(history).toHaveLength(1);
      expect(history.map((revision) => revision.content).join('\n')).not.toContain(PROPOSED);
    });

    it('does not appear as the latest revision, approved or otherwise', async () => {
      const revisions = createRevisionRepository(database.db);

      for (const resolved of [
        await revisions.latest(specFileId),
        await revisions.latestApproved(specFileId),
        await revisions.latestApprovedPreEnrichment(specFileId),
      ]) {
        expect(resolved?.content).not.toContain(PROPOSED);
      }
    });

    it('does not appear in what an export would contain', async () => {
      const exportable = await createSpecFileRepository(database.db).approvedForExport(
        scope(),
        projectId,
      );

      expect(exportable).toHaveLength(1);
      expect(exportable[0]?.content).not.toContain(PROPOSED);
    });

    it('does not move the file pointer — a proposal is not a revision', async () => {
      const [file] = await database.db
        .select({ currentRevision: specFiles.currentRevision })
        .from(specFiles)
        .where(eq(specFiles.id, specFileId));

      expect(file?.currentRevision).toBe(0);
      expect(await database.db.select().from(specRevisions)).toHaveLength(1);
    });

    it('leaves no trace of itself in spec_revisions at all', async () => {
      const rows = await database.db.select().from(specRevisions);

      expect(rows.map((row) => row.content).join('\n')).not.toContain(PROPOSED);
    });

    it('is still there in its own table — isolated, not discarded', async () => {
      const rows = await database.db.select().from(proposedChanges);

      expect(rows).toHaveLength(1);
      expect(rows[0]?.proposedContent).toContain(PROPOSED);
      expect(rows[0]?.status).toBe('pending');
    });
  });

  describe('column rules', () => {
    it('rejects an unknown status', async () => {
      const message = await captureDatabaseError(() =>
        database.exec(
          `INSERT INTO proposed_changes (spec_file_id, base_revision, proposed_content, instruction, status, decided_at)
           VALUES ('${specFileId}', 1, 'x', 'y', 'maybe', now())`,
        ),
      );

      expect(message).toMatch(/proposed_changes_status_valid/);
    });

    it('rejects blank proposed content and a blank instruction', async () => {
      expect(await captureDatabaseError(() => propose({ proposedContent: '  \n\t ' }))).toMatch(
        /proposed_changes_content_not_blank/,
      );
      expect(await captureDatabaseError(() => propose({ instruction: '   ' }))).toMatch(
        /proposed_changes_instruction_not_blank/,
      );
    });

    it('rejects a base revision below one', async () => {
      expect(await captureDatabaseError(() => propose({ baseRevision: 0 }))).toMatch(
        /proposed_changes_base_revision_positive/,
      );
    });

    it('pairs the decision timestamp with a decided status, in both directions', async () => {
      expect(await captureDatabaseError(() => propose({ status: 'accepted' }))).toMatch(
        /proposed_changes_decision_timestamp_paired/,
      );

      expect(await captureDatabaseError(() => propose({ decidedAt: new Date() }))).toMatch(
        /proposed_changes_decision_timestamp_paired/,
      );
    });

    it('is removed by the project cascade (DR-6)', async () => {
      await propose();

      await database.db.delete(users);

      expect(await database.db.select().from(proposedChanges)).toHaveLength(0);
    });
  });
});
