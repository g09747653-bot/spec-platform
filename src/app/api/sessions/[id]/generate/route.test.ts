import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as EnvModule from '@/config/env';
import { OwnerScope } from '@/db/owner-scope';
import {
  attachments,
  generationChunks,
  generationRuns,
  projects,
  questionRounds,
  answers,
  sessions,
  specRevisions,
  users,
  workflowState,
} from '@/db/schema';
import { createMigratedDatabase, type TestDatabase } from '@/db/testing/migrated-database';
import { TEST_ENV } from '@/config/testing/test-env';
import { decodeEvents, type GenerationEvent } from '@/modules/web/api/stream-protocol';
import { validateStructure } from '@/modules/specs/validate-structure';

/**
 * Task 45 — the generation endpoint at the HTTP level, plus tasks 48 and 49 as they surface here.
 *
 * Real route handler, real workflow engine, real PostgreSQL. Two seams are mocked, and only two: the
 * Auth.js session and the adapter composition root — the latter is the seam that guarantees no test
 * reaches a vendor (IR-001-AC-5), and swapping it is exactly what "substitutable by a test double"
 * means.
 *
 * The order the handler enforces is what most of this asserts: the gate is consulted *before* a model
 * is constructed, so a rejected transition costs no token and issues no call.
 */
vi.mock('@/modules/projects/auth/scope', () => ({
  currentOwnerScope: vi.fn(),
  requireOwnerScope: vi.fn(),
}));

vi.mock('@/db/client', () => ({ getDatabase: vi.fn() }));

vi.mock('@/config/env', async (importOriginal) => {
  const actual = await importOriginal<typeof EnvModule>();
  return { ...actual, getEnv: () => actual.parseEnv(TEST_ENV) };
});

vi.mock('@/modules/adapters/llm/default-adapter', () => ({ createDefaultAdapter: vi.fn() }));

import { getDatabase } from '@/db/client';
import { createDefaultAdapter } from '@/modules/adapters/llm/default-adapter';
import { createFailoverClient } from '@/modules/adapters/llm/failover-client';
import { currentOwnerScope } from '@/modules/projects/auth/scope';

import { fakeChain, type FakeBehaviour } from '@/modules/adapters/llm/__tests__/provider-fakes';
import type { ProviderId } from '@/modules/adapters/llm';

import { POST } from './route';

/**
 * The stub answers the prompt, so its document carries exactly the sections the schema asked for.
 * Nothing here spells a heading out, and a schema change moves the fixture with it (constitution P3).
 */
const CONFORMANT: FakeBehaviour = { followPrompt: true };

type ChainEntry = readonly [ProviderId, FakeBehaviour];

/** Points the handler at a chain of hand-built providers. No network, no SDK, no credential. */
function useChain(...entries: ChainEntry[]): void {
  vi.mocked(createDefaultAdapter).mockReturnValue(
    createFailoverClient({ providers: fakeChain(...entries), timeoutMs: 5_000 }),
  );
}

async function readEvents(response: Response): Promise<GenerationEvent[]> {
  const text = await response.text();
  return decodeEvents(text).events;
}

function post(sessionId: string): Promise<Response> {
  return POST(new Request('http://test.local/api/sessions/generate', { method: 'POST' }), {
    params: Promise.resolve({ id: sessionId }),
  });
}

