/* eslint-disable no-restricted-properties -- a hand-run walk, not application code: it takes its
   configuration from the environment because that is how a person points it at this machine. */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, type Browser, type Page } from '@playwright/test';

import { unexpectedConsole } from '../../e2e/fixtures/console-noise.ts';

/**
 * **Гейт M16а — живой параллельный прогон** (task 163; А-2.1; А-24 §2).
 *
 * The claim under test is the whole milestone at once: a real small product, built end to end by
 * **three or more executors working at the same time** on the customer's subscription, with the two
 * interruptions that decide whether the pipeline is a pipeline or a demo —
 *
 * - a **staged red CI**: a failing test planted mid-run, so one task's acceptance goes red while
 *   others are in flight. Everything must freeze — containers paused, statuses `PAUSED` on disk —
 *   and nothing may move again until a person presses «Возобновить» (task 160);
 * - a **`SIGKILL` into live parallelism**: the orchestrator dies with several containers running,
 *   and the plan comes back off the disk (tasks 158, 162).
 *
 * What it measures, because these are the numbers three decisions are waiting on (§7 of the M15а
 * report and А-24 §2):
 *
 * - **actual parallelism over time** — sampled from the board once a second, so «up to ten» is a
 *   measurement rather than a configuration value;
 * - **every `rate_limit_event`** — the tariff closing mid-run is a *working state*, and a cascade of
 *   failures around one is a red condition of this gate;
 * - **the distribution of iteration durations** — the five-minute ceiling is currently supported by
 *   two data points, and the verdict was «мерить, а не двигать»;
 * - **peak VRAM**, through `loop/scripts/vram_monitor.ps1` running beside the walk on the customer's
 *   own machine (gate-only by А-20 §3г; CI has no GPU and does not run it).
 *
 * Red conditions: every one of M15а's — an interactive hang, `database is locked`, state lost across
 * the restart, a credential in an artifact — plus this milestone's own: fewer than three executors
 * ever running at once, a freeze that did not pause the containers, a freeze that resumed itself,
 * and a **cascade on throttling** (tasks failing *because* the tariff window closed).
 *
 * Usage:
 *   node loop/e2e/gate-M16a.live.ts
 *
 * Environment:
 *   GATE_BUNDLE      the machine bundle to build from (required; a bundle with a milestone of ≥3
 *                    non-overlapping tasks, or the parallelism claim cannot be made)
 *   GATE_OUT         where the artifacts go (default artifacts/gate-M16a)
 *   GATE_WORKSPACE   the workspace root the loop builds in (default .gate-tmp/m16a-workspace)
 *   GATE_PORT        the loop's port for this walk (default 3197)
 *   GATE_STUB        `1` to rehearse the whole walk with a scripted executor — do this first
 *   GATE_MAX_EXECUTORS  the ceiling for this walk (default 10)
 *   GATE_BUDGET_MS   how long the pipeline may take before the walk gives up (default 2 h)
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const LOOP_ROOT = resolve(HERE, '..');
const REPO_ROOT = resolve(LOOP_ROOT, '..');

const PORT = Number(process.env.GATE_PORT ?? 3197);
const BASE_URL = `http://127.0.0.1:${String(PORT)}`;
const OUT = resolve(REPO_ROOT, process.env.GATE_OUT ?? 'artifacts/gate-M16a');
const WORKSPACE = resolve(REPO_ROOT, process.env.GATE_WORKSPACE ?? '.gate-tmp/m16a-workspace');
const BUNDLE_SOURCE = process.env.GATE_BUNDLE ?? '';
const STUB = process.env.GATE_STUB === '1';
const MAX_EXECUTORS = Number(process.env.GATE_MAX_EXECUTORS ?? 10);
const BUDGET_MS = Number(process.env.GATE_BUDGET_MS ?? 7_200_000);
const PROJECT_DIRECTORY_NAME = 'toy';

/** The parallelism this milestone is about. Fewer than this at any moment and the gate is red. */
const REQUIRED_PARALLEL = 3;

/** How many genuine red verdicts the walk will rescue before it stops calling that a resume. */
const MAX_GENUINE_RETRIES = 3;

const NEWLINE = String.fromCharCode(10);

const VIEWPORT = { width: 1440, height: 900 };

const steps: { at: string; what: string }[] = [];
const findings: string[] = [];
const measurements: string[] = [];

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

/* ------------------------------------------------------------------ the toy project */

/**
 * The code the executors work on.
 *
 * A real, runnable Node project, for the reason M15а wrote down: the acceptance gate runs the
 * project's own test command in a clean container, and a project with nothing to run is a gate that
 * refuses by design. `node --test` needs at least one test file to exit 0, so the skeleton ships
 * one that passes.
 */
