/* eslint-disable no-restricted-properties -- a hand-run walk, not application code: it takes its
   configuration from the environment because that is how a person points it at this machine. */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createServer, request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, type Browser, type Page } from '@playwright/test';

import { ACCEPTANCE_IMAGES } from '../src/gate/accept.ts';

/**
 * **Гейт M17а — сквозной путь без рук** (task 167; А-2.1; А-29).
 *
 * The claim under test is the whole Программа А at once: one TEXT message with an idea, pressed
 * «🚀 Запустить» under the bot's reply — and no further human action until the «✅ Проект завершён»
 * alert. In between, every piece is the real one: the local platform writes the specification
 * autonomously (through the staff subscription adapter of task 175), the machine bundle crosses the
 * contract of task 150, the loop's intake slices it, and live executors on the customer's
 * subscription build and pass acceptance in clean containers.
 *
 * **One deliberate stand-in, named rather than hidden: the Bot API itself.** An *incoming* message
 * from the owner cannot be injected into api.telegram.org programmatically — sending as a user is
 * the privilege of a human with an account. So the walk runs a local Bot API stand
 * (`TELEGRAM_API_BASE`, the same class of seam as `DOCKER_ENGINE_PIPE`) with real long-poll
 * semantics, and the alert ledger it records is exactly what would have reached the phone. The real
 * transport is exercised where it belongs: at the customer's own acceptance, per the README section
 * this gate ships.
 *
 * **«Без рук» means without a human.** The walk itself may press the same «Возобновить» a phone
 * owner would (through the staff `retry` endpoint) when a genuine red verdict freezes the pipeline
 * — each such resume is counted and reported as a finding, exactly like the M16а walk did. A walk
 * that hid a resume would be lying about autonomy; a walk that refused one would be testing luck.
 *
 * Red conditions: a credential value in any artifact or alert, `database is locked`, a cascade
 * around throttling, an interactive hang, a silent link (a phase past its named budget with no
 * named alert), and every prior gate's condition that applies.
 *
 * Usage: node loop/e2e/gate-M17a.live.ts
 *   GATE_OUT        artifacts directory (default artifacts/gate-M17a)
 *   GATE_WORKSPACE  loop workspace root (default .gate-tmp/m17a-workspace)
 *   GATE_PORT       loop port (default 3197)
 *   GATE_IDEA       the owner's idea (default: короткий русский конвертер величин)
 *   GATE_BUDGET_MS  total hands-off budget (default 3.5 h)
 *   GATE_STUB       `1` — rehearse with the scripted executor (no real model calls in the loop)
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const LOOP_ROOT = resolve(HERE, '..');
const REPO_ROOT = resolve(LOOP_ROOT, '..');

const OUT = resolve(REPO_ROOT, process.env.GATE_OUT ?? 'artifacts/gate-M17a');
const WORKSPACE = resolve(REPO_ROOT, process.env.GATE_WORKSPACE ?? '.gate-tmp/m17a-workspace');
const LOOP_PORT = Number(process.env.GATE_PORT ?? 3197);
const LOOP_URL = `http://127.0.0.1:${String(LOOP_PORT)}`;
const PLATFORM_PORT = 3000;
const PLATFORM_URL = `http://127.0.0.1:${String(PLATFORM_PORT)}`;
const BRIDGE_PORT = 8091;
const STUB = process.env.GATE_STUB === '1';
const BUDGET_MS = Number(process.env.GATE_BUDGET_MS ?? 5 * 3_600_000);

const IDEA =
  process.env.GATE_IDEA ??
  'Консольный конвертер величин: длина, масса и температура; история последних десяти переводов хранится в локальном файле.';

/** Синтетический токен гейтового стенда. НЕ секрет — секрет то, чего в артефактах быть не должно. */
const GATE_TG_TOKEN = 'gate-m17a-synthetic-bot-token';

const VIEWPORT = { width: 1440, height: 900 };

/** Пофазные бюджеты «звено обязано отозваться» — молчание дольше есть красное условие. */
const PHASE_BUDGETS = {
  confirmOfferMs: 90_000,
  platformAcceptedMs: 5 * 60_000,
  specReadyMs: 2.5 * 3_600_000,
  bundleMs: 10 * 60_000,
  planAcceptedMs: 50 * 60_000,
} as const;

/**
 * Сколько настоящих красных заморозок прогулка возобновит сама. Шесть — мерка M16а (D-303:
 * широкий план попросил пять-шесть спасений), поднято с четырёх по замеру попытки 3.
 */
