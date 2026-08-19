#!/usr/bin/env node
/**
 * The persistent local database (task 149; А-7 §4).
 *
 * The same machinery the end-to-end suite has trusted since D-18 — PGlite behind the PostgreSQL
 * wire protocol — with one difference that is the whole point: the data directory. Where
 * `db:test-server` holds its rows in memory and starts empty every time, this server keeps them in
 * a project-local, gitignored directory and starts from what it kept. Durability across a hard
 * process kill was probed before this script relied on it: a row written over the wire and killed
 * with no warning came back byte-identical on the next start.
 *
 * Explicitly NOT a migration to SQLite (А-20): the platform keeps its PostgreSQL dialect — all
 * migrations under `migrations/` apply here unchanged, and Drizzle's own journal table makes a
 * restart apply only what is new.
 *
 * Usage:
 *   pnpm db:local-server           (directly; the customer uses `pnpm local:up`, which spawns this)
 */
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

/** 5499, not the throwaway's 5497: the two servers must be able to coexist on one machine. */
const PORT = Number(process.env.LOCAL_DB_PORT ?? 5499);
const HOST = '127.0.0.1';
const DATA_DIR = resolve(process.env.LOCAL_DB_DIR ?? '.local/db');

mkdirSync(DATA_DIR, { recursive: true });

const db = await PGlite.create(DATA_DIR);
await migrate(drizzle(db), { migrationsFolder: './migrations' });

const server = new PGLiteSocketServer({ db, port: PORT, host: HOST, maxConnections: 5 });
await server.start();

console.log(`Local database at ${DATA_DIR}`);
console.log(
  `Local database listening on postgres://postgres:postgres@${HOST}:${String(PORT)}/postgres`,
);

const shutdown = async () => {
  await server.stop();
  await db.close();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