const TOY_FILES: Record<string, string> = {
  'package.json': `${JSON.stringify(
    {
      name: 'tekstovyy-kvest',
      version: '0.1.0',
      private: true,
      type: 'module',
      description: 'Игрушечный консольный проект для гейта M16а.',
      scripts: { test: 'node --test' },
    },
    null,
    2,
  )}\n`,

  'lib/state-machine.js': [
    '// Заготовка: переходы между сценами квеста.',
    'export function nextScene(scenes, id, choice) {',
    '  const scene = scenes[id];',
    '  return scene?.choices?.[choice]?.to ?? null;',
    '}',
    '',
  ].join('\n'),

  'test/skeleton.test.js': [
    "import { test } from 'node:test';",
    "import assert from 'node:assert/strict';",
    "import { nextScene } from '../lib/state-machine.js';",
    '',
    "test('заготовка отвечает на неизвестную сцену', () => {",
    "  assert.equal(nextScene({}, 'нет', 0), null);",
    '});',
    '',
  ].join('\n'),
};

/** The planted failure: one test file, red on purpose, removed by the retry. */
const RED_TEST_PATH = join('test', 'gate-red.test.js');

const RED_TEST = [
  '// Подложен гейтом M16а: инсценированный красный CI. Удаляется перед возобновлением.',
  "import { test } from 'node:test';",
  "import assert from 'node:assert/strict';",
  '',
  "test('инсценированный красный тест гейта M16а', () => {",
  "  assert.equal('красный', 'зелёный');",
  '});',
  '',
].join('\n');

/* ------------------------------------------------------------------ the loop's server */

let server: ChildProcess | null = null;
const serverLog: string[] = [];

function buildLoop(): void {
  note('Сборка контура (next build)…');
  const built = spawnSync(
    'node',
    [join(LOOP_ROOT, 'node_modules', 'next', 'dist', 'bin', 'next'), 'build', '--webpack'],
    { cwd: LOOP_ROOT, encoding: 'utf8', env: { ...process.env, PORT: String(PORT) } },
  );

  if (built.status !== 0) {
    throw new Error(
      `сборка контура не прошла (код ${String(built.status)}): ${(built.stderr || built.stdout || '').slice(-800)}`,
    );
  }

  note('Контур собран.');
}

function credentialFromEnvFile(): { kind: string; value: string } | null {
  const path = join(LOOP_ROOT, '.env');
  if (!existsSync(path)) return null;

  for (const kind of ['CLAUDE_CODE_OAUTH_TOKEN', 'ANTHROPIC_API_KEY']) {
    const found = new RegExp(`^${kind}=(.+)$`, 'm').exec(readFileSync(path, 'utf8'));
    const value = found?.[1]?.trim() ?? '';
    if (value !== '') return { kind, value };
  }

  return null;
}