const MAX_AUTO_RESUMES = Number(process.env.GATE_MAX_RESUMES ?? 6);

const steps: { at: string; what: string }[] = [];
const findings: string[] = [];
const measurements: string[] = [];
/** Лента Telegram, какой её увидел бы телефон владельца: вход и выход, по порядку. */
const tgFeed: { at: string; direction: '→боту' | '←владельцу'; text: string }[] = [];

function note(what: string): void {
  const at = new Date().toISOString();
  steps.push({ at, what });
  console.log(`[${at.slice(11, 19)}] ${what}`);
}

function finding(what: string): void {
  findings.push(what);
  note(`НАХОДКА: ${what}`);
}

function measure(what: string): void {
  measurements.push(what);
  note(`· ${what}`);
}

/* ------------------------------------------------------------------ secrets, for the leak scan */

interface SecretUnderWatch {
  name: string;
  value: string;
}

function secretsUnderWatch(): SecretUnderWatch[] {
  const watched: SecretUnderWatch[] = [];
  const envPath = join(LOOP_ROOT, '.env');
  const source = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';

  for (const name of [
    'CLAUDE_CODE_OAUTH_TOKEN',
    'ANTHROPIC_API_KEY',
    'TELEGRAM_BOT_TOKEN',
    'GOOGLE_GENERATIVE_AI_API_KEY',
  ]) {
    const found = new RegExp(`^${name}=(.+)$`, 'm').exec(source);
    const value = found?.[1]?.trim() ?? '';
    if (value !== '') watched.push({ name, value });
  }

  return watched;
}

function ownerChatIdFromEnv(): number {
  const envPath = join(LOOP_ROOT, '.env');
  const source = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
  const found = /^TELEGRAM_OWNER_CHAT_ID=(.+)$/m.exec(source);
  const value = Number(found?.[1]?.trim() ?? '');
  return Number.isInteger(value) ? value : 999_000_111;
}

/* ------------------------------------------------------------------ the Bot API stand */

interface SentMessage {
  at: string;
  chat_id: number;
  text: string;
  reply_markup?: { inline_keyboard: { text: string; callback_data: string }[][] };
}

interface BotApiStand {
  server: Server;
  base: string;
  outbox: SentMessage[];
  push(update: Record<string, unknown>): void;
  close(): void;
}

/**
 * Локальный Bot API: настоящая offset-семантика long poll (запрос держится до события или до
 * timeout), запись каждого исходящего. Ровно то, что делает api.telegram.org для этого шлюза, —
 * минус привилегия человека слать входящие, ради которой стенд и существует.
 */
function startBotApiStand(port: number): Promise<BotApiStand> {
  const updates: Record<string, unknown>[] = [];
  let nextUpdateId = 1;
  const outbox: SentMessage[] = [];
  const waiters: (() => void)[] = [];

  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const url = request.url ?? '';
      if (!url.startsWith(`/bot${GATE_TG_TOKEN}/`)) {
        response.writeHead(404).end('{"ok":false,"description":"unknown token"}');
        return;
      }
      const method = url.slice(`/bot${GATE_TG_TOKEN}/`.length);
      const payload = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as Record<
        string,
        unknown
      >;

      const ok = (result: unknown) => {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ ok: true, result }));
      };

      switch (method) {
        case 'getUpdates': {
          const offset = Number(payload.offset ?? 0);
          const ready = () => updates.filter((update) => Number(update.update_id) >= offset);

          /*
           * Один ответ на один запрос: таймер и разбуженный waiter НЕ должны писать оба —
           * протухший waiter после сработавшего таймера ронял репетицию «Cannot write headers
           * after they are sent» ровно на фазе голосового (находка репетиции №1).
           */
          let settled = false;
          const answer = (result: unknown) => {
            if (settled) return;
            settled = true;
            ok(result);
          };

          if (ready().length > 0) {
            answer(ready());
            return;
          }
          const timer = setTimeout(
            () => {
              answer([]);
            },
            Number(payload.timeout ?? 0) * 1000,
          );
          waiters.push(() => {
            clearTimeout(timer);
            answer(ready());
          });
          return;
        }
        case 'sendMessage': {
          const message = {
            at: new Date().toISOString(),
            ...(payload as unknown as Omit<SentMessage, 'at'>),
          };
          outbox.push(message);
          tgFeed.push({ at: message.at, direction: '←владельцу', text: message.text });
          console.log(`  [tg←] ${message.text.split('\n')[0] ?? ''}`);
          ok({ message_id: outbox.length });
          return;
        }
        case 'setMyCommands':
          ok(true);
          return;
        case 'answerCallbackQuery':
          ok(true);
          return;
        default:
          ok(true);
      }
    });
  });

  return new Promise((ready) => {
    server.listen(port, '127.0.0.1', () => {
      const base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
      ready({
        server,
        base,
        outbox,
        push(update) {
          const stamped = { update_id: nextUpdateId, ...update };
          nextUpdateId += 1;
          updates.push(stamped);
          for (const wake of waiters.splice(0, waiters.length)) wake();
        },
        close() {
          server.close();
        },
      });
    });
  });
}

