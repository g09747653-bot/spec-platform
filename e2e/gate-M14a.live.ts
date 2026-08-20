/* eslint-disable no-restricted-properties -- a hand-run walk, not application code: it takes its
   configuration from the environment because that is how a person points it at this machine. */
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { get } from 'node:http';

import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import Ajv from 'ajv';
import { unzipSync } from 'fflate';
import pg from 'pg';

/**
 * **Гейт M14а — живая прогулка локального профиля** (task 151; А-2.1; А-20).
 *
 * The claim under test is the milestone itself: the whole stack comes up by the customer's own
 * command, nobody signs in because there is nobody to sign in — the deployment owns its owner —
 * and a full autonomous run carries a short Russian seed to a sealed bundle on the same gates as
 * ever. Mid-walk the **entire stack is taken down and brought back** by the same two commands, at a
 * collect position (no generation in flight — the orphaned-`running` defect is Backlog B-1, known
 * and deliberately not fixed here), and the walk proves the restart cost nothing: rows dumped from
 * the dead stack's directory are compared byte-for-byte with the same rows after the run completes.
 *
 * Modelled on `dogfood-A0.live.ts` — the same watch, the same liveness, the same honesty rule (an
 * honest named stop is a finding, not a failure) — plus this gate's own red condition: **any OAuth
 * surface on screen in local mode is red** (sign-out, provider buttons, an account email; `/signin`
 * answering anything but 404).
 *
 * The machine export (task 150) is fixed at the end through its endpoint — cookie-less GET, like
 * everything else here — and validated with AJV against the shared schema fixtures, the same files
 * the unit suite pins. Its sha256 goes into the report.
 *
 * Usage (gate profile — fresh key first, local fallback with the declared window):
 *   1. close the Ollama tray app if it is running (it holds 11434 with a 4096 window — А-8);
 *      OLLAMA_CONTEXT_LENGTH=16384 OLLAMA_KEEP_ALIVE=4h OLLAMA_NUM_PARALLEL=1 ollama serve
 *   2. node --experimental-strip-types e2e/gate-M14a.live.ts
 * The walk starts and stops the local stack itself (scripts/local-stack.mjs), so nothing else may
 * hold ports 3000/5499, and no other `next dev` may run in this directory.
 */
const APP_PORT = Number(process.env.LOCAL_PORT ?? 3000);
const DB_PORT = Number(process.env.LOCAL_DB_PORT ?? 5499);
const BASE_URL = `http://127.0.0.1:${String(APP_PORT)}`;
const LOCAL_DATABASE_URL = `postgres://postgres:postgres@127.0.0.1:${String(DB_PORT)}/postgres`;
const OUT = process.env.GATE_OUT ?? 'artifacts/gate-M14a';

const METHODOLOGY = process.env.GATE_METHODOLOGY ?? 'myspec-greenfield-v1';

/**
 * The seed — deliberately **short** (the gate's own words: «от короткого русского seed»). The A0
 * dogfood proved the long-brief case; this gate proves the everyday one: one sentence of idea, the
 * platform does the rest.
 */
const SEED =
  process.env.GATE_IDEA ??
  'Консольный планировщик личных дел: добавить дело с датой, показать список на сегодня, отметить сделанное; данные хранятся локально в файле.';

const VIEWPORT = { width: 1440, height: 900 };

/** Far past any honest ending; the run's real bounds are its own budgets (see dogfood-A0). */
const RUN_BUDGET_MS = Number(process.env.GATE_RUN_BUDGET_MS ?? 14_400_000);

/** Controls that move the session on. Zero of them usable on a session page is a red run (Д-1). */
const SESSION_CONTROLS = [
  'ask-round',
  'proceed',
  'generate-spec',
  'stop-generation',
  'viewer-stop-generation',
  'stop-waiting',
  'mcq-submit',
  'mcq-reply-toggle',
  'mcq-reply-send',
  'fallback-submit',
  'approve-spec',
  'review-accept',
  'review-ignore',
  'review-request-changes',
  'accept-diff',
  'reject-diff',
  'submit-refinement',
  'chat-send',
  'download-export',
  'driver-stop',
];

/** The OAuth surface — none of these may exist on any page of a local deployment (gate red). */
const OAUTH_SURFACE = ['sign-out', 'signin-google', 'signin-github', 'account-email'];

const problems: string[] = [];
const consoleErrors: string[] = [];
const notes: string[] = [];
const measurements: string[] = [];
const driverLog: string[] = [];
const feedLog: string[] = [];
const boardLog: string[] = [];
const exportLog: string[] = [];
const restartLog: string[] = [];

let step = 0;
let clicks = 0;
const startedAt = Date.now();

const stamp = () => `${String(Math.round((Date.now() - startedAt) / 1000))}s`;

