import { resolve } from 'node:path';

import { requireEnv } from '../config/env.ts';

import { migrate } from './migrate.ts';
import { openDatabase } from './open.ts';

/**
 * `pnpm --filter @spec-platform/loop db:migrate` — the operator's way to create or update the
 * database without starting the server (бандл A0 §Bootstrap, step 3).
 *
 * The server does the same thing at boot, so this is a convenience rather than a step anyone can
 * forget; what it adds is a place to see the migration names scroll past.
 */

/* eslint-disable no-restricted-properties -- a CLI entry point: this is where the process lives. */
const env = requireEnv(process.env, {
  write: (text) => process.stderr.write(text),
  exit: (code) => process.exit(code),
});

const path = resolve(process.cwd(), env.LOOP_DB_PATH);
/* eslint-enable no-restricted-properties */

const database = openDatabase(path);
const ran = migrate(database);
database.close();

console.log(
  ran.length === 0
    ? `База ${path} уже на последней версии схемы.`
    : `База ${path}: применено миграций ${String(ran.length)} — ${ran.join(', ')}.`,
);
