import { readFileSync } from 'node:fs';

import { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { z } from 'zod';

import * as schema from '@/db/schema';

/**
 * **Test support only.** A real PostgreSQL instance, in this process.
 *
 * Constraints, triggers and cascades are database behaviour, so they cannot be asserted against a
 * mock: the tests that matter for DR-2/DR-3/DR-4 are the ones where the *database* refuses a write
 * (task 16). PGlite is PostgreSQL compiled to WebAssembly, so the migrations under `migrations/`
 * are applied by Drizzle's own migrator — the same mechanism `scripts/db-migrate.mjs` runs against
 * Neon — and what the test exercises is the DDL that ships.
 *
 * It needs no server, no container and no credential, which keeps `pnpm test:unit` hermetic and
 * identical on a developer machine and on CI (constitution — Testing Approaches, Rules).
 *
 * Nothing in the application imports this module; `@electric-sql/pglite` is a devDependency.
 */
export interface TestDatabase {
  db: PgliteDatabase<typeof schema>;
  /** Raw SQL escape hatch, for asserting that the database itself rejects a statement. */
  exec(sql: string): Promise<unknown>;
  /** Applies every pending migration again — a second call must be a no-op. */
  migrateAgain(): Promise<void>;
  close(): Promise<void>;
}

const MIGRATIONS_FOLDER = './migrations';

export async function createMigratedDatabase(): Promise<TestDatabase> {
  const client = new PGlite();
  const db = drizzle(client, { schema });

  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

  return {
    db,
    exec: (statement: string) => client.exec(statement),
    migrateAgain: () => migrate(db, { migrationsFolder: MIGRATIONS_FOLDER }),
    close: () => client.close(),
  };
}

const Journal = z.object({ entries: z.array(z.object({ tag: z.string() })) });

/** How many migrations the repository ships, read from Drizzle's journal. */
export function inRepoMigrationCount(): number {
  const journal = Journal.parse(
    JSON.parse(readFileSync(`${MIGRATIONS_FOLDER}/meta/_journal.json`, 'utf8')),
  );

  return journal.entries.length;
}

/** How many migrations this database has recorded as applied. */
export async function appliedMigrationCount(database: TestDatabase): Promise<number> {
  const result = await database.db.execute(
    sql`SELECT count(*)::int AS applied FROM drizzle.__drizzle_migrations`,
  );

  return z.object({ rows: z.tuple([z.object({ applied: z.number() })]) }).parse(result).rows[0]
    .applied;
}

/**
 * Runs `body` and returns the PostgreSQL error message, or `undefined` when the statement was
 * accepted. Negative database tests assert on the message, so a constraint that stops firing is a
 * failure rather than a silently passing test.
 *
 * Drizzle wraps a driver error in its own `DrizzleQueryError`, whose message names the failed query
 * but not the violated constraint; the constraint name lives further down the `cause` chain. The
 * whole chain is flattened so an assertion can name the constraint it means to exercise.
 */
export async function captureDatabaseError(
  body: () => Promise<unknown>,
): Promise<string | undefined> {
  try {
    await body();
    return undefined;
  } catch (error) {
    const messages: string[] = [];

    for (let current: unknown = error; current !== undefined && current !== null;) {
      if (!(current instanceof Error)) {
        messages.push(typeof current === 'string' ? current : JSON.stringify(current));
        break;
      }

      messages.push(current.message);
      current = current.cause;
    }

    return messages.join(' | ');
  }
}