function say(line: string): void {
  console.log(`[${stamp()}] ${line}`);
  notes.push(`- \`${stamp()}\` ${line}`);
}

function problem(line: string): void {
  console.log(`[${stamp()}] PROBLEM: ${line}`);
  problems.push(`\`${stamp()}\` ${line}`);
}

function measure(line: string): void {
  console.log(`[${stamp()}] · ${line}`);
  measurements.push(`- ${line}`);
}

/**
 * Console noise a browser makes that is not the product's fault. The restart window adds its own
 * honest noise — every in-flight fetch of a dead server fails — and those shapes are listed rather
 * than the check disarmed: anything else in the console is still red.
 */
const EXPECTED_CONSOLE = [
  /Failed to load resource/i,
  /net::ERR_ABORTED/i,
  /net::ERR_CONNECTION_REFUSED/i,
  /net::ERR_CONNECTION_RESET/i,
  /The user aborted a request/i,
  /Failed to fetch/i,
  /NS_BINDING_ABORTED/i,
  /ERR_NETWORK_CHANGED/i,
  // The dev server's HMR socket dying is the restart window's own honest noise.
  /WebSocket is already in CLOSING or CLOSED state/i,
];

/* ------------------------------------------------------------------ the stack, by its own commands */

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function waitForHttp(timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const attempt = () => {
      const request = get({ host: '127.0.0.1', port: APP_PORT, path: '/' }, (response) => {
        response.resume();
        resolve();
      });
      request.on('error', () => {
        if (Date.now() > deadline) reject(new Error('приложение не ответило после подъёма стека'));
        else setTimeout(attempt, 500);
      });
    };
    attempt();
  });
}

let stack: ChildProcess | null = null;

/**
 * `pnpm local:up`, verbatim machinery: the same script the README hands the customer.
 *
 * The three variables below are the **gate's profile**, not the stack's (the exact trio
 * `dev-gate.mjs` sets, for the same reasons): the funded provider first with the free local one
 * behind it, the raised per-provider budget a local model needs, and the window the gate's
 * `ollama serve` was started with, declared to the assembler (А-8). Each yields to an explicit
 * override so a deliberate single-provider walk stays possible.
 */
async function stackUp(label: string): Promise<void> {
  const log = openSync(`${OUT}/local-up.log`, 'a');
  stack = spawn(process.execPath, ['scripts/local-stack.mjs', 'up'], {
    stdio: ['ignore', log, log],
    env: {
      ...process.env,
      LLM_PROVIDER_ORDER: process.env.LLM_PROVIDER_ORDER ?? 'google,ollama',
      LLM_REQUEST_TIMEOUT_MS: process.env.LLM_REQUEST_TIMEOUT_MS ?? '600000',
      OLLAMA_CONTEXT_LENGTH: process.env.OLLAMA_CONTEXT_LENGTH ?? '16384',
    },
  });

  const died = new Promise<never>((_, reject) => {
    stack?.on('exit', (code) => {
      reject(new Error(`local:up завершился (код ${String(code)}) — см. ${OUT}/local-up.log`));
    });
  });

  await Promise.race([waitForHttp(240_000), died]);
  say(`стек поднят (${label})`);
}

/** `pnpm local:down`, the customer's other command. Kills the supervisor tree by the pidfile. */
function stackDown(label: string): void {
  execFileSync(process.execPath, ['scripts/local-stack.mjs', 'down'], { stdio: 'ignore' });
  stack = null;
  say(`стек погашен (${label})`);
}

/* ------------------------------------------------------------------ database, post-run only */

/**
 * One query over the wire, for after the run. **Never called while the run is moving** — a second
 * connection into a live PGlite hangs; mid-walk state is read from the page, and the restart dump
 * reads the directory while the stack is down.
 */
async function query<T extends pg.QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const client = new pg.Client({ connectionString: LOCAL_DATABASE_URL });
  await client.connect();

  try {
    return (await client.query<T>(sql, params)).rows;
  } finally {
    await client.end();
  }
}

/* ------------------------------------------------------------------ snapshots, liveness, the red check */

async function oauthSurfaceCheck(page: Page, where: string): Promise<void> {
  const visible = await page.evaluate((ids: string[]) => {
    return ids.filter((id) => {
      const element = document.querySelector(`[data-testid="${id}"]`);
      return element instanceof HTMLElement && element.checkVisibility();
    });
  }, OAUTH_SURFACE);

  if (visible.length > 0) {
    problem(`OAuth-поверхность на экране в локальном режиме (${where}): ${visible.join(', ')}`);
  }
}

