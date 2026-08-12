import { getEnv } from '@/config/env';

import { createDatabase, type Database } from './index';

/**
 * The application's database handle, created once per process.
 *
 * Serverless invocations are short and numerous, so the client is memoised rather than constructed
 * per request; Neon's HTTP driver holds no pool to exhaust (D-12). Configuration still arrives from
 * exactly one place — `getEnv()` — so this module reads no environment of its own (IR-X2).
 */
let cached: Database | undefined;

export function getDatabase(): Database {
  cached ??= createDatabase(getEnv().DATABASE_URL);
  return cached;
}
