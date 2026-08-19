import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { migrate, openMigratedDatabase, readMigrations } from './migrate.ts';
import { CONNECTION_PRAGMAS, connectionPragmas, openDatabase } from './open.ts';

/**
 * The loop's SQLite core (task 152).
 *
 * Three claims, and none of them is testable against a double: that first boot produces a database,
 * that every connection carries the pragmas the A0 solution mandates, and that ten writers on ten
 * connections do not collide. The last one is the whole reason WAL is in the design.
 */

const WRITER = fileURLToPath(new URL('./concurrent-writer.ts', import.meta.url));

let directory: string;
let path: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'loop-db-'));
  path = join(directory, 'nested', 'loop.db');
});

afterEach(() => {
  /*
   * Cleanup is not an assertion. A case that fails while connections are still open leaves Windows
   * holding the `-wal` file, and an EPERM raised here would bury the failure that matters under a
   * second one about a temporary directory. `maxRetries` covers the ordinary handle-release delay;
   * anything past that is the operating system's to reclaim.
   */
  try {
    rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  } catch {
    // deliberately ignored — see above
  }
});

describe('first boot (task 152 AC-1)', () => {
  it('creates the database file, its directory and the whole schema', () => {
    expect(existsSync(path)).toBe(false);

    const database = openMigratedDatabase(path);

    expect(existsSync(path)).toBe(true);

    const tables = database
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row) => String(row.name));

    expect(tables).toEqual(
      expect.arrayContaining([
        'agent_decisions',
        'agent_logs',
        'milestones',
        'projects',
        'reports',
        'tasks',
      ]),
    );

    database.close();
  });

  it('is a no-op the second time — a restart is not a migration', () => {
    const first = openDatabase(path);
    const ran = migrate(first);
    expect(ran).toEqual(readMigrations().map((migration) => migration.name));
    expect(ran.length).toBeGreaterThan(0);

    expect(migrate(first)).toEqual([]);
    first.close();

    const second = openDatabase(path);
    expect(migrate(second)).toEqual([]);
    second.close();
  });

  it('leaves the previous version in place when a migration throws', () => {
    const database = openMigratedDatabase(path);
    const broken = mkdtempSync(join(tmpdir(), 'loop-broken-'));

    try {
      // A directory whose second migration is invalid SQL: the journal must not record it.
      writeFileSync(join(broken, '0001_core.sql'), 'CREATE TABLE ok (a TEXT);', 'utf8');
      writeFileSync(join(broken, '0002_bad.sql'), 'THIS IS NOT SQL;', 'utf8');

      expect(() => migrate(database, broken)).toThrow(/0002_bad\.sql/);

      const applied = database
        .prepare('SELECT name FROM schema_migrations ORDER BY name')
        .all()
        .map((row) => String(row.name));

      expect(applied).not.toContain('0002_bad.sql');
    } finally {
      rmSync(broken, { recursive: true, force: true });
      database.close();
    }
  });
});

describe('every connection, not every database (task 152)', () => {
  it('carries WAL, a five-second busy timeout and foreign keys', () => {
    const first = openMigratedDatabase(path);
    expect(connectionPragmas(first)).toEqual({
      journalMode: 'wal',
      busyTimeout: 5000,
      foreignKeys: 1,
    });
    first.close();

    // A second, later connection to the same file gets them too — the point of the seam.
    const second = openDatabase(path);
    expect(connectionPragmas(second)).toEqual({
      journalMode: 'wal',
      busyTimeout: 5000,
      foreignKeys: 1,
    });
    second.close();
  });

  it('enforces the schema cascades, so a deleted project takes its rows with it', () => {
    const database = openMigratedDatabase(path);

    database
      .prepare('INSERT INTO projects (project_id, title, status) VALUES (?, ?, ?)')
      .run('p1', 'Проект', 'ACTIVE');
    database
      .prepare(
        'INSERT INTO agent_logs (project_id, agent_role, message, log_level) VALUES (?, ?, ?, ?)',
      )
      .run('p1', 'ARCHITECT', 'строка', 'INFO');

    // A foreign key that names nothing is refused rather than silently orphaned.
    expect(() =>
      database
        .prepare(
          'INSERT INTO agent_logs (project_id, agent_role, message, log_level) VALUES (?, ?, ?, ?)',
        )
        .run('missing', 'ARCHITECT', 'строка', 'INFO'),
    ).toThrow(/FOREIGN KEY/i);

    database.prepare('DELETE FROM projects WHERE project_id = ?').run('p1');
    expect(database.prepare('SELECT count(*) AS n FROM agent_logs').get()?.n).toBe(0);

    database.close();
  });

  it('refuses a status the schema does not name', () => {
    const database = openMigratedDatabase(path);

    expect(() =>
      database
        .prepare('INSERT INTO projects (project_id, title, status) VALUES (?, ?, ?)')
        .run('p1', 'Проект', 'WHATEVER'),
    ).toThrow(/CHECK/i);

    database.close();
  });
});

describe('ten writers on ten connections (task 152 AC-2)', () => {
  it('writes every row, and an eleventh connection opened mid-flight is not locked out', async () => {
    const database = openMigratedDatabase(path);
    database
      .prepare('INSERT INTO projects (project_id, title, status) VALUES (?, ?, ?)')
      .run('p1', 'Проект', 'ACTIVE');
    database.close();

    const WRITERS = 10;
    const ROWS = 50;

    interface Verdict {
      ok: boolean;
      role: string;
      message?: string;
    }

    const reported: Promise<Verdict>[] = [];
    const finished: Promise<void>[] = [];

    for (let index = 0; index < WRITERS; index += 1) {
      const role = `writer-${String(index)}`;
      const worker = new Worker(WRITER, {
        workerData: { path, projectId: 'p1', rows: ROWS, role },
      });

      reported.push(
        new Promise<Verdict>((settle, fail) => {
          worker.on('message', settle);
          worker.on('error', fail);
        }),
      );
      finished.push(
        new Promise<void>((settle) => {
          worker.on('exit', () => {
            settle();
          });
        }),
      );
    }

    const results = await Promise.all(reported);
    expect(results.filter((result) => !result.ok).map((failure) => failure.message ?? '')).toEqual(
      [],
    );

    /*
     * **The contended open, and the point of the whole case.** A writer posts its verdict and only
     * then closes its connection, so this line runs while ten connections are still live and
     * closing — which is precisely what the dashboard does when an operator loads the page during a
     * run. It is also what caught the pragma-order defect: with `journal_mode` applied before
     * `busy_timeout` this throws `database is locked` on every attempt (measured 3/3, both orders),
     * because the timeout that would have made the connection wait is not in force yet. Waiting for
     * the workers to *exit* before reading would remove the contention — and with it the only thing
     * this case proves.
     */
    const verify = openDatabase(path);
    expect(verify.prepare('SELECT count(*) AS n FROM agent_logs').get()?.n).toBe(WRITERS * ROWS);

    // Every writer's rows are there, not merely the right total.
    const perRole = verify
      .prepare('SELECT agent_role AS role, count(*) AS n FROM agent_logs GROUP BY agent_role')
      .all();
    expect(perRole).toHaveLength(WRITERS);
    for (const row of perRole) expect(row.n).toBe(ROWS);

    verify.close();

    // Cleanup only: Windows will not remove a directory whose `-wal` file is still held open.
    await Promise.all(finished);
  });

  it('applies the busy timeout before anything that can contend', () => {
    // The invariant behind the case above, stated where a reordering edit will meet it.
    expect(CONNECTION_PRAGMAS[0]).toContain('busy_timeout');
  });
});
