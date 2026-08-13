import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as EnvModule from '@/config/env';
import { OwnerScope } from '@/db/owner-scope';
import { projects, sessions, specFiles, specRevisions, users, workflowState } from '@/db/schema';
import { createMigratedDatabase, type TestDatabase } from '@/db/testing/migrated-database';

/**
 * Task 29 — the transition endpoint at the HTTP level.
 *
 * The two seams a unit test cannot carry — the Auth.js session and the process-wide database
 * handle — are mocked; everything else is the real code path: the real route handler, the real
 * engine, a real PostgreSQL instance. What is asserted is the task's own acceptance criteria: an
 * out-of-order transition answers 409 **carrying the machine-readable reason**, and a rejection
 * never advances persisted state.
 */
vi.mock('@/modules/projects/auth/scope', () => ({
  currentOwnerScope: vi.fn(),
  requireOwnerScope: vi.fn(),
}));

vi.mock('@/db/client', () => ({ getDatabase: vi.fn() }));

import { TEST_ENV } from '@/config/testing/test-env';

vi.mock('@/config/env', async (importOriginal) => {
  const actual = await importOriginal<typeof EnvModule>();

  return {
    ...actual,
    // A real, fully-parsed Env — no partial casts — with the values this route reads.
    getEnv: () => actual.parseEnv(TEST_ENV),
  };
});

import { getDatabase } from '@/db/client';
import { currentOwnerScope } from '@/modules/projects/auth/scope';

import { POST } from './route';

const asJson = async (response: Response): Promise<Record<string, unknown>> =>
  (await response.json()) as Record<string, unknown>;

function post(sessionId: string, body: unknown): Promise<Response> {
  return POST(
    new Request('http://test.local/api/sessions/transition', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: sessionId }) },
  );
}

