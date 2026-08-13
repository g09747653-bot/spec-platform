import { getEnv, type Env } from '@/config/env';

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
 * One place decides what "the store" means for a request. Without a Blob token there is no store to
 * talk to, and the honest response is an in-process one rather than a call that fails at the network:
 * uploads work locally and in CI, and the deployment that has the token gets Vercel Blob. The token is
 * the configuration that switches them, exactly as `LLM_PROVIDER_ORDER` switches the model chain.
 *
 * The fallback is memory-only and therefore not durable across processes — which is precisely why the
 * variable becomes required for the deployments that serve uploads (D-8/D-46), and why this function
 * is the only place that can silently be either.
 */
export function createDefaultStorage(env: Env = getEnv()): StorageStore {
  const token = env.BLOB_READ_WRITE_TOKEN;

  return token === undefined ? createMemoryStorage() : createBlobStore(token);
}
