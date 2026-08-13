import { describe, expect, it } from 'vitest';

import { OwnerScope } from '@/db/owner-scope';

import { createMemoryStorage } from './memory-store';
import { keyBelongsTo, safeKeySegment, StorageNotFoundError } from './types';

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
});
