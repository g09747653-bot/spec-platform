import { strToU8 } from 'fflate';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as EnvModule from '@/config/env';
import { OwnerScope } from '@/db/owner-scope';
import { attachments, projects, sessions, users, workflowState } from '@/db/schema';
import { createMigratedDatabase, type TestDatabase } from '@/db/testing/migrated-database';

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
    getEnv: () => actual.parseEnv({ ...TEST_ENV, MAX_UPLOAD_BYTES: '4096' }),
  };
});

import { getDatabase } from '@/db/client';
import { currentOwnerScope } from '@/modules/projects/auth/scope';

import { DELETE } from '../../../attachments/[id]/route';
import { POST } from './route';

/**
 * The upload and removal endpoints, end to end over the real service (task 68; FR-004).
 *
 * No storage adapter is mocked: with no `BLOB_READ_WRITE_TOKEN` in the test environment the
 * composition root resolves to the in-memory store, which is the same object graph as Vercel Blob
 * with a `Map` where the network is. So these tests exercise the production wiring — guard, store,
 * row, extractor — rather than a stand-in for it.
 */
const asJson = async (response: Response): Promise<Record<string, unknown>> =>
  (await response.json()) as Record<string, unknown>;

function upload(
  sessionId: string,
  file: { name: string; type: string; bytes: Uint8Array },
): Promise<Response> {
  const body = new FormData();
  body.append('file', new File([file.bytes as BlobPart], file.name, { type: file.type }));

  return POST(new Request('http://test.local/attachments', { method: 'POST', body }), {
    params: Promise.resolve({ id: sessionId }),
  });
}

describe('POST /api/sessions/:id/attachments', () => {
  let database: TestDatabase;
  let ownerId: string;
  let strangerId: string;
  let sessionId: string;

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

    const [stranger] = await database.db
      .insert(users)
      .values({ email: 'stranger@example.test' })
      .returning({ id: users.id });
    strangerId = stranger?.id ?? '';

    const [project] = await database.db
      .insert(projects)
      .values({ ownerId, name: 'Documents' })
      .returning({ id: projects.id });
    const [session] = await database.db
      .insert(sessions)
      .values({ projectId: project?.id ?? '', initialPrompt: 'Build a spec platform' })
      .returning({ id: sessions.id });
    sessionId = session?.id ?? '';

    await database.db
      .insert(workflowState)
      .values({ sessionId, stage: 'solution', substage: 'collect' });

    vi.mocked(currentOwnerScope).mockResolvedValue(OwnerScope.forAuthenticatedUser(ownerId));
  });

  it('stores a Markdown document and records the stage it arrived at', async () => {
    const response = await upload(sessionId, {
      name: 'notes.md',
      type: 'text/markdown',
      bytes: strToU8('# Constraints\n\nMust run on Postgres.\n'),
    });

    expect(response.status).toBe(201);
    expect(await asJson(response)).toMatchObject({
      attachment: {
        fileName: 'notes.md',
        mimeType: 'text/markdown',
        parseStatus: 'ok',
        extractedText: '# Constraints\n\nMust run on Postgres.\n',
        // FR-004 AC-2: attached mid-session, at the stage the session is actually in.
        attachedAtStage: 'solution',
      },
    });
  });

  describe('rejections carry the status the error table gives them', () => {
    it('answers 413 for a file over the limit, naming it, and stores nothing', async () => {
      const response = await upload(sessionId, {
        name: 'huge.txt',
        type: 'text/plain',
        bytes: new Uint8Array(8_000).fill(0x41),
      });

      expect(response.status).toBe(413);
      const body = await asJson(response);
      expect(body).toMatchObject({ error: { code: 'UPLOAD_REJECTED' } });
      expect(JSON.stringify(body)).toContain('MB upload limit');
      expect(await database.db.select().from(attachments)).toHaveLength(0);
    });

    it('answers 415 for an unsupported type, naming the supported ones', async () => {
      const response = await upload(sessionId, {
        name: 'archive.zip',
        type: 'application/zip',
        bytes: new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00]),
      });

      expect(response.status).toBe(415);
      expect(JSON.stringify(await asJson(response))).toContain('PDF');
      expect(await database.db.select().from(attachments)).toHaveLength(0);
    });

    it('answers 422 when the request carries no file part', async () => {
      const response = await POST(
        new Request('http://test.local/attachments', { method: 'POST', body: new FormData() }),
        { params: Promise.resolve({ id: sessionId }) },
      );

      expect(response.status).toBe(422);
    });
  });

  describe('ownership', () => {
    it('answers 401 when nobody is signed in', async () => {
      vi.mocked(currentOwnerScope).mockResolvedValue(null);

      const response = await upload(sessionId, {
        name: 'notes.md',
        type: 'text/markdown',
        bytes: strToU8('# x'),
      });

      expect(response.status).toBe(401);
    });

    it("answers 404 for someone else's session, and stores nothing", async () => {
      vi.mocked(currentOwnerScope).mockResolvedValue(OwnerScope.forAuthenticatedUser(strangerId));

      const response = await upload(sessionId, {
        name: 'notes.md',
        type: 'text/markdown',
        bytes: strToU8('# x'),
      });

      expect(response.status).toBe(404);
      expect(await database.db.select().from(attachments)).toHaveLength(0);
    });
  });

  describe('DELETE /api/attachments/:id', () => {
    const remove = (id: string): Promise<Response> =>
      DELETE(new Request('http://test.local/attachments', { method: 'DELETE' }), {
        params: Promise.resolve({ id }),
      });

    it('removes the attachment and answers 204', async () => {
      const created = await asJson(
        await upload(sessionId, {
          name: 'notes.md',
          type: 'text/markdown',
          bytes: strToU8('# x'),
        }),
      );
      const attachment = created.attachment as { id: string };

      expect((await remove(attachment.id)).status).toBe(204);
      expect(await database.db.select().from(attachments)).toHaveLength(0);
    });

    it("answers 404 for someone else's attachment, and removes nothing", async () => {
      const created = await asJson(
        await upload(sessionId, {
          name: 'notes.md',
          type: 'text/markdown',
          bytes: strToU8('# x'),
        }),
      );
      const attachment = created.attachment as { id: string };

      vi.mocked(currentOwnerScope).mockResolvedValue(OwnerScope.forAuthenticatedUser(strangerId));

      expect((await remove(attachment.id)).status).toBe(404);
      expect(await database.db.select().from(attachments)).toHaveLength(1);
    });

    it('answers 404 for an id that never existed', async () => {
      expect((await remove('00000000-0000-4000-8000-000000000000')).status).toBe(404);
      expect((await remove('not-a-uuid')).status).toBe(404);
    });
  });
});