async function startServer(label: string): Promise<void> {
  note(`Запуск сервера контура (${label})…`);

  const hasCredential =
    (process.env.ANTHROPIC_API_KEY ?? '') !== '' ||
    (process.env.CLAUDE_CODE_OAUTH_TOKEN ?? '') !== '' ||
    credentialFromEnvFile() !== null;

  server = spawn(
    'node',
    [join(LOOP_ROOT, 'node_modules', 'next', 'dist', 'bin', 'next'), 'start', '-H', '127.0.0.1'],
    {
      cwd: LOOP_ROOT,
      env: {
        ...process.env,
        PORT: String(PORT),
        WORKSPACE_ROOT_PATH: WORKSPACE,
        LOOP_DB_PATH: join(WORKSPACE, '.loop', 'loop.db'),
        LOOP_MAX_EXECUTORS: String(MAX_EXECUTORS),
        ...(STUB && !hasCredential ? { ANTHROPIC_API_KEY: 'gate-placeholder-not-a-real-key' } : {}),
        ...(STUB ? { LOOP_EXECUTOR_STUB: '1' } : {}),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  const log = (chunk: Buffer) => {
    const text = chunk.toString('utf8');
    serverLog.push(text);
    process.stdout.write(`  [loop] ${text}`);
  };
  server.stdout?.on('data', log);
  server.stderr?.on('data', log);

  await waitFor(async () => {
    try {
      return (await fetch(`${BASE_URL}/`, { redirect: 'manual' })).status < 500;
    } catch {
      return false;
    }
  }, 180_000);

  note(`Сервер контура отвечает на ${BASE_URL} (${label}).`);
}

function killServer(hard: boolean): void {
  if (server === null) return;

  note(hard ? 'SIGKILL оркестратору.' : 'Остановка сервера контура.');
  if (process.platform === 'win32' && server.pid !== undefined) {
    spawnSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    server.kill(hard ? 'SIGKILL' : 'SIGTERM');
  }
  server = null;
}

async function waitFor(
  condition: () => Promise<boolean> | boolean,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    if (await condition()) return;
    if (Date.now() > deadline) throw new Error(`условие не наступило за ${String(timeoutMs)} мс`);
    await new Promise((settle) => setTimeout(settle, 250));
  }
}

/* ------------------------------------------------------------------ the workspace */

function prepareWorkspace(): string {
  rmSync(WORKSPACE, { recursive: true, force: true });
  const projectDirectory = join(WORKSPACE, PROJECT_DIRECTORY_NAME);
  mkdirSync(projectDirectory, { recursive: true });

  if (BUNDLE_SOURCE === '') {
    throw new Error('GATE_BUNDLE не задан: прогулка идёт на настоящем машинном бандле платформы');
  }

  const source = resolve(REPO_ROOT, BUNDLE_SOURCE);
  const bundleDirectory = existsSync(join(source, 'bundle')) ? join(source, 'bundle') : source;

  cpSync(bundleDirectory, join(projectDirectory, 'bundle'), { recursive: true });
  note(`Бандл скопирован из ${bundleDirectory}.`);

  for (const [path, content] of Object.entries(TOY_FILES)) {
    const full = join(projectDirectory, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content, 'utf8');
  }
  note('Игрушечный nodejs-проект разложен в рабочей директории.');

  return projectDirectory;
}

/* ------------------------------------------------------------------ the board, sampled */

interface BoardSnapshot {
  milestones: { title: string; status: string; tasks: { taskId: string; status: string }[] }[];
}

async function readBoardSnapshot(page: Page): Promise<BoardSnapshot> {
  return page.evaluate(() => {
    const milestones = [...document.querySelectorAll('[data-testid="milestone"]')].map((node) => ({
      title: (node.querySelector('.row-title')?.textContent ?? '').trim(),
      status: node.querySelector('.badge')?.getAttribute('data-status') ?? '',
      tasks: [...node.querySelectorAll('[data-testid="task"]')].map((task) => ({
        taskId: task.getAttribute('data-task-id') ?? '',
        status: task.querySelector('.badge')?.getAttribute('data-status') ?? '',
      })),
    }));

    return { milestones };
  });
}

const tasksOf = (board: BoardSnapshot) => board.milestones.flatMap((milestone) => milestone.tasks);

const countIn = (board: BoardSnapshot, status: string) =>
  tasksOf(board).filter((task) => task.status === status).length;

interface ParallelSample {
  at: number;
  /** Tasks the board shows as in progress — a cycle, which may be an executor or an acceptance. */
  inProgress: number;
  /** Executor containers the daemon has running. This is the milestone's own number. */
  executors: number;
  paused: number;
  completed: number;
  taskIds: string[];
}

/* ------------------------------------------------------------------ docker, for the freeze proof */

/** Whether a container of that name is paused right now, straight from the daemon. */
function containerPaused(name: string): boolean | null {
  const inspected = spawnSync('docker', ['inspect', '-f', '{{.State.Paused}}', name], {
    encoding: 'utf8',
  });

  if (inspected.status !== 0) return null;
  return inspected.stdout.trim() === 'true';
}

/**
 * Executor containers the daemon currently has, by name.
 *
 * **The parallelism claim is measured here and not on the board**, and the rehearsal is why: a task
 * is `IN_PROGRESS` from the moment its cycle starts until its verdict, which includes the acceptance
 * run — so three `IN_PROGRESS` tasks can be three *acceptances* with not a single executor alive.
 * «Три одновременных исполнителя» is a statement about containers, so it is asked of the daemon.
 */
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

/* ------------------------------------------------------------------ the VRAM audit */

let vramStopFile = '';

function startVramAudit(): void {
  if (process.platform !== 'win32') {
    measure('Аудит VRAM: пропущен — не Windows (gate-only, А-20 §3г).');
    return;
  }

  vramStopFile = join(OUT, 'vram.stop');
  rmSync(vramStopFile, { force: true });

  spawn(
    'powershell',
    [
      '-NoProfile',
      '-File',
      join(LOOP_ROOT, 'scripts', 'vram_monitor.ps1'),
      '-Out',
      join(OUT, 'vram.json'),
      '-StopFile',
      vramStopFile,
    ],
    { detached: false, stdio: 'ignore' },
  );

  note('Аудит VRAM запущен параллельно прогону (шаг 500 мс, порог 12288 МБ).');
}

function stopVramAudit(): void {
  if (vramStopFile === '') return;

  writeFileSync(vramStopFile, 'stop', 'utf8');
  note('Аудит VRAM остановлен файлом-стопом; итог пишется скриптом.');
}

/* ------------------------------------------------------------------ measurements out of the feed */

/** Every iteration duration the cycle announced, in seconds. */
function iterationSeconds(text: string): number[] {
  return [...text.matchAll(/Итерация исполнителя: ([\d.]+) с/g)]
    .map((match) => Number(match[1]))
    .filter((value) => Number.isFinite(value));
}

/** Every line about the tariff — the pause, the resume, and the per-iteration status. */
function tariffLines(text: string): string[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /лимит тарифа|Лимит тарифа|Окно тарифа/i.test(line));
}

function describeDistribution(values: readonly number[]): string {
  if (values.length === 0) return 'замеров нет';

  const sorted = [...values].sort((left, right) => left - right);
  const at = (fraction: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))] ?? 0;

  const total = sorted.reduce((sum, value) => sum + value, 0);

  return (
    `n=${String(sorted.length)}, min ${sorted[0]?.toFixed(1) ?? '—'} с, ` +
    `med ${at(0.5).toFixed(1)} с, p90 ${at(0.9).toFixed(1)} с, ` +
    `max ${(sorted.at(-1) ?? 0).toFixed(1)} с, среднее ${(total / sorted.length).toFixed(1)} с`
  );
}

