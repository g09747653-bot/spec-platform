import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as EnvModule from '@/config/env';
import { OwnerScope } from '@/db/owner-scope';
import {
  projects,
  proposedChanges,
  reviewFeedback,
  sessions,
  specFiles,
  specRevisions,
  users,
  workflowState,
} from '@/db/schema';
import { createMigratedDatabase, type TestDatabase } from '@/db/testing/migrated-database';
import { validateStructure } from '@/modules/specs/validate-structure';

/**
 * Task 62 — typing a decision instead of clicking it.
 *
 * The load-bearing criterion is "a typed approval produces the identical persisted state as
 * clicking approve", and it is not something a response body can demonstrate. So the tests run the
 * *same scenario twice* against two identical databases — once through the card's endpoint, once
 * through chat — and compare the resulting rows column by column. That is the only form of the
 * claim that could actually fail if the two paths diverged.
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
import { createDefaultAdapter } from '@/modules/adapters/llm/default-adapter';
import { currentOwnerScope } from '@/modules/projects/auth/scope';

import { POST as decideSpec } from '../../../specs/[specFileId]/decision/route';

import { POST } from './route';

const asJson = async (response: Response): Promise<Record<string, unknown>> =>
  (await response.json()) as Record<string, unknown>;

function chat(sessionId: string, text: unknown): Promise<Response> {
  return POST(
    new Request('http://test.local/api/sessions/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    }),
    { params: Promise.resolve({ id: sessionId }) },
  );
}

/** The assistant answers with a fixed sentence; decisions are the deterministic layer's business. */
const answeringAdapter = {
  generateStreaming: () =>
    Promise.resolve({
      text: 'The constitution sets the ground rules the other files must comply with.',
      providerUsed: 'stub' as const,
      attempts: 1,
    }),
};

interface Fixture {
  database: TestDatabase;
  ownerId: string;
  sessionId: string;
  specFileId: string;
}

const requiredHeadings = () =>
  validateStructure('constitution', '# Constitution')
    .violations.filter((violation) => violation.code === 'MISSING_HEADING')
    .map((violation) => ({ heading: violation.heading, level: violation.expectedLevel }));

const validDocument = (): string =>
  [
    '# Constitution',
    ...requiredHeadings().flatMap((section) => [
      '',
      `${'#'.repeat(section.level)} ${section.heading}`,
      '',
      `Content for ${section.heading}.`,
    ]),
  ].join('\n');

/** A session sitting at an unapproved revision 1 — the spec card's pending state. */
async function seed(database: TestDatabase): Promise<Fixture> {
  await database.db.delete(users);

  const [owner] = await database.db
    .insert(users)
    .values({ email: 'owner@example.test' })
    .returning({ id: users.id });
  const ownerId = owner?.id ?? '';

  const [project] = await database.db
    .insert(projects)
    .values({ ownerId, name: 'Chat decisions' })
    .returning({ id: projects.id });
  const projectId = project?.id ?? '';

  const [session] = await database.db
    .insert(sessions)
    .values({ projectId, initialPrompt: 'Build a spec tool', summary: 'Summarised.' })
    .returning({ id: sessions.id });
  const sessionId = session?.id ?? '';

  await database.db
    .insert(workflowState)
    .values({ sessionId, stage: 'constitution', substage: 'generate' });

  const [file] = await database.db
    .insert(specFiles)
    .values({ projectId, specType: 'constitution', fileName: 'constitution.md' })
    .returning({ id: specFiles.id });
  const specFileId = file?.id ?? '';

  await database.db
    .insert(specRevisions)
    .values({ specFileId, revisionNumber: 1, content: validDocument() });
  await database.db
    .update(specFiles)
    .set({ currentRevision: 1 })
    .where(eq(specFiles.id, specFileId));

  return { database, ownerId, sessionId, specFileId };
}