async function stillAlive(page: Page, where: string): Promise<void> {
  const live = await page.evaluate((ids: string[]) => {
    return ids.filter((id) => {
      const element = document.querySelector(`[data-testid="${id}"]`);
      return (
        element instanceof HTMLElement &&
        element.checkVisibility() &&
        !element.hasAttribute('disabled')
      );
    });
  }, SESSION_CONTROLS);

  if (live.length === 0) {
    problem(`Д-1: no usable control on the page at ${where}`);
    return;
  }

  say(`alive at ${where}: ${live.join(', ')}`);
}

async function snapshot(page: Page, label: string): Promise<string> {
  step += 1;
  const name = `${String(step).padStart(2, '0')}-${label.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;
  mkdirSync(`${OUT}/screens`, { recursive: true });
  // `caret: 'initial'` — the instrument must not edit the page it is judging (D-110).
  await page.screenshot({ path: `${OUT}/screens/${name}.png`, fullPage: false, caret: 'initial' });

  return `screens/${name}.png`;
}

/** A click, counted. After the creation click this number must never move again. */
async function click(page: Page, testId: string): Promise<void> {
  clicks += 1;
  await page.getByTestId(testId).click();
}

/* ------------------------------------------------------------------ the session, cookieless */

/**
 * The auto-owner session is the whole point: **no cookie is planted anywhere in this walk.** The
 * browser context starts empty except for the interface-language cookie, which is UI state, not
 * authentication. Landing on the projects page from `/` IS the assertion that the server made the
 * session (task 148 AC-1) — a login screen anywhere here is a red walk.
 */
async function createSession(page: Page): Promise<string> {
  await page.goto(`${BASE_URL}/`);
  await page.waitForURL(/\/projects$/, { timeout: 60_000 });
  say('открыт `/` без cookie — сервер привёл в проекты владельца сам');

  await oauthSurfaceCheck(page, 'the projects page');
  const localBadge = await page.getByTestId('account-local').count();
  if (localBadge === 0)
    problem('на странице проектов нет метки локального владельца (account-local)');

  await page.getByTestId('create-project').waitFor({ state: 'visible', timeout: 60_000 });
  await page.waitForFunction(() => {
    const button = document.querySelector('[data-testid="create-project"]');
    return button instanceof HTMLButtonElement && !button.disabled;
  });
  await snapshot(page, 'projects-as-owner');

  await page.getByTestId('prompt-input').fill(SEED);
  await page.getByTestId('audience-technical').check();
  await page.getByTestId('style-concrete').check();
  await page.getByTestId('autonomous-toggle').check();
  await page.getByTestId(`methodology-${METHODOLOGY}`).check();
  await click(page, 'create-project');

  await page.getByTestId('session').waitFor({ state: 'visible', timeout: 120_000 });

  return page.url();
}

/* ------------------------------------------------------------------ watching, with one restart */

interface RunProgress {
  stage: string;
  substage: string;
  steps: number;
  driverNotes: number;
  stopReason: string;
}

async function readProgress(page: Page): Promise<RunProgress> {
  return page.evaluate(() => {
    const attribute = (testId: string, name: string) =>
      document.querySelector(`[data-testid="${testId}"]`)?.getAttribute(name) ?? '';

    return {
      stage: attribute('stage-current', 'data-stage'),
      substage: attribute('stage-substage', 'data-substage'),
      steps: Number(attribute('driver-panel', 'data-steps') || '0'),
      driverNotes: document.querySelectorAll('[data-msg-origin="driver"]').length,
      stopReason: attribute('driver-panel', 'data-stop-reason'),
    };
  });
}

/**
 * Stages at whose `collect` position the mid-walk restart may fire (mid-journey, no stream).
 *
 * `GATE_RESTART=0` empties the set. The restart is this walk's own claim (task 149 AC) and stays on
 * by default; the switch exists because the walk is also the only way to *produce* a bundle, and
 * M15а needed one without the restart in the way — which is what isolated the finding that the
 * driver stalls at `requirements/collect` right after the stack comes back.
 */
const RESTART_STAGES =
  process.env.GATE_RESTART === '0'
    ? new Set<string>()
    : new Set(['requirements', 'solution', 'tasks']);

interface RestartEvidence {
  dumpPath: string;
  atStage: string;
  atSubstage: string;
}

/**
 * The restart itself: the customer's `down`, a dump of what the dead directory holds, the
 * customer's `up`, and the same session page reopened. The dump is the authoritative "before" —
 * nothing can move while the stack is down — and the end-of-walk comparison reads the same rows
 * back over the wire once the run has finished.
 */
async function restartMidWalk(page: Page, sessionUrl: string): Promise<RestartEvidence> {
  const before = await readProgress(page);
  await snapshot(page, `restart-before-${before.stage}-${before.substage}`);
  restartLog.push(
    `- \`${stamp()}\` рестарт запрошен на позиции **${before.stage}/${before.substage}**, шагов ${String(before.steps)}`,
  );

  stackDown('mid-walk');
  await sleep(2_000);

  const dumpPath = `${OUT}/restart-dump.json`;
  execFileSync(process.execPath, ['e2e/gate-M14a.dump.mjs', dumpPath], { stdio: 'inherit' });
  restartLog.push(`- \`${stamp()}\` дамп мёртвого каталога снят: \`restart-dump.json\``);

  await stackUp('mid-walk restart');

  await page.goto(sessionUrl, { timeout: 120_000 });
  await page.getByTestId('session').waitFor({ state: 'visible', timeout: 120_000 });

  const after = await readProgress(page);
  const dump = JSON.parse(readFileSync(dumpPath, 'utf8')) as Record<string, string[]>;
  const workflowRow = JSON.parse(dump.workflow_state?.[0] ?? '{}') as {
    stage?: string;
    substage?: string | null;
  };

  if (after.stage !== (workflowRow.stage ?? '')) {
    problem(
      `после рестарта страница показывает позицию ${after.stage}, а диск держал ${workflowRow.stage ?? '—'}`,
    );
  } else {
    restartLog.push(
      `- \`${stamp()}\` страница после подъёма показывает ровно позицию диска: **${after.stage}/${after.substage || '—'}**`,
    );
  }

  await oauthSurfaceCheck(page, 'the reopened session');
  await stillAlive(page, 'the session after the stack restart');
  await snapshot(page, `restart-after-${after.stage}-${after.substage}`);

  return { dumpPath, atStage: before.stage, atSubstage: before.substage };
}

