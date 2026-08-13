import { randomUUID } from 'node:crypto';

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
 * The storage test double (IR-001-AC-5's rule, applied to storage; D-18's rule, applied to blobs).
 *
 * It is the same object graph as the real store — same keys, same ownership rule, same errors — with a
 * `Map` where the network is. That is what lets the end-to-end suite exercise the real upload route
 * without a Vercel account and without a credential in CI, and what lets a unit test assert the thing
 * SC-9 actually demands: **that `put` was never called**. A double that only checked the response body
 * could not tell a rejected upload from one that was written and then cleaned up.
 */
export interface MemoryStorage extends StorageStore {
  /** Every key currently stored. The assertion surface for "no blob was written". */
  keys(): string[];
  /** How many times `put` was entered, successful or not. */
  putCount(): number;
  contentTypeOf(blobKey: string): string | undefined;
}

export function createMemoryStorage(): MemoryStorage {
  const objects = new Map<string, { bytes: Uint8Array; contentType: string }>();
  let puts = 0;

  return {
    put(scope: OwnerScope, file: UploadInput): Promise<{ blobKey: string }> {
      puts += 1;

      const blobKey = `${ownerPrefix(scope)}${file.sessionId}/${randomUUID()}-${safeKeySegment(file.fileName)}`;
      objects.set(blobKey, { bytes: file.bytes, contentType: file.contentType });

      return Promise.resolve({ blobKey });
    },

    signedUrl(scope: OwnerScope, blobKey: string, ttlSeconds: number): Promise<string> {
      if (!keyBelongsTo(scope, blobKey) || !objects.has(blobKey)) {
        return Promise.reject(new StorageNotFoundError(blobKey));
      }

      return Promise.resolve(
        `https://storage.test/${encodeURIComponent(blobKey)}?expires=${String(ttlSeconds)}`,
      );
    },

    deleteMany(blobKeys: readonly string[]): Promise<void> {
      for (const key of blobKeys) objects.delete(key);

      return Promise.resolve();
    },

    read(scope: OwnerScope, blobKey: string): Promise<Uint8Array> {
      const stored = objects.get(blobKey);

      if (!keyBelongsTo(scope, blobKey) || stored === undefined) {
        return Promise.reject(new StorageNotFoundError(blobKey));
      }

      return Promise.resolve(stored.bytes);
    },

    keys: () => [...objects.keys()],
    putCount: () => puts,
    contentTypeOf: (blobKey) => objects.get(blobKey)?.contentType,
  };
}
