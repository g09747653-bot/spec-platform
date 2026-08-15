import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { OwnerScope } from '@/db/owner-scope';
import {
  generationRuns,
  projects,
  proposedChanges,
  sessions,
  specFiles,
  specRevisions,
  users,
  workflowState,
} from '@/db/schema';
import { createMigratedDatabase, type TestDatabase } from '@/db/testing/migrated-database';

import { validateStructure } from '../validate-structure';

import { createProposedChangeService } from './proposed-change-service';

/**
 * Task 118 — a cross-file edit is applied as one thing, or not at all.
 *
 * Three acceptance criteria live here, and each is stated as something the database can be asked:
 *
 * - **approve writes one revision per touched file, and reject writes none.** Counted, and the
 *   rejected case is compared byte for byte, because "leaves every file byte-identical" is the M4
 *   contract and a near-miss would be invisible in a count.
 * - **the apply is atomic.** Proved with an *induced* failure in the middle rather than by reading
 *   the SQL: a trigger refuses one file's content, and the assertion is that none of the others
 *   gained a revision and the batch is still pending. A loop of appends would pass every other test
 *   in this file and fail this one.
 * - **the history names the chat.** `source_session_id` is what makes a project with two
 *   conversations answer "who wrote this?" (А-6).
 */
describe('cross-file edit batches (task 118)', () => {
  let database: TestDatabase;
  let ownerId: string;
  let projectId: string;
  let editSessionId: string;
  let batchId: string;
  let constitutionId: string;
  let requirementsId: string;
  let service: ReturnType<typeof createProposedChangeService>;

  const requiredHeadings = (specType: 'constitution' | 'requirements') =>
    validateStructure(specType, '# Doc')
      .violations.filter((violation) => violation.code === 'MISSING_HEADING')
      .map((violation) => ({ heading: violation.heading, level: violation.expectedLevel }));

  const validDocument = (specType: 'constitution' | 'requirements', extra = ''): string =>
    [
      `# ${specType}`,
      ...requiredHeadings(specType).flatMap((section) => [
        '',
        `${'#'.repeat(section.level)} ${section.heading}`,
        '',
        `Content for ${section.heading}.`,
      ]),
      extra,
    ].join('\n');

  beforeAll(async () => {
    database = await createMigratedDatabase();
    service = createProposedChangeService(database.db);
  });

  afterAll(async () => {
    await database.close();
  });

  const scope = () => OwnerScope.forAuthenticatedUser(ownerId);

  beforeEach(async () => {
    await database.exec('DROP TRIGGER IF EXISTS refuse_one_file ON spec_revisions').catch(() => {
      /* the trigger only exists in the test that installs it */
    });
    await database.db.delete(users);

    const [owner] = await database.db
      .insert(users)
      .values({ email: 'owner@example.test' })
      .returning({ id: users.id });
    ownerId = owner?.id ?? '';

    const [project] = await database.db
      .insert(projects)
      .values({ ownerId, name: 'Bundle' })
      .returning({ id: projects.id });
    projectId = project?.id ?? '';

    // The generate chat that produced the bundle, and the edit chat that is about to change it.
    const [generateSession] = await database.db
      .insert(sessions)
      .values({ projectId, title: 'Bundle', initialPrompt: 'a spec platform' })
      .returning({ id: sessions.id });
    await database.db
      .insert(workflowState)
      .values({ sessionId: generateSession?.id ?? '', stage: 'complete', substage: null });

    const [editSession] = await database.db
      .insert(sessions)
      .values({
        projectId,
        title: 'Edit constitution.md and requirements.md',
        initialPrompt: 'I want to update spec constitution.md and requirements.md to ',
        methodologyId: 'myspec-edit-v1',
      })
      .returning({ id: sessions.id });
    editSessionId = editSession?.id ?? '';
    await database.db
      .insert(workflowState)
      .values({ sessionId: editSessionId, stage: 'constitution', substage: 'generate' });

    const [run] = await database.db
      .insert(generationRuns)
      .values({ sessionId: editSessionId, stage: 'constitution' })
      .returning({ id: generationRuns.id });
    batchId = run?.id ?? '';

    const [constitution] = await database.db
      .insert(specFiles)
      .values({ projectId, specType: 'constitution', fileName: 'constitution.md' })
      .returning({ id: specFiles.id });
    constitutionId = constitution?.id ?? '';

    const [requirements] = await database.db
      .insert(specFiles)
      .values({ projectId, specType: 'requirements', fileName: 'requirements.md' })
      .returning({ id: specFiles.id });
    requirementsId = requirements?.id ?? '';

    for (const [id, specType] of [
      [constitutionId, 'constitution'],
      [requirementsId, 'requirements'],
    ] as const) {
      await database.db.insert(specRevisions).values({
        specFileId: id,
        revisionNumber: 1,
        content: validDocument(specType),
        approved: true,
      });
      await database.db.update(specFiles).set({ currentRevision: 1 }).where(eq(specFiles.id, id));
    }
  });

  const proposeBoth = () =>
    service.proposeBatch(scope(), {
      editBatchId: batchId,
      instruction: 'Add a rate limit everywhere it matters.',
      files: [
        {
          specFileId: constitutionId,
          content: validDocument('constitution', '\n- A rate limit.\n'),
        },
        {
          specFileId: requirementsId,
          content: validDocument('requirements', '\n- FR-099 rate limit.\n'),
        },
      ],
    });

  const revisionsOf = (specFileId: string) =>
    database.db.select().from(specRevisions).where(eq(specRevisions.specFileId, specFileId));

  it('stores one pending proposal per touched file and writes no revision', async () => {
    const outcome = await proposeBoth();

    expect(outcome.status).toBe('proposed');
    if (outcome.status !== 'proposed') return;
    expect(outcome.files.map((file) => file.fileName).sort()).toEqual([
      'constitution.md',
      'requirements.md',
    ]);

    expect(await revisionsOf(constitutionId)).toHaveLength(1);
    expect(await revisionsOf(requirementsId)).toHaveLength(1);

    const members = await service.batchMembers(scope(), batchId);
    expect(members).toHaveLength(2);
    expect(members.every((member) => member.status === 'pending')).toBe(true);
  });

  it('refuses the whole batch when one file would lose a required section (FR-011 AC-8)', async () => {
    const outcome = await service.proposeBatch(scope(), {
      editBatchId: batchId,
      instruction: 'Trim it.',
      files: [
        { specFileId: constitutionId, content: validDocument('constitution', '\n- Fine.\n') },
        { specFileId: requirementsId, content: '# requirements\n\nNothing else.\n' },
      ],
    });

    expect(outcome.status).toBe('removes-required-section');

    // Not a single row from the batch, including the file that was admissible: a card that offered
    // one of two changes would describe an edit nobody asked for.
    expect(await service.batchMembers(scope(), batchId)).toHaveLength(0);
  });

  describe('approve (AC-1, AC-2, AC-4)', () => {
    it('appends one approved revision per file, stamped with the edit chat', async () => {
      await proposeBoth();

      const applied = await service.acceptBatch(scope(), batchId, editSessionId);

      expect(applied.map((file) => file.fileName)).toEqual(['constitution.md', 'requirements.md']);
      expect(applied.every((file) => file.revisionNumber === 2)).toBe(true);

      for (const specFileId of [constitutionId, requirementsId]) {
        const revisions = await revisionsOf(specFileId);
        expect(revisions).toHaveLength(2);

        const latest = revisions.find((revision) => revision.revisionNumber === 2);
        expect(latest?.approved).toBe(true);
        // AC-4: the history of each touched file names the chat that produced it.
        expect(latest?.sourceSessionId).toBe(editSessionId);

        const [file] = await database.db
          .select()
          .from(specFiles)
          .where(eq(specFiles.id, specFileId));
        expect(file?.currentRevision).toBe(2);
      }
    });

    it('is a no-op the second time, so a double submission cannot revise twice', async () => {
      await proposeBoth();
      await service.acceptBatch(scope(), batchId, editSessionId);

      expect(await service.acceptBatch(scope(), batchId, editSessionId)).toEqual([]);
      expect(await revisionsOf(constitutionId)).toHaveLength(2);
    });

    /**
     * AC-2, the whole of it: a failure part-way through leaves **nothing** behind.
     *
     * The failure is induced rather than waited for. A `BEFORE INSERT` trigger refuses the
     * requirements document specifically, so the statement fails after the constitution row has
     * been inserted *within the same statement* — which is exactly the state a loop of appends
     * would commit and a single statement rolls back.
     */
    it('applies nothing when one file fails midway (induced failure)', async () => {
      await proposeBoth();

      await database.exec(`
        CREATE OR REPLACE FUNCTION refuse_one_file() RETURNS trigger AS $$
        BEGIN
          IF NEW.content LIKE '%FR-099 rate limit%' THEN
            RAISE EXCEPTION 'induced failure on the second file';
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `);
      await database.exec(`
        CREATE TRIGGER refuse_one_file BEFORE INSERT ON spec_revisions
          FOR EACH ROW EXECUTE FUNCTION refuse_one_file();
      `);

      await expect(service.acceptBatch(scope(), batchId, editSessionId)).rejects.toThrow();

      // Neither file moved — not the one that failed, and not the one that would have succeeded.
      expect(await revisionsOf(constitutionId)).toHaveLength(1);
      expect(await revisionsOf(requirementsId)).toHaveLength(1);

      const pointers = await database.db.select().from(specFiles);
      expect(pointers.every((file) => file.currentRevision === 1)).toBe(true);

      // And the decision did not stick either: the batch is still there to decide.
      const members = await service.batchMembers(scope(), batchId);
      expect(members.every((member) => member.status === 'pending')).toBe(true);
    });
  });

  describe('reject (AC-1 — the M4 contract, re-asserted)', () => {
    it('leaves every referenced file byte-identical and writes no revision', async () => {
      const before = await database.db.select().from(specRevisions);

      await proposeBoth();
      const rejected = await service.rejectBatch(scope(), batchId);

      expect(rejected).toBe(2);

      const after = await database.db.select().from(specRevisions);
      expect(after).toHaveLength(before.length);
      expect(after.map((revision) => revision.content).sort()).toEqual(
        before.map((revision) => revision.content).sort(),
      );

      const members = await service.batchMembers(scope(), batchId);
      expect(members.every((member) => member.status === 'rejected')).toBe(true);
    });

    it('claims nothing the second time', async () => {
      await proposeBoth();
      await service.rejectBatch(scope(), batchId);

      expect(await service.rejectBatch(scope(), batchId)).toBe(0);
    });
  });

  it('resolves the chat that produced a batch, and refuses another owner', async () => {
    await proposeBoth();

    expect(await service.sessionForBatch(scope(), batchId)).toBe(editSessionId);

    const [intruder] = await database.db
      .insert(users)
      .values({ email: 'intruder@example.test' })
      .returning({ id: users.id });

    const foreign = OwnerScope.forAuthenticatedUser(intruder?.id ?? '');
    expect(await service.sessionForBatch(foreign, batchId)).toBeNull();
    expect(await service.batchMembers(foreign, batchId)).toEqual([]);
    expect(await service.acceptBatch(foreign, batchId, editSessionId)).toEqual([]);

    // The refusal is not a message: another owner's decision changed nothing.
    const rows = await database.db.select().from(proposedChanges);
    expect(rows.every((row) => row.status === 'pending')).toBe(true);
  });
});