async function watchTheRun(
  page: Page,
  sessionUrl: string,
): Promise<{ finished: RunProgress; restart: RestartEvidence | null }> {
  const seen = new Set<string>();
  const deadline = Date.now() + RUN_BUDGET_MS;
  let last: RunProgress = await readProgress(page);
  let restart: RestartEvidence | null = null;

  while (Date.now() < deadline) {
    const progress = await readProgress(page);

    const key = `${progress.stage}/${progress.substage}`;
    if (!seen.has(key) && progress.stage !== '') {
      seen.add(key);
      const shot = await snapshot(page, `auto-${key}`);
      driverLog.push(
        `- \`${stamp()}\` **${key}** — шагов ${String(progress.steps)}, записей драйвера ${String(
          progress.driverNotes,
        )} · \`${shot}\``,
      );
      await stillAlive(page, key);
      await oauthSurfaceCheck(page, key);
    }

    if (
      restart === null &&
      RESTART_STAGES.has(progress.stage) &&
      progress.substage === 'collect' &&
      progress.stopReason === ''
    ) {
      restart = await restartMidWalk(page, sessionUrl);
    }

    if (progress.stage === 'complete' || progress.stopReason !== '') {
      last = progress;
      break;
    }

    last = progress;
    await page.waitForTimeout(4_000);
  }

  if (last.stage !== 'complete' && last.stopReason === '') {
    problem(
      `the watch ran out of its ${String(RUN_BUDGET_MS / 60_000)}-minute budget with the run still moving at ${last.stage}/${last.substage}`,
    );
  }
  if (restart === null) {
    problem('окно для рестарта (collect средней стадии) так и не наступило — рестарт не исполнен');
  }

  return { finished: last, restart };
}

/* ------------------------------------------------------------------ persistence: the comparison */

/**
 * Every row the dead directory held must come back over the wire once the run has ended.
 *
 * Immutable material — revisions, feed messages — must be **byte-identical** (`row_to_json` text
 * against `row_to_json` text). Rows the run legitimately keeps writing to (the session's workflow
 * position, boards awaiting decisions, the run row itself) are asserted by identity: the row still
 * exists. A restart that lost or mutated history fails loudly either way.
 */
const BYTE_IDENTICAL_TABLES = [
  'users',
  'spec_revisions',
  'session_messages',
  'question_rounds',
  'answers',
] as const;

/**
 * Byte-identical **except** the named columns, which the run legitimately writes after the restart.
 * `sessions` earned its entry in the rehearsal: sealing the session increments `completion_count`,
 * and the quality offer at the tasks gate may write `quality_enabled` — everything else in the row
 * must come back byte-for-byte.
 */
const PARTIAL_TABLES: Readonly<Record<string, readonly string[]>> = {
  sessions: ['completion_count', 'quality_enabled'],
};

/*
 * Rows the run legitimately writes to after the restart: the project's `updated_at` is touched by
 * activity, `spec_files.current_revision` is a moving pointer, the workflow position and the run
 * row advance, boards gain decisions. Their identity surviving is the claim; their bytes moving is
 * the product working.
 */
const IDENTITY_TABLES = [
  'projects',
  'spec_files',
  'workflow_state',
  'review_feedback',
  'autonomous_runs',
] as const;