/* ------------------------------------------------------------------ the rehearsal platform stand */

/**
 * Платформенный стенд репетиции: те же четыре поверхности, что зовёт фасад, — а в экспорте
 * НАСТОЯЩИЙ машинный бандл гейта M14а (fixture репозитория, тот же, на котором тестируется интейк)
 * плюс toy-скелет nodejs, чтобы приёмке стаб-задач было что запускать в чистом контейнере.
 */
async function startPlatformStand(): Promise<string> {
  const { zipSync } = await import('fflate');
  const fixture = join(REPO_ROOT, 'artifacts', 'gate-M14a', 'machine-bundle', 'bundle');
  if (!existsSync(fixture)) throw new Error(`fixture-бандл не найден: ${fixture}`);

  const entries: Record<string, Uint8Array> = {};
  for (const name of readdirSync(fixture, { recursive: true, encoding: 'utf8' })) {
    const full = join(fixture, name);
    if (!existsSync(full)) continue;
    try {
      entries[`bundle/${name.replaceAll('\\', '/')}`] = new Uint8Array(readFileSync(full));
    } catch {
      /* каталог — пропускаем */
    }
  }

  const toy: Record<string, string> = {
    'package.json': `${JSON.stringify(
      {
        name: 'rehearsal-toy',
        version: '0.1.0',
        private: true,
        type: 'module',
        description: 'Toy-скелет репетиции гейта M17а.',
        scripts: { test: 'node --test' },
      },
      null,
      2,
    )}\n`,
    'test/skeleton.test.js': [
      "import { test } from 'node:test';",
      "import assert from 'node:assert/strict';",
      '',
      "test('скелет репетиции жив', () => {",
      '  assert.equal(1, 1);',
      '});',
      '',
    ].join('\n'),
  };
  for (const [path, content] of Object.entries(toy)) {
    entries[path] = new TextEncoder().encode(content);
  }

  const zip = zipSync(entries);
  let stepCount = 0;

  const server = createServer((request, response) => {
    const url = request.url ?? '';
    const drain = () => request.on('data', () => undefined);
    drain();

    if (request.method === 'POST' && url === '/api/projects') {
      response.writeHead(201, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({ projectId: 'rehearsal-project', sessionId: 'rehearsal-session' }),
      );
      return;
    }
    if (request.method === 'POST' && url.endsWith('/autonomous/step')) {
      stepCount += 1;
      const done = stepCount >= 5;
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          kind: done ? 'stop' : 'generate',
          moved: !done,
          done,
          stopReason: done ? 'completed' : null,
          steps: stepCount,
        }),
      );
      return;
    }
    if (request.method === 'GET' && url.endsWith('/export/machine')) {
      response.writeHead(200, { 'content-type': 'application/zip' });
      response.end(Buffer.from(zip));
      return;
    }
    response.writeHead(404).end();
  });

  return new Promise((ready) => {
    server.listen(0, '127.0.0.1', () => {
      standCloseHooks.push(() => {
        server.close();
      });
      ready(`http://127.0.0.1:${String((server.address() as AddressInfo).port)}`);
    });
  });
}

const standCloseHooks: (() => void)[] = [];

/* ------------------------------------------------------------------ child processes */

const children: { label: string; child: ChildProcess }[] = [];

function spawnTracked(
  label: string,
  command: string,
  args: string[],
  options: { cwd: string; env?: Record<string, string | undefined> },
  sink: string[],
): ChildProcess {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const log = (chunk: Buffer) => {
    const text = chunk.toString('utf8');
    sink.push(text);
    for (const line of text.split('\n')) {
      if (line.trim() !== '') console.log(`  [${label}] ${line}`);
    }
  };
  child.stdout.on('data', log);
  child.stderr.on('data', log);

  children.push({ label, child });
  return child;
}