async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(join(OUT, 'screens'), { recursive: true });
  await page.screenshot({ path: join(OUT, 'screens', `${name}.png`), fullPage: true });
  note(`Снимок ${name}.png`);
}

function everyFile(directory: string): string[] {
  const found: string[] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...everyFile(full));
    else found.push(full);
  }

  return found;
}

/* ------------------------------------------------------------------ the walk */

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const started = Date.now();

  const samples: ParallelSample[] = [];
  const consoleErrors: string[] = [];
  let verdict: 'GREEN' | 'RED' = 'GREEN';
  let projectId = '';
  let browser: Browser | null = null;
  let peakParallel = 0;
  let peakInProgress = 0;

  buildLoop();
  const projectDirectory = prepareWorkspace();
  startVramAudit();

  try {
    await startServer('первый запуск');

    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: VIEWPORT });
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(`console.error: ${message.text()}`);
    });
    page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));

    await page.goto(BASE_URL);
    await shot(page, '01-пустой-дашборд');

    /**
     * Samples the board and records the parallelism. Called from every wait below.
     *
     * The **peak** is taken from every read, because a moment of five executors is a fact even if
     * nobody was looking a second later; the recorded *series* is thinned to one point a second, so
     * the artifact is a graph a person can read rather than forty thousand rows of the same number.
     */
    let sampledAt = 0;
    let liveExecutors: string[] = [];

    const sample = async (): Promise<BoardSnapshot> => {
      const board = await readBoardSnapshot(page);
      const running = tasksOf(board).filter((task) => task.status === 'IN_PROGRESS');

      /* `docker ps` is a process launch, so it is asked once a second rather than on every poll. */
      if (Date.now() - sampledAt >= 1_000) {
        sampledAt = Date.now();
        liveExecutors = executorContainers();
        peakParallel = Math.max(peakParallel, liveExecutors.length);
        peakInProgress = Math.max(peakInProgress, running.length);

        samples.push({
          at: Math.round((Date.now() - started) / 1000),
          inProgress: running.length,
          executors: liveExecutors.length,
          paused: countIn(board, 'PAUSED'),
          completed: countIn(board, 'COMPLETED'),
          taskIds: running.map((task) => task.taskId),
        });
      }

      return board;
    };

    // --- intake ---------------------------------------------------------------------------------
    note('POST /api/orchestrator/start-loop (без maxCycles — весь план)');
    const response = await fetch(`${BASE_URL}/api/orchestrator/start-loop`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectDirectory: PROJECT_DIRECTORY_NAME,
        projectTitle: 'Текстовый квест (гейт M16а)',
      }),
    });

    const intake: unknown = await response.json();
    writeFileSync(join(OUT, 'intake.json'), `${JSON.stringify(intake, null, 2)}\n`, 'utf8');
    if (!response.ok) throw new Error(`интейк отвергнут: ${JSON.stringify(intake)}`);

    const parsed = intake as {
      projectId: string;
      strategy: string;
      milestones: number;
      tasks: number;
      writtenByModel: number;
      keptFromDisk: number;
    };
    projectId = parsed.projectId;
    measure(
      `Интейк: проект ${projectId}, стратегия ${parsed.strategy}, вех ${String(parsed.milestones)}, ` +
        `задач ${String(parsed.tasks)}, моделью написано ${String(parsed.writtenByModel)}.`,
    );

    await page.reload();
    await page.waitForSelector('[data-testid="milestone"]');
    await shot(page, '02-план-принят');

    // --- the parallelism claim -------------------------------------------------------------------
    note(`Ожидание ${String(REQUIRED_PARALLEL)} одновременных исполнителей…`);
    await waitFor(async () => {
      await sample();
      return peakParallel >= REQUIRED_PARALLEL;
    }, 900_000).catch(() => {
      finding(
        `За отведённое время одновременно работало не больше ${String(peakParallel)} исполнителей ` +
          `— требуется ${String(REQUIRED_PARALLEL)}.`,
      );
      verdict = 'RED';
    });

    if (peakParallel >= REQUIRED_PARALLEL) {
      measure(
        `Фактическая параллель достигла ${String(peakParallel)} живых контейнеров-исполнителей ` +
          `одновременно (задач в работе одновременно: ${String(peakInProgress)}).`,
      );
      await shot(page, '03-параллель');
    }

    // --- staged red CI ---------------------------------------------------------------------------
    note('Подкладываем падающий тест — инсценированный красный CI.');
    writeFileSync(join(projectDirectory, RED_TEST_PATH), RED_TEST, 'utf8');

    const frozenMarker = join(projectDirectory, 'handoff', 'FROZEN.md');
    let frozenAt = 0;
    /*
     * What the daemon was running **just** before the freeze, with the time it was seen.
     *
     * The freshness matters and the rehearsal proved it: an older non-empty set belongs to a wave
     * that has since finished, and asserting «these should be paused» over containers that exited a
     * minute ago produces a confident verdict about nothing.
     */
    let executorsBeforeFreeze: { at: number; names: string[] } = { at: 0, names: [] };

    await waitFor(async () => {
      await sample();
      if (liveExecutors.length > 0) {
        executorsBeforeFreeze = { at: Date.now(), names: liveExecutors };
      }
      if (!existsSync(frozenMarker)) return false;
      frozenAt = Date.now();
      return true;
    }, 1_800_000).catch(() => {
      finding('Красный вердикт не заморозил конвейер за отведённое время.');
      verdict = 'RED';
    });

    /*
     * The planted test comes out **immediately**, before anything else is asserted: while it is
     * there every acceptance that copies the workspace is red, and the gate is staging one red
     * verdict, not a permanent one.
     */
    rmSync(join(projectDirectory, RED_TEST_PATH), { force: true });
    note('Подложенный тест убран — красный был инсценирован ровно на одну приёмку.');

    if (frozenAt > 0) {
      /*
       * «Все контейнеры paused ≤1 с» — asked of the daemon, not of the loop's own board: the claim
       * is about what `docker pause` did, and the only witness that cannot be mistaken about it is
       * docker.
       */
      /*
       * The claim is about the containers that were **running when the freeze landed**, so the set
       * is the one sampled just before it rather than whatever `docker ps` happens to show now: a
       * container that finished on its own between the marker and this line was never frozen, and
       * asserting over an empty list would pass vacuously.
       */
      const paused: string[] = [];
      const missed: string[] = [];
      const gone: string[] = [];

      /** A set older than this describes a wave that has already finished, not the frozen one. */
      const FRESH_MS = 5_000;
      const fresh =
        executorsBeforeFreeze.names.length > 0 && frozenAt - executorsBeforeFreeze.at <= FRESH_MS;

      let pausedWithinSecond = fresh;

      if (!fresh) {
        finding(
          'Инсценированный красный пришёлся на момент, когда ни один исполнитель не работал ' +
            `(последний живой набор видели ${String(Math.round((frozenAt - executorsBeforeFreeze.at) / 1000))} с назад) ` +
            '— доказательство паузы было бы пустым.',
        );
        verdict = 'RED';
      }

      await waitFor(() => {
        paused.length = 0;
        missed.length = 0;
        gone.length = 0;

        for (const name of executorsBeforeFreeze.names) {
          const state = containerPaused(name);
          if (state === true) paused.push(name);
          else if (state === false) missed.push(name);
          else gone.push(name);
        }

        return missed.length === 0 && paused.length > 0;
      }, 5_000).catch(() => {
        pausedWithinSecond = false;
      });

      const took = Date.now() - frozenAt;
      if (took > 1_000) pausedWithinSecond = false;

      measure(
        `Заморозка: работало исполнителей ${String(executorsBeforeFreeze.names.length)}, ` +
          `на паузе ${String(paused.length)} (${paused.join(', ') || '—'}), ` +
          `не встали ${String(missed.length)}, успели выйти ${String(gone.length)}, ` +
          `через ${String(took)} мс после отметки на диске.`,
      );

      if (!pausedWithinSecond) {
        finding(
          `Контейнеры не встали на паузу за 1 с (заняло ${String(took)} мс; ` +
            `не на паузе: ${missed.join(', ') || '—'}; вышли сами: ${gone.join(', ') || '—'}).`,
        );
        verdict = 'RED';
      }

      await page.reload();
      await shot(page, '04-заморозка');

      const frozenBoard = await sample();
      measure(`На заморозке: PAUSED ${String(countIn(frozenBoard, 'PAUSED'))} задач(и).`);

      /* And it does not resume itself: ten seconds of nothing at all. */
      const before = readFileSync(frozenMarker, 'utf8');
      await new Promise((settle) => setTimeout(settle, 10_000));

      if (!existsSync(frozenMarker) || readFileSync(frozenMarker, 'utf8') !== before) {
        finding('Заморозка снялась сама — отметка на диске изменилась без «Возобновить».');
        verdict = 'RED';
      } else {
        measure('Заморозка не самовозобновилась: 10 с без единого движения.');
      }

      // --- retry ---------------------------------------------------------------------------------
      /*
       * A person pressing «Возобновить» is looking at a board that has stopped moving. So does the
       * walk: the acceptances that were already in flight when the freeze landed had copied the
       * workspace *with* the planted test, and their verdicts arrive after it. Retrying before they
       * do would resume a pipeline that is about to freeze again over a test that no longer exists.
       */
      note('Ждём, пока замороженный конвейер затихнет…');
      await waitFor(async () => {
        const board = await sample();
        /*
         * «Затих» is **not** «no containers»: the frozen ones are paused, and a paused container
         * never exits — that is the point of pausing it. What settles is everything else: the
         * acceptances that were in flight when the freeze landed finish, and their tasks leave
         * `IN_PROGRESS`. Waiting for an empty `docker ps` waits for ever, which is how this walk
         * spent fourteen minutes staring at two containers it had itself asked to be frozen.
         */
        const unpaused = executorContainers().filter((name) => containerPaused(name) === false);

        return unpaused.length === 0 && countIn(board, 'IN_PROGRESS') === 0;
      }, 600_000).catch(() => {
        note('Конвейер не затих полностью — жмём «Возобновить» по тому, что есть.');
      });

      const frozenBoardNow = await sample();
      measure(
        `Перед возобновлением: красных ${String(countIn(frozenBoardNow, 'FAILED'))}, ` +
          `приостановленных ${String(countIn(frozenBoardNow, 'PAUSED'))}, ` +
          `принято ${String(countIn(frozenBoardNow, 'COMPLETED'))}.`,
      );

      note('Жмём «Возобновить».');
      await page.reload();
      await page.getByTestId('retry-pipeline').click();
      await waitFor(async () => {
        await sample();
        return !existsSync(frozenMarker);
      }, 120_000).catch(() => {
        finding('«Возобновить» не сняло заморозку.');
        verdict = 'RED';
      });

      await shot(page, '05-после-возобновления');
      measure('Заморозка снята кнопкой «Возобновить» — единственным путём назад.');
    }

    // --- SIGKILL into live parallelism ------------------------------------------------------------
    note('Ожидание живой параллели, чтобы SIGKILL пришёлся по работающим контейнерам…');
    await waitFor(async () => {
      const board = await sample();
      return countIn(board, 'IN_PROGRESS') >= 2;
    }, 900_000).catch(() => {
      note('Параллель ниже двух — SIGKILL придётся по тому, что есть.');
    });

    const beforeKill = await sample();
    const runningAtKill = countIn(beforeKill, 'IN_PROGRESS');
    writeFileSync(
      join(OUT, 'before-kill.json'),
      `${JSON.stringify(beforeKill, null, 2)}\n`,
      'utf8',
    );

    killServer(true);
    await new Promise((settle) => setTimeout(settle, 3_000));
    measure(`SIGKILL при ${String(runningAtKill)} работающих исполнителях.`);

    await startServer('после SIGKILL');
    await page.goto(BASE_URL);
    await page.waitForSelector('[data-testid="milestone"]');
    await shot(page, '06-после-рестарта');

    const afterRestart = await sample();
    writeFileSync(
      join(OUT, 'after-restart.json'),
      `${JSON.stringify(afterRestart, null, 2)}\n`,
      'utf8',
    );

    if (afterRestart.milestones.length !== beforeKill.milestones.length) {
      finding(
        `План потерян на рестарте: вех до ${String(beforeKill.milestones.length)}, ` +
          `после ${String(afterRestart.milestones.length)}.`,
      );
      verdict = 'RED';
    } else {
      measure(`План пережил SIGKILL: вех ${String(afterRestart.milestones.length)}.`);
    }

    note('Возобновление конвейера после рестарта…');
    const resumed = await fetch(`${BASE_URL}/api/orchestrator/start-loop`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectDirectory: PROJECT_DIRECTORY_NAME }),
    });
    note(`Возобновление после рестарта: ${String(resumed.status)}`);

    // --- to the end -------------------------------------------------------------------------------
    /*
     * **A genuine red is retried too, because that is what the operator does.**
     *
     * The staged one above is the milestone's own test. After it, nineteen live model iterations run
     * against a real acceptance suite, and some of them will legitimately come back red — a test the
     * executor wrote and broke, a file two tasks disagreed about. Freezing on that is the product
     * working; what a person does next is read the feed and press «Возобновить». A walk that instead
     * sat waiting for a frozen pipeline to finish would be measuring the loop's ability to run
     * without a human, which is not what «красный CI» claims. Bounded, and every one of them counted:
     * a plan that needs a fourth rescue is a finding about the plan, not a resume worth making.
     */
    note('Ожидание конца плана…');
    const deadline = started + BUDGET_MS;
    let genuineFreezes = 0;

    await waitFor(async () => {
      const board = await sample();
      const tasks = tasksOf(board);
      const done = tasks.filter((task) => task.status === 'COMPLETED').length;

      if (Date.now() > deadline) return true;
      if (tasks.length > 0 && done === tasks.length) return true;

      if (existsSync(frozenMarker) && genuineFreezes < MAX_GENUINE_RETRIES) {
        genuineFreezes += 1;
        const record = readFileSync(frozenMarker, 'utf8').split(NEWLINE).slice(0, 6).join(' ');
        note(`Настоящий красный вердикт (${String(genuineFreezes)}): ${record.slice(0, 240)}`);

        await page.reload();
        await page.getByTestId('retry-pipeline').click();
        await new Promise((settle) => setTimeout(settle, 5_000));
      }

      return false;
    }, BUDGET_MS).catch(() => undefined);

    if (genuineFreezes > 0) {
      measure(
        `Настоящих красных вердиктов за прогон: ${String(genuineFreezes)} — каждый снят кнопкой ` +
          '«Возобновить», как это сделал бы оператор.',
      );
    }

    const final = await sample();
    await shot(page, '07-финал');
    writeFileSync(join(OUT, 'final-board.json'), `${JSON.stringify(final, null, 2)}\n`, 'utf8');

    const total = tasksOf(final).length;
    const done = countIn(final, 'COMPLETED');
    measure(`Итог плана: принято ${String(done)} из ${String(total)} задач.`);

    if (done !== total) {
      finding(`План не доведён до конца: ${String(done)} из ${String(total)}.`);
      verdict = 'RED';
    }

    // --- the artifacts -----------------------------------------------------------------------------
    const feed = await page.evaluate(() =>
      [...document.querySelectorAll('[data-testid="feed-line"]')].map((node) => node.textContent),
    );
    writeFileSync(join(OUT, 'feed.txt'), `${feed.join('\n')}\n`, 'utf8');
    writeFileSync(join(OUT, 'server.log'), serverLog.join(''), 'utf8');
    cpSync(join(projectDirectory, 'handoff'), join(OUT, 'handoff'), { recursive: true });

    const wholeLog = `${serverLog.join('')}\n${feed.join('\n')}`;
    const durations = iterationSeconds(wholeLog);
    const tariff = tariffLines(wholeLog);

    writeFileSync(
      join(OUT, 'measurements.json'),
      `${JSON.stringify(
        {
          maxExecutors: MAX_EXECUTORS,
          peakParallel,
          peakInProgress,
          requiredParallel: REQUIRED_PARALLEL,
          samples,
          iterationSeconds: durations,
          iterationCeilingSeconds: 300,
          overCeiling: durations.filter((value) => value >= 300).length,
          tariff,
        },
        null,
        2,
      )}\n`,
      'utf8',
    );

    measure(`Длительности итераций: ${describeDistribution(durations)}.`);
    measure(
      `Потолок итерации 300 с: превышений ${String(durations.filter((value) => value >= 300).length)} ` +
        `из ${String(durations.length)}.`,
    );
    measure(
      tariff.length === 0
        ? 'Событий лимита тарифа за прогон не было.'
        : `Строк о лимите тарифа: ${String(tariff.length)}.`,
    );

    // --- red conditions ----------------------------------------------------------------------------
    if (/database is locked/i.test(wholeLog)) {
      finding('В логах встретилось «database is locked».');
      verdict = 'RED';
    }

    if (/не уложился в/i.test(wholeLog)) {
      finding('Исполнитель упёрся в стенные часы — возможное интерактивное зависание.');
      verdict = 'RED';
    }

    /*
     * The cascade. A tariff window closing is a *working state*: the pipeline pauses and goes on. If
     * tasks went red while it was closed, the loop turned a budget into a failure — which is the one
     * thing А-24 §2 forbids by name.
     */
    const throttled = tariff.some((line) => /Лимит тарифа/i.test(line));
    const failedOnLimit = feed
      .map(String)
      .filter((line) => /не принята|FAILED/i.test(line) && /лимит|limit|429|quota/i.test(line));

    if (throttled && failedOnLimit.length > 0) {
      finding(
        `Каскадный отказ на троттлинге: ${String(failedOnLimit.length)} задач(и) покраснели вокруг ` +
          'закрытого окна тарифа.',
      );
      verdict = 'RED';
    } else if (throttled) {
      measure('Троттлинг случился и НЕ дал каскада: ни одна задача не покраснела из-за лимита.');
    }

    const unexpected = unexpectedConsole(consoleErrors);
    if (unexpected.length > 0) {
      finding(`Неожиданных записей консоли: ${String(unexpected.length)} — ${unexpected[0] ?? ''}`);
      verdict = 'RED';
    }

    // The credential is the customer's own subscription: it may not appear in a committed artifact.
    const credential = credentialFromEnvFile();
    if (credential === null) {
      note('Учётные данные исполнителя в loop/.env не найдены — проверка утечки пропущена.');
    } else {
      const leaked = everyFile(OUT).filter((path) => {
        try {
          return readFileSync(path, 'utf8').includes(credential.value);
        } catch {
          return false;
        }
      });

      if (leaked.length === 0) {
        measure(`Утечки нет: ${credential.kind} не встречается ни в одном артефакте прогулки.`);
      } else {
        finding(
          `Учётные данные попали в артефакты: ${leaked.map((path) => path.slice(OUT.length + 1)).join(', ')}.`,
        );
        verdict = 'RED';
      }
    }
  } catch (error) {
    finding(`Прогулка остановлена: ${error instanceof Error ? error.message : String(error)}`);
    verdict = 'RED';
  } finally {
    stopVramAudit();
    await browser?.close();
    killServer(false);
  }

  /* The VRAM summary is written by the script on its way out; give it a moment, then read it. */
  await new Promise((settle) => setTimeout(settle, 2_000));
  const vram = readVram();
  if (vram !== null) measure(vram);

  const minutes = ((Date.now() - started) / 60_000).toFixed(1);
  writeResult(verdict, minutes, projectId, peakParallel);
  note(`Вердикт: ${verdict}. Артефакты в ${OUT}.`);

  process.exitCode = verdict === 'GREEN' ? 0 : 1;
}

