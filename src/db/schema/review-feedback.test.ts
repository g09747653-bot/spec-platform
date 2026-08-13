import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { projects, reviewFeedback, specFiles, specRevisions, users } from '@/db/schema';
import {
  captureDatabaseError,
  createMigratedDatabase,
  type TestDatabase,
} from '@/db/testing/migrated-database';
import { REVIEW_DECISIONS, REVIEW_OUTCOMES } from '@/modules/specs/model/review';

/**
 * Task 53 — the two acceptance criteria, asserted as the database refusing the write.
 *
 * Both rules exist to protect one downstream behaviour: FR-010 AC-7, "apply only the selected
 * items". That filter reads `selected_item_ids` and matches it against item ids, so an item with no
 * id and a selection recorded against the wrong decision are the same defect seen from two ends —
 * feedback silently applied, or silently not applied, with nothing in the data to show which.
 */
describe('review_feedback (task 53)', () => {
  let database: TestDatabase;
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

    const [file] = await database.db
      .insert(specFiles)
      .values({ projectId: project.id, specType: 'constitution', fileName: 'constitution.md' })
      .returning({ id: specFiles.id });
    if (file === undefined) throw new Error('spec file setup failed');

    const [revision] = await database.db
      .insert(specRevisions)
      .values({ specFileId: file.id, revisionNumber: 1, content: '# Constitution', approved: true })
      .returning({ id: specRevisions.id });
    if (revision === undefined) throw new Error('revision setup failed');
    revisionId = revision.id;
  });

  const item = (id: string) => ({
    id,
    section: 'Core Principles',
    line: 12,
    severity: 'blocking',
    confidenceScore: 8,
    description: 'P2 is stated but never gated.',
    suggestion: 'Name the gate that enforces it.',
  });

  const insertReview = (values: Record<string, unknown>) => {
    const row: typeof reviewFeedback.$inferInsert = {
      specRevisionId: revisionId,
      outcome: 'needs_revision',
      items: [item('mf-1')],
      ...values,
    };

    return database.db.insert(reviewFeedback).values(row);
  };

  describe('AC-1 — every persisted feedback item has a stable, non-empty id', () => {
    it('accepts items that all carry a non-empty string id', async () => {
      const message = await captureDatabaseError(() =>
        insertReview({ items: [item('mf-1'), item('rec-1')] }),
      );

      expect(message).toBeUndefined();
    });

    it('rejects an item with no id key at all', async () => {
      const { id: _dropped, ...withoutId } = item('mf-1');

      const message = await captureDatabaseError(() => insertReview({ items: [withoutId] }));

      expect(message).toMatch(/review_feedback_items_have_stable_ids/);
    });

    it('rejects an empty-string id', async () => {
      const message = await captureDatabaseError(() => insertReview({ items: [item('')] }));

      expect(message).toMatch(/review_feedback_items_have_stable_ids/);
    });

    it('rejects a non-string id, including a number and a null', async () => {
      for (const badId of [7, null, true, { nested: 'id' }, ['array']]) {
        const message = await captureDatabaseError(() =>
          insertReview({ items: [{ ...item('mf-1'), id: badId }] }),
        );

        expect(message).toMatch(/review_feedback_items_have_stable_ids/);
      }
    });

    it('rejects a single bad item hidden among good ones', async () => {
      const message = await captureDatabaseError(() =>
        insertReview({ items: [item('mf-1'), item(''), item('mf-3')] }),
      );

      expect(message).toMatch(/review_feedback_items_have_stable_ids/);
    });

    it('accepts an empty item list — a passing review has nothing to say', async () => {
      const message = await captureDatabaseError(() =>
        insertReview({ outcome: 'pass', items: [] }),
      );

      expect(message).toBeUndefined();
    });

    it('rejects items that are not an array', async () => {
      const message = await captureDatabaseError(() =>
        database.exec(
          `INSERT INTO review_feedback (spec_revision_id, outcome, items)
           VALUES ('${revisionId}', 'pass', '{"id":"mf-1"}'::jsonb)`,
        ),
      );

      expect(message).toMatch(/review_feedback_items_is_array/);
    });

    /*
     * The array check earns its place: in lax jsonpath mode `$[*]` auto-wraps a non-array, so the
     * object above satisfies the id rule on its own and only `..._items_is_array` refuses it. A bare
     * scalar is refused by both — wrapped, it is an element with no `id` — and PostgreSQL reports
     * whichever it evaluates first, so either name is a correct refusal here.
     */
    it('rejects a bare scalar, which is neither an array nor an item', async () => {
      const message = await captureDatabaseError(() =>
        database.exec(
          `INSERT INTO review_feedback (spec_revision_id, outcome, items)
           VALUES ('${revisionId}', 'pass', '"just a string"'::jsonb)`,
        ),
      );

      expect(message).toMatch(
        /review_feedback_items_is_array|review_feedback_items_have_stable_ids/,
      );
    });
  });

  describe('AC-2 — selected_item_ids is populated only for request-changes', () => {
    it('accepts a request-changes decision carrying selected ids', async () => {
      const message = await captureDatabaseError(() =>
        insertReview({
          decision: 'request_changes',
          selectedItemIds: ['mf-1'],
          decidedAt: new Date(),
        }),
      );

      expect(message).toBeUndefined();
    });

    it('rejects request-changes with no selection at all', async () => {
      const message = await captureDatabaseError(() =>
        insertReview({ decision: 'request_changes', decidedAt: new Date() }),
      );

      expect(message).toMatch(/review_feedback_selection_matches_decision/);
    });

    it('rejects request-changes with an empty selection — an empty revision prompt', async () => {
      const message = await captureDatabaseError(() =>
        insertReview({ decision: 'request_changes', selectedItemIds: [], decidedAt: new Date() }),
      );

      expect(message).toMatch(/review_feedback_selection_matches_decision/);
    });

    it('accepts accept and ignore with a null selection', async () => {
      for (const decision of ['accept', 'ignore']) {
        await database.db.delete(reviewFeedback);

        const message = await captureDatabaseError(() =>
          insertReview({ decision, decidedAt: new Date() }),
        );

        expect(message).toBeUndefined();
      }
    });

    it('rejects accept or ignore that carries a selection', async () => {
      for (const decision of ['accept', 'ignore']) {
        const message = await captureDatabaseError(() =>
          insertReview({ decision, selectedItemIds: ['mf-1'], decidedAt: new Date() }),
        );

        expect(message).toMatch(/review_feedback_selection_matches_decision/);
      }
    });

    it('rejects accept or ignore that carries an empty array rather than null', async () => {
      // "Selected nothing" and "was never asked" must stay distinguishable in the data.
      const message = await captureDatabaseError(() =>
        insertReview({ decision: 'accept', selectedItemIds: [], decidedAt: new Date() }),
      );

      expect(message).toMatch(/review_feedback_selection_matches_decision/);
    });

    it('rejects a pending review that already carries a selection', async () => {
      const message = await captureDatabaseError(() => insertReview({ selectedItemIds: ['mf-1'] }));

      expect(message).toMatch(/review_feedback_selection_matches_decision/);
    });

    it('rejects a selection that is not an array', async () => {
      const message = await captureDatabaseError(() =>
        database.exec(
          `INSERT INTO review_feedback (spec_revision_id, outcome, items, decision, selected_item_ids, decided_at)
           VALUES ('${revisionId}', 'needs_revision', '[]'::jsonb, 'request_changes', '"mf-1"'::jsonb, now())`,
        ),
      );

      expect(message).toMatch(/review_feedback_selection_matches_decision/);
    });

    it('rejects a selection added by UPDATE onto an accept decision', async () => {
      await insertReview({ decision: 'accept', decidedAt: new Date() });

      const message = await captureDatabaseError(() =>
        database.exec(
          `UPDATE review_feedback SET selected_item_ids = '["mf-1"]'::jsonb
           WHERE spec_revision_id = '${revisionId}'`,
        ),
      );

      expect(message).toMatch(/review_feedback_selection_matches_decision/);
    });
  });

  describe('vocabulary and pending state', () => {
    it('accepts each declared outcome', async () => {
      for (const outcome of REVIEW_OUTCOMES) {
        await database.db.delete(reviewFeedback);
        expect(await captureDatabaseError(() => insertReview({ outcome }))).toBeUndefined();
      }
    });

    it('accepts each declared decision', async () => {
      for (const decision of REVIEW_DECISIONS) {
        await database.db.delete(reviewFeedback);
        const selectedItemIds = decision === 'request_changes' ? ['mf-1'] : null;
        expect(
          await captureDatabaseError(() =>
            insertReview({ decision, selectedItemIds, decidedAt: new Date() }),
          ),
        ).toBeUndefined();
      }
    });

    it('rejects an outcome the review agent is not allowed to state', async () => {
      // `accept` is a user decision, not an outcome — the two alphabets must not blur (P2).
      const message = await captureDatabaseError(() => insertReview({ outcome: 'accept' }));

      expect(message).toMatch(/review_feedback_outcome_valid/);
    });

    it('rejects a decision outside the three the board offers', async () => {
      const message = await captureDatabaseError(() =>
        insertReview({ decision: 'approve', decidedAt: new Date() }),
      );

      expect(message).toMatch(/review_feedback_decision_valid/);
    });

    it('stores a pending review with no decision and no timestamp (FR-010 AC-4)', async () => {
      await insertReview({});

      const [row] = await database.db
        .select()
        .from(reviewFeedback)
        .where(eq(reviewFeedback.specRevisionId, revisionId));

      expect(row?.decision).toBeNull();
      expect(row?.decidedAt).toBeNull();
      expect(row?.selectedItemIds).toBeNull();
    });

    it('rejects a decision with no timestamp, and a timestamp with no decision', async () => {
      expect(await captureDatabaseError(() => insertReview({ decision: 'accept' }))).toMatch(
        /review_feedback_decision_timestamp_paired/,
      );

      await database.db.delete(reviewFeedback);

      expect(await captureDatabaseError(() => insertReview({ decidedAt: new Date() }))).toMatch(
        /review_feedback_decision_timestamp_paired/,
      );
    });
  });

  describe('one review per revision (FR-010 AC-8)', () => {
    it('rejects a second review of the same revision', async () => {
      await insertReview({});

      const message = await captureDatabaseError(() => insertReview({ outcome: 'pass' }));

      expect(message).toMatch(/review_feedback_spec_revision_unique|duplicate key/i);
    });

    it('accepts a review of the next revision of the same file — a fresh review of new content', async () => {
      await insertReview({});

      const [file] = await database.db.select({ id: specFiles.id }).from(specFiles).limit(1);
      const [revised] = await database.db
        .insert(specRevisions)
        .values({ specFileId: file?.id ?? '', revisionNumber: 2, content: '# Constitution v2' })
        .returning({ id: specRevisions.id });

      const message = await captureDatabaseError(() =>
        database.db.insert(reviewFeedback).values({
          specRevisionId: revised?.id ?? '',
          outcome: 'pass',
          items: [],
        }),
      );

      expect(message).toBeUndefined();
    });

    it('is removed by the project cascade, and only by it (DR-6)', async () => {
      await insertReview({});

      await database.db.delete(users);

      expect(await database.db.select().from(reviewFeedback)).toHaveLength(0);
    });
  });

  /**
   * Control run: the constraints are what refuse the writes above.
   *
   * A test that expects an error passes for any error, including a typo in the statement. Dropping
   * the two constraints and replaying the very same inserts shows they are accepted without them.
   */
  describe('control run — the constraints are what refuse the write', () => {
    // Explicit timeout: this boots a second PGlite instance *inside the test body*, which the
    // config's `hookTimeout` does not cover — see the note on the same pattern in `spec-revisions.test.ts`.
    it('accepts an id-less item and a mismatched selection once the constraints are dropped', async () => {
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

        const idless = `INSERT INTO review_feedback (spec_revision_id, outcome, items)
                        VALUES ('${revision?.id ?? ''}', 'pass', '[{"section":"x"}]'::jsonb)`;

        expect(await captureDatabaseError(() => control.exec(idless))).toMatch(
          /review_feedback_items_have_stable_ids/,
        );

        await control.exec(
          'ALTER TABLE review_feedback DROP CONSTRAINT review_feedback_items_have_stable_ids',
        );
        expect(await captureDatabaseError(() => control.exec(idless))).toBeUndefined();

        await control.exec('DELETE FROM review_feedback');

        const mismatched = `INSERT INTO review_feedback (spec_revision_id, outcome, items, decision, selected_item_ids, decided_at)
                            VALUES ('${revision?.id ?? ''}', 'pass', '[]'::jsonb, 'accept', '["mf-1"]'::jsonb, now())`;

        expect(await captureDatabaseError(() => control.exec(mismatched))).toMatch(
          /review_feedback_selection_matches_decision/,
        );

        await control.exec(
          'ALTER TABLE review_feedback DROP CONSTRAINT review_feedback_selection_matches_decision',
        );
        expect(await captureDatabaseError(() => control.exec(mismatched))).toBeUndefined();
      } finally {
        await control.close();
      }
    }, 60_000);
  });
});
