#!/usr/bin/env node
/**
 * The application, against the throwaway database, with the **real** providers from `.env`.
 *
 * This is the milestone-gate configuration: the customer walks the whole journey by hand against a
 * live model, a live Blob store and live web research, but writes nothing to the Neon database that
 * serves the deployment. The end-to-end suite already runs this way with the stub — the only
 * difference here is that the provider chain is the one `.env` names, so the prompts, the questions
 * and the documents are a model's rather than the double's.
 *
 * Exactly one variable is overridden. `DATABASE_URL` points at `pnpm db:test-server`, which holds its
 * data in memory for the lifetime of that process: the walk starts from an empty database and leaves
 * nothing behind. Everything else — the Google key, the OAuth clients, the Blob token, the search key
 * — comes from `.env` untouched, because those are precisely what the gate is meant to exercise.
 *
 * Usage:
 *   pnpm db:test-server     (one terminal — leave it running)
 *   pnpm dev:gate           (another terminal)
 */
import { spawn } from 'node:child_process';

const PORT = Number(process.env.TEST_DB_PORT ?? 5497);
const TEST_DATABASE_URL = `postgres://postgres:postgres@127.0.0.1:${String(PORT)}/postgres`;

console.log(`Starting the application against the throwaway database on port ${String(PORT)}.`);
console.log('Providers, OAuth and storage come from .env — this walk makes real calls.\n');

/*
 * `next dev` loads `.env` itself, so no `--env-file` flag is passed — Next re-executes itself and
 * forwards Node flags through `NODE_OPTIONS`, where `--env-file-if-exists` is refused. The override
 * below is set on the child's environment instead, which Next never overwrites.
 */
const child = spawn(
  process.execPath,
  ['./node_modules/next/dist/bin/next', 'dev', '--port', String(process.env.PORT ?? 3000)],
  {
    stdio: 'inherit',
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  },
);

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
