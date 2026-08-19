#!/usr/bin/env node
/**
 * The whole local stack, one command up and one command down (task 149; А-7 §4).
 *
 *   pnpm local:up      — the persistent database (scripts/local-db-server.mjs), then the
 *                        application in local single-user mode. The command stays in the
 *                        foreground — like `pnpm dev` — and Ctrl+C takes the whole stack down.
 *   pnpm local:down    — from any other terminal: stops both, by the pids recorded at `up`.
 *
 * Foreground on purpose, and the reason is measured, not stylistic: Next 16's dev CLI exits when
 * its parent process goes away, so a stack that detached itself would lose the application the
 * moment the launching command returned. A supervisor that stays alive is also the honest shape —
 * `db:test-server` and `dev:gate` hold their terminals for the same reason.
 *
 * What `up` overrides is exactly two variables: `DATABASE_URL` aims the application at the local
 * database instead of the deployment's, and `LOCAL_SINGLE_USER=1` selects the auto-owner session
 * (task 148). Everything else — provider keys, chains, timeouts — comes from `.env` and the caller's
 * environment untouched, so the same command serves the customer's everyday stack and, with the
 * gate's variables exported around it, a gate walk.
 *
 * Ports: the database on 5499 (`LOCAL_DB_PORT`), the application on 3000 (`LOCAL_PORT`). Both are
 * checked before anything starts — `next dev` silently walks to a free port when its own is taken,
 * and a stack that came up on a surprise port is not "up" in any useful sense.
 */
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { get } from 'node:http';
import { createConnection } from 'node:net';

const COMMAND = process.argv[2] ?? '';

const DB_PORT = Number(process.env.LOCAL_DB_PORT ?? 5499);
const APP_PORT = Number(process.env.LOCAL_PORT ?? 3000);
const DATABASE_URL = `postgres://postgres:postgres@127.0.0.1:${String(DB_PORT)}/postgres`;

const STATE_DIR = '.local';
const PID_FILE = `${STATE_DIR}/stack.json`;

const say = (line) => console.log(line);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Whether anything answers on a local TCP port. */
function portInUse(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host: '127.0.0.1' });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

async function waitForPort(port, label, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await portInUse(port)) return;
    await sleep(300);
  }
  throw new Error(`${label} не открыл порт ${String(port)} за ${String(timeoutMs / 1000)} секунд`);
}

/**
 * Waits until the application answers HTTP — any status counts, the first compile is the slow part.
 *
 * `stillRunning` is read between attempts: `next dev` refuses to start at all when another dev
 * server already runs in this directory (one per directory is Next's own rule), and waiting three
 * minutes for a process that exited in one second would bury the actual reason. The log carries it.
 */
function waitForHttp(port, timeoutMs, stillRunning) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const attempt = () => {
      if (!stillRunning()) {
        reject(
          new Error('приложение завершилось, не начав отвечать — причина в .local/dev-server.log'),
        );
        return;
      }
      const request = get({ host: '127.0.0.1', port, path: '/' }, (response) => {
        response.resume();
        resolve();
      });
      request.on('error', () => {
        if (Date.now() > deadline) {
          reject(new Error(`приложение не ответило на порту ${String(port)}`));
        } else {
          setTimeout(attempt, 500);
        }
      });
    };
    attempt();
  });
}

function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Kills a process and everything it spawned — `next dev` is a tree, not a process. */
function killTree(pid) {
  if (typeof pid !== 'number' || !alive(pid)) return;
  if (process.platform === 'win32') {
    try {
      execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    } catch {
      // Already gone between the check and the kill.
    }
  } else {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      // Already gone.
    }
  }
}

function readState() {
  if (!existsSync(PID_FILE)) return null;
  try {
    return JSON.parse(readFileSync(PID_FILE, 'utf8'));
  } catch {
    return null;
  }
}

async function up() {
  const state = readState();
  if (state !== null && (alive(state.db) || alive(state.dev) || alive(state.supervisor))) {
    say(`Стек уже поднят (см. ${PID_FILE}). Сначала: pnpm local:down`);
    process.exit(1);
  }

  for (const [port, what] of [
    [DB_PORT, 'база'],
    [APP_PORT, 'приложение'],
  ]) {
    if (await portInUse(port)) {
      say(`Порт ${String(port)} (${what}) уже занят другим процессом — стек не поднят.`);
      process.exit(1);
    }
  }

  mkdirSync(STATE_DIR, { recursive: true });

  const dbLog = openSync(`${STATE_DIR}/db-server.log`, 'a');
  const database = spawn(process.execPath, ['scripts/local-db-server.mjs'], {
    stdio: ['ignore', dbLog, dbLog],
    env: { ...process.env, LOCAL_DB_PORT: String(DB_PORT) },
  });

  const devLog = openSync(`${STATE_DIR}/dev-server.log`, 'a');
  let application = null;

  let closing = false;
  const takeDown = (code) => {
    if (closing) return;
    closing = true;
    killTree(application?.pid);
    killTree(database.pid);
    rmSync(PID_FILE, { force: true });
    process.exit(code);
  };

  process.on('SIGINT', () => takeDown(0));
  process.on('SIGTERM', () => takeDown(0));

  database.on('exit', () => {
    if (closing) return;
    say('База данных завершилась — стек гасится. Причина в .local/db-server.log');
    takeDown(1);
  });

  try {
    await waitForPort(DB_PORT, 'база данных', 60_000);
  } catch (error) {
    say(`Стек не поднялся: ${error instanceof Error ? error.message : String(error)}`);
    takeDown(1);
    return;
  }
  say(`База поднята: порт ${String(DB_PORT)}, данные в .local/db, лог в .local/db-server.log`);

  application = spawn(
    process.execPath,
    ['./node_modules/next/dist/bin/next', 'dev', '--port', String(APP_PORT)],
    {
      stdio: ['ignore', devLog, devLog],
      env: {
        ...process.env,
        DATABASE_URL,
        LOCAL_SINGLE_USER: '1',
      },
    },
  );

  application.on('exit', () => {
    if (closing) return;
    say('Приложение завершилось — стек гасится. Причина в .local/dev-server.log');
    takeDown(1);
  });

  writeFileSync(
    PID_FILE,
    JSON.stringify({
      supervisor: process.pid,
      db: database.pid,
      dev: application.pid,
      dbPort: DB_PORT,
      appPort: APP_PORT,
    }),
    'utf8',
  );

  try {
    await waitForHttp(APP_PORT, 180_000, () => !closing && application.exitCode === null);
  } catch (error) {
    say(`Стек не поднялся: ${error instanceof Error ? error.message : String(error)}`);
    takeDown(1);
    return;
  }

  say(
    `Приложение поднято: http://127.0.0.1:${String(APP_PORT)} — вход не нужен, сессия владельца автоматическая.`,
  );
  say(
    'Стек работает, терминал занят им. Погасить: Ctrl+C здесь или pnpm local:down из другого терминала.',
  );
}

function down() {
  const state = readState();
  if (state === null) {
    say('Стек не поднят (нет .local/stack.json) — гасить нечего.');
    return;
  }

  // The supervisor's tree covers all three; the direct kills below are for a supervisor already gone.
  killTree(state.supervisor);
  killTree(state.dev);
  killTree(state.db);
  rmSync(PID_FILE, { force: true });
  say('Стек погашен. Данные остались в .local/db — следующий pnpm local:up продолжит с них.');
}

if (COMMAND === 'up') {
  await up();
} else if (COMMAND === 'down') {
  down();
} else {
  say('Использование: node scripts/local-stack.mjs up | down');
  process.exit(1);
}