describe('POST /api/sessions/:id/generate (task 45)', () => {
  let database: TestDatabase;
  let ownerId: string;
  let sessionId: string;
  let projectId: string;

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
    vi.mocked(createDefaultAdapter).mockReset();

    const [owner] = await database.db
      .insert(users)
      .values({ email: 'owner@example.test' })
      .returning({ id: users.id });
    ownerId = owner?.id ?? '';

    const [project] = await database.db
      .insert(projects)
      .values({ ownerId, name: 'Generation API' })
      .returning({ id: projects.id });
    projectId = project?.id ?? '';

    const [session] = await database.db
      .insert(sessions)
      .values({ projectId, initialPrompt: 'A tool that writes specs', summary: 'A summary.' })
      .returning({ id: sessions.id });
    sessionId = session?.id ?? '';

    await database.db
      .insert(workflowState)
      .values({ sessionId, stage: 'interview', substage: null });

    vi.mocked(currentOwnerScope).mockResolvedValue(OwnerScope.forAuthenticatedUser(ownerId));

    useChain(['google', CONFORMANT]);
  });

  /** Moves the session to `constitution/collect` with one answered round, so the gate can open. */
  async function readyToGenerate(): Promise<void> {
    await database.db
      .update(workflowState)
      .set({ stage: 'constitution', substage: 'collect' })
      .where(eq(workflowState.sessionId, sessionId));

    const [round] = await database.db
      .insert(questionRounds)
      .values({ sessionId, stage: 'constitution', roundNumber: 1, questions: { questions: [] } })
      .returning({ id: questionRounds.id });

    await database.db
      .insert(answers)
      .values({ roundId: round?.id ?? '', questionId: 'q1', freeText: 'an answer' });
  }

  describe('the gate is checked before any model call (AC-1)', () => {
    it('refuses generation from the interview, with the machine-readable reason', async () => {
      const response = await post(sessionId);

      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({
        error: { code: 'GATE_REJECTED', details: { reason: 'TRANSITION_NOT_IN_TABLE' } },
      });
      expect(createDefaultAdapter).not.toHaveBeenCalled();
    });

    it('refuses a stage whose collection gate is unmet, and issues no call', async () => {
      await database.db
        .update(workflowState)
        .set({ stage: 'constitution', substage: 'collect' })
        .where(eq(workflowState.sessionId, sessionId));

      const response = await post(sessionId);

      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({
        error: { details: { reason: 'NO_ANSWERED_ROUND' } },
      });
      expect(createDefaultAdapter).not.toHaveBeenCalled();
    });

    it('leaves persisted state untouched when it refuses', async () => {
      await post(sessionId);

      const [state] = await database.db
        .select()
        .from(workflowState)
        .where(eq(workflowState.sessionId, sessionId));

      expect(state?.stage).toBe('interview');
      expect(await database.db.select().from(generationRuns)).toEqual([]);
    });

    it('answers 404 for another owner’s session and 401 when unauthenticated', async () => {
      const [stranger] = await database.db
        .insert(users)
        .values({ email: 'stranger@example.test' })
        .returning({ id: users.id });

      vi.mocked(currentOwnerScope).mockResolvedValue(
        OwnerScope.forAuthenticatedUser(stranger?.id ?? ''),
      );
      expect((await post(sessionId)).status).toBe(404);

      vi.mocked(currentOwnerScope).mockResolvedValue(null);
      expect((await post(sessionId)).status).toBe(401);
    });
  });

  describe('a successful run (AC-2)', () => {
    it('emits run first and complete last, and persists exactly one revision', async () => {
      await readyToGenerate();

      const response = await post(sessionId);
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('application/x-ndjson');

      const events = await readEvents(response);

      expect(events[0]?.type).toBe('run');
      expect(events.at(-1)?.type).toBe('complete');
      expect(events.some((event) => event.type === 'delta')).toBe(true);

      const revisions = await database.db.select().from(specRevisions);
      expect(revisions).toHaveLength(1);
      expect(revisions[0]?.approved).toBe(false);
      // Persisted means conformant: a document missing a required section never becomes a revision
      // (task 51; FR-008 AC-4/AC-7).
      expect(validateStructure('constitution', revisions[0]?.content ?? '').violations).toEqual([]);

      const complete = events.at(-1);
      if (complete?.type !== 'complete') throw new Error('expected a complete event');
      expect(complete.revisionNumber).toBe(1);
    });

    /**
     * Task 69 / DR-12 / FR-004 AC-11: the revision records the attachment set that existed when it
     * was generated, and it records **every** attachment — including one whose parse failed, which
     * was available to the run whether or not it contributed text.
     */
    it('records the attachment set the context was built from (AC-11)', async () => {
      await readyToGenerate();

      const [readable] = await database.db
        .insert(attachments)
        .values({
          sessionId,
          fileName: 'brief.md',
          mimeType: 'text/markdown',
          sizeBytes: 12,
          blobKey: `attachments/${ownerId}/${sessionId}/brief.md`,
          parseStatus: 'ok',
          extractedText: 'The brief.',
          attachedAtStage: 'interview',
        })
        .returning({ id: attachments.id });

      const [unreadable] = await database.db
        .insert(attachments)
        .values({
          sessionId,
          fileName: 'broken.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 40,
          blobKey: `attachments/${ownerId}/${sessionId}/broken.pdf`,
          parseStatus: 'failed',
          parseReason: 'corrupt xref table',
          attachedAtStage: 'interview',
        })
        .returning({ id: attachments.id });

      await readEvents(await post(sessionId));

      const [revision] = await database.db.select().from(specRevisions);

      expect(revision?.contextAttachmentIds).toEqual(
        expect.arrayContaining([readable?.id, unreadable?.id]),
      );
      expect(revision?.contextAttachmentIds).toHaveLength(2);
    });

    it('records an empty set when the session has no documents', async () => {
      await readyToGenerate();
      await readEvents(await post(sessionId));

      const [revision] = await database.db.select().from(specRevisions);

      expect(revision?.contextAttachmentIds).toEqual([]);
    });

    it('streams the document in order, and the deltas reassemble to it exactly', async () => {
      await readyToGenerate();
      const events = await readEvents(await post(sessionId));

      const [revision] = await database.db.select().from(specRevisions);
      const deltas = events.filter((event) => event.type === 'delta');

      expect(deltas.map((delta) => delta.sequence)).toEqual(deltas.map((_delta, index) => index));
      // What was streamed is what was stored, byte for byte — no reassembly gap, no lost chunk.
      expect(deltas.map((delta) => delta.text).join('')).toBe(revision?.content);
    });

    it('marks the run complete with the provider that served it, and prunes the chunk log', async () => {
      await readyToGenerate();
      await readEvents(await post(sessionId));

      const [run] = await database.db.select().from(generationRuns);
      expect(run?.status).toBe('complete');
      expect(run?.providerUsed).toBe('google');
      expect(run?.completedAt).not.toBeNull();
      expect(run?.firstTokenAt).not.toBeNull();

      expect(await database.db.select().from(generationChunks)).toEqual([]);
    });

    it('moves the session into generate, and a second call needs no transition (FR-018 AC-6)', async () => {
      await readyToGenerate();
      await readEvents(await post(sessionId));

      const [state] = await database.db
        .select()
        .from(workflowState)
        .where(eq(workflowState.sessionId, sessionId));
      expect(state?.substage).toBe('generate');

      // The retry path: already in `generate`, so nothing is transitioned and a second run opens.
      const events = await readEvents(await post(sessionId));
      expect(events.at(-1)?.type).toBe('complete');
      expect(await database.db.select().from(generationRuns)).toHaveLength(2);
      expect(await database.db.select().from(specRevisions)).toHaveLength(2);
    });
  });

  describe('mid-stream failover (task 48; D-9; FR-018 AC-5)', () => {
    it('emits restart and persists only the second provider’s document', async () => {
      await readyToGenerate();
      useChain(
        ['anthropic', { document: 'PARTIAL partial partial partial partial', failAfterChunks: 3 }],
        ['google', CONFORMANT],
      );

      const events = await readEvents(await post(sessionId));
      const restart = events.find((event) => event.type === 'restart');

      expect(restart).toMatchObject({ reason: 'provider_failover', attempt: 2 });

      const [revision] = await database.db.select().from(specRevisions);
      expect(revision?.content).not.toContain('PARTIAL');
      expect(validateStructure('constitution', revision?.content ?? '').valid).toBe(true);

      // Everything after the restart is numbered from zero again, so a resuming client that honours
      // the restart cannot splice the two attempts together.
      const after = events.slice(events.indexOf(restart as GenerationEvent) + 1);
      const deltas = after.filter((event) => event.type === 'delta');
      expect(deltas[0]?.sequence).toBe(0);
    });

    it('records the successful provider, not the one that died', async () => {
      await readyToGenerate();
      useChain(['anthropic', { document: 'x y z', failAfterChunks: 1 }], ['google', CONFORMANT]);

      await readEvents(await post(sessionId));

      const [run] = await database.db.select().from(generationRuns);
      expect(run?.providerUsed).toBe('google');
      expect(run?.attempt).toBe(2);
    });
  });

  describe('total failure (task 49; FR-018)', () => {
    it('emits a sanitised error, marks the run failed, and persists no revision', async () => {
      await readyToGenerate();
      useChain(
        ['anthropic', { document: 'a b c', failAfterChunks: 1 }],
        ['google', { failAfterChunks: 0 }],
      );

      const response = await post(sessionId);
      expect(response.status).toBe(200);

      const events = await readEvents(response);
      const failure = events.at(-1);

      if (failure?.type !== 'error') throw new Error('expected an error event');
      expect(failure.code).toBe('GENERATION_FAILED');
      expect(failure.retryable).toBe(true);
      for (const vendor of ['anthropic', 'google', 'openai', 'gemini', 'claude']) {
        expect(failure.message.toLowerCase()).not.toContain(vendor);
      }

      expect(await database.db.select().from(specRevisions)).toEqual([]);
      expect(await database.db.select().from(generationChunks)).toEqual([]);

      const [run] = await database.db.select().from(generationRuns);
      expect(run?.status).toBe('failed');
    });

    it('treats a structurally invalid document as a failed generation (task 51; FR-008 AC-7)', async () => {
      await readyToGenerate();
      // Well-formed prose that answers nothing the schema asked for — the shape a model produces
      // when it ignores the instruction rather than when it errors.
      useChain(['google', { document: '# Constitution\n\nSome prose and no required sections.' }]);

      const events = await readEvents(await post(sessionId));
      const failure = events.at(-1);

      if (failure?.type !== 'error') throw new Error('expected an error event');
      expect(failure.code).toBe('GENERATION_FAILED');
      expect(failure.retryable).toBe(true);

      // Not persisted, and not persisted *as anything*: no revision, approved or otherwise.
      expect(await database.db.select().from(specRevisions)).toEqual([]);

      const [run] = await database.db.select().from(generationRuns);
      expect(run?.status).toBe('failed');
    });

    it('recovers on retry once a conformant document arrives, with no duplicated stage', async () => {
      await readyToGenerate();
      useChain(['google', { document: '# Constitution\n\nNothing the schema asked for.' }]);
      await readEvents(await post(sessionId));

      useChain(['google', CONFORMANT]);
      const events = await readEvents(await post(sessionId));

      expect(events.at(-1)?.type).toBe('complete');
      expect(await database.db.select().from(specRevisions)).toHaveLength(1);
      expect(await database.db.select().from(questionRounds)).toHaveLength(1);
    });

    it('keeps the session at the same position, so retry resumes rather than restarts', async () => {
      await readyToGenerate();
      useChain(['google', { failAfterChunks: 0 }]);
      await readEvents(await post(sessionId));

      const [state] = await database.db
        .select()
        .from(workflowState)
        .where(eq(workflowState.sessionId, sessionId));

      expect(state?.stage).toBe('constitution');
      expect(state?.substage).toBe('generate');

      // Retrying from that position succeeds, with no duplicated stage and one revision.
      useChain(['google', CONFORMANT]);
      const events = await readEvents(await post(sessionId));

      expect(events.at(-1)?.type).toBe('complete');
      expect(await database.db.select().from(specRevisions)).toHaveLength(1);
      expect(await database.db.select().from(answers)).toHaveLength(1);
    });
  });
});