describe('POST /api/sessions/:id/transition (task 29)', () => {
  let database: TestDatabase;
  let ownerId: string;
  let sessionId: string;
  let projectId: string;

  beforeAll(async () => {
    database = await createMigratedDatabase();
    vi.mocked(getDatabase).mockReturnValue(
      // The route needs any Drizzle handle over this schema; the test hands it the PGlite one.
      database.db as unknown as ReturnType<typeof getDatabase>,
    );
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
      .values({ ownerId, name: 'Transition API' })
      .returning({ id: projects.id });
    projectId = project?.id ?? '';

    const [session] = await database.db
      .insert(sessions)
      .values({ projectId, initialPrompt: 'Build it', summary: 'Summarised.' })
      .returning({ id: sessions.id });
    sessionId = session?.id ?? '';

    await database.db.insert(workflowState).values({ sessionId, stage: 'interview' });

    vi.mocked(currentOwnerScope).mockResolvedValue(OwnerScope.forAuthenticatedUser(ownerId));
  });

  it('answers 401 when unauthenticated, revealing nothing', async () => {
    vi.mocked(currentOwnerScope).mockResolvedValue(null);

    const response = await post(sessionId, { toStage: 'constitution', toSubstage: 'collect' });

    expect(response.status).toBe(401);
  });

  it("answers 404 for another user's session — indistinguishable from a missing one (AR-2)", async () => {
    const [stranger] = await database.db
      .insert(users)
      .values({ email: 'stranger@example.test' })
      .returning({ id: users.id });
    vi.mocked(currentOwnerScope).mockResolvedValue(
      OwnerScope.forAuthenticatedUser(stranger?.id ?? ''),
    );

    const response = await post(sessionId, { toStage: 'constitution', toSubstage: 'collect' });

    expect(response.status).toBe(404);
  });

  it('rejects a malformed body and a substage-less spec-stage target with 422', async () => {
    expect((await post(sessionId, { toStage: 'nowhere' })).status).toBe(422);
    expect((await post(sessionId, { toStage: 'constitution' })).status).toBe(422);
    expect((await post(sessionId, { toStage: 'complete', toSubstage: 'collect' })).status).toBe(
      422,
    );
  });

  it('answers an out-of-order transition with 409 and the unmet gate reason (AC-1)', async () => {
    // Interview exit: grounding and summary exist, but no round has been answered.
    const response = await post(sessionId, { toStage: 'constitution', toSubstage: 'collect' });

    expect(response.status).toBe(409);
    const body = await asJson(response);
    expect(body).toMatchObject({
      error: {
        code: 'GATE_REJECTED',
        details: { reason: 'INTERVIEW_INCOMPLETE', unmet: ['answered-round'] },
      },
    });

    // AC-2: the rejection advanced nothing.
    const [state] = await database.db
      .select({ stage: workflowState.stage, version: workflowState.version })
      .from(workflowState)
      .where(eq(workflowState.sessionId, sessionId));
    expect(state).toEqual({ stage: 'interview', version: 1 });
  });

  it('maps CAPABILITY_NOT_REGISTERED to its own error code (solution.md error table)', async () => {
    await database.db
      .update(workflowState)
      .set({ stage: 'complete', substage: null })
      .where(eq(workflowState.sessionId, sessionId));
    await database.db
      .update(sessions)
      .set({ qualityEnabled: true })
      .where(eq(sessions.id, sessionId));

    const response = await post(sessionId, { toStage: 'quality', toSubstage: 'collect' });

    expect(response.status).toBe(409);
    expect(await asJson(response)).toMatchObject({
      error: {
        code: 'CAPABILITY_NOT_REGISTERED',
        details: { reason: 'CAPABILITY_NOT_REGISTERED' },
      },
    });
  });

  it('applies a permitted transition, returns the new position, and touches the project', async () => {
    await database.db
      .update(workflowState)
      .set({ stage: 'constitution', substage: 'generate' })
      .where(eq(workflowState.sessionId, sessionId));

    const [file] = await database.db
      .insert(specFiles)
      .values({ projectId, specType: 'constitution', fileName: 'constitution.md' })
      .returning({ id: specFiles.id });
    const [revision] = await database.db
      .insert(specRevisions)
      .values({ specFileId: file?.id ?? '', revisionNumber: 1, content: '# C' })
      .returning({ id: specRevisions.id });
    await database.db
      .update(specRevisions)
      .set({ approved: true })
      .where(eq(specRevisions.id, revision?.id ?? ''));

    const before = await database.db
      .select({ updatedAt: projects.updatedAt })
      .from(projects)
      .where(eq(projects.id, projectId));

    const response = await post(sessionId, { toStage: 'constitution', toSubstage: 'review' });

    expect(response.status).toBe(200);
    expect(await asJson(response)).toEqual({
      stage: 'constitution',
      substage: 'review',
      version: 2,
    });

    const after = await database.db
      .select({ updatedAt: projects.updatedAt })
      .from(projects)
      .where(eq(projects.id, projectId));
    expect(after[0]?.updatedAt.getTime() ?? 0).toBeGreaterThanOrEqual(
      before[0]?.updatedAt.getTime() ?? Number.POSITIVE_INFINITY,
    );
  });

  it('surfaces a version race as 409 CONFLICT', async () => {
    // The state moved between the read and the write: simulated by bumping the version after the
    // route has been given a stale world — here simply by racing two identical requests.
    await database.db
      .update(workflowState)
      .set({ stage: 'constitution', substage: 'generate' })
      .where(eq(workflowState.sessionId, sessionId));

    const [file] = await database.db
      .insert(specFiles)
      .values({ projectId, specType: 'constitution', fileName: 'constitution.md' })
      .returning({ id: specFiles.id });
    const [revision] = await database.db
      .insert(specRevisions)
      .values({ specFileId: file?.id ?? '', revisionNumber: 1, content: '# C' })
      .returning({ id: specRevisions.id });
    await database.db
      .update(specRevisions)
      .set({ approved: true })
      .where(eq(specRevisions.id, revision?.id ?? ''));

    const target = { toStage: 'constitution', toSubstage: 'review' };
    const [first, second] = await Promise.all([post(sessionId, target), post(sessionId, target)]);

    const statuses = [first.status, second.status].sort((a, b) => a - b);
    expect(statuses).toEqual([200, 409]);

    const conflict = first.status === 409 ? first : second;
    expect(await asJson(conflict)).toMatchObject({ error: { code: 'CONFLICT' } });
  });
});