describe('POST /api/sessions/:id/messages (task 62)', () => {
  let database: TestDatabase;
  let fixture: Fixture;

  beforeAll(async () => {
    vi.mocked(createDefaultAdapter).mockReturnValue(answeringAdapter);
    database = await createMigratedDatabase();
    vi.mocked(getDatabase).mockReturnValue(
      database.db as unknown as ReturnType<typeof getDatabase>,
    );
  });

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    fixture = await seed(database);
    vi.mocked(getDatabase).mockReturnValue(
      database.db as unknown as ReturnType<typeof getDatabase>,
    );
    vi.mocked(currentOwnerScope).mockResolvedValue(
      OwnerScope.forAuthenticatedUser(fixture.ownerId),
    );
  });

  const revisionRows = async (db: TestDatabase) =>
    (await db.db.select().from(specRevisions)).map((row) => ({
      revisionNumber: row.revisionNumber,
      content: row.content,
      approved: row.approved,
      origin: row.origin,
      derivedFrom: row.derivedFrom,
    }));

  describe('AC-1 — a typed approval produces the identical persisted state as clicking approve', () => {
    // Explicit timeout: this boots a second PGlite instance *inside the test body*, which the
    // config's `hookTimeout` does not cover — see the note on the same pattern in `spec-revisions.test.ts`.
    it('leaves the same rows behind as the card does', async () => {
      // The chat path, on this database.
      const viaChat = await chat(fixture.sessionId, 'approve it');
      expect(viaChat.status).toBe(200);
      expect(await asJson(viaChat)).toMatchObject({
        applied: { kind: 'spec', action: 'approve' },
      });
      const chatRows = await revisionRows(database);

      // The card path, on a second database seeded identically.
      const control = await createMigratedDatabase();
      try {
        const controlFixture = await seed(control);
        vi.mocked(getDatabase).mockReturnValue(
          control.db as unknown as ReturnType<typeof getDatabase>,
        );
        vi.mocked(currentOwnerScope).mockResolvedValue(
          OwnerScope.forAuthenticatedUser(controlFixture.ownerId),
        );

        const viaCard = await decideSpec(
          new Request('http://test.local/api/specs/decision', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ decision: 'approve', revisionNumber: 1 }),
          }),
          { params: Promise.resolve({ specFileId: controlFixture.specFileId }) },
        );
        expect(viaCard.status).toBe(200);

        expect(chatRows).toEqual(await revisionRows(control));
      } finally {
        await control.close();
      }
    }, 60_000);

    it('marks the revision approved, exactly once, with no extra revision', async () => {
      await chat(fixture.sessionId, 'approve it');

      const rows = await database.db.select().from(specRevisions);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.approved).toBe(true);
    });

    it('records nothing that says the decision came from chat (AC-3)', async () => {
      await chat(fixture.sessionId, 'approve it');

      const [row] = await database.db.select().from(specRevisions);

      // Every column of the row, as stored. There is no provenance field to differ, and adding one
      // would be the thing this criterion forbids.
      expect(Object.keys(row ?? {}).sort()).toEqual(
        [
          'approved',
          'contextAttachmentIds',
          'content',
          'createdAt',
          'derivedFrom',
          'id',
          'origin',
          'revisionNumber',
          'specFileId',
        ].sort(),
      );
    });

    it('reports what is pending now, which is nothing once the spec is approved', async () => {
      const response = await chat(fixture.sessionId, 'approve it');

      expect((await asJson(response)).pendingAction).toBeNull();
    });
  });

  describe('AC-2 — an unresolved message leaves the pending card unchanged', () => {
    const UNRESOLVED = [
      'what does the constitution file do?',
      'should I approve this?',
      'maybe approve it',
      'the approve button looks odd',
    ];

    it.each(UNRESOLVED)('answers %j and applies nothing', async (text) => {
      const response = await chat(fixture.sessionId, text);

      expect(response.status).toBe(200);
      const body = await asJson(response);
      expect(body.applied).toBeNull();
      expect(body.reply).toEqual(expect.any(String));

      const rows = await database.db.select().from(specRevisions);
      expect(rows[0]?.approved).toBe(false);
    });

    it('re-states the same pending card so the client re-renders what it had', async () => {
      const before = await chat(fixture.sessionId, 'what is this file for?');

      expect((await asJson(before)).pendingAction).toMatchObject({
        kind: 'spec',
        specFileId: fixture.specFileId,
        revisionNumber: 1,
      });
    });

    it('leaves the workflow position untouched', async () => {
      await chat(fixture.sessionId, 'should I approve this?');

      const [state] = await database.db
        .select()
        .from(workflowState)
        .where(eq(workflowState.sessionId, fixture.sessionId));
      expect(state?.substage).toBe('generate');
    });
  });

  describe('the card it resolves against is the one the user is looking at', () => {
    it('routes to the review board when a review is pending', async () => {
      const [revision] = await database.db.select().from(specRevisions);
      await database.db
        .update(specRevisions)
        .set({ approved: true })
        .where(eq(specRevisions.id, revision?.id ?? ''));
      await database.db.insert(reviewFeedback).values({
        specRevisionId: revision?.id ?? '',
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
        ],
      });

      const response = await chat(fixture.sessionId, 'accept the review');

      expect(await asJson(response)).toMatchObject({
        applied: { kind: 'review', action: 'accept' },
      });

      const [row] = await database.db.select().from(reviewFeedback);
      expect(row?.decision).toBe('accept');
    });

    it('routes to the diff card when a proposal is pending, ahead of anything else', async () => {
      await database.db.insert(proposedChanges).values({
        specFileId: fixture.specFileId,
        baseRevision: 1,
        proposedContent: `${validDocument()}\n\n- An added line.\n`,
        instruction: 'Add a line.',
      });

      const response = await chat(fixture.sessionId, 'reject it');

      expect(await asJson(response)).toMatchObject({
        applied: { kind: 'diff', action: 'reject' },
      });

      const [row] = await database.db.select().from(proposedChanges);
      expect(row?.status).toBe('rejected');
      // Rejecting wrote no revision, exactly as the card's own path does not.
      expect(await database.db.select().from(specRevisions)).toHaveLength(1);
    });

    it('does not approve a spec when the pending card is a diff', async () => {
      await database.db.insert(proposedChanges).values({
        specFileId: fixture.specFileId,
        baseRevision: 1,
        proposedContent: `${validDocument()}\n\n- An added line.\n`,
        instruction: 'Add a line.',
      });

      // `approve` is not an action a diff card offers, so this must apply nothing at all (AC-3
      // of task 61), rather than falling through to the spec underneath it.
      const response = await chat(fixture.sessionId, 'approve it');

      expect((await asJson(response)).applied).toBeNull();
      const rows = await database.db.select().from(specRevisions);
      expect(rows[0]?.approved).toBe(false);
    });
  });

  describe('ownership and validation', () => {
    it('answers 401 when unauthenticated', async () => {
      vi.mocked(currentOwnerScope).mockResolvedValue(null);

      expect((await chat(fixture.sessionId, 'approve it')).status).toBe(401);
    });

    it("answers 404 for another user's session (AR-2)", async () => {
      const [stranger] = await database.db
        .insert(users)
        .values({ email: 'stranger@example.test' })
        .returning({ id: users.id });
      vi.mocked(currentOwnerScope).mockResolvedValue(
        OwnerScope.forAuthenticatedUser(stranger?.id ?? ''),
      );

      expect((await chat(fixture.sessionId, 'approve it')).status).toBe(404);

      const rows = await database.db.select().from(specRevisions);
      expect(rows[0]?.approved).toBe(false);
    });

    it('rejects an empty or oversized message', async () => {
      expect((await chat(fixture.sessionId, '   ')).status).toBe(422);
      expect((await chat(fixture.sessionId, 'x'.repeat(8_001))).status).toBe(422);
      expect((await chat(fixture.sessionId, 42)).status).toBe(422);
    });

    it('answers a message when nothing is pending, without inventing a decision', async () => {
      await database.db.update(specRevisions).set({ approved: true });

      const response = await chat(fixture.sessionId, 'approve it');

      expect(response.status).toBe(200);
      const body = await asJson(response);
      expect(body.applied).toBeNull();
      expect(body.pendingAction).toBeNull();
    });
  });
});
