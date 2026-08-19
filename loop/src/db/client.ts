import { resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

import { getEnv } from '../config/env.ts';

import { openMigratedDatabase } from './migrate.ts';

/**
 * The loop's database handle, created once per process (task 152/153).
 *
 * A singleton on `globalThis` for the same reason the event bus is one: Next reloads modules in
 * development, and a second copy of this module would open a second connection to the same file
 * every time a route recompiled — which is how a local tool ends up with dozens of open handles and
 * a `-wal` nobody can check-point.
 *
 * Migrations run here, so first boot needs no separate step: the file appears with its schema and
 * the caller receives a connection.
 */

const KEY = Symbol.for('spec-platform.loop.database');

interface Holder {
  [KEY]?: DatabaseSync;
}

export function databasePath(): string {
  return resolve(process.cwd(), getEnv().LOOP_DB_PATH);
}

export function getDatabase(): DatabaseSync {
  const holder = globalThis as unknown as Holder;
  holder[KEY] ??= openMigratedDatabase(databasePath());
  return holder[KEY];
}