async function comparePersistence(dumpPath: string): Promise<void> {
  const dump = JSON.parse(readFileSync(dumpPath, 'utf8')) as Record<string, string[]>;

  for (const table of BYTE_IDENTICAL_TABLES) {
    const before = dump[table] ?? [];
    const after = await query<{ row: string }>(
      `SELECT row_to_json(t)::text AS row FROM (SELECT * FROM ${table} ORDER BY id) t`,
    );
    const now = new Set(after.map((entry) => entry.row));

    const lost = before.filter((row) => !now.has(row));
    if (lost.length > 0) {
      problem(
        `${table}: ${String(lost.length)} строк(и) из дампа перед рестартом не вернулись байт-в-байт`,
      );
      for (const row of lost.slice(0, 2))
        restartLog.push(`  · потеряно/изменено: \`${row.slice(0, 160)}…\``);
    } else {
      restartLog.push(
        `- ${table}: все ${String(before.length)} строк дампа вернулись байт-в-байт (после прогона строк ${String(after.length)})`,
      );
    }
  }

  for (const [table, movable] of Object.entries(PARTIAL_TABLES)) {
    const strip = (row: string): string => {
      const parsed = JSON.parse(row) as Record<string, unknown>;
      const kept = Object.entries(parsed).filter(([column]) => !movable.includes(column));
      return JSON.stringify(Object.fromEntries(kept));
    };

    const before = (dump[table] ?? []).map(strip);
    const after = await query<{ row: string }>(
      `SELECT row_to_json(t)::text AS row FROM (SELECT * FROM ${table} ORDER BY id) t`,
    );
    const now = new Set(after.map((entry) => strip(entry.row)));

    const lost = before.filter((row) => !now.has(row));
    if (lost.length > 0) {
      problem(
        `${table}: ${String(lost.length)} строк(и) из дампа не вернулись байт-в-байт (сверх законных колонок ${movable.join(', ')})`,
      );
      for (const row of lost.slice(0, 2))
        restartLog.push(`  · потеряно/изменено: \`${row.slice(0, 160)}…\``);
    } else {
      restartLog.push(
        `- ${table}: все ${String(before.length)} строк дампа вернулись байт-в-байт, не считая законных колонок (${movable.join(', ')})`,
      );
    }
  }

  for (const table of IDENTITY_TABLES) {
    const before = dump[table] ?? [];
    const ids = before
      .map((row) => JSON.parse(row) as { id?: string; session_id?: string })
      .map((row) => row.id ?? row.session_id ?? '');
    const key = table === 'workflow_state' ? 'session_id' : 'id';
    const after = await query<{ id: string }>(`SELECT ${key}::text AS id FROM ${table}`);
    const now = new Set(after.map((entry) => entry.id));

    const lost = ids.filter((id) => !now.has(id));
    if (lost.length > 0) {
      problem(`${table}: ${String(lost.length)} строк(и) из дампа исчезли после рестарта`);
    } else {
      restartLog.push(
        `- ${table}: все ${String(before.length)} строк дампа на месте (двигались законно: позиция, решения, шаги)`,
      );
    }
  }
}

/* ------------------------------------------------------------------ fixing the exports */

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

