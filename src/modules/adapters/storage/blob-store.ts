import { randomUUID } from 'node:crypto';

import { del, get, issueSignedToken, presignUrl, put } from '@vercel/blob';

import type { OwnerScope } from '@/db/owner-scope';

import {
  keyBelongsTo,
  ownerPrefix,
  safeKeySegment,
  StorageNotFoundError,
  type StorageStore,
  type UploadInput,
} from './types';

/**
 * Private object storage over Vercel Blob (IR-005; task 63).
 *
 * Two properties carry the acceptance criteria, and both are decided here rather than by a caller:
 *
 * 1. **`access: 'private'` on every write.** A public blob is addressable by anyone holding its URL,
 *    for as long as it exists — IR-005-AC-2 is not "the URL is hard to guess", it is "the object is
 *    not publicly addressable". Reads therefore go through a signed URL with an expiry.
 * 2. **The owner is in the key.** `attachments/<userId>/<sessionId>/<uuid>-<name>`, so the ownership
 *    check on read is a prefix test the adapter performs on itself. A key that leaked, or one supplied
 *    by a client, fails before a token is issued.
 *
 * `addRandomSuffix` is off: the key is generated here and stored on the attachment row, and a store
 * that silently renames the object would make that row point at nothing.
 */
export function createBlobStore(token: string): StorageStore {
  const options = { token } as const;

  return {
    async put(scope: OwnerScope, file: UploadInput): Promise<{ blobKey: string }> {
      const blobKey = `${ownerPrefix(scope)}${file.sessionId}/${randomUUID()}-${safeKeySegment(file.fileName)}`;

      const result = await put(blobKey, Buffer.from(file.bytes), {
        ...options,
        access: 'private',
        addRandomSuffix: false,
        contentType: file.contentType,
      });

      /*
       * The store is the authority on the pathname it actually created. Trusting the local string
       * instead would hide a rename behind a successful upload, and the row would name an object that
       * cannot be read or deleted.
       */
      return { blobKey: result.pathname };
    },

    async signedUrl(scope: OwnerScope, blobKey: string, ttlSeconds: number): Promise<string> {
      if (!keyBelongsTo(scope, blobKey)) throw new StorageNotFoundError(blobKey);

      const validUntil = Date.now() + Math.max(ttlSeconds, 1) * 1000;

      const signed = await issueSignedToken({
        ...options,
        pathname: blobKey,
        operations: ['get'],
        validUntil,
      });

      const { presignedUrl } = await presignUrl(signed, {
        ...options,
        access: 'private',
        operation: 'get',
        pathname: blobKey,
        validUntil,
      });

      return presignedUrl;
    },

    async deleteMany(blobKeys: readonly string[]): Promise<void> {
      if (blobKeys.length === 0) return;

      await del([...blobKeys], options);
    },

    async read(scope: OwnerScope, blobKey: string): Promise<Uint8Array> {
      if (!keyBelongsTo(scope, blobKey)) throw new StorageNotFoundError(blobKey);

      /*
       * Read through the read–write token rather than by minting a signed URL: a URL issued to fetch
       * one file server-side would be a credential with a lifetime, for no reason — the token is
       * already here and the bytes never leave the process.
       */
      const result = await get(blobKey, { ...options, access: 'private' });
      const stream = result?.stream ?? null;

      if (stream === null) throw new StorageNotFoundError(blobKey);

      return new Uint8Array(await new Response(stream).arrayBuffer());
    },
  };
}