function killAll(): void {
  for (const { label, child } of children.reverse()) {
    if (child.pid === undefined) continue;
    note(`Остановка: ${label}.`);
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      child.kill('SIGTERM');
    }
  }
  children.length = 0;
}

async function waitFor(
  condition: () => Promise<boolean> | boolean,
  timeoutMs: number,
  what: string,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await condition()) return;
    if (Date.now() > deadline) {
      throw new Error(`${what}: условие не наступило за ${String(Math.round(timeoutMs / 1000))} с`);
    }
    await new Promise((settle) => setTimeout(settle, 500));
  }
}

function httpOk(url: string): Promise<boolean> {
  return fetch(url, { redirect: 'manual' })
    .then((response) => response.status < 500)
    .catch(() => false);
}

/** POST без предела на молчание тела (D-305): retry может думать, сколько думает план. */
function postJson(url: string, payload: unknown): Promise<{ status: number; text: string }> {
  return new Promise((settle, refuse) => {
    const body = JSON.stringify(payload);
    const target = new URL(url);
    const sent = httpRequest(
      {
        hostname: target.hostname,
        port: target.port,
        path: target.pathname,
        method: 'POST',
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
      },
      (response) => {
        const pieces: Buffer[] = [];
        response.on('data', (piece: Buffer) => pieces.push(piece));
        response.on('end', () => {
          settle({
            status: response.statusCode ?? 0,
            text: Buffer.concat(pieces).toString('utf8'),
          });
        });
      },
    );
    sent.on('error', refuse);
    sent.end(body);
  });
}

/* ------------------------------------------------------------------ docker sampling */

