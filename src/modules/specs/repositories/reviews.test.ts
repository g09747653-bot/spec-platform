import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { projects, reviewFeedback, users } from '@/db/schema';
import { createMigratedDatabase, type TestDatabase } from '@/db/testing/migrated-database';
import type { OwnerScope } from '@/db/owner-scope';

import { createRevisionRepository, type RevisionRepository } from './revisions';
import { createReviewRepository, type ReviewRepository } from './reviews';

/**
 * Task 111 — the board is history, and history is only ever appended to.
 *
 * Two claims, and both are about what the storage layer *refuses*: a second review of a revision
 * does not replace the first, and a second decision does not replace the first. They are asserted
 * against a real PostgreSQL instance because both are enforced by the database (a unique index and a
 * conditional UPDATE) rather than by the repository being careful — the same reasoning behind the
 * revision allocator's concurrency tests.
 *
 * The third claim is the one that has to hold for the customer's existing sessions: a board written
 * before review.v2 still reads. It is asserted by writing the old shape straight into the column and
 * reading it back through the repository, because that is exactly what an old row is.
 */
describe('ReviewRepository (task 111)', () => {
  let database: TestDatabase;
  let reviews: ReviewRepository;
  let revisions: RevisionRepository;
  let scope: OwnerScope;
  let specFileId: string;

  const item = (id: string) => ({
    id,
    sectionPath: 'Scope — Non-goals',
    title: 'No boundary is stated',
    body: 'The scope section names no non-goals.',
    suggestion: 'Add a non-goals list.',
    confidence: 8,
    severity: 'blocking' as const,
    source: 'model' as const,
  });

  beforeAll(async () => {
    database = await createMigratedDatabase();
    reviews = createReviewRepository(database.db);
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
    scope = { userId: owner?.id ?? '' };

    const [project] = await database.db
      .insert(projects)
      .values({ ownerId: scope.userId, name: 'Reviews' })
      .returning({ id: projects.id });

    const file = await revisions.ensureSpecFile(project?.id ?? '', 'constitution');
    specFileId = file.id;
  });

  const appendRevision = async (content: string) => {
    const revision = await revisions.append({ specFileId, content });
    await revisions.approve(revision.id);
    return revision;
  };

  it('stores the summary and the items, and reads them back whole', async () => {
    const revision = await appendRevision('# Constitution');

    const stored = await reviews.create({
      specRevisionId: revision.id,
      outcome: 'needs_revision',
      summary: 'One boundary is missing.',
      items: [item('mf-1')],
    });

    expect(stored.summary).toBe('One boundary is missing.');
    expect(stored.items[0]).toMatchObject({ sectionPath: 'Scope — Non-goals', confidence: 8 });

    const read = await reviews.findById(scope, stored.id);
    expect(read?.summary).toBe('One boundary is missing.');
    expect(read?.items).toEqual(stored.items);
  });

  it('never replaces the board of a revision that already has one', async () => {
    const revision = await appendRevision('# Constitution');

    const first = await reviews.create({
      specRevisionId: revision.id,
      outcome: 'needs_revision',
      summary: 'The first opinion.',
      items: [item('mf-1')],
    });

    const second = await reviews.create({
      specRevisionId: revision.id,
      outcome: 'pass',
      summary: 'A different opinion entirely.',
      items: [],
    });

    // Same row, unchanged: a second review of immutable bytes could only ever disagree with the one
    // the user is already looking at.
    expect(second.id).toBe(first.id);
    expect(second.summary).toBe('The first opinion.');
    expect(second.items.map((entry) => entry.id)).toEqual(['mf-1']);
  });

  it('never overwrites a decision, and reports the second attempt as a no-op', async () => {
    const revision = await appendRevision('# Constitution');
    const board = await reviews.create({
      specRevisionId: revision.id,
      outcome: 'needs_revision',
      summary: 'One point.',
      items: [item('mf-1')],
    });

    const decided = await reviews.decide(board.id, 'request_changes', ['mf-1']);
    expect(decided?.decision).toBe('request_changes');
    expect(decided?.selectedItemIds).toEqual(['mf-1']);

    expect(await reviews.decide(board.id, 'accept', null)).toBeNull();

    const read = await reviews.findById(scope, board.id);
    expect(read?.decision).toBe('request_changes');
    expect(read?.selectedItemIds).toEqual(['mf-1']);
  });

  it('gives every revision its own board, so a cycle appends rather than rewrites', async () => {
    const first = await appendRevision('# Constitution, first draft');
    const firstBoard = await reviews.create({
      specRevisionId: first.id,
      outcome: 'needs_revision',
      summary: 'Round one.',
      items: [item('mf-1')],
    });
    await reviews.decide(firstBoard.id, 'request_changes', ['mf-1']);

    const second = await appendRevision('# Constitution, second draft');
    const secondBoard = await reviews.create({
      specRevisionId: second.id,
      outcome: 'pass',
      summary: 'Round two: the point was applied.',
      items: [],
    });

    expect(secondBoard.id).not.toBe(firstBoard.id);

    // The earlier board is still there, still decided, still carrying what it carried.
    const earlier = await reviews.findById(scope, firstBoard.id);
    expect(earlier?.decision).toBe('request_changes');
    expect(earlier?.summary).toBe('Round one.');

    // And the pending lookup follows the latest revision, not the oldest undecided board.
    const pending = await reviews.pendingForFile(scope, specFileId);
    expect(pending?.id).toBe(secondBoard.id);
  });

  it('reads a board written before review.v2 forward into the v2 shape', async () => {
    const revision = await appendRevision('# Constitution');

    // Exactly what an M4-era row looks like: no summary, v1 field names, a line number.
    await database.db.execute(sql`
      INSERT INTO ${reviewFeedback} (spec_revision_id, outcome, items)
      VALUES (
        ${revision.id}::uuid,
        'needs_revision',
        ${JSON.stringify([
          {
            id: 'mf-legacy',
            section: 'Core Principles',
            line: 12,
            confidenceScore: 9,
            description: 'P2 is stated but never gated.',
            suggestion: 'Name the gate that enforces it.',
            severity: 'blocking',
          },
        ])}::jsonb
      )
    `);

    const pending = await reviews.pendingForFile(scope, specFileId);

    expect(pending).not.toBeNull();
    expect(pending?.summary).toBeNull();
    expect(pending?.items[0]).toEqual({
      id: 'mf-legacy',
      sectionPath: 'Core Principles',
      title: 'Core Principles',
      body: 'P2 is stated but never gated.',
      suggestion: 'Name the gate that enforces it.',
      confidence: 9,
      severity: 'blocking',
      source: 'model',
    });
  });
});
