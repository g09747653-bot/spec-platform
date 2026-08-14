import { getEnv, NO_CREDENTIAL, type Env } from '@/config/env';

import { createBlobStore } from './blob-store';
import { createMemoryStorage } from './memory-store';
import type { StorageStore } from './types';

/** `adapters/storage` — private object storage for uploads and exports (IR-005). */
export const MODULE_ID = 'adapters/storage';

export {
  keyBelongsTo,
  ownerPrefix,
  safeKeySegment,
  StorageNotFoundError,
  type BlobReader,
  type StorageAdapter,
  type StorageStore,
  type UploadInput,
} from './types';
export { createBlobStore } from './blob-store';
export { createMemoryStorage, type MemoryStorage } from './memory-store';

/**
 * The composition root for storage, mirroring `createDefaultAdapter` (D-23).
 *
 * One place decides what "the store" means for a request. With `BLOB_READ_WRITE_TOKEN=none` there is
 * no store to talk to, and the honest response is an in-process one rather than a call that fails at
 * the network: uploads work locally and in CI, and the deployment that has a token gets Vercel Blob.
 * The token is the configuration that switches them, exactly as `LLM_PROVIDER_ORDER` switches the
 * model chain.
 *
 * The variable itself is required (D-73), so *forgetting* it is a boot failure rather than a silent
 * in-memory store on a deployment. Only the explicit `none` reaches the branch below — which is what
 * makes this function the one place the substitution can happen, and makes it deliberate when it does.
 */
/**
 * One in-process store per process, not one per call.
 *
 * A fresh `Map` per request would make an object written by the upload endpoint invisible to every
 * later request — a signed URL or a re-parse would find nothing — and the fallback would be a store
 * only in the sense that `put` returns a key. Process-scoped is as durable as an in-memory store can
 * honestly be; the deployments that need more get the Blob token.
 */
let inProcessStore: StorageStore | undefined;

export function createDefaultStorage(env: Env = getEnv()): StorageStore {
  const token = env.BLOB_READ_WRITE_TOKEN;

  if (token !== NO_CREDENTIAL) return createBlobStore(token);

  inProcessStore ??= createMemoryStorage();

  return inProcessStore;
}
