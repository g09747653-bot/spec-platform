import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { OwnerScope } from '@/db/owner-scope';
import {
  answers,
  attachments,
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
import { createMemoryStorage, type MemoryStorage } from '@/modules/adapters/storage';
import { duplicateProject, duplicateName } from '@/modules/projects/duplicate';
import { createRevisionRepository } from '@/modules/specs/repositories/revisions';
import { evaluateTransition } from '@/modules/workflow/evaluate-transition';
import { assembleWorkflowSnapshot } from '@/modules/workflow/snapshot-assembler';

/**
 * Task 77 — duplication (FR-002 AC-6/AC-7).
 *
 * Two claims, and both are about *rows* rather than about intent, so both are asserted by reading the
 * database back: the copy resumes into a state whose gates still pass, and the two projects share
 * nothing that lets a change to one reach the other.
 *
 * **Why this test lives here and not beside `duplicate.ts`.** Duplication is the one operation that
 * touches every table in the system, and its acceptance criteria are stated in the vocabulary of
 * three modules: `projects` owns the copy, `specs` owns the revisions it must reproduce, and
 * `workflow` owns the gates the copy has to satisfy. `projects` may import none of those (A1), and
 * the boundary rule said so when the first draft of this file tried — correctly. A claim that spans
 * modules is a composition-level claim, so it is asserted where composition happens, next to the
 * parity check.
 */
describe('duplicateProject (task 77)', () => {
  let database: TestDatabase;
  let storage: MemoryStorage;
  let scope: OwnerScope;
  let sourceProjectId: string;
  let sourceSessionId: string;

  beforeAll(async () => {
    database = await createMigratedDatabase();
  });

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    storage = createMemoryStorage();
    await database.db.delete(users);

    const [owner] = await database.db
      .insert(users)
      .values({ email: 'owner@example.test' })
      .returning({ id: users.id });

    scope = OwnerScope.forAuthenticatedUser(owner?.id ?? '');

    const [project] = await database.db
      .insert(projects)
      .values({ ownerId: owner?.id ?? '', name: 'Recipes without life stories' })
      .returning({ id: projects.id });

    sourceProjectId = project?.id ?? '';

    const [session] = await database.db
      .insert(sessions)
      .values({
        projectId: sourceProjectId,
        initialPrompt: 'A recipe app for cooks who hate scrolling',
        summary: 'Solo cooks, mobile first.',
      })
      .returning({ id: sessions.id });

    sourceSessionId = session?.id ?? '';

    await database.db
      .insert(workflowState)
      .values({ sessionId: sourceSessionId, stage: 'requirements', substage: 'collect' });
  });

  /** A mid-session source: one answered round, one satisfied need, one approved file with a review. */
  async function buildMidSession(): Promise<void> {
    const [round] = await database.db
      .insert(questionRounds)
      .values({
        sessionId: sourceSessionId,
        stage: 'interview',
        roundNumber: 1,
        questions: { questions: [] },
      })
      .returning({ id: questionRounds.id });

    await database.db.insert(answers).values({
      roundId: round?.id ?? '',
      questionId: 'q-audience',
      selectedOptionIds: ['solo-devs'],
    });

    await database.db.insert(informationNeeds).values([
      {
        sessionId: sourceSessionId,
        stage: 'interview',
        name: 'audience',
        satisfiedByRound: round?.id ?? '',
      },
      { sessionId: sourceSessionId, stage: 'requirements', name: 'scope' },
    ]);

    const revisions = createRevisionRepository(database.db);
    const file = await revisions.ensureSpecFile(sourceProjectId, 'constitution');
    const first = await revisions.append({ specFileId: file.id, content: '# Constitution\nfirst' });
    await revisions.approve(first.id);
    const second = await revisions.append({
      specFileId: file.id,
      content: '# Constitution\nsecond',
    });
    await revisions.approve(second.id);

    await database.db.insert(reviewFeedback).values({
      specRevisionId: second.id,
      outcome: 'pass',
      items: [],
      decision: 'accept',
      decidedAt: new Date(),
    });
  }

  const duplicate = () => duplicateProject(database.db, scope, sourceProjectId, storage);

  it('creates a project for the same owner, named as a copy', async () => {
    const result = await duplicate();

    expect(result).not.toBeNull();
    expect(result?.name).toBe(duplicateName('Recipes without life stories'));

    const [row] = await database.db
      .select()
      .from(projects)
      .where(eq(projects.id, result?.projectId ?? ''));

    expect(row?.ownerId).toBe(scope.userId);
  });

  it('copies the session, its position, its rounds, answers and needs (AC-6)', async () => {
    await buildMidSession();
    const result = await duplicate();

    const [session] = await database.db
      .select()
      .from(sessions)
      .where(eq(sessions.id, result?.sessionId ?? ''));

    expect(session?.initialPrompt).toBe('A recipe app for cooks who hate scrolling');
    expect(session?.summary).toBe('Solo cooks, mobile first.');

    const [state] = await database.db
      .select()
      .from(workflowState)
      .where(eq(workflowState.sessionId, result?.sessionId ?? ''));

    expect(state).toMatchObject({ stage: 'requirements', substage: 'collect', version: 1 });

    const rounds = await database.db
      .select()
      .from(questionRounds)
      .where(eq(questionRounds.sessionId, result?.sessionId ?? ''));

    expect(rounds).toHaveLength(1);
    expect(rounds[0]?.roundNumber).toBe(1);

    const copiedAnswers = await database.db
      .select()
      .from(answers)
      .where(eq(answers.roundId, rounds[0]?.id ?? ''));

    expect(copiedAnswers).toHaveLength(1);
    expect(copiedAnswers[0]?.selectedOptionIds).toEqual(['solo-devs']);

    const needs = await database.db
      .select()
      .from(informationNeeds)
      .where(eq(informationNeeds.sessionId, result?.sessionId ?? ''));

    expect(needs).toHaveLength(2);
    // The satisfied need points at the **copy's** round, not the source's.
    const satisfied = needs.find((need) => need.name === 'audience');
    expect(satisfied?.satisfiedByRound).toBe(rounds[0]?.id);
    expect(needs.find((need) => need.name === 'scope')?.satisfiedByRound).toBeNull();
  });

  it('copies every revision with its approval, and the review that decided it', async () => {
    await buildMidSession();
    const result = await duplicate();

    const [file] = await database.db
      .select()
      .from(specFiles)
      .where(eq(specFiles.projectId, result?.projectId ?? ''));

    expect(file).toMatchObject({ specType: 'constitution', currentRevision: 2 });

    const revisions = await database.db
      .select()
      .from(specRevisions)
      .where(eq(specRevisions.specFileId, file?.id ?? ''));

    expect(revisions).toHaveLength(2);
    expect(revisions.every((revision) => revision.approved)).toBe(true);
    expect(revisions.map((revision) => revision.revisionNumber).sort()).toEqual([1, 2]);

    const latest = revisions.find((revision) => revision.revisionNumber === 2);
    const reviews = await database.db
      .select()
      .from(reviewFeedback)
      .where(eq(reviewFeedback.specRevisionId, latest?.id ?? ''));

    expect(reviews).toHaveLength(1);
    expect(reviews[0]?.decision).toBe('accept');
  });

  /*
   * The acceptance criterion, taken literally: the duplicate resumes into a state whose gates still
   * pass. So the assertion runs the real engine over a snapshot assembled from the copy — not a
   * reading of the rows, but the verdict the session would actually get on its first attempt.
   */
  it('resumes into a state whose gates pass on the first attempt (AC-6)', async () => {
    await buildMidSession();
    await database.db
      .update(workflowState)
      .set({ stage: 'constitution', substage: 'review' })
      .where(eq(workflowState.sessionId, sourceSessionId));

    const result = await duplicate();

    const assembled = await assembleWorkflowSnapshot(database.db, result?.sessionId ?? '', {
      roundBudget: 3,
      capabilities: [],
    });

    expect(assembled).not.toBeNull();
    if (assembled === null) return;

    expect(assembled.snapshot.position).toEqual({ stage: 'constitution', substage: 'review' });
    expect(assembled.snapshot.specApproved.constitution).toBe(true);
    expect(assembled.snapshot.reviewDecided.constitution).toBe(true);
    expect(assembled.snapshot.summaryPersisted).toBe(true);
    expect(assembled.snapshot.answeredRounds.interview).toBe(1);

    // The gate that the decided review opens: on to the next stage, with nothing redone.
    expect(
      evaluateTransition(assembled.snapshot, { stage: 'requirements', substage: 'collect' })
        .allowed,
    ).toBe(true);
  });

  it('carries no pending proposed change into the duplicate (AC: explicitly none)', async () => {
    await buildMidSession();

    const [file] = await database.db
      .select()
      .from(specFiles)
      .where(eq(specFiles.projectId, sourceProjectId));

    await database.db.insert(proposedChanges).values({
      specFileId: file?.id ?? '',
      baseRevision: 2,
      proposedContent: '# Constitution\nproposed',
      instruction: 'Tighten the scope.',
    });

    const result = await duplicate();

    const [copiedFile] = await database.db
      .select()
      .from(specFiles)
      .where(eq(specFiles.projectId, result?.projectId ?? ''));

    const copied = await database.db
      .select()
      .from(proposedChanges)
      .where(eq(proposedChanges.specFileId, copiedFile?.id ?? ''));

    expect(copied).toEqual([]);
    // And the source keeps its own, untouched.
    expect(
      await database.db
        .select()
        .from(proposedChanges)
        .where(eq(proposedChanges.specFileId, file?.id ?? '')),
    ).toHaveLength(1);
  });

  describe('the two projects are independent (AC-7)', () => {
    it('shares no row: appending to the copy leaves the source alone, and the reverse', async () => {
      await buildMidSession();
      const result = await duplicate();

      const revisions = createRevisionRepository(database.db);

      const [copiedFile] = await database.db
        .select()
        .from(specFiles)
        .where(eq(specFiles.projectId, result?.projectId ?? ''));
      const [sourceFile] = await database.db
        .select()
        .from(specFiles)
        .where(eq(specFiles.projectId, sourceProjectId));

      await revisions.append({
        specFileId: copiedFile?.id ?? '',
        content: '# Constitution\nthird',
      });

      expect(
        await database.db
          .select()
          .from(specRevisions)
          .where(eq(specRevisions.specFileId, sourceFile?.id ?? '')),
      ).toHaveLength(2);

      await revisions.append({
        specFileId: sourceFile?.id ?? '',
        content: '# Constitution\nsource third',
      });

      const copiedRevisions = await database.db
        .select()
        .from(specRevisions)
        .where(eq(specRevisions.specFileId, copiedFile?.id ?? ''));

      expect(copiedRevisions).toHaveLength(3);
      expect(copiedRevisions.map((revision) => revision.content)).not.toContain(
        '# Constitution\nsource third',
      );
    });

    it('survives the source being deleted entirely (DR-6 does not reach across)', async () => {
      await buildMidSession();
      const result = await duplicate();

      await database.db.delete(projects).where(eq(projects.id, sourceProjectId));

      const [copiedFile] = await database.db
        .select()
        .from(specFiles)
        .where(eq(specFiles.projectId, result?.projectId ?? ''));

      expect(
        await database.db
          .select()
          .from(specRevisions)
          .where(eq(specRevisions.specFileId, copiedFile?.id ?? '')),
      ).toHaveLength(2);
    });
  });

  describe('attachments', () => {
    /** An attachment with a real object behind it, as the upload path would have produced. */
    async function attachDocument(): Promise<string> {
      const { blobKey } = await storage.put(scope, {
        sessionId: sourceSessionId,
        fileName: 'brief.pdf',
        contentType: 'application/pdf',
        bytes: new Uint8Array([1, 2, 3, 4]),
      });

      await database.db.insert(attachments).values({
        sessionId: sourceSessionId,
        fileName: 'brief.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 4,
        blobKey,
        parseStatus: 'ok',
        extractedText: 'The brief, in words.',
        attachedAtStage: 'interview',
      });

      return blobKey;
    }

    /*
     * `attachments.blob_key` is unique, so two rows cannot address one object: a "reference" to the
     * source's document is not expressible. The copy therefore gets its own object, and the assertion
     * is that both exist and hold the same bytes — a copy that pointed at the source's object would
     * be deleted out from under it the first time the source was.
     */
    it('copies the row and the object it names', async () => {
      const sourceKey = await attachDocument();
      const result = await duplicate();

      const copied = await database.db
        .select()
        .from(attachments)
        .where(eq(attachments.sessionId, result?.sessionId ?? ''));

      expect(copied).toHaveLength(1);
      expect(copied[0]?.extractedText).toBe('The brief, in words.');
      expect(copied[0]?.blobKey).not.toBe(sourceKey);

      expect(await storage.read(scope, copied[0]?.blobKey ?? '')).toEqual(
        new Uint8Array([1, 2, 3, 4]),
      );
      // The source object is still there — copying is not moving.
      expect(await storage.read(scope, sourceKey)).toEqual(new Uint8Array([1, 2, 3, 4]));
    });

    it('keys the copy under the new session, so the owner prefix check still holds', async () => {
      await attachDocument();
      const result = await duplicate();

      const copied = await database.db
        .select()
        .from(attachments)
        .where(eq(attachments.sessionId, result?.sessionId ?? ''));

      expect(copied[0]?.blobKey).toContain(
        `attachments/${scope.userId}/${result?.sessionId ?? ''}/`,
      );
    });

    /*
     * A document whose object has already gone missing must not stop the duplication: the row is
     * skipped, everything else is copied, and the owner gets a working fork rather than an error
     * about a file they cannot see.
     */
    it('skips an attachment whose object is gone, and copies the rest', async () => {
      const sourceKey = await attachDocument();
      await storage.deleteMany([sourceKey]);

      const result = await duplicate();

      expect(result).not.toBeNull();
      expect(
        await database.db
          .select()
          .from(attachments)
          .where(eq(attachments.sessionId, result?.sessionId ?? '')),
      ).toEqual([]);
    });
  });

  /**
   * А-6 — a project holds several chats, so a copy of the project is a copy of all of them.
   *
   * Copying only one would silently drop the Edit conversations, and the copy's bundle would then
   * have a history whose authors no longer exist on that project. The primary chat is the copy of
   * the source's *first*, because that is the chat unattributed history belongs to and the one a
   * project link lands in.
   */
  it('copies every chat of the project, keeping the first one primary (А-6)', async () => {
    const [edit] = await database.db
      .insert(sessions)
      .values({
        projectId: sourceProjectId,
        title: 'Edit constitution.md',
        initialPrompt: 'I want to update spec constitution.md to ',
        methodologyId: 'myspec-edit-v1',
        archived: true,
      })
      .returning({ id: sessions.id });

    await database.db
      .insert(workflowState)
      .values({ sessionId: edit?.id ?? '', stage: 'constitution', substage: 'collect' });

    const result = await duplicate();
    expect(result).not.toBeNull();

    const copied = await database.db
      .select()
      .from(sessions)
      .where(eq(sessions.projectId, result?.projectId ?? ''));

    expect(copied).toHaveLength(2);
    expect(copied.map((row) => row.methodologyId).sort()).toEqual([
      'myspec-edit-v1',
      'myspec-greenfield-v1',
    ]);

    // Titles and the archived flag travel: a chat that was filed away stays filed away.
    const editCopy = copied.find((row) => row.methodologyId === 'myspec-edit-v1');
    expect(editCopy?.title).toBe('Edit constitution.md');
    expect(editCopy?.archived).toBe(true);

    // Each copied chat has its own workflow row, at the position its source was in.
    const states = await Promise.all(
      copied.map(
        async (row) =>
          (
            await database.db
              .select()
              .from(workflowState)
              .where(eq(workflowState.sessionId, row.id))
          )[0],
      ),
    );
    expect(states.map((state) => state?.stage).sort()).toEqual(['constitution', 'requirements']);

    // And the result names the copy of the *first* chat.
    const primary = copied.find((row) => row.methodologyId === 'myspec-greenfield-v1');
    expect(result?.sessionId).toBe(primary?.id);
  });

  it('carries the authorship of each revision to the copy of the chat that wrote it', async () => {
    await buildMidSession();

    const [file] = await database.db
      .select()
      .from(specFiles)
      .where(eq(specFiles.projectId, sourceProjectId));

    /*
     * A second revision, attributed to the source's chat as a real generation would have written
     * it. Inserted rather than updated: `source_session_id` is frozen by the same trigger that
     * freezes the content (DR-2), which is exactly the property that makes authorship trustworthy.
     */
    await database.exec(
      `INSERT INTO spec_revisions (spec_file_id, revision_number, content, approved, source_session_id)
       VALUES ('${file?.id ?? ''}', 3, '# Requirements v3', true, '${sourceSessionId}')`,
    );

    const result = await duplicate();
    expect(result).not.toBeNull();

    const [copiedFile] = await database.db
      .select()
      .from(specFiles)
      .where(eq(specFiles.projectId, result?.projectId ?? ''));

    const copiedRevisions = await database.db
      .select()
      .from(specRevisions)
      .where(eq(specRevisions.specFileId, copiedFile?.id ?? ''));

    const attributed = copiedRevisions.filter((row) => row.sourceSessionId !== null);
    expect(attributed).toHaveLength(1);

    // Remapped, not carried over: the copy's history names the copy's chat, never the source's.
    expect(attributed[0]?.sourceSessionId).toBe(result?.sessionId);
    expect(attributed[0]?.sourceSessionId).not.toBe(sourceSessionId);

    // And history that named no chat still names none — an author is not invented after the fact.
    expect(copiedRevisions.some((row) => row.sourceSessionId === null)).toBe(true);
  });

  it('is null for a project the caller does not own, and writes nothing (AR-2)', async () => {
    const stranger = OwnerScope.forAuthenticatedUser('11111111-1111-4111-8111-111111111111');

    await expect(
      duplicateProject(database.db, stranger, sourceProjectId, storage),
    ).resolves.toBeNull();

    expect(await database.db.select().from(projects)).toHaveLength(1);
  });
});
