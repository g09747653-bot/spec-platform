import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { OwnerScope } from '@/db/owner-scope';
import {
  generationChunks,
  generationRuns,
  projects,
  sessions,
  specFiles,
  specRevisions,
  users,
  workflowState,
} from '@/db/schema';
import { createMigratedDatabase, type TestDatabase } from '@/db/testing/migrated-database';
import { decodeEvents, type GenerationEvent } from '@/modules/web/api/stream-protocol';

/**
 * Task 47 — resume.
 *
 * The three claims worth proving are the three the acceptance criteria name, and each of them is a
 * property a user would notice: another owner's run is indistinguishable from one that never existed,
 * a reconnect gets exactly what it has not seen, and a run that already finished says so at once
 * instead of hanging on a stream that will never speak again.
 */
vi.mock('@/modules/projects/auth/scope', () => ({
  currentOwnerScope: vi.fn(),
  requireOwnerScope: vi.fn(),
}));

vi.mock('@/db/client', () => ({ getDatabase: vi.fn() }));

import { getDatabase } from '@/db/client';
import { currentOwnerScope } from '@/modules/projects/auth/scope';

import { GET } from './route';

function get(runId: string, query = ''): Promise<Response> {
  return GET(new Request(`http://test.local/api/generations/${runId}/stream${query}`), {
    params: Promise.resolve({ runId }),
  });
}

/** Reads whole events from a stream, stopping once `count` have arrived, then cancels. */
async function readEvents(response: Response, count = Number.POSITIVE_INFINITY) {
  const reader = response.body?.getReader();
  if (reader === undefined) return [];

  const decoder = new TextDecoder();
  const events: GenerationEvent[] = [];
  let buffer = '';

  while (events.length < count) {
    const { done, value } = await reader.read();

    if (value !== undefined) {
      buffer += decoder.decode(value, { stream: true });
      const decoded = decodeEvents(buffer);
      buffer = decoded.rest;
      events.push(...decoded.events);
    }

    if (done) break;
  }

  await reader.cancel().catch(() => undefined);
  return events;
}