async function fixTheExports(context: BrowserContext, projectId: string): Promise<void> {
  /* The classic ZIP — byte-for-byte as the parity contract prints it. */
  const zipResponse = await context.request.get(
    `${BASE_URL}/api/projects/${projectId}/export?mode=default`,
  );

  if (!zipResponse.ok()) {
    problem(`ZIP-экспорт ответил ${String(zipResponse.status())}`);
  } else {
    const zip = new Uint8Array(await zipResponse.body());
    writeFileSync(`${OUT}/bundle.zip`, zip);
    exportLog.push(`- \`bundle.zip\` — ${String(zip.byteLength)} байт, sha256 \`${sha256(zip)}\``);
    const headers = zipResponse.headers();
    exportLog.push(
      `- ZIP: режим \`${headers['x-spec-export-mode'] ?? '—'}\`, включено \`${headers['x-spec-export-included'] ?? '—'}\`, опущено \`${headers['x-spec-export-omitted'] === '' ? 'ничего' : (headers['x-spec-export-omitted'] ?? '—')}\``,
    );
  }

  /* The machine bundle — the inter-app contract, AJV-validated right here (task 150). */
  const machineResponse = await context.request.get(
    `${BASE_URL}/api/projects/${projectId}/export/machine`,
  );

  if (!machineResponse.ok()) {
    problem(`машинный экспорт ответил ${String(machineResponse.status())}`);
    return;
  }

  const machine = new Uint8Array(await machineResponse.body());
  writeFileSync(`${OUT}/machine-bundle.zip`, machine);
  exportLog.push(
    `- \`machine-bundle.zip\` — ${String(machine.byteLength)} байт, **sha256 \`${sha256(machine)}\`**`,
  );

  const headers = machineResponse.headers();
  exportLog.push(
    `- machine: режим \`${headers['x-spec-export-mode'] ?? '—'}\`, включено \`${headers['x-spec-export-included'] ?? '—'}\`, опущено \`${headers['x-spec-export-omitted'] === '' ? 'ничего' : (headers['x-spec-export-omitted'] ?? '—')}\``,
  );

  const entries = unzipSync(machine);
  mkdirSync(`${OUT}/machine-bundle/bundle`, { recursive: true });
  for (const [name, bytes] of Object.entries(entries)) {
    if (name.includes('..')) {
      problem(`машинный бандл несёт запись с обратным путём «${name}»`);
      continue;
    }
    writeFileSync(`${OUT}/machine-bundle/${name}`, bytes);
    exportLog.push(`- \`${name}\` — ${String(bytes.byteLength)} байт, sha256 \`${sha256(bytes)}\``);
  }

  const expectedEntries = [
    'bundle/constitution.md',
    'bundle/architecture.md',
    'bundle/requirements.json',
    'bundle/tasks.json',
  ];
  const actual = Object.keys(entries).sort();
  if (JSON.stringify(actual) !== JSON.stringify([...expectedEntries].sort())) {
    problem(`машинный бандл держит записи [${actual.join(', ')}] вместо контрактных четырёх`);
  }

  const ajv = new Ajv({ allErrors: true });
  const decoder = new TextDecoder();

  const pairs: [string, string][] = [
    ['bundle/requirements.json', 'fixtures/spec-bundle/requirements_schema.json'],
    ['bundle/tasks.json', 'fixtures/spec-bundle/tasks_schema.json'],
  ];

  for (const [entry, schemaPath] of pairs) {
    const bytes = entries[entry];
    if (bytes === undefined) continue;

    const validate = ajv.compile(JSON.parse(readFileSync(schemaPath, 'utf8')) as object);
    const payload: unknown = JSON.parse(decoder.decode(bytes));

    if (validate(payload)) {
      exportLog.push(`- \`${entry}\` **валиден** против \`${schemaPath}\` (AJV)`);
    } else {
      problem(`${entry} НЕ валиден против ${schemaPath}: ${ajv.errorsText(validate.errors)}`);
    }

    /*
     * Valid and empty are different verdicts. An empty array satisfies AJV, and that is exactly how
     * the first run of this walk shipped zero tasks out of a 17-KB plan — the mapping had not met
     * the live document's shape yet. A row count of zero beside a non-trivial source document is a
     * mapping defect, and it is red here so it can never again hide behind a green schema check.
     */
    const rows =
      entry === 'bundle/tasks.json'
        ? (payload as { tasks?: unknown[] }).tasks?.length
        : ((payload as { functionalRequirements?: unknown[] }).functionalRequirements?.length ??
            0) +
          ((payload as { nonFunctionalRequirements?: unknown[] }).nonFunctionalRequirements
            ?.length ?? 0);

    if ((rows ?? 0) === 0) {
      problem(`${entry}: ноль строк из непустого исходного документа — маппинг не узнал форму`);
    } else {
      exportLog.push(`- \`${entry}\`: строк ${String(rows ?? 0)}`);
    }
  }
}

/* ------------------------------------------------------------------ the walk */

