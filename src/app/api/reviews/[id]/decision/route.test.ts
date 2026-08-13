import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as EnvModule from '@/config/env';
import { OwnerScope } from '@/db/owner-scope';
import {
  projects,
  reviewFeedback,
  sessions,
  specFiles,
  specRevisions,
  users,
  workflowState,
} from '@/db/schema';
import { createMigratedDatabase, type TestDatabase } from '@/db/testing/migrated-database';

/**
 * Task 56 — the review decision endpoint and the gate it feeds.
 *
 * The acceptance criteria are about *consequences*, so the assertions reach past the response body
 * into persisted state and into the assembled snapshot: accept or ignore satisfies `reviewGate`
 * (AC-1), request-changes with no selection is refused by validation (AC-2), and an approved
 * revision produces a fresh review of the new content (AC-3).
 *
 * Two seams are mocked — the Auth.js session and the process-wide database handle. Everything else
 * is the shipping code path against a real PostgreSQL instance.
 */
vi.mock('@/modules/projects/auth/scope', () => ({
  currentOwnerScope: vi.fn(),
  requireOwnerScope: vi.fn(),
}));

vi.mock('@/db/client', () => ({ getDatabase: vi.fn() }));

vi.mock('@/modules/adapters/llm/default-adapter', () => ({ createDefaultAdapter: vi.fn() }));

import { TEST_ENV } from '@/config/testing/test-env';

vi.mock('@/config/env', async (importOriginal) => {
  const actual = await importOriginal<typeof EnvModule>();

  return { ...actual, getEnv: () => actual.parseEnv(TEST_ENV) };
});

import { getDatabase } from '@/db/client';
import { stubReviewDocument } from '@/modules/adapters/llm';
import { createDefaultAdapter } from '@/modules/adapters/llm/default-adapter';
import { assembleContext } from '@/modules/agents/context-assembler';
import { collectContextSources } from '@/modules/agents/spec/collect-context';
import { currentOwnerScope } from '@/modules/projects/auth/scope';
import { assembleWorkflowSnapshot } from '@/modules/workflow/snapshot-assembler';

import { POST as transition } from '../../../sessions/[id]/transition/route';
import { POST as decideSpec } from '../../../specs/[specFileId]/decision/route';

import { POST } from './route';

const asJson = async (response: Response): Promise<Record<string, unknown>> =>
  (await response.json()) as Record<string, unknown>;

function post(reviewId: string, body: unknown): Promise<Response> {
  return POST(
    new Request('http://test.local/api/reviews/decision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: reviewId }) },
  );
}

function approveSpec(specFileId: string, revisionNumber: number): Promise<Response> {
  return decideSpec(
    new Request('http://test.local/api/specs/decision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'approve', revisionNumber }),
    }),
    { params: Promise.resolve({ specFileId }) },
  );
}

/** Walks the session into `<stage>/review`, which is what produces a review (FR-010 AC-1). */
function enterReview(sessionId: string, stage = 'constitution'): Promise<Response> {
  return transition(
    new Request('http://test.local/api/sessions/transition', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toStage: stage, toSubstage: 'review' }),
    }),
    { params: Promise.resolve({ id: sessionId }) },
  );
}