describe('GET /api/generations/:runId/stream (task 47)', () => {
  let database: TestDatabase;
  let ownerId: string;
  let sessionId: string;
  let projectId: string;
  let runId: string;

  beforeAll(async () => {
    database = await createMigratedDatabase();
    vi.mocked(getDatabase).mockReturnValue(
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
      .values({ ownerId, name: 'Resume API' })
      .returning({ id: projects.id });
    projectId = project?.id ?? '';

    const [session] = await database.db
      .insert(sessions)
      .values({ projectId, initialPrompt: 'A tool that writes specs' })
      .returning({ id: sessions.id });
    sessionId = session?.id ?? '';

    await database.db
      .insert(workflowState)
      .values({ sessionId, stage: 'constitution', substage: 'generate' });

    const [run] = await database.db
      .insert(generationRuns)
      .values({ sessionId, stage: 'constitution' })
      .returning({ id: generationRuns.id });
    runId = run?.id ?? '';

    vi.mocked(currentOwnerScope).mockResolvedValue(OwnerScope.forAuthenticatedUser(ownerId));
  });

  async function addChunks(...deltas: string[]): Promise<void> {
    await database.db
      .insert(generationChunks)
      .values(deltas.map((delta, sequence) => ({ runId, sequence, delta })));
  }

  async function completeRun(): Promise<void> {
    const [file] = await database.db
      .insert(specFiles)
      .values({
        projectId,
        specType: 'constitution',
        fileName: 'constitution.md',
        currentRevision: 1,
      })
      .returning({ id: specFiles.id });

    await database.db
      .insert(specRevisions)
      .values({ specFileId: file?.id ?? '', revisionNumber: 1, content: '# Constitution\n' });

    await database.db
      .update(generationRuns)
      .set({ status: 'complete', providerUsed: 'google', completedAt: new Date() })
      .where(eq(generationRuns.id, runId));
  }

  describe('ownership is settled before anything is replayed (AC-1)', () => {
    it('answers 404 for another user’s run, exactly as for one that does not exist', async () => {
      await addChunks('secret text');

      const [stranger] = await database.db
        .insert(users)
        .values({ email: 'stranger@example.test' })
        .returning({ id: users.id });
      vi.mocked(currentOwnerScope).mockResolvedValue(
        OwnerScope.forAuthenticatedUser(stranger?.id ?? ''),
      );

      const foreign = await get(runId);
      const missing = await get('11111111-2222-3333-4444-555555555555');

      expect(foreign.status).toBe(404);
      expect(missing.status).toBe(404);
      expect(await foreign.text()).toBe(await missing.text());
    });

    it('answers 404 for a malformed run id rather than leaking a parse error', async () => {
      expect((await get('not-a-uuid')).status).toBe(404);
    });

    it('answers 401 when there is no session at all', async () => {
      vi.mocked(currentOwnerScope).mockResolvedValue(null);
      expect((await get(runId)).status).toBe(401);
    });
  });

  describe('replay (AC-2)', () => {
    it('sends only what the client has not rendered', async () => {
      await addChunks('one ', 'two ', 'three ', 'four');
      await completeRun();

      const events = await readEvents(await get(runId, '?from=1&attempt=1'));
      const deltas = events.filter((event) => event.type === 'delta');

      expect(deltas.map((delta) => delta.sequence)).toEqual([2, 3]);
      expect(deltas.map((delta) => delta.text).join('')).toBe('three four');
    });

    it('sends everything when the client has rendered nothing', async () => {
      await addChunks('one ', 'two');
      await completeRun();

      const events = await readEvents(await get(runId, '?from=-1'));
      const deltas = events.filter((event) => event.type === 'delta');

      expect(deltas.map((delta) => delta.text).join('')).toBe('one two');
    });

    it('treats a missing or nonsense cursor as "I have nothing"', async () => {
      await addChunks('one ', 'two');
      await completeRun();

      for (const query of ['', '?from=', '?from=banana']) {
        const events = await readEvents(await get(runId, query));
        expect(events.filter((event) => event.type === 'delta')).toHaveLength(2);
      }
    });

    it('opens with the run event, so the client learns the attempt it is reading', async () => {
      await addChunks('text');
      await completeRun();

      const [first] = await readEvents(await get(runId));

      expect(first).toMatchObject({ type: 'run', runId, stage: 'constitution', attempt: 1 });
    });
  });

  describe('a run that has moved on', () => {
    it('tells a client resuming an abandoned attempt to discard what it rendered (D-9)', async () => {
      await database.db
        .update(generationRuns)
        .set({ status: 'restarted', attempt: 2 })
        .where(eq(generationRuns.id, runId));
      await addChunks('the second attempt');
      await completeRun();

      const events = await readEvents(await get(runId, '?from=5&attempt=1'));

      expect(events[1]).toMatchObject({ type: 'restart', attempt: 2 });
      // And the replay starts again from the beginning of the new attempt.
      const deltas = events.filter((event) => event.type === 'delta');
      expect(deltas.map((delta) => delta.sequence)).toEqual([0]);
    });

    it('does not cry restart at a client that is already on the current attempt', async () => {
      await database.db
        .update(generationRuns)
        .set({ status: 'restarted', attempt: 2 })
        .where(eq(generationRuns.id, runId));
      await addChunks('a ', 'b');
      await completeRun();

      const events = await readEvents(await get(runId, '?from=0&attempt=2'));

      expect(events.some((event) => event.type === 'restart')).toBe(false);
      expect(events.filter((event) => event.type === 'delta')).toHaveLength(1);
    });
  });

  describe('a run that has finished (AC-3)', () => {
    it('answers complete immediately, with the card the user must decide on', async () => {
      await completeRun();

      const events = await readEvents(await get(runId));
      const complete = events.at(-1);

      if (complete?.type !== 'complete') throw new Error('expected a complete event');
      expect(complete.revisionNumber).toBe(1);
      expect(events.some((event) => event.type === 'delta')).toBe(false);
    });

    it('reports a failed run as a retryable error rather than an empty stream', async () => {
      await database.db
        .update(generationRuns)
        .set({ status: 'failed' })
        .where(eq(generationRuns.id, runId));

      const events = await readEvents(await get(runId));
      const failure = events.at(-1);

      if (failure?.type !== 'error') throw new Error('expected an error event');
      expect(failure.code).toBe('GENERATION_FAILED');
      expect(failure.retryable).toBe(true);
      expect(failure.message.toLowerCase()).not.toContain('google');
    });
  });

  describe('a run still in flight', () => {
    it('replays what exists and then follows, rather than closing the stream', async () => {
      await addChunks('so far ');

      const response = await get(runId, '?from=-1');
      // Two events: `run`, then the one batch that exists. The stream stays open after them, which is
      // what "attach to the live stream" means when the writer is a different invocation (D-15).
      const events = await readEvents(response, 2);

      expect(events.map((event) => event.type)).toEqual(['run', 'delta']);
    });
  });
});