async function run(browser: Browser): Promise<void> {
  mkdirSync(OUT, { recursive: true });

  await stackUp('start');

  const context = await browser.newContext({ viewport: VIEWPORT });
  /* The interface language only — UI state, not authentication. No session cookie exists anywhere. */
  await context.addCookies([
    { name: 'spec-platform-locale', value: 'ru', domain: '127.0.0.1', path: '/', sameSite: 'Lax' },
  ]);

  const page = await context.newPage();

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => {
    consoleErrors.push(`pageerror: ${error.message}`);
  });

  say(
    `гейт M14а — локальный профиль, авто-владелец, seed из ${String(SEED.trim().split(/\s+/u).length)} слов`,
  );

  /* The OAuth routes refuse — checked once at the doorstep, before anything else happens. */
  const signin = await context.request.get(`${BASE_URL}/signin`);
  if (signin.status() !== 404) {
    problem(`/signin ответил ${String(signin.status())} вместо 404 в локальном режиме`);
  }
  const authApi = await context.request.get(`${BASE_URL}/api/auth/session`);
  if (authApi.status() !== 404) {
    problem(`/api/auth/session ответил ${String(authApi.status())} вместо 404 в локальном режиме`);
  }
  say('OAuth-поверхность отказывает: /signin 404, /api/auth/session 404');

  const sessionUrl = await createSession(page);
  const clicksAtStart = clicks;
  say(`clicks so far: ${String(clicksAtStart)} — this number must not move again`);
  await snapshot(page, 'auto-session-open');

  const { finished, restart } = await watchTheRun(page, sessionUrl);

  if (clicks !== clicksAtStart) {
    problem(`the walk clicked ${String(clicks - clicksAtStart)} time(s) after the seed`);
  }

  measure(
    `панель на финише: шагов ${String(finished.steps)}, записей драйвера ${String(finished.driverNotes)}`,
  );
  measure(
    `итог: позиция ${finished.stage}/${finished.substage || '—'}, причина остановки «${finished.stopReason || '—'}»`,
  );

  await snapshot(page, 'auto-final');

  /* Both themes, as every gate profile asks. */
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
  });
  await snapshot(page, 'auto-final-dark');
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'light');
  });

  /* The final state, surviving a reload. */
  await page.goto(sessionUrl);
  await page.getByTestId('session').waitFor({ state: 'visible', timeout: 60_000 });
  if (finished.stage === 'complete') {
    const sealed = await page.getByTestId('session-complete').count();
    if (sealed === 0) problem('the completed session did not come back sealed after a reload');
  }
  await stillAlive(page, 'the session after a reload');
  await oauthSurfaceCheck(page, 'the final reload');
  await snapshot(page, 'auto-reloaded');
  await page.screenshot({ path: `${OUT}/final-state.png`, fullPage: true, caret: 'initial' });

  await page.close();

  /* -------------------------------------------------- what the database says about it */

  const driverRows = await query<{ stage: string; at: string; body: string }>(
    "SELECT stage, to_char(created_at, 'HH24:MI:SS') AS at, body FROM session_messages WHERE origin = 'driver' ORDER BY created_at ASC",
  );

  for (const row of driverRows) {
    feedLog.push(`- \`${row.at}\` \`${row.stage}\` ${row.body}`);
  }

  measure(`строк драйвера в ленте: ${String(driverRows.length)}`);

  const runs = await query<{
    status: string;
    stop_reason: string | null;
    steps: number;
    idle_steps: number;
    started_at: string;
    ended_at: string | null;
  }>(
    "SELECT status, stop_reason, steps, idle_steps, to_char(started_at, 'HH24:MI:SS') AS started_at, to_char(ended_at, 'HH24:MI:SS') AS ended_at FROM autonomous_runs ORDER BY started_at ASC",
  );

  for (const row of runs) {
    measure(
      `прогон: ${row.status}/${row.stop_reason ?? '—'}, шагов ${String(row.steps)}, холостых ${String(row.idle_steps)}, ${row.started_at}–${row.ended_at ?? '…'}`,
    );
  }

  const rounds = await query<{ stage: string; rounds: string }>(
    'SELECT stage, count(*)::text AS rounds FROM question_rounds GROUP BY stage ORDER BY min(presented_at)',
  );

  for (const row of rounds) {
    measure(`раундов на ${row.stage}: ${row.rounds}`);
  }

  const revisions = await query<{ spec_type: string; revision_number: number; approved: boolean }>(
    'SELECT f.spec_type, r.revision_number, r.approved FROM spec_revisions r JOIN spec_files f ON f.id = r.spec_file_id ORDER BY f.spec_type, r.revision_number',
  );

  for (const row of revisions) {
    measure(
      `${row.spec_type} Rev ${String(row.revision_number)} — ${row.approved ? 'одобрен' : 'не одобрен'}`,
    );
  }

  const boards = await query<{
    spec_type: string;
    revision_number: number;
    outcome: string;
    decision: string | null;
    blocking: string;
    advisory: string;
    selected: string;
  }>(
    `SELECT f.spec_type,
            r.revision_number,
            b.outcome,
            b.decision,
            (SELECT count(*) FROM jsonb_array_elements(b.items) item WHERE item->>'severity' = 'blocking')::text AS blocking,
            (SELECT count(*) FROM jsonb_array_elements(b.items) item WHERE item->>'severity' = 'advisory')::text AS advisory,
            COALESCE(jsonb_array_length(b.selected_item_ids), 0)::text AS selected
       FROM review_feedback b
       JOIN spec_revisions r ON r.id = b.spec_revision_id
       JOIN spec_files f ON f.id = r.spec_file_id
      ORDER BY b.created_at ASC`,
  );

  for (const board of boards) {
    boardLog.push(
      `- **${board.spec_type} Rev ${String(board.revision_number)}** — итог \`${board.outcome}\`, решение \`${
        board.decision ?? 'не принято'
      }\`, блокирующих ${board.blocking}, советов ${board.advisory}, отобрано ${board.selected}`,
    );
  }

  measure(`досок ревью: ${String(boards.length)}`);

  /* The owner: exactly one, the fixed address, and every project theirs. */
  const owners = await query<{ email: string | null; projects: string }>(
    `SELECT u.email, count(p.id)::text AS projects
       FROM users u LEFT JOIN projects p ON p.owner_id = u.id
      GROUP BY u.id, u.email ORDER BY u.email`,
  );
  for (const owner of owners) {
    measure(`владелец: ${owner.email ?? '—'} — проектов ${owner.projects}`);
  }
  if (owners.length !== 1 || owners[0]?.email !== 'owner@local.invalid') {
    problem('в базе не ровно один владелец owner@local.invalid');
  }

  /* -------------------------------------------------- persistence and the exports */

  if (restart !== null) {
    await comparePersistence(restart.dumpPath);
  }

  const projects = await query<{ id: string; name: string }>('SELECT id, name FROM projects');
  const project = projects[0];

  if (project === undefined) {
    problem('no project row — the session never created one');
    return;
  }

  measure(`проект: «${project.name}», сессия ${sessionUrl.split('/').pop() ?? '—'}`);

  await fixTheExports(context, project.id);
  await context.close();
}

