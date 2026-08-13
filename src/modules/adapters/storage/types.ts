import type { OwnerScope } from '@/db/owner-scope';

/**
 * The storage contract (solution.md — `adapters/storage`; IR-005; task 63).
 *
 * Three operations and no read-by-URL among them: a stored object is reached through a short-lived
 * signed URL issued after an ownership check, never through an address a client can guess or keep
 * (IR-005-AC-2).
 */
export interface UploadInput {
  sessionId: string;
  fileName: string;
  /** The sniffed content type. The upload guard has already refused everything else (task 64). */
  contentType: string;
  bytes: Uint8Array;
}

export interface StorageAdapter {
  put(scope: OwnerScope, file: UploadInput): Promise<{ blobKey: string }>;
  signedUrl(scope: OwnerScope, blobKey: string, ttlSeconds: number): Promise<string>;
  deleteMany(blobKeys: readonly string[]): Promise<void>;
}

/**
 * Reading an object back — kept **off** `StorageAdapter` on purpose.
 *
 * solution.md publishes exactly three storage operations, and the upload path needs no fourth:
 * extraction runs on the bytes already in hand, once, at upload (DR-8). But `adapters/parsing` is
 * declared to depend on `adapters/storage`, and a re-parse or a managed fallback would need a byte
 * source that is not a round trip through a signed CDN URL. So the capability exists as a separate,
 * narrower interface that the concrete stores implement: the published contract is unchanged, and
 * `adapters/parsing` depends on one function rather than on a whole storage adapter.
 */
export interface BlobReader {
  read(scope: OwnerScope, blobKey: string): Promise<Uint8Array>;
}

/** What both concrete stores provide: the published contract plus the reader. */
export type StorageStore = StorageAdapter & BlobReader;

/**
 * A key that is not the caller's.
 *
 * `NOT_FOUND`, never `FORBIDDEN` (AR-2): telling a stranger that a key exists but is not theirs is
 * itself the disclosure.
 */
export class StorageNotFoundError extends Error {
  constructor(blobKey: string) {
    super(`no stored object for key ${blobKey}`);
    this.name = 'StorageNotFoundError';
  }
}

/**
 * Where an owner's objects live.
 *
 * The owner id is **in the key**, which is what makes `signedUrl`'s ownership check a property of the
 * adapter rather than a favour the caller does it. A client-supplied key belonging to someone else
 * fails the prefix test locally, before a token is issued and before the store is contacted — so the
 * check cannot be skipped by a caller who forgot, and cannot be defeated by a key that leaked.
 *
 * The service layer checks ownership again in SQL when it resolves the attachment row. Two checks, one
 * of them impossible to omit.
 */
export function ownerPrefix(scope: OwnerScope): string {
  return `attachments/${scope.userId}/`;
}

/** Whether a key belongs to this owner. The whole of the adapter-level authorization rule. */
export function keyBelongsTo(scope: OwnerScope, blobKey: string): boolean {
  return blobKey.startsWith(ownerPrefix(scope));
}

/**
 * Strips a file name down to something safe to put in a key.
 *
 * The name is user input, and it lands in a path. Everything outside a conservative set becomes `-`,
 * the result is length-capped, and a name that reduces to nothing becomes `file`. Path traversal is
 * therefore not a case to handle — `.` and `/` do not survive.
 */
export function safeKeySegment(fileName: string): string {
  const cleaned = fileName
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/^[.-]+/, '')
    .slice(0, 80);

  return cleaned === '' ? 'file' : cleaned;
}
