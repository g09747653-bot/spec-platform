import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';

import * as schema from './schema';

/**
 * Database access (D-12).
 *
 * Neon's HTTP driver is used rather than a pooled TCP client: serverless invocations would
 * otherwise exhaust a connection pool, and it keeps cold starts small.
 *
 * The connection string is passed in rather than read from the environment here, so this module
 * performs no configuration I/O of its own — `src/config/env.ts` remains the only place the
 * environment is read (IR-X2).
 */
export function createDatabase(connectionString: string) {
  return drizzle(neon(connectionString), { schema });
}

export type Database = ReturnType<typeof createDatabase>;
