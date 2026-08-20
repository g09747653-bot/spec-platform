import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * Every connection to the loop's database, opened the one way that is allowed (task 152).
 *
 * **The pragmas are per connection, not per database**, and that is the whole reason this function
 * exists rather than a `new DatabaseSync(path)` at each call site. `journal_mode=WAL` is persistent
 * — it is written into the file header — but `busy_timeout` is a property of the *connection*, and
 * a connection that skipped it does not wait five seconds for a writer to finish: it fails
 * immediately with `SQLITE_BUSY: database is locked`. With up to ten executors, an architect and a
 * dashboard all touching one file (бандл A0 §Data Model), one forgetful call site is enough to
 * reintroduce the exact symptom WAL was chosen to remove.
 *
 * `node:sqlite` rather than a native package, deliberately: the loop must install and run on the
 * customer's Windows machine and on a Linux CI runner with no compiler in either, and Node 24 ships
 * SQLite in the runtime.
 */

/**
 * The pragmas the A0 solution states — **busy timeout first**, and the order is a measured finding.
 *
 * A0 writes them the other way round, and the concurrency probe of this very task failed on it, so
 * the order was measured directly rather than reasoned about. Ten worker threads write through ten
 * connections; an eleventh connection is opened while they are still closing theirs:
 *
 *   journal_mode first → `database is locked`, 3 runs out of 3
 *   busy_timeout first → clean, all 500 rows, 3 runs out of 3
 *
 * `PRAGMA journal_mode = WAL` contends for a lock against connections shutting down (a closing WAL
 * connection checkpoints, which wants exclusive access). Issued before `busy_timeout`, it meets
 * SQLite's default timeout of **zero** and fails instantly instead of waiting — thrown from the very
 * line that exists to prevent that error. `busy_timeout` needs no lock of its own, being a property
 * of the connection and nothing else, so putting it first costs nothing and makes the second pragma
 * survivable.
 *
 * This is the one place the loop departs from A0's literal text, and it departs from it to deliver
 * what A0 was asking for.
 */
export const CONNECTION_PRAGMAS = ['busy_timeout = 5000', 'journal_mode = WAL'] as const;

export interface OpenOptions {
  /** Creates the parent directory when it is missing — first boot has no `.data/` yet. */
  createDirectory?: boolean;
  /** Foreign keys are off by default in SQLite; the schema's cascades depend on them being on. */
  foreignKeys?: boolean;
}

export function openDatabase(path: string, options: OpenOptions = {}): DatabaseSync {
  if (options.createDirectory !== false && path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }

  const database = new DatabaseSync(path);

  for (const pragma of CONNECTION_PRAGMAS) database.exec(`PRAGMA ${pragma};`);
  if (options.foreignKeys !== false) database.exec('PRAGMA foreign_keys = ON;');

  return database;
}

/** What a connection actually reports back, so a test asserts the database rather than the call. */
export function connectionPragmas(database: DatabaseSync): {
  journalMode: string;
  busyTimeout: number;
  foreignKeys: number;
} {
  const journal = database.prepare('PRAGMA journal_mode').get();
  const busy = database.prepare('PRAGMA busy_timeout').get();
  const keys = database.prepare('PRAGMA foreign_keys').get();

  return {
    journalMode: String(journal?.journal_mode ?? ''),
    busyTimeout: Number(busy?.timeout ?? 0),
    foreignKeys: Number(keys?.foreign_keys ?? 0),
  };
}
