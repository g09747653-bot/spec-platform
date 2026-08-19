#!/usr/bin/env node
/**
 * Reads the local profile's database **while the stack is down** and writes the rows the restart
 * must not lose (task 149 AC; gate M14а). Direct directory access, deliberately: a second wire
 * connection into a *live* PGlite hangs (the walk never queries mid-run), but a stopped stack holds
 * no connection at all, and reading the directory is exactly the persistence claim under test —
 * what is on disk is what the next boot serves.
 *
 * Rows travel as server-rendered JSON text (`row_to_json`), so the end-of-walk comparison — made
 * over the wire protocol by a different driver — compares identical renderings, not two drivers'
 * ideas of a timestamp.
 *
 * Usage: node e2e/gate-M14a.dump.mjs <out-file.json> [data-dir]
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { PGlite } from '@electric-sql/pglite';

const OUT = process.argv[2];
const DATA_DIR = resolve(process.argv[3] ?? '.local/db');

if (!OUT) {
  console.error('usage: node e2e/gate-M14a.dump.mjs <out-file.json> [data-dir]');
  process.exit(1);
}

/** Table → the ORDER BY that makes the dump deterministic. */
export const DUMP_TABLES = {
  users: 'id',
  projects: 'id',
  sessions: 'id',
  workflow_state: 'session_id',
  spec_files: 'id',
  spec_revisions: 'id',
  review_feedback: 'id',
  session_messages: 'id',
  question_rounds: 'id',
  answers: 'id',
  autonomous_runs: 'id',
};

const db = await PGlite.create(DATA_DIR);

const dump = {};
for (const [table, order] of Object.entries(DUMP_TABLES)) {
  const result = await db.query(
    `SELECT row_to_json(t)::text AS row FROM (SELECT * FROM ${table} ORDER BY ${order}) t`,
  );
  dump[table] = result.rows.map((entry) => entry.row);
}

await db.close();

writeFileSync(OUT, JSON.stringify(dump, null, 2), 'utf8');
console.log(
  `dumped ${Object.entries(dump)
    .map(([table, rows]) => `${table}:${String(rows.length)}`)
    .join(' ')}`,
);
