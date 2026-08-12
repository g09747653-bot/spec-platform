import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { projects, specFiles, specRevisions, users } from '@/db/schema';
import {
  captureDatabaseError,
  createMigratedDatabase,
  type TestDatabase,
} from '@/db/testing/migrated-database';

import { createRevisionRepository, type RevisionRepository } from './revisions';

/**
 * Task 17 — allocation and resolution, against a real PostgreSQL instance.
 *
 * The acceptance criteria are concurrency claims ("consecutive numbers with no gaps or duplicates"),
 * so the tests run inserts concurrently rather than asserting the intent of the code.
 */
describe('RevisionRepository (task 17)', () => {
  let database: TestDatabase;
  let revisions: RevisionRepository;
  let projectId: string;
  let specFileId: string;

  beforeAll(async () => {
    database = await createMigratedDatabase();
    revisions = createRevisionRepository(database.db);
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
      .values({ ownerId: owner?.id ?? '', name: 'Revisions' })
      .returning({ id: projects.id });
    projectId = project?.id ?? '';

    const file = await revisions.ensureSpecFile(projectId, 'constitution');
    specFileId = file.id;
  });

  describe('allocation', () => {
    it('numbers revisions from one, upwards, with no gaps', async () => {
      const first = await revisions.append({ specFileId, content: 'first' });
      const second = await revisions.append({ specFileId, content: 'second' });
      const third = await revisions.append({ specFileId, content: 'third' });

      expect([first.revisionNumber, second.revisionNumber, third.revisionNumber]).toEqual([
        1, 2, 3,
      ]);
    });

    it('produces consecutive numbers with no gaps or duplicates under concurrency (AC-1)', async () => {
      const CONCURRENT = 8;

      const created = await Promise.all(
        Array.from({ length: CONCURRENT }, (_unused, index) =>
          revisions.append({ specFileId, content: `concurrent ${String(index)}` }),
        ),
      );

      const numbers = created.map((revision) => revision.revisionNumber).sort((a, b) => a - b);

      expect(numbers).toEqual(Array.from({ length: CONCURRENT }, (_unused, index) => index + 1));
      expect(new Set(numbers).size).toBe(CONCURRENT);
    });

    it('numbers each file independently', async () => {
      const other = await revisions.ensureSpecFile(projectId, 'requirements');

      await revisions.append({ specFileId, content: 'c1' });
      const first = await revisions.append({ specFileId: other.id, content: 'r1' });

      expect(first.revisionNumber).toBe(1);
    });

    it('persists a new revision as unapproved (FR-009 AC-4; task 20 AC-1)', async () => {
      const revision = await revisions.append({ specFileId, content: 'generated' });

      expect(revision.approved).toBe(false);
      expect(revision.origin).toBe('parity');
      expect(revision.derivedFrom).toBeNull();
    });

    it('moves the spec file pointer to the revision it just wrote', async () => {
      await revisions.append({ specFileId, content: 'first' });
      const second = await revisions.append({ specFileId, content: 'second' });

      const [file] = await database.db
        .select({ currentRevision: specFiles.currentRevision })
        .from(specFiles)
        .where(eq(specFiles.id, specFileId));

      expect(file?.currentRevision).toBe(second.revisionNumber);
    });

    it('records the attachment context it was given (DR-12)', async () => {
      const attachmentId = '11111111-2222-3333-4444-555555555555';

      const revision = await revisions.append({
        specFileId,
        content: 'with context',
        contextAttachmentIds: [attachmentId],
      });

      const [row] = await database.db
        .select({ ids: specRevisions.contextAttachmentIds })
        .from(specRevisions)
        .where(eq(specRevisions.id, revision.id));

      expect(row?.ids).toEqual([attachmentId]);
    });

    it('writes an enrichment revision that names its parity source (A4)', async () => {
      const parity = await revisions.append({ specFileId, content: 'parity content' });

      const enriched = await revisions.append({
        specFileId,
        content: 'enriched content',
        origin: 'enrichment',
        derivedFrom: parity.id,
      });

      expect(enriched.origin).toBe('enrichment');
      expect(enriched.derivedFrom).toBe(parity.id);
      expect(enriched.revisionNumber).toBe(2);
    });

    it('refuses an enrichment revision with no source, because the database does (A4)', async () => {
      const message = await captureDatabaseError(() =>
        revisions.append({ specFileId, content: 'enriched', origin: 'enrichment' }),
      );

      expect(message).toMatch(/spec_revisions_origin_derivation_paired/);
    });
  });

  describe('resolution', () => {
    it('latest returns the newest revision regardless of approval', async () => {
      const first = await revisions.append({ specFileId, content: 'first' });
      await revisions.approve(first.id);
      const second = await revisions.append({ specFileId, content: 'second' });

      expect((await revisions.latest(specFileId))?.id).toBe(second.id);
    });

    it('latestApproved ignores unapproved revisions (AC-2)', async () => {
      const first = await revisions.append({ specFileId, content: 'first' });
      await revisions.approve(first.id);
      await revisions.append({ specFileId, content: 'second, still under review' });

      const approved = await revisions.latestApproved(specFileId);

      expect(approved?.id).toBe(first.id);
      expect(approved?.content).toBe('first');
    });

    it('latestApproved returns nothing when no revision has been approved', async () => {
      await revisions.append({ specFileId, content: 'awaiting a decision' });

      expect(await revisions.latestApproved(specFileId)).toBeNull();
    });

    it('returns nothing for a file with no revisions at all', async () => {
      expect(await revisions.latest(specFileId)).toBeNull();
      expect(await revisions.latestApproved(specFileId)).toBeNull();
      expect(await revisions.latestApprovedPreEnrichment(specFileId)).toBeNull();
    });

    it('resolves the last pre-enrichment revision even after enrichment has run (FR-012 AC-4)', async () => {
      const parity = await revisions.append({ specFileId, content: 'parity content' });
      await revisions.approve(parity.id);
      const enriched = await revisions.append({
        specFileId,
        content: 'enriched content',
        origin: 'enrichment',
        derivedFrom: parity.id,
      });
      await revisions.approve(enriched.id);

      expect((await revisions.latestApproved(specFileId))?.id).toBe(enriched.id);
      expect((await revisions.latestApprovedPreEnrichment(specFileId))?.id).toBe(parity.id);
    });

    it('keeps every revision in history, oldest first', async () => {
      await revisions.append({ specFileId, content: 'first' });
      await revisions.append({ specFileId, content: 'second' });

      const history = await revisions.history(specFileId);

      expect(history.map((revision) => revision.content)).toEqual(['first', 'second']);
    });
  });

  describe('approval', () => {
    it('marks exactly the named revision approved (FR-009 AC-3)', async () => {
      const first = await revisions.append({ specFileId, content: 'first' });
      const second = await revisions.append({ specFileId, content: 'second' });

      expect(await revisions.approve(second.id)).toBe(true);

      const history = await revisions.history(specFileId);
      expect(history.find((revision) => revision.id === first.id)?.approved).toBe(false);
      expect(history.find((revision) => revision.id === second.id)?.approved).toBe(true);
    });

    it('reports nothing to do when the revision is already approved', async () => {
      const revision = await revisions.append({ specFileId, content: 'first' });

      expect(await revisions.approve(revision.id)).toBe(true);
      expect(await revisions.approve(revision.id)).toBe(false);
    });

    it('reports nothing to do for a revision that does not exist', async () => {
      expect(await revisions.approve('11111111-2222-3333-4444-555555555555')).toBe(false);
    });
  });

  describe('ensureSpecFile', () => {
    it('creates the file once and returns the same one afterwards', async () => {
      const again = await revisions.ensureSpecFile(projectId, 'constitution');

      expect(again.id).toBe(specFileId);
      expect(await database.db.select().from(specFiles)).toHaveLength(1);
    });

    it('survives concurrent callers racing to create the same file', async () => {
      const results = await Promise.all(
        Array.from({ length: 5 }, () => revisions.ensureSpecFile(projectId, 'solution')),
      );

      expect(new Set(results.map((file) => file.id)).size).toBe(1);
    });

    it('names the file after its spec type (DR-4)', async () => {
      const file = await revisions.ensureSpecFile(projectId, 'tasks');

      const [row] = await database.db
        .select({ fileName: specFiles.fileName })
        .from(specFiles)
        .where(eq(specFiles.id, file.id));

      expect(row?.fileName).toBe('tasks.md');
    });
  });
});
