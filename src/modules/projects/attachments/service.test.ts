import { strToU8 } from 'fflate';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { OwnerScope } from '@/db/owner-scope';
import { attachments, projects, sessions, users } from '@/db/schema';
import { createMigratedDatabase, type TestDatabase } from '@/db/testing/migrated-database';
import { createExtractorRegistry, type ParsingAdapter } from '@/modules/adapters/parsing';
import { createMemoryStorage, type MemoryStorage } from '@/modules/adapters/storage';

import { createAttachmentService } from './service';

/**
 * Tasks 63–65, wired together — and the assertion SC-9 actually asks for.
 *
 * "Rejected before storage" is not observable in the guard, which is pure. It is observable here: the
 * storage double counts every entry into `put`, and a rejected upload must leave that counter at zero.
 * A test that only checked the response body would pass just as happily against an implementation that
 * wrote the blob and deleted it afterwards — which is the defect the criterion exists to forbid.
 */
describe('AttachmentService (tasks 63–65)', () => {
  let database: TestDatabase;
  let storage: MemoryStorage;
  let ownerId: string;
  let sessionId: string;
  let scope: OwnerScope;
  let strangerScope: OwnerScope;

  const limits = {
    maxBytes: 1_000,
    allowedTypes: ['application/pdf', 'text/plain', 'text/markdown', 'image/png'],
  };

  const parsing = (
    extractors: Parameters<typeof createExtractorRegistry>[0]['extractors'],
  ): ParsingAdapter =>
    createExtractorRegistry({
      extractors,
      read: (blobKey) => storage.read(scope, blobKey),
      timeoutMs: 1_000,
    });

  const defaultParsing = () =>
    parsing({
      'text/plain': (bytes) => Promise.resolve(new TextDecoder().decode(bytes)),
      'text/markdown': (bytes) => Promise.resolve(new TextDecoder().decode(bytes)),
      'image/png': () => Promise.resolve(null),
      'application/pdf': () => Promise.reject(new Error('corrupt xref table')),
    });

  const service = (parser: ParsingAdapter = defaultParsing()) =>
    createAttachmentService({ db: database.db, storage, parsing: parser, limits });

  const upload = (
    overrides: Partial<Parameters<ReturnType<typeof service>['upload']>[1]> = {},
  ) => ({
    sessionId,
    fileName: 'notes.txt',
    declaredType: 'text/plain',
    bytes: strToU8('A grounding document.'),
    attachedAtStage: 'interview',
    ...overrides,
  });

  beforeAll(async () => {
    database = await createMigratedDatabase();
  });

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    await database.db.delete(users);
    storage = createMemoryStorage();

    const [owner] = await database.db
      .insert(users)
      .values({ email: 'owner@example.test' })
      .returning({ id: users.id });
    ownerId = owner?.id ?? '';
    scope = OwnerScope.forAuthenticatedUser(ownerId);

    const [stranger] = await database.db
      .insert(users)
      .values({ email: 'stranger@example.test' })
      .returning({ id: users.id });
    strangerScope = OwnerScope.forAuthenticatedUser(stranger?.id ?? '');

    const [project] = await database.db
      .insert(projects)
      .values({ ownerId, name: 'Attachments' })
      .returning({ id: projects.id });

    const [session] = await database.db
      .insert(sessions)
      .values({ projectId: project?.id ?? '', initialPrompt: 'A tool for specs.' })
      .returning({ id: sessions.id });
    sessionId = session?.id ?? '';
  });

  it('stores, records and extracts a supported document in one pass', async () => {
    const outcome = await service().upload(scope, upload());

    expect(outcome.status).toBe('stored');
    if (outcome.status !== 'stored') return;

    expect(outcome.attachment).toMatchObject({
      fileName: 'notes.txt',
      mimeType: 'text/plain',
      sizeBytes: 21,
      parseStatus: 'ok',
      extractedText: 'A grounding document.',
      parseReason: null,
      attachedAtStage: 'interview',
    });
    expect(storage.keys()).toEqual([outcome.attachment.blobKey]);
  });

  describe('SC-9 — nothing is written before the verdict', () => {
    it('writes no blob when the file is too large', async () => {
      const outcome = await service().upload(
        scope,
        upload({ bytes: new Uint8Array(2_000).fill(0x41) }),
      );

      expect(outcome).toMatchObject({ status: 'rejected', reason: 'size' });
      expect(storage.putCount()).toBe(0);
      expect(storage.keys()).toEqual([]);
      expect(await database.db.select().from(attachments)).toHaveLength(0);
    });

    it('writes no blob when the type is unsupported, and names the supported types', async () => {
      const outcome = await service().upload(
        scope,
        upload({
          fileName: 'sheet.xlsx',
          declaredType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          bytes: strToU8('PK not really'),
        }),
      );

      expect(outcome).toMatchObject({ status: 'rejected', reason: 'type' });
      if (outcome.status === 'rejected') {
        expect(outcome.message).toContain('PDF, plain text, Markdown, PNG');
      }
      expect(storage.putCount()).toBe(0);
      expect(await database.db.select().from(attachments)).toHaveLength(0);
    });

    it('writes no blob for a file whose contents contradict its declared type', async () => {
      const outcome = await service().upload(
        scope,
        upload({ fileName: 'brief.pdf', declaredType: 'application/pdf' }),
      );

      expect(outcome).toMatchObject({ status: 'rejected', reason: 'type' });
      expect(storage.putCount()).toBe(0);
    });
  });

  describe('extraction', () => {
    it('records a parse failure with its reason and leaves the session usable', async () => {
      const pdf = new Uint8Array(40);
      pdf.set(strToU8('%PDF-1.7\n'));

      const outcome = await service().upload(
        scope,
        upload({ fileName: 'brief.pdf', declaredType: 'application/pdf', bytes: pdf }),
      );

      expect(outcome.status).toBe('stored');
      if (outcome.status !== 'stored') return;

      expect(outcome.attachment).toMatchObject({
        parseStatus: 'failed',
        parseReason: 'corrupt xref table',
        extractedText: null,
      });
      // The bytes are still there: the document is listed, just unreadable (FR-004 AC-5).
      expect(storage.keys()).toEqual([outcome.attachment.blobKey]);
    });

    it('records an image as a passthrough rather than as an empty document', async () => {
      const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);

      const outcome = await service().upload(
        scope,
        upload({ fileName: 'chart.png', declaredType: 'image/png', bytes: png }),
      );

      expect(outcome).toMatchObject({
        status: 'stored',
        attachment: { parseStatus: 'passthrough', extractedText: null, parseReason: null },
      });
    });

    /** DR-8: the text is persisted, so nothing re-parses it later. */
    it('extracts exactly once, at upload', async () => {
      const extractor = vi.fn(() => Promise.resolve('extracted once'));

      const outcome = await service(parsing({ 'text/plain': extractor })).upload(scope, upload());

      expect(extractor).toHaveBeenCalledTimes(1);
      expect(outcome).toMatchObject({ status: 'stored', attachment: { parseStatus: 'ok' } });

      const listed = await service().list(scope, sessionId);
      expect(listed[0]?.extractedText).toBe('extracted once');
      expect(extractor).toHaveBeenCalledTimes(1);
    });

    it('leaves the row in a readable state when extraction times out', async () => {
      const slow = parsing({ 'text/plain': () => new Promise<string>(() => undefined) });
      const timed = createAttachmentService({
        db: database.db,
        storage,
        parsing: createExtractorRegistry({
          extractors: { 'text/plain': () => new Promise<string>(() => undefined) },
          read: (blobKey) => storage.read(scope, blobKey),
          timeoutMs: 10,
        }),
        limits,
      });
      expect(slow).toBeDefined();

      const outcome = await timed.upload(scope, upload());

      expect(outcome).toMatchObject({
        status: 'stored',
        attachment: { parseStatus: 'failed', extractedText: null },
      });
      if (outcome.status === 'stored') {
        expect(outcome.attachment.parseReason).toContain('exceeded 10 ms');
      }
    });
  });

  describe('ownership', () => {
    it('answers NOT_FOUND for a session that is not the caller’s, and stores nothing', async () => {
      const outcome = await service().upload(strangerScope, upload());

      expect(outcome).toEqual({ status: 'not-found' });
      expect(await database.db.select().from(attachments)).toHaveLength(0);
      // The object written under the stranger's own prefix is cleaned up rather than left behind.
      expect(storage.keys()).toEqual([]);
    });

    it('does not list or remove another owner’s attachment', async () => {
      const stored = await service().upload(scope, upload());
      expect(stored.status).toBe('stored');

      expect(await service().list(strangerScope, sessionId)).toEqual([]);

      if (stored.status !== 'stored') return;
      expect(await service().remove(strangerScope, stored.attachment.id)).toBe(false);
      expect(storage.keys()).toHaveLength(1);
    });
  });

  describe('removal', () => {
    it('deletes the row and the stored object (FR-004 AC-7)', async () => {
      const stored = await service().upload(scope, upload());
      expect(stored.status).toBe('stored');
      if (stored.status !== 'stored') return;

      expect(await service().remove(scope, stored.attachment.id)).toBe(true);
      expect(await service().list(scope, sessionId)).toEqual([]);
      expect(storage.keys()).toEqual([]);
    });

    it('reports removal even when the store refuses to delete the bytes', async () => {
      const stored = await service().upload(scope, upload());
      if (stored.status !== 'stored') throw new Error('setup failed');

      const failing = createAttachmentService({
        db: database.db,
        storage: {
          ...storage,
          deleteMany: () => Promise.reject(new Error('store unavailable')),
        },
        parsing: defaultParsing(),
        limits,
      });

      expect(await failing.remove(scope, stored.attachment.id)).toBe(true);
      expect(await service().list(scope, sessionId)).toEqual([]);
    });

    it('reports false for an attachment that does not exist', async () => {
      expect(await service().remove(scope, '00000000-0000-4000-8000-000000000000')).toBe(false);
      expect(await service().remove(scope, 'not-a-uuid')).toBe(false);
    });
  });

  it('lists a session’s attachments oldest first, with the stage each arrived at', async () => {
    await service().upload(scope, upload({ fileName: 'first.txt' }));
    await service().upload(
      scope,
      upload({ fileName: 'second.md', declaredType: 'text/markdown', attachedAtStage: 'solution' }),
    );

    const listed = await service().list(scope, sessionId);

    expect(listed.map((item) => [item.fileName, item.attachedAtStage])).toEqual([
      ['first.txt', 'interview'],
      ['second.md', 'solution'],
    ]);
  });
});