function executorContainers(): string[] {
  const listed = spawnSync(
    'docker',
    ['ps', '--filter', 'name=delivery-executor-', '--format', '{{.Names}}'],
    { encoding: 'utf8' },
  );
  if (listed.status !== 0) return [];
  return listed.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

/* ------------------------------------------------------------------ screens */

async function screenshot(page: Page, name: string): Promise<void> {
  mkdirSync(join(OUT, 'screens'), { recursive: true });
  await page.screenshot({ path: join(OUT, 'screens', `${name}.png`), fullPage: true });
  note(`Скрин: screens/${name}.png`);
}

/* ------------------------------------------------------------------ the walk */

const serverLogs = { platform: [] as string[], bridge: [] as string[], loop: [] as string[] };

async function main(): Promise<number> {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(join(OUT, 'screens'), { recursive: true });
  rmSync(WORKSPACE, { recursive: true, force: true });
  mkdirSync(WORKSPACE, { recursive: true });

  const startedAt = Date.now();
  const secrets = secretsUnderWatch();
  const ownerChatId = ownerChatIdFromEnv();
  note(
    `Гейт M17а: ${STUB ? 'РЕПЕТИЦИЯ на стабе исполнителя' : 'ЖИВОЙ прогон'}; секретов под надзором: ${String(secrets.length)}; чат владельца ${String(ownerChatId)}.`,
  );

  /* Свежая платформа (только живому прогону): прежняя база уезжает в сторону, не удаляется. */
  const localDb = join(REPO_ROOT, '.local', 'db');
  if (!STUB && existsSync(localDb)) {
    const backup = join(REPO_ROOT, '.local', `db-before-m17a-${String(Date.now())}`);
    renameSync(localDb, backup);
    note(`Прежняя платформенная база отложена: ${backup}`);
  }

  /* Docker нужен и репетиции: стаб-исполнитель — это контейнер со скриптом, не подмена докера. */
  const docker = spawnSync('docker', ['version', '--format', '{{.Server.Version}}'], {
    encoding: 'utf8',
  });
  if (docker.status !== 0) {
    throw new Error('Docker Desktop не отвечает — исполнителям (и стабовым тоже) негде работать.');
  }
  note(`Docker: ${docker.stdout.trim()}.`);

  /*
   * Приёмочные образы — ДО прогона (находка попытки 3): стек выбирает спецификация, которой ещё
   * нет, поэтому тянутся все пять. Недостающий образ посреди прогона — это красный цикл create→404
   * на каждой попытке задачи и BLOCKED от честного исполнителя, диагностировавшего среду.
   */
  for (const image of Object.values(ACCEPTANCE_IMAGES)) {
    const have = spawnSync('docker', ['image', 'inspect', image], { stdio: 'ignore' });
    if (have.status === 0) continue;
    note(`Тяну приёмочный образ ${image}…`);
    const pulled = spawnSync('docker', ['pull', image], { encoding: 'utf8' });
    if (pulled.status !== 0) {
      throw new Error(`не удалось дотянуть образ ${image}: ${(pulled.stderr || '').slice(-200)}`);
    }
  }
  note('Приёмочные образы на месте (все пять стеков).');

  /*
   * Репетиция (GATE_STUB=1) гоняет ВСЮ бухгалтерию прогулки быстро и без единого модельного
   * вызова: платформенную половину замещает стенд с НАСТОЯЩИМ машинным бандлом M14а в экспорте
   * (плюс toy-скелет nodejs в том же ZIP — приёмке стаб-задач нужен запускаемый проект), интейк
   * контура деградирует детерминированно (звено claude-cli в мёртвый порт — путь D-229),
   * исполнители — скриптованные контейнеры. Платформенная половина живьём доказана пробой 175 и
   * фасадными тестами; живой прогон гейта идёт по ней целиком.
   */
  let platformBaseForLoop = PLATFORM_URL;

  if (STUB) {
    const stub = await startPlatformStand();
    platformBaseForLoop = stub;
    note(
      `Репетиция: платформенный стенд на ${stub} (экспорт — настоящий бандл M14а + toy-скелет).`,
    );
  } else {
    /* ---------------------------------------------------------- 1. мост подписки (задача 175) */
    spawnTracked(
      'bridge',
      process.execPath,
      ['--env-file-if-exists=.env', 'src/bridge/serve.ts'],
      { cwd: LOOP_ROOT },
      serverLogs.bridge,
    );
    await waitFor(() => httpOk(`http://127.0.0.1:${String(BRIDGE_PORT)}/health`), 30_000, 'мост');
    note('Мост подписки отвечает на /health.');

    /* ------------------------------------------------- 2. платформа локального профиля */
    spawnTracked(
      'platform',
      process.execPath,
      [join(REPO_ROOT, 'scripts', 'local-stack.mjs'), 'up'],
      {
        cwd: REPO_ROOT,
        env: {
          LLM_PROVIDER_ORDER: 'ollama,google',
          OLLAMA_BASE_URL: `http://127.0.0.1:${String(BRIDGE_PORT)}/v1`,
          /*
           * Ёмкость локального звена — про МОСТ, не про ollama (находка живого прогона №1):
           * незаданная переменная означает олламское умолчание 4096, платформа честно пакует
           * промпт в 1843 токена и просит ответ в 2223 — а CLI-модель, переполнив кап, отдаёт
           * хвост-продолжение, и стражи дважды правы, что бракуют. Окно звена CLI —
           * Anthropic-класса; 200000 объявляет это той же переменной, какой заявляют ollama.
           */
          OLLAMA_CONTEXT_LENGTH: '200000',
          /*
           * Гейт-профиль платформы всегда нёс десятиминутный предел запроса (gate-M14a.live.ts) —
           * прогулка, не донёсшая его, получила находку №2 попытки 2: умолчание 60 с роняет
           * «звено» на каждой solution-генерации (замер: 100–120 c у моста), документы уезжают на
           * google, а ревью-вызов, упавший на обоих звеньях, оставляет драйвера перед закрытой
           * дверью (gate-refused). Предел — конфиг платформы, не её код.
           */
          LLM_REQUEST_TIMEOUT_MS: '600000',
        },
      },
      serverLogs.platform,
    );
    await waitFor(() => httpOk(`${PLATFORM_URL}/api/projects`), 240_000, 'платформа');
    note('Платформа локального профиля отвечает (цепочка: адаптер спереди, google запасным).');
  }

  /* ------------------------------------------------- 3. Bot API-стенд и сервер контура */
  const stand = await startBotApiStand(0);
  note(`Bot API-стенд слушает ${stand.base}.`);

  note('Сборка контура (next build)…');
  const built = spawnSync(
    process.execPath,
    [join(LOOP_ROOT, 'node_modules', 'next', 'dist', 'bin', 'next'), 'build', '--webpack'],
    { cwd: LOOP_ROOT, encoding: 'utf8' },
  );
  if (built.status !== 0) {
    throw new Error(
      `сборка контура не прошла: ${(built.stderr || built.stdout || '').slice(-600)}`,
    );
  }
  note('Контур собран.');

  spawnTracked(
    'loop',
    process.execPath,
    [join(LOOP_ROOT, 'node_modules', 'next', 'dist', 'bin', 'next'), 'start', '-H', '127.0.0.1'],
    {
      cwd: LOOP_ROOT,
      env: {
        PORT: String(LOOP_PORT),
        WORKSPACE_ROOT_PATH: WORKSPACE,
        LOOP_DB_PATH: join(WORKSPACE, '.loop', 'loop.db'),
        SPEC_PLATFORM_API_BASE: platformBaseForLoop,
        TELEGRAM_API_BASE: stand.base,
        TELEGRAM_BOT_TOKEN: GATE_TG_TOKEN,
        TELEGRAM_OWNER_CHAT_ID: String(ownerChatId),
        LOOP_PROVIDER_ORDER: STUB ? 'claude-cli' : 'claude-cli,google',
        CLAUDE_CLI_API_BASE: STUB
          ? 'http://127.0.0.1:1/v1'
          : `http://127.0.0.1:${String(BRIDGE_PORT)}/v1`,
        ...(STUB ? { LOOP_EXECUTOR_STUB: '1' } : {}),
      },
    },
    serverLogs.loop,
  );
  await waitFor(() => httpOk(`${LOOP_URL}/`), 180_000, 'контур');
  note(`Контур отвечает на ${LOOP_URL}; Telegram-шлюз должен был подняться сам.`);

  /* Шлюз жив, когда стенд получил setMyCommands и повис на getUpdates — дадим ему секунду-другую. */
  await new Promise((settle) => setTimeout(settle, 3_000));

  const browser: Browser = await chromium.launch();
  const page: Page = await browser.newPage({ viewport: VIEWPORT });

  const sendAsOwner = (text: string) => {
    tgFeed.push({ at: new Date().toISOString(), direction: '→боту', text });
    stand.push({
      message: { message_id: tgFeed.length, chat: { id: ownerChatId }, text },
    });
  };

  const outboxHas = (needle: string) => stand.outbox.some((entry) => entry.text.includes(needle));
  const outboxLast = (needle: string) =>
    [...stand.outbox].reverse().find((entry) => entry.text.includes(needle));

  try {
    /* ---------------------------------------------- 4. вход владельца: задумка и кнопка */
    note(`Задумка владельца уходит боту: «${IDEA}»`);
    sendAsOwner(IDEA);

    await waitFor(
      () => outboxHas('Запустить проект по этой задумке?'),
      PHASE_BUDGETS.confirmOfferMs,
      'предложение запуска',
    );
    const offer = outboxLast('Запустить проект по этой задумке?');
    const launchButton = offer?.reply_markup?.inline_keyboard
      .flat()
      .find((button) => button.callback_data.startsWith('idea:yes:'));
    if (launchButton === undefined) throw new Error('в предложении запуска нет кнопки «Запустить»');

    note('Кнопка «🚀 Запустить» нажата — с этого момента РУК НЕТ.');
    const handsOffAt = Date.now();
    stand.push({
      callback_query: {
        id: 'gate-confirm',
        data: launchButton.callback_data,
        message: { message_id: 1, chat: { id: ownerChatId } },
      },
    });

    /* ---------------------------------------------- 5. путь фасада, фаза за фазой */
    await waitFor(
      () => outboxHas('Платформа приняла задумку'),
      PHASE_BUDGETS.platformAcceptedMs,
      'звено «платформа/создание проекта»',
    );
    measure(
      `платформа приняла задумку за ${String(Math.round((Date.now() - handsOffAt) / 1000))} с после кнопки`,
    );

    await waitFor(
      () => outboxHas('Спецификация готова') || outboxHas('отказало'),
      PHASE_BUDGETS.specReadyMs,
      'звено «платформа/драйвер»',
    );
    if (outboxHas('отказало')) {
      throw new Error(`звено отказало: ${outboxLast('отказало')?.text.split('\n')[0] ?? ''}`);
    }
    const specReadyAt = Date.now();
    measure(
      `спецификация готова: ${outboxLast('Спецификация готова')?.text.replaceAll('\n', ' · ') ?? ''} (${String(Math.round((specReadyAt - handsOffAt) / 60_000))} мин от кнопки)`,
    );

    await waitFor(
      () => outboxHas('Бандл получен') || outboxHas('отказало'),
      PHASE_BUDGETS.bundleMs,
      'звено «платформа/машинный экспорт»',
    );
    if (outboxHas('отказало')) {
      throw new Error(`звено отказало: ${outboxLast('отказало')?.text.split('\n')[0] ?? ''}`);
    }
    const bundleAlert = outboxLast('Бандл получен')?.text ?? '';
    const projectDirectory = /→ (.+)$/m.exec(bundleAlert)?.[1]?.trim() ?? '';
    if (projectDirectory === '' || !existsSync(join(projectDirectory, 'bundle'))) {
      throw new Error(`каталог бандла из алерта не найден на диске: «${projectDirectory}»`);
    }
    measure(`бандл на диске: ${projectDirectory}`);

    await waitFor(
      () => outboxHas('Контур принял план') || outboxHas('отказало'),
      PHASE_BUDGETS.planAcceptedMs,
      'звено «контур/start-loop»',
    );
    if (outboxHas('отказало')) {
      throw new Error(`звено отказало: ${outboxLast('отказало')?.text.split('\n')[0] ?? ''}`);
    }
    measure(
      `контур принял план: ${outboxLast('Контур принял план')?.text.replaceAll('\n', ' · ') ?? ''}`,
    );

    await page.goto(LOOP_URL);
    await screenshot(page, '01-loop-plan-accepted');

    /* ---------------------------------------------- 6. конвейер до успеха, с надзором */
    let peakExecutors = 0;
    let resumes = 0;
    let lastSeenFreezeAt = 0;

    for (;;) {
      if (Date.now() - startedAt > BUDGET_MS) {
        throw new Error(`бюджет прогулки исчерпан (${String(Math.round(BUDGET_MS / 60_000))} мин)`);
      }

      const running = executorContainers();
      if (running.length > peakExecutors) {
        peakExecutors = running.length;
        measure(`пик исполнителей: ${String(peakExecutors)} (${running.join(', ')})`);
      }

      if (outboxHas('Проект завершён')) break;

      /*
       * Блокировка — легитимная остановка исполнителя, требующая ЧЕЛОВЕКА (протокол задачи 157);
       * прогулке автоматизировать владельца тут нечестно — она падает сразу с текстом блокировки
       * (находка попытки 3: молчаливое догорание бюджета час скрывало остановившийся конвейер).
       */
      const blockedAlert = outboxLast('Задача заблокирована');
      if (blockedAlert !== undefined && Date.parse(blockedAlert.at) > handsOffAt) {
        throw new Error(
          `исполнитель заблокировал задачу — нужен человек: ${blockedAlert.text.split('\n').slice(0, 4).join(' · ')}`,
        );
      }

      /*
       * Настоящий красный вердикт замораживает конвейер и алертит владельца; владелец жал бы
       * «Возобновить». Прогулка делает то же самое тем же штатным эндпоинтом — считая и записывая
       * каждый раз (как M16а), потому что «без рук» — это про человека, а не про кнопку продукта.
       */
      const freezeAlert = outboxLast('Красный CI');
      if (freezeAlert !== undefined) {
        const freezeStamp = Date.parse(freezeAlert.at);
        if (freezeStamp > lastSeenFreezeAt) {
          lastSeenFreezeAt = freezeStamp;
          resumes += 1;
          if (resumes > MAX_AUTO_RESUMES) {
            throw new Error(
              `красных заморозок больше ${String(MAX_AUTO_RESUMES)} — конвейер ходит по кругу`,
            );
          }
          finding(
            `красный CI №${String(resumes)}: ${freezeAlert.text.split('\n').slice(0, 3).join(' · ')} — прогулка жмёт «Возобновить»`,
          );
          await new Promise((settle) => setTimeout(settle, 3_000));
          const resumed = await postJson(`${LOOP_URL}/api/orchestrator/retry`, {
            projectDirectory,
          });
          note(`retry → ${String(resumed.status)}`);
        }
      }

      await new Promise((settle) => setTimeout(settle, 5_000));
    }

    const completedAt = Date.now();
    measure(
      `✅ путь целиком: от кнопки до «Проект завершён» ${String(Math.round((completedAt - handsOffAt) / 60_000))} мин; пик исполнителей ${String(peakExecutors)}; возобновлений ${String(resumes)}`,
    );

    await page.goto(LOOP_URL);
    await screenshot(page, '02-loop-completed');

    /* ---------------------------------------------- 7. отложенный голос и /status в том же прогоне */
    const before = stand.outbox.length;
    stand.push({
      message: {
        message_id: 900,
        chat: { id: ownerChatId },
        voice: { file_id: 'gate-voice-1', mime_type: 'audio/ogg', duration: 3 },
      },
    });
    await waitFor(() => stand.outbox.length > before, 60_000, 'ответ на голосовое');
    const voiceReply = stand.outbox.at(-1)?.text ?? '';
    if (!voiceReply.includes('Голос отложен решением владельца')) {
      throw new Error(`на голосовое пришёл не именованный ответ: «${voiceReply.slice(0, 120)}»`);
    }
    measure('голосовое → именованный ответ «Голос отложен решением владельца» (задача 165, А-29)');

    const beforeStatus = stand.outbox.length;
    sendAsOwner('/status');
    await waitFor(() => stand.outbox.length > beforeStatus, 60_000, 'ответ /status');
    measure(`/status: ${stand.outbox.at(-1)?.text.split('\n').slice(0, 2).join(' · ') ?? ''}`);

    /* ---------------------------------------------- 8. улики: handoff-дерево и продукт */
    const handoffDirectory = join(projectDirectory, 'handoff');
    const snapshot = join(OUT, 'handoff');
    mkdirSync(snapshot, { recursive: true });
    cpSync(join(handoffDirectory, 'tasks'), join(snapshot, 'tasks'), { recursive: true });
    if (existsSync(join(handoffDirectory, 'reports'))) {
      cpSync(join(handoffDirectory, 'reports'), join(snapshot, 'reports'), { recursive: true });
    }
    const productFiles = readdirSync(projectDirectory, { recursive: true, encoding: 'utf8' });
    writeFileSync(
      join(OUT, 'product-tree.txt'),
      productFiles
        .filter((path) => !path.includes('node_modules'))
        .sort()
        .join('\n'),
      'utf8',
    );
    measure(`handoff-дерево и дерево продукта сняты (${String(productFiles.length)} записей)`);

    return 0;
  } finally {
    await browser.close().catch(() => undefined);

    /* ---------------------------------------------- 9. красные условия и артефакты */
    const everything = [
      JSON.stringify(stand.outbox),
      tgFeed.map((entry) => entry.text).join('\n'),
      serverLogs.platform.join(''),
      serverLogs.bridge.join(''),
      serverLogs.loop.join(''),
      steps.map((step) => step.what).join('\n'),
    ].join('\n');

    for (const secret of secretsUnderWatch()) {
      if (everything.includes(secret.value)) {
        finding(`КРАСНОЕ: значение ${secret.name} найдено в артефактах прогулки`);
      }
    }
    if (everything.includes('database is locked')) {
      finding('КРАСНОЕ: «database is locked» в логах');
    }
    const maxListeners = (serverLogs.loop.join('').match(/MaxListenersExceededWarning/g) ?? [])
      .length;
    measure(`MaxListenersExceededWarning в логе контура: ${String(maxListeners)}`);

    writeFileSync(
      join(OUT, 'tg-feed.md'),
      [
        '# Лента Telegram — гейт M17а',
        '',
        ...tgFeed.map(
          (entry) =>
            `- \`${entry.at}\` **${entry.direction}**: ${entry.text.replaceAll('\n', ' ⏎ ')}`,
        ),
        '',
      ].join('\n'),
      'utf8',
    );

    writeFileSync(join(OUT, 'server-loop.log'), serverLogs.loop.join(''), 'utf8');
    writeFileSync(join(OUT, 'server-platform.log'), serverLogs.platform.join(''), 'utf8');
    writeFileSync(join(OUT, 'server-bridge.log'), serverLogs.bridge.join(''), 'utf8');

    writeFileSync(
      join(OUT, 'RESULT.md'),
      [
        `# Гейт M17а — сквозной путь без рук (${STUB ? 'репетиция на стабе' : 'живой прогон'})`,
        '',
        `Дата: ${new Date().toISOString()}. Задумка: «${IDEA}»`,
        '',
        '## Замеры',
        '',
        ...measurements.map((line) => `- ${line}`),
        '',
        '## Находки',
        '',
        ...(findings.length === 0 ? ['_Нет._'] : findings.map((line) => `- ${line}`)),
        '',
        '## Шаги',
        '',
        ...steps.map((step) => `- \`${step.at}\` ${step.what}`),
        '',
      ].join('\n'),
      'utf8',
    );

    stand.close();
    for (const close of standCloseHooks) close();
    killAll();
    spawnSync(process.execPath, [join(REPO_ROOT, 'scripts', 'local-stack.mjs'), 'down'], {
      cwd: REPO_ROOT,
      stdio: 'ignore',
    });
    note(`Артефакты: ${OUT}`);
  }
}

main()
  .then((code) => {
    const red = findings.some((line) => line.startsWith('КРАСНОЕ'));
    console.log(red ? 'ГЕЙТ КРАСНЫЙ (см. находки)' : 'ГЕЙТ ЗАВЕРШЁН');
    process.exitCode = red ? 1 : code;
  })
  .catch((error: unknown) => {
    console.error(`ГЕЙТ ОБОРВАН: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
