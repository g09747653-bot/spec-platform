import { describe, expect, it } from 'vitest';

import { parseEnv } from '@/config/env';
import { testEnv } from '@/config/testing/test-env';
import { OwnerScope } from '@/db/owner-scope';

import { createDefaultStorage } from './index';
import { createMemoryStorage } from './memory-store';
import { keyBelongsTo, safeKeySegment, StorageNotFoundError, type StorageStore } from './types';

/**
 * Task 63 — the storage adapter's ownership rule.
 *
 * The acceptance criterion is that a signed URL is issued **only after an ownership check** and that a
 * non-owner receives `NOT_FOUND`. The check lives in the key: the owner id is a path segment, so a key
 * that belongs to someone else fails a prefix test the adapter performs on itself, before any token is
 * minted. These tests are therefore about the rule, and they hold for the Vercel Blob store and the
 * in-memory double alike — both call the same predicate.
 */
describe('storage adapter (task 63)', () => {
  const owner = OwnerScope.forAuthenticatedUser('11111111-1111-4111-8111-111111111111');
  const stranger = OwnerScope.forAuthenticatedUser('22222222-2222-4222-8222-222222222222');

  const upload = {
    sessionId: '33333333-3333-4333-8333-333333333333',
    fileName: 'brief.pdf',
    contentType: 'application/pdf',
    bytes: new Uint8Array([1, 2, 3]),
  };

  it('puts an object under a key that names its owner and its session', async () => {
    const storage = createMemoryStorage();

    const { blobKey } = await storage.put(owner, upload);

    expect(blobKey.startsWith(`attachments/${owner.userId}/${upload.sessionId}/`)).toBe(true);
    expect(storage.keys()).toEqual([blobKey]);
    expect(storage.contentTypeOf(blobKey)).toBe('application/pdf');
  });

  it('gives two uploads of the same file distinct keys', async () => {
    const storage = createMemoryStorage();

    const first = await storage.put(owner, upload);
    const second = await storage.put(owner, upload);

    expect(first.blobKey).not.toBe(second.blobKey);
    expect(storage.keys()).toHaveLength(2);
  });

  it('issues a signed URL to the owner', async () => {
    const storage = createMemoryStorage();
    const { blobKey } = await storage.put(owner, upload);

    await expect(storage.signedUrl(owner, blobKey, 60)).resolves.toContain(
      encodeURIComponent(blobKey),
    );
  });

  it('answers NOT_FOUND when a stranger presents a key that is not theirs', async () => {
    const storage = createMemoryStorage();
    const { blobKey } = await storage.put(owner, upload);

    await expect(storage.signedUrl(stranger, blobKey, 60)).rejects.toBeInstanceOf(
      StorageNotFoundError,
    );
    await expect(storage.read(stranger, blobKey)).rejects.toBeInstanceOf(StorageNotFoundError);
  });

  it('answers NOT_FOUND for a key that never existed', async () => {
    const storage = createMemoryStorage();

    await expect(
      storage.signedUrl(owner, `attachments/${owner.userId}/session/ghost.pdf`, 60),
    ).rejects.toBeInstanceOf(StorageNotFoundError);
  });

  it('reads back exactly what was written, and deletes in bulk', async () => {
    const storage = createMemoryStorage();
    const first = await storage.put(owner, upload);
    const second = await storage.put(owner, { ...upload, fileName: 'notes.txt' });

    expect(await storage.read(owner, first.blobKey)).toEqual(upload.bytes);

    await storage.deleteMany([first.blobKey, second.blobKey]);

    expect(storage.keys()).toEqual([]);
  });

  it('tolerates an empty deletion list', async () => {
    const storage = createMemoryStorage();

    await expect(storage.deleteMany([])).resolves.toBeUndefined();
  });

  describe('key hygiene', () => {
    it('strips a user-supplied file name down to a safe path segment', () => {
      expect(safeKeySegment('../../etc/passwd')).toBe('etc-passwd');
      expect(safeKeySegment('quarterly report (final).pdf')).toBe('quarterly-report--final-.pdf');
      expect(safeKeySegment('..')).toBe('file');
      expect(safeKeySegment('')).toBe('file');
      expect(safeKeySegment('a'.repeat(200))).toHaveLength(80);
    });

    it('never lets a traversal survive into the key', async () => {
      const storage = createMemoryStorage();

      const { blobKey } = await storage.put(owner, { ...upload, fileName: '../../../secret.pdf' });

      expect(blobKey).not.toContain('..');
      expect(keyBelongsTo(owner, blobKey)).toBe(true);
      expect(keyBelongsTo(stranger, blobKey)).toBe(false);
    });
  });

  /**
   * The composition root, after `BLOB_READ_WRITE_TOKEN` became required (D-73).
   *
   * The in-process store is now reached by one value and no other. That is the whole point of the
   * change: before it, *any* environment that failed to supply a token landed here — including a
   * deployment, where the store lives for one process and an upload that returned 201 is gone by the
   * next request. `none` says it out loud; anything else is a token and gets Vercel Blob.
   *
   * Both directions are asserted, because only the pair is the guarantee. Neither case makes a call:
   * `createBlobStore` builds a client, it does not contact anything.
   */
  describe('createDefaultStorage selects on the credential (D-73)', () => {
    const isInProcess = (store: StorageStore): boolean => 'keys' in store;

    it('gives the in-process store for the stated absence, and only for it', () => {
      const local = createDefaultStorage(parseEnv(testEnv({ BLOB_READ_WRITE_TOKEN: 'none' })));

      expect(isInProcess(local)).toBe(true);
    });

    it('gives the Blob store for a real token', () => {
      const remote = createDefaultStorage(
        parseEnv(testEnv({ BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_notarealtoken' })),
      );

      expect(isInProcess(remote)).toBe(false);
    });

    it('keeps one in-process store per process, so a written object survives the next request', async () => {
      const env = parseEnv(testEnv({ BLOB_READ_WRITE_TOKEN: 'none' }));

      const writer = createDefaultStorage(env);
      const { blobKey } = await writer.put(owner, upload);

      // A second resolution — what the *next* request does — must see the same objects.
      await expect(createDefaultStorage(env).read(owner, blobKey)).resolves.toEqual(upload.bytes);
    });
  });
});
