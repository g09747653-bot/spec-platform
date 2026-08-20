import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

import { openDatabase } from './open.ts';

/**
 * Migrations, applied in filename order and recorded so a second run is a no-op (task 152).
 *
 * A hand-rolled runner rather than an ORM's, because the loop's schema is one hand-written DDL file
 * per change and its whole database is a local file the operator may delete: the runner has to be
 * something they can read in a minute and re-run without ceremony. Each file is applied inside a
 * transaction with its bookkeeping row, so a migration that throws halfway leaves the database on
 * the previous version rather than in between two.
 */

const HERE = dirname(fileURLToPath(import.meta.url));

/** `loop/migrations`, resolved from this module so the cwd never decides. */
export const MIGRATIONS_DIRECTORY = join(HERE, '..', '..', 'migrations');

const JOURNAL = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`;

export interface MigrationFile {
  name: string;
  sql: string;
}

/** Every `.sql` file in the directory, sorted by name — the order they are applied in. */
export function readMigrations(directory = MIGRATIONS_DIRECTORY): MigrationFile[] {
  return readdirSync(directory)
    .filter((name) => name.endsWith('.sql'))
    .sort((left, right) => left.localeCompare(right, 'en'))
    .map((name) => ({ name, sql: readFileSync(join(directory, name), 'utf8') }));
}

/** Applies whatever has not been applied yet. Returns the names it ran, in order. */
export function migrate(database: DatabaseSync, directory = MIGRATIONS_DIRECTORY): string[] {
  database.exec(JOURNAL);

  const applied = new Set(
    database
      .prepare('SELECT name FROM schema_migrations')
      .all()
      .map((row) => String(row.name)),
  );

  const ran: string[] = [];

  for (const migration of readMigrations(directory)) {
    if (applied.has(migration.name)) continue;

    database.exec('BEGIN');
    try {
      database.exec(migration.sql);
      database.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(migration.name);
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw new Error(`migration ${migration.name} failed: ${String(error)}`, { cause: error });
    }

    ran.push(migration.name);
  }

  return ran;
}

/**
 * Opens the database at `path`, creating and migrating it if it is not there yet (task 152 AC-1).
 *
 * First boot is not a special case anywhere else in the loop: the file appears, the schema is
 * applied, and the caller receives a connection carrying the pragmas like every other connection.
 */
export function openMigratedDatabase(path: string, directory = MIGRATIONS_DIRECTORY): DatabaseSync {
  const database = openDatabase(path);
  migrate(database, directory);
  return database;
}