describe('POST /api/reviews/:id/decision (task 56)', () => {
  let database: TestDatabase;
  let ownerId: string;
  let sessionId: string;
  let projectId: string;
  let specFileId: string;
  let revisionId: string;
  let reviewId: string;

  beforeAll(async () => {
    // The one seam that keeps a vendor out of the suite (D-23): entering `review` calls the chain.
    vi.mocked(createDefaultAdapter).mockReturnValue({
      generateStreaming: () =>
        Promise.resolve({ text: stubReviewDocument(), providerUsed: 'stub', attempts: 1 }),
    });

    database = await createMigratedDatabase();
    vi.mocked(getDatabase).mockReturnValue(
      database.db as unknown as ReturnType<typeof getDatabase>,
    );
  });

  afterAll(async () => {
    await database.close();
  });

  const snapshot = async () =>
    assembleWorkflowSnapshot(database.db, sessionId, {
      roundBudget: 3,
      capabilities: [],
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
      .values({ ownerId, name: 'Review API' })
      .returning({ id: projects.id });
    projectId = project?.id ?? '';

    const [session] = await database.db
      .insert(sessions)
      .values({ projectId, initialPrompt: 'Build it', summary: 'Summarised.' })
      .returning({ id: sessions.id });
    sessionId = session?.id ?? '';

    await database.db
      .insert(workflowState)
      .values({ sessionId, stage: 'constitution', substage: 'review' });

    const [file] = await database.db
      .insert(specFiles)
      .values({ projectId, specType: 'constitution', fileName: 'constitution.md' })
      .returning({ id: specFiles.id });
    specFileId = file?.id ?? '';

    const [revision] = await database.db
      .insert(specRevisions)
      .values({
        specFileId,
        revisionNumber: 1,
        content: '# Constitution\n\n## Purpose\n\nText.',
        approved: true,
      })
      .returning({ id: specRevisions.id });
    revisionId = revision?.id ?? '';

    const [review] = await database.db
      .insert(reviewFeedback)
      .values({
        specRevisionId: revisionId,
        outcome: 'needs_revision',
        items: [
          {
            id: 'mf-1',
            section: 'Purpose',
            line: 3,
            confidenceScore: 9,
            description: 'Untestable.',
            suggestion: 'Restate it.',
            severity: 'blocking',
          },
          {
            id: 'rec-1',
            section: 'Purpose',
            line: 4,
            confidenceScore: 6,
            description: 'Could use an example.',
            suggestion: 'Add one.',
            severity: 'advisory',
          },
        ],
      })
      .returning({ id: reviewFeedback.id });
    reviewId = review?.id ?? '';

    vi.mocked(currentOwnerScope).mockResolvedValue(OwnerScope.forAuthenticatedUser(ownerId));
  });

  describe('ownership and validation', () => {
    it('answers 401 when unauthenticated', async () => {
      vi.mocked(currentOwnerScope).mockResolvedValue(null);

      expect((await post(reviewId, { decision: 'accept' })).status).toBe(401);
    });

    it("answers 404 for another user's review — indistinguishable from a missing one (AR-2)", async () => {
      const [stranger] = await database.db
        .insert(users)
        .values({ email: 'stranger@example.test' })
        .returning({ id: users.id });
      vi.mocked(currentOwnerScope).mockResolvedValue(
        OwnerScope.forAuthenticatedUser(stranger?.id ?? ''),
      );

      const owned = await post(reviewId, { decision: 'accept' });
      const missing = await post('11111111-2222-3333-4444-555555555555', {
        decision: 'accept',
      });

      expect(owned.status).toBe(404);
      expect(await asJson(owned)).toEqual(await asJson(missing));
    });

    it('answers 422 for a decision outside the three the board offers', async () => {
      expect((await post(reviewId, { decision: 'approve' })).status).toBe(422);
      expect((await post(reviewId, {})).status).toBe(422);
    });
  });

  describe('AC-2 — request-changes without a selected item is rejected by validation', () => {
    it('refuses an omitted selection', async () => {
      const response = await post(reviewId, { decision: 'request_changes' });

      expect(response.status).toBe(422);
      const body = await asJson(response);
      expect(JSON.stringify(body)).toMatch(/at least one selected feedback item/);
    });

    it('refuses an empty selection', async () => {
      const response = await post(reviewId, {
        decision: 'request_changes',
        selectedItemIds: [],
      });

      expect(response.status).toBe(422);
    });

    it('refuses a selection naming an item this review does not contain', async () => {
      const response = await post(reviewId, {
        decision: 'request_changes',
        selectedItemIds: ['mf-1', 'not-a-real-item'],
      });

      expect(response.status).toBe(422);
      expect(JSON.stringify(await asJson(response))).toMatch(/unknown feedback item/);
    });

    it('writes nothing when validation refuses', async () => {
      await post(reviewId, { decision: 'request_changes' });

      const [row] = await database.db
        .select()
        .from(reviewFeedback)
        .where(eq(reviewFeedback.id, reviewId));

      expect(row?.decision).toBeNull();
      expect(row?.decidedAt).toBeNull();
    });
  });

  describe('AC-1 — accept or ignore satisfies reviewGate for the stage', () => {
    it('leaves the gate closed while the review is pending', async () => {
      const assembled = await snapshot();

      expect(assembled?.snapshot.reviewDecided.constitution).toBe(false);
    });

    for (const decision of ['accept', 'ignore'] as const) {
      it(`opens the gate on ${decision}, and stores no selection`, async () => {
        const response = await post(reviewId, { decision });

        expect(response.status).toBe(200);
        expect(await asJson(response)).toMatchObject({ decision, returnedToGenerate: false });

        const [row] = await database.db
          .select()
          .from(reviewFeedback)
          .where(eq(reviewFeedback.id, reviewId));
        expect(row?.decision).toBe(decision);
        expect(row?.selectedItemIds).toBeNull();
        expect(row?.decidedAt).not.toBeNull();

        const assembled = await snapshot();
        expect(assembled?.snapshot.reviewDecided.constitution).toBe(true);
      });
    }

    it('does not advance the session by itself — deciding and moving stay separate', async () => {
      await post(reviewId, { decision: 'accept' });

      const [state] = await database.db
        .select()
        .from(workflowState)
        .where(eq(workflowState.sessionId, sessionId));

      expect(state?.stage).toBe('constitution');
      expect(state?.substage).toBe('review');
    });

    it('leaves other stages undecided — the flag is per file', async () => {
      await post(reviewId, { decision: 'accept' });

      const assembled = await snapshot();

      expect(assembled?.snapshot.reviewDecided.requirements).toBe(false);
      expect(assembled?.snapshot.reviewDecided.solution).toBe(false);
    });

    it('refuses a second decision rather than overwriting the first', async () => {
      await post(reviewId, { decision: 'accept' });

      const second = await post(reviewId, { decision: 'ignore' });

      expect(second.status).toBe(409);
      const [row] = await database.db
        .select()
        .from(reviewFeedback)
        .where(eq(reviewFeedback.id, reviewId));
      expect(row?.decision).toBe('accept');
    });
  });

  describe('request-changes returns the stage to generate (FR-010 AC-6)', () => {
    it('applies the backward transition and records the selection', async () => {
      const response = await post(reviewId, {
        decision: 'request_changes',
        selectedItemIds: ['rec-1'],
      });

      expect(response.status).toBe(200);
      expect(await asJson(response)).toMatchObject({ returnedToGenerate: true });

      const [state] = await database.db
        .select()
        .from(workflowState)
        .where(eq(workflowState.sessionId, sessionId));
      expect(state?.substage).toBe('generate');

      const [row] = await database.db
        .select()
        .from(reviewFeedback)
        .where(eq(reviewFeedback.id, reviewId));
      expect(row?.selectedItemIds).toEqual(['rec-1']);
    });

    it('stores only the ticked subset, not every item (FR-010 AC-7)', async () => {
      await post(reviewId, { decision: 'request_changes', selectedItemIds: ['mf-1'] });

      const [row] = await database.db
        .select()
        .from(reviewFeedback)
        .where(eq(reviewFeedback.id, reviewId));

      expect(row?.selectedItemIds).toEqual(['mf-1']);
    });

    it('does not open the gate — request-changes is not an advancing decision', async () => {
      await post(reviewId, { decision: 'request_changes', selectedItemIds: ['mf-1'] });

      const assembled = await snapshot();

      expect(assembled?.snapshot.reviewDecided.constitution).toBe(false);
    });
  });

  /**
   * Task 57, where it actually bites: the ticked subset has to survive the round trip from the
   * board, through storage, into the next generation's context. The agent-level tests prove the
   * filter; this proves the plumbing that feeds it, which is the half that would fail silently.
   */
  describe('the selection reaches the revision context (FR-010 AC-6/AC-7)', () => {
    const sourcesFor = () =>
      collectContextSources(database.db, OwnerScope.forAuthenticatedUser(ownerId), {
        sessionId,
        projectId,
        initialPrompt: 'Build it',
        specType: 'constitution',
      });

    it('carries the review items and exactly the ticked ids', async () => {
      await post(reviewId, { decision: 'request_changes', selectedItemIds: ['rec-1'] });

      const sources = await sourcesFor();

      expect(sources.feedback?.items.map((item) => item.id).sort()).toEqual(['mf-1', 'rec-1']);
      expect(sources.feedback?.selectedIds).toEqual(['rec-1']);
    });

    it('assembles a context holding only the ticked item', async () => {
      await post(reviewId, { decision: 'request_changes', selectedItemIds: ['rec-1'] });

      const text = assembleContext(await sourcesFor()).text;

      expect(text).toContain('Could use an example.');
      expect(text).not.toContain('Untestable.');
    });

    it('carries nothing when the review was accepted rather than sent back', async () => {
      await post(reviewId, { decision: 'accept' });

      expect((await sourcesFor()).feedback).toBeUndefined();
    });

    it('carries nothing while the review is still pending', async () => {
      expect((await sourcesFor()).feedback).toBeUndefined();
    });

    it('stops applying once the revision it asked for exists', async () => {
      await post(reviewId, { decision: 'request_changes', selectedItemIds: ['rec-1'] });
      expect((await sourcesFor()).feedback).toBeDefined();

      // The next revision is the one the request produced; re-applying it to every later
      // regeneration for the rest of the stage would be a feedback item that never goes away.
      await database.db.insert(specRevisions).values({
        specFileId,
        revisionNumber: 2,
        content: '# Constitution v2\n\n## Purpose\n\nB.',
      });

      expect((await sourcesFor()).feedback).toBeUndefined();
    });
  });

  /**
   * AC-3 of task 56, walked the way the application walks it: approve, enter `review`, decide.
   *
   * Approval only *permits* the move (FR-009 AC-3); entering `review` is what produces the feedback
   * (FR-010 AC-1). So "a revised spec, once approved, triggers a fresh review" is a property of the
   * pair of steps, and each test below performs both rather than asserting on either alone.
   */
  describe('AC-3 — an approved revision triggers a fresh review of the new content', () => {
    /** Sends the stage back to `generate`, appends revision 2 and approves it. */
    async function reviseAndApprove(): Promise<string> {
      await post(reviewId, { decision: 'request_changes', selectedItemIds: ['mf-1'] });

      const [revised] = await database.db
        .insert(specRevisions)
        .values({ specFileId, revisionNumber: 2, content: '# Constitution v2\n\n## Purpose\n\nB.' })
        .returning({ id: specRevisions.id });

      await approveSpec(specFileId, 2);

      return revised?.id ?? '';
    }

    it('creates a pending review keyed to the newly approved revision', async () => {
      const revisedId = await reviseAndApprove();

      const response = await enterReview(sessionId);

      expect(response.status).toBe(200);
      expect((await asJson(response)).reviewId).toEqual(expect.any(String));

      const rows = await database.db
        .select()
        .from(reviewFeedback)
        .where(eq(reviewFeedback.specRevisionId, revisedId));

      expect(rows).toHaveLength(1);
      expect(rows[0]?.decision).toBeNull();
    });

    it('does not carry the earlier decision over to the new revision', async () => {
      await post(reviewId, { decision: 'accept' });
      expect((await snapshot())?.snapshot.reviewDecided.constitution).toBe(true);

      await database.db.insert(specRevisions).values({
        specFileId,
        revisionNumber: 2,
        content: '# Constitution v2\n\n## Purpose\n\nB.',
      });

      // The decision taken on revision 1 must not answer for revision 2 — that is exactly the
      // "advance on a review of content the user never saw" defect the assembler query avoids.
      expect((await snapshot())?.snapshot.reviewDecided.constitution).toBe(false);

      await approveSpec(specFileId, 2);
      await enterReview(sessionId);

      // A fresh review exists, and it is undecided: the gate stays shut until the user decides.
      expect((await snapshot())?.snapshot.reviewDecided.constitution).toBe(false);
    });

    it('reviews the second approval independently of the first', async () => {
      await reviseAndApprove();

      const entered = await enterReview(sessionId);
      const secondReviewId = String((await asJson(entered)).reviewId);

      expect(secondReviewId).not.toBe(reviewId);

      const decided = await post(secondReviewId, { decision: 'ignore' });
      expect(decided.status).toBe(200);
      expect((await snapshot())?.snapshot.reviewDecided.constitution).toBe(true);
    });

    it('re-entering review re-presents the same review rather than replacing it', async () => {
      // Immutable content cannot deserve two different verdicts, and the user is looking at one.
      await post(reviewId, { decision: 'request_changes', selectedItemIds: ['mf-1'] });
      await database.db.insert(specRevisions).values({
        specFileId,
        revisionNumber: 2,
        content: '# Constitution v2\n\n## Purpose\n\nB.',
      });
      await approveSpec(specFileId, 2);

      const first = String((await asJson(await enterReview(sessionId))).reviewId);
      // Step back to generate, then in again.
      await transition(
        new Request('http://test.local/api/sessions/transition', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ toStage: 'constitution', toSubstage: 'generate' }),
        }),
        { params: Promise.resolve({ id: sessionId }) },
      );
      const second = String((await asJson(await enterReview(sessionId))).reviewId);

      expect(second).toBe(first);
      expect(await database.db.select().from(reviewFeedback)).toHaveLength(2);
    });

    it('does not produce a review when entering a substage that is not review', async () => {
      const before = await database.db.select().from(reviewFeedback);

      await transition(
        new Request('http://test.local/api/sessions/transition', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ toStage: 'constitution', toSubstage: 'generate' }),
        }),
        { params: Promise.resolve({ id: sessionId }) },
      );

      expect(await database.db.select().from(reviewFeedback)).toHaveLength(before.length);
    });
  });
});
