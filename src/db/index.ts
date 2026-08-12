import { neon } from '@neondatabase/serverless';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http';
import { drizzle as drizzlePostgres } from 'drizzle-orm/node-postgres';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { Pool } from 'pg';

import * as schema from './schema';

/**
 * Database access (D-12).
 *
 * **Production** talks to Neon over its HTTP driver: serverless invocations would otherwise exhaust a
 * connection pool, and it keeps cold starts small (solution.md — Scaling Strategy). That is the only
 * driver a deployment ever uses, and the choice is unchanged.
 *
 * **Tests and local runs** need a database that is not Neon — CI must never hold a real credential
 * (constitution S1), and the end-to-end suite has to drive the real application against a real
 * PostgreSQL instance. Those connection strings are served by `scripts/test-db-server.mjs` and are
 * reached with the standard driver instead (D-18).
 *
 * The driver is derived from the connection string, so no configuration variable was added and no
 * caller has to know which one is in use: everything downstream is typed as `SchemaDatabase`, through
 * which nothing driver-specific is reachable.
 *
 * The connection string is passed in rather than read from the environment here, so this module
 * performs no configuration I/O of its own — `src/config/env.ts` remains the only place the
 * environment is read (IR-X2).
 */
export function createDatabase(connectionString: string) {
  if (isNeonConnection(connectionString)) {
    return drizzleNeon(neon(connectionString), { schema });
  }

  /*
   * A single connection, deliberately. The test server is PGlite behind the PostgreSQL wire protocol,
   * which serves one connection at a time; `pg` queues statements on that connection, so the app
   * behaves normally while the test database stays a single in-process instance. A real PostgreSQL
   * server accepts this too — it is a pool of one, not a special protocol.
   */
  return drizzlePostgres(new Pool({ connectionString, max: 1 }), { schema });
}

/** Neon's own hostnames. Everything else is a plain PostgreSQL server (see above). */
function isNeonConnection(connectionString: string): boolean {
  try {
    return new URL(connectionString).hostname.endsWith('.neon.tech');
  } catch {
    return false;
  }
}

export type Database = ReturnType<typeof createDatabase>;

/**
 * Any Drizzle handle over this schema, regardless of driver.
 *
 * Repositories and the auth adapter are typed against this rather than against a concrete driver, so
 * the same code that runs on Neon in production is the code the tests exercise against a real
 * PostgreSQL instance. Nothing driver-specific — `batch`, interactive `transaction` — is reachable
 * through it, which is also the constraint the production driver imposes anyway (D-16).
 */
export type SchemaDatabase = PgDatabase<PgQueryResultHKT, typeof schema>;