function readVram(): string | null {
  const path = join(OUT, 'vram.json');
  if (!existsSync(path)) return null;

  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as {
      available?: boolean;
      peakMb?: number | null;
      thresholdMb?: number;
      samples?: number;
      overThreshold?: boolean;
    };

    if (parsed.available !== true) return 'Аудит VRAM: недоступен на этой машине (нет nvidia-smi).';

    return (
      `Пик VRAM: ${String(parsed.peakMb ?? 0)} МБ при пороге ${String(parsed.thresholdMb ?? 0)} МБ ` +
      `(${String(parsed.samples ?? 0)} замеров, превышение: ${parsed.overThreshold === true ? 'да' : 'нет'}).`
    );
  } catch {
    return 'Аудит VRAM: итог нечитаем.';
  }
}

function writeResult(
  verdict: string,
  minutes: string,
  projectId: string,
  peakParallel: number,
): void {
  const lines = [
    `# Гейт M16а — ${verdict}`,
    '',
    `* **Режим:** ${STUB ? 'репетиция на стабовом исполнителе' : 'живой исполнитель Claude Code'}`,
    `* **Проект:** ${projectId}`,
    `* **Длительность:** ${minutes} мин`,
    `* **Бандл:** ${BUNDLE_SOURCE}`,
    `* **Потолок исполнителей:** ${String(MAX_EXECUTORS)}`,
    `* **Пиковая фактическая параллель:** ${String(peakParallel)}`,
    `* **Рабочая директория:** ${WORKSPACE}`,
    '',
    '## Находки',
    '',
    findings.length === 0 ? 'Находок нет.' : findings.map((entry) => `* ${entry}`).join('\n'),
    '',
    '## Замеры',
    '',
    measurements.length === 0
      ? 'Замеров нет.'
      : measurements.map((entry) => `* ${entry}`).join('\n'),
    '',
    '## Шаги',
    '',
    ...steps.map((step) => `* \`${step.at}\` ${step.what}`),
    '',
  ];

  writeFileSync(join(OUT, 'RESULT.md'), `${lines.join('\n')}\n`, 'utf8');
}

await main();
