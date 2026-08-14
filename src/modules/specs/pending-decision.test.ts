import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { OwnerScope } from '@/db/owner-scope';
import {
  projects,
  proposedChanges,
  reviewFeedback,
  sessions,
  specRevisions,
  users,
  workflowState,
} from '@/db/schema';
import { createMigratedDatabase, type TestDatabase } from '@/db/testing/migrated-database';

import { describePending, findPendingDecision, isDecidable } from './pending-decision';
import { createRevisionRepository } from './repositories/revisions';

/**
 * Task 75 — the one answer to "what is this session waiting on?" (FR-017 AC-3/AC-4).
 *
 * Resume is only correct if the page and the chat endpoint agree, and they agree because they both
 * call this. So what is asserted here is the **precedence**: with two things outstanding at once,
 * exactly one is the card in front of the user, and it is always the same one.
 */
describe('findPendingDecision (task 75)', () => {
  let database: TestDatabase;
  let scope: OwnerScope;
  let projectId: string;
  let sessionId: string;
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

    scope = OwnerScope.forAuthenticatedUser(owner?.id ?? '');

    const [project] = await database.db
      .insert(projects)
      .values({ ownerId: owner?.id ?? '', name: 'Resume' })
      .returning({ id: projects.id });

    projectId = project?.id ?? '';

    const [session] = await database.db
      .insert(sessions)
      .values({ projectId, initialPrompt: 'A session to resume' })
      .returning({ id: sessions.id });

    sessionId = session?.id ?? '';
    await database.db
      .insert(workflowState)
      .values({ sessionId, stage: 'constitution', substage: 'generate' });

    const file = await createRevisionRepository(database.db).ensureSpecFile(
      projectId,
      'constitution',
    );
    specFileId = file.id;
  });

  /** An unapproved revision — the plainest pending decision there is. */
  async function unapprovedRevision(): Promise<number> {
    const revision = await createRevisionRepository(database.db).append({
      specFileId,
      content: '# Constitution\nawaiting a decision',
    });

    return revision.revisionNumber;
  }

  async function approvedRevision(): Promise<string> {
    const revisions = createRevisionRepository(database.db);
    const revision = await revisions.append({ specFileId, content: '# Constitution\napproved' });
    await revisions.approve(revision.id);

    return revision.id;
  }

  async function pendingReview(revisionId: string): Promise<string> {
    const [row] = await database.db
      .insert(reviewFeedback)
      .values({ specRevisionId: revisionId, outcome: 'pass', items: [] })
      .returning({ id: reviewFeedback.id });

    return row?.id ?? '';
  }

  async function pendingProposal(): Promise<string> {
    const [row] = await database.db
      .insert(proposedChanges)
      .values({
        specFileId,
        baseRevision: 1,
        proposedContent: '# Constitution\nproposed',
        instruction: 'Tighten the scope.',
      })
      .returning({ id: proposedChanges.id });

    return row?.id ?? '';
  }

  const find = (roundId: string | null = null) =>
    findPendingDecision(database.db, scope, projectId, roundId);

  it('is null when nothing is outstanding', async () => {
    await expect(find()).resolves.toBeNull();
    expect(describePending(null)).toBe('nothing is awaiting a decision');
  });

  describe('each of the four kinds, on its own (FR-017 AC-3/AC-4)', () => {
    it('names a pending question round', async () => {
      const roundId = '33333333-3333-4333-8333-333333333333';

      await expect(find(roundId)).resolves.toEqual({ kind: 'question-round', roundId });
    });

    it('names an unapproved revision', async () => {
      const revisionNumber = await unapprovedRevision();

      await expect(find()).resolves.toEqual({
        kind: 'spec',
        specFileId,
        revisionNumber,
        fileName: 'constitution.md',
      });
    });

    it('names a pending review', async () => {
      const reviewId = await pendingReview(await approvedRevision());

      await expect(find()).resolves.toMatchObject({ kind: 'review', reviewId, specFileId });
    });

    it('names a pending proposed change', async () => {
      await approvedRevision();
      const proposedChangeId = await pendingProposal();

      await expect(find()).resolves.toMatchObject({
        kind: 'diff',
        proposedChangeId,
        fileName: 'constitution.md',
      });
    });
  });

  describe('precedence, when more than one is outstanding', () => {
    /*
     * The defect this ordering removes: while a round is presented, generation is blocked (FR-005
     * AC-4), so the round *is* the card on screen. A round-blind lookup would answer "spec" here —
     * and a typed "approve" would reach past the questions and approve a draft the user is not
     * looking at.
     */
    it('puts a pending question round ahead of everything else', async () => {
      await unapprovedRevision();
      const roundId = '33333333-3333-4333-8333-333333333333';

      await expect(find(roundId)).resolves.toMatchObject({ kind: 'question-round' });
    });

    it('puts a proposed change ahead of a review and an unapproved revision (FR-011 AC-6)', async () => {
      const revisionId = await approvedRevision();
      await pendingReview(revisionId);
      await pendingProposal();

      await expect(find()).resolves.toMatchObject({ kind: 'diff' });
    });

    /*
     * A review belongs to the revision it read, and `pendingForFile` resolves the latest revision
     * first. So a request-changes — which appends a *new* unapproved revision — moves the card from
     * the board to the draft, rather than leaving two outstanding. The precedence in the resolver is
     * belt to that braces: it decides the case the repository has already made impossible, so a
     * later change to either cannot produce two cards at once.
     */
    it('hands the card to the new draft when a review is superseded by a newer revision', async () => {
      const revisionId = await approvedRevision();
      await pendingReview(revisionId);

      await expect(find()).resolves.toMatchObject({ kind: 'review' });

      const revisionNumber = await unapprovedRevision();

      await expect(find()).resolves.toMatchObject({ kind: 'spec', revisionNumber });
    });
  });

  /*
   * The divergence this closes: the page has looked up proposals project-wide since M5, because a
   * late attachment can start a refinement on a file the session has moved past (task 69). A
   * file-scoped lookup here meant the page rendered a diff card that chat could not see — two
   * answers to "which card is on screen", which is one too many.
   */
  it('finds a proposal on a file the session has moved past', async () => {
    await approvedRevision();

    const other = await createRevisionRepository(database.db).ensureSpecFile(
      projectId,
      'requirements',
    );
    const otherRevision = await createRevisionRepository(database.db).append({
      specFileId: other.id,
      content: '# Requirements\ncurrent',
    });
    await createRevisionRepository(database.db).approve(otherRevision.id);

    // The proposal is on `constitution`, which is no longer the file with the highest pointer.
    const proposedChangeId = await pendingProposal();

    await expect(find()).resolves.toMatchObject({ kind: 'diff', proposedChangeId });
  });

  describe('what a typed message may decide', () => {
    it('excludes a question round: it is answered, not decided', () => {
      expect(isDecidable({ kind: 'question-round', roundId: 'r' })).toBe(false);
      expect(isDecidable(null)).toBe(false);
    });

    it('includes the three decision cards', () => {
      expect(
        isDecidable({ kind: 'spec', specFileId: 'f', revisionNumber: 1, fileName: 'x.md' }),
      ).toBe(true);
      expect(
        isDecidable({ kind: 'review', reviewId: 'r', specFileId: 'f', specType: 'tasks' }),
      ).toBe(true);
      expect(
        isDecidable({ kind: 'diff', proposedChangeId: 'p', specFileId: 'f', fileName: 'x.md' }),
      ).toBe(true);
    });

    it('describes a pending round in words the assistant can use', () => {
      expect(describePending({ kind: 'question-round', roundId: 'r' })).toContain('questions');
    });
  });

  it('finds nothing for a stranger, however much is outstanding (AR-2)', async () => {
    await unapprovedRevision();

    const stranger = OwnerScope.forAuthenticatedUser('11111111-1111-4111-8111-111111111111');

    await expect(findPendingDecision(database.db, stranger, projectId, null)).resolves.toBeNull();
  });

  /* Resume reads state; it must not change it (FR-017 AC-6). */
  it('writes nothing', async () => {
    const revisionId = await approvedRevision();
    await pendingReview(revisionId);

    const revisionsBefore = await database.db.select().from(specRevisions);
    const stateBefore = await database.db
      .select()
      .from(workflowState)
      .where(eq(workflowState.sessionId, sessionId));

    await find();
    await find('33333333-3333-4333-8333-333333333333');

    expect(await database.db.select().from(specRevisions)).toEqual(revisionsBefore);
    expect(
      await database.db.select().from(workflowState).where(eq(workflowState.sessionId, sessionId)),
    ).toEqual(stateBefore);
  });
});
