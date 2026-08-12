#!/usr/bin/env node
/**
 * A throwaway PostgreSQL server for the end-to-end suite (D-18).
 *
 * PGlite is PostgreSQL compiled to WebAssembly; `PGLiteSocketServer` puts it behind the PostgreSQL
 * wire protocol on a local port. The application connects to it with the standard driver and cannot
 * tell the difference, which is what lets the E2E suite drive the real app against a real database
 * with **no container, no service and no credential** — on a developer machine and on CI alike
 * (constitution S1: CI never holds a real credential).
 *
 * Every in-repo migration is applied before the port opens, so a test never races the schema.
 *
 * Data lives in memory for the lifetime of this process: each run starts from an empty database.
 */
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

const PORT = Number(process.env.TEST_DB_PORT ?? 5497);
const HOST = '127.0.0.1';

const db = await PGlite.create();
await migrate(drizzle(db), { migrationsFolder: './migrations' });

/*
 * More than one connection: the application holds one, and the test process needs its own to set up
 * fixtures. PGlite executes one query at a time regardless — the server queues them — so this raises
 * the connection count, not the concurrency.
 */
const server = new PGLiteSocketServer({ db, port: PORT, host: HOST, maxConnections: 5 });
await server.start();

console.log(
  `Test database listening on postgres://postgres:postgres@${HOST}:${String(PORT)}/postgres`,
);

const shutdown = async () => {
  await server.stop();
  await db.close();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