const browser = await chromium.launch();

try {
  await run(browser);
} catch (error) {
  problem(`the walk threw: ${error instanceof Error ? error.message : String(error)}`);
} finally {
  await browser.close();
  try {
    stackDown('end of walk');
  } catch {
    /* Already down, or never came up — the report carries whichever it was. */
  }
}

/* ------------------------------------------------------------------ the report */

const list = (lines: readonly string[]) => (lines.length === 0 ? '_None._' : lines.join('\n'));

const unexpectedConsole = consoleErrors.filter(
  (line) => !EXPECTED_CONSOLE.some((pattern) => pattern.test(line)),
);

function readLog(path: string): string {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
}

const OLLAMA_LOG = process.env.OLLAMA_LOG ?? `${OUT}/ollama-serve.err`;
const SERVER_LOG = process.env.SERVER_LOG ?? '.local/dev-server.log';

const truncations = [...readLog(OLLAMA_LOG).matchAll(/.*truncating input prompt.*/g)].map(
  (match) => match[0],
);
const structuralRejections = [
  ...readLog(SERVER_LOG).matchAll(/.*generated document rejected on structure.*/g),
].map((match) => match[0]);
const packingRecords = [...readLog(SERVER_LOG).matchAll(/context packing .*/g)].map(
  (match) => match[0],
);

const red =
  problems.length > 0 ||
  truncations.length > 0 ||
  structuralRejections.length > 0 ||
  unexpectedConsole.length > 0;

mkdirSync(OUT, { recursive: true });

/* The stack's logs are part of the evidence: copied beside the report before the verdict is read. */
for (const [source, target] of [
  ['.local/dev-server.log', `${OUT}/dev-server.log`],
  ['.local/db-server.log', `${OUT}/db-server.log`],
] as const) {
  const content = readLog(source);
  if (content !== '') writeFileSync(target, content, 'utf8');
}

writeFileSync(
  `${OUT}/RESULT.md`,
  `# Гейт M14а — RESULT (машинный отчёт прогулки)

Walked ${new Date(startedAt).toISOString()} against \`${BASE_URL}\` — **локальный профиль**: стек
поднят командой заказчика (\`local:up\`), сессия владельца автоматическая (ни одной cookie
авторизации за всю прогулку), данные в \`.local/db\`. Сессия: MySpec greenfield · профиль
«технический» · стиль «Конкретный» · автономный режим; русский интерфейс. Seed (${String(
    SEED.trim().split(/\s+/u).length,
  )} слов): «${SEED}»

**Verdict (здоровье прогулки): ${red ? 'RED' : 'GREEN'}** — ${String(problems.length)} problem(s), ${String(step)} state(s)
captured, ${String(consoleErrors.length)} console record(s) of which ${String(unexpectedConsole.length)} unexpected.

Clicks after the session was created: **0** by construction — the count is asserted in code; both
exports below are cookie-less \`GET\`s of the same endpoints the buttons call.

## Problems

${list(problems)}

## Рестарт стека посреди прогулки (задача 149 AC)

${list(restartLog)}

## Хронология позиций

${list(driverLog)}

## Записи драйвера (лента, origin='driver')

${list(feedLog)}

## Доски ревью

${list(boardLog)}

## Экспорт (фиксация обоих бандлов)

${list(exportLog)}

## Measured

${list(measurements)}

## Prompt truncation (красное условие А-8)

\`truncating input prompt\` records: **${String(truncations.length)}**.

${list(truncations)}

## Structural rejections (красное условие M10п)

\`generated document rejected on structure\` records: **${String(structuralRejections.length)}**.

${list(structuralRejections)}

## Context packing (А-8)

${String(packingRecords.length)} packing record(s).

${list(packingRecords)}

## Console

${list(unexpectedConsole)}

## Transcript

${list(notes)}
`,
  'utf8',
);

console.log(`\n${red ? 'RED' : 'GREEN'} — отчёт в ${OUT}/RESULT.md`);
process.exit(red ? 1 : 0);
