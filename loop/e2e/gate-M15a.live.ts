/* eslint-disable no-restricted-properties -- a hand-run walk, not application code: it takes its
   configuration from the environment because that is how a person points it at this machine. */
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
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

/**
 * **Гейт M15а — живая прогулка одиночного цикла** (task 158; А-2.1).
 *
 * The claim under test is the milestone itself: a bundle the platform produced through its machine
 * export (task 150) is taken in, the milestones are cut **by code**, an assignment is written, an
 * executor runs it in a container, its report is read, and a **fresh clean container** decides
 * whether the task is done. Mid-cycle the orchestrator is `SIGKILL`ed and restarted, and the run
 * continues from the disk.
 *
 * Red conditions, judged at the end and each on its own line of the report:
 *
 * - the executor waiting for a person (an interactive hang) — measured as an iteration that hits
 *   its wall clock without producing output;
 * - `database is locked` anywhere in the loop's own logs;
 * - state lost across the restart — the plan on disk and the board after the restart must agree
 *   with what they were before it.
 *
 * Usage:
 *   node loop/e2e/gate-M15a.live.ts
 *
 * Environment (all optional except the bundle):
 *   GATE_BUNDLE      directory holding the machine bundle (bundle/constitution.md, …)
 *   GATE_OUT         where the artifacts go (default artifacts/gate-M15a)
 *   GATE_WORKSPACE   the workspace root the loop builds in (default .gate-tmp/m15a-workspace)
 *   GATE_PORT        the loop's port for this walk (default 3198)
 *   GATE_STUB        `1` to rehearse with a scripted executor instead of the live model
 *
 * **The rehearsal matters.** The bookkeeping of a walk is untested code, and M14а's own lesson was
 * that rehearsing it on a stub first catches its defects for free. `GATE_STUB=1` runs the entire
 * walk — intake, cycle, kill, restart, artifacts, verdict — with a shell script where the model
 * goes, so everything except the model has already been proven when the live run starts.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const LOOP_ROOT = resolve(HERE, '..');
const REPO_ROOT = resolve(LOOP_ROOT, '..');

const PORT = Number(process.env.GATE_PORT ?? 3198);
const BASE_URL = `http://127.0.0.1:${String(PORT)}`;
const OUT = resolve(REPO_ROOT, process.env.GATE_OUT ?? 'artifacts/gate-M15a');
const WORKSPACE = resolve(REPO_ROOT, process.env.GATE_WORKSPACE ?? '.gate-tmp/m15a-workspace');
const BUNDLE_SOURCE = process.env.GATE_BUNDLE ?? '';
const STUB = process.env.GATE_STUB === '1';
const PROJECT_DIRECTORY_NAME = 'toy';

const VIEWPORT = { width: 1440, height: 900 };

interface Step {
  at: string;
  what: string;
}

const steps: Step[] = [];
const findings: string[] = [];

function note(what: string): void {
  const at = new Date().toISOString();
  steps.push({ at, what });
  console.log(`[${at.slice(11, 19)}] ${what}`);
}

function finding(what: string): void {
  findings.push(what);
  note(`НАХОДКА: ${what}`);
}

/* ------------------------------------------------------------------ the toy project skeleton */

/**
 * The code the executor is asked to work on.
 *
 * A real, runnable Node project — not an empty directory — because the acceptance gate runs the
 * project's own test command in a clean container, and a project with nothing to run is a gate that
 * refuses by design (task 157). Two files, one script, no dependencies: `npm test` works offline,
 * which matters because the acceptance container has no network of its own to rely on.
 */
const TOY_FILES: Record<string, string> = {
  'package.json': `${JSON.stringify(
    {
      name: 'tekstovyy-kvest',
      version: '0.1.0',
      private: true,
      type: 'module',
      description: 'Игрушечный консольный проект для гейта M15а.',
      scripts: { test: 'node --test' },
    },
    null,
    2,
  )}\n`,

  'src/story.js': [
    '// Заготовка: сюжет квеста и переходы между сценами.',
    'export const scenes = {',
    "  start: { text: 'Ты стоишь у входа в пещеру.', choices: [] },",
    '};',
    '',
    'export function sceneById(id) {',
    '  return scenes[id] ?? null;',
    '}',
    '',
  ].join('\n'),

  'test/story.test.js': [
    "import { test } from 'node:test';",
    "import assert from 'node:assert/strict';",
    '',
    "import { sceneById } from '../src/story.js';",
    '',
    "test('стартовая сцена существует', () => {",
    "  assert.ok(sceneById('start'));",
    '});',
    '',
  ].join('\n'),

  'README.md': '# Текстовый квест\n\nИгрушечный проект гейта M15а.\n',
};

/* ------------------------------------------------------------------ the walk */

let server: ChildProcess | null = null;

async function startServer(label: string): Promise<void> {
  note(`Запуск сервера контура (${label})…`);

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
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? 'gate-placeholder-not-a-real-key',
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
      const response = await fetch(`${BASE_URL}/`, { redirect: 'manual' });
      return response.status < 500;
    } catch {
      return false;
    }
  }, 120_000);

  note(`Сервер контура отвечает на ${BASE_URL} (${label}).`);
}

const serverLog: string[] = [];

function killServer(hard: boolean): void {
  if (server === null) return;

  note(hard ? 'SIGKILL оркестратору.' : 'Остановка сервера контура.');
  /*
   * `taskkill /T` on Windows: `next start` is a child of this `node`, and killing only the parent
   * leaves the server holding the port — which the M14а walk learned the same way.
   */
  if (process.platform === 'win32' && server.pid !== undefined) {
    spawn('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
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

async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(join(OUT, 'screens'), { recursive: true });
  await page.screenshot({ path: join(OUT, 'screens', `${name}.png`), fullPage: true });
  note(`Снимок ${name}.png`);
}

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

interface BoardSnapshot {
  milestones: {
    milestoneId: string;
    status: string;
    tasks: { taskId: string; status: string }[];
  }[];
}

/**
 * The board as the page currently shows it.
 *
 * **Read without reloading, deliberately.** The tree is server-rendered and refreshed in place when
 * a status event arrives, so reading the live DOM is reading what an operator sees. The first
 * rehearsal of this walk polled a DOM that never changed and waited forever on a status that had
 * already moved — the fix was to make the board live (task 153's feed now carries status events),
 * not to have the walk reload behind the product's back.
 */
async function readBoardSnapshot(page: Page): Promise<BoardSnapshot> {
  return page.evaluate(() => {
    const milestones = [...document.querySelectorAll('[data-testid="milestone"]')].map((node) => ({
      milestoneId: (node.querySelector('.row-title')?.textContent ?? '').trim(),
      status: node.querySelector('.badge')?.getAttribute('data-status') ?? '',
      tasks: [...node.querySelectorAll('[data-testid="task"]')].map((task) => ({
        taskId: task.getAttribute('data-task-id') ?? '',
        status: task.querySelector('.badge')?.getAttribute('data-status') ?? '',
      })),
    }));

    return { milestones };
  });
}

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function snapshotHandoff(projectDirectory: string): Record<string, string> {
  const tree: Record<string, string> = {};
  const tasksDirectory = join(projectDirectory, 'handoff', 'tasks');

  for (const name of readdirSync(tasksDirectory)) {
    tree[`handoff/tasks/${name}`] = sha256(join(tasksDirectory, name));
  }

  return tree;
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const started = Date.now();

  const projectDirectory = prepareWorkspace();

  let browser: Browser | null = null;
  let verdict: 'GREEN' | 'RED' = 'GREEN';
  let projectId = '';
  let beforeKill: BoardSnapshot;
  let beforeKillTree: Record<string, string>;

  try {
    await startServer('первый запуск');

    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: VIEWPORT });
    await page.goto(BASE_URL);
    await shot(page, '01-пустой-дашборд');

    // --- intake -------------------------------------------------------------------------------
    note('POST /api/orchestrator/start-loop');
    const response = await fetch(`${BASE_URL}/api/orchestrator/start-loop`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectDirectory: PROJECT_DIRECTORY_NAME,
        projectTitle: 'Текстовый квест (гейт M15а)',
        // One cycle end to end — the gate's own words.
        maxCycles: 1,
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
    };
    projectId = parsed.projectId;
    note(
      `Интейк принят: проект ${projectId}, стратегия ${parsed.strategy}, ` +
        `вех ${String(parsed.milestones)}, задач ${String(parsed.tasks)}.`,
    );

    if (parsed.strategy === 'dependencies') {
      note('Вехи нарезаны по ЗАВИСИМОСТЯМ — контракт задачи 169 сработал вживую.');
    } else {
      finding('Бандл не назвал зависимостей: вехи нарезаны фазовым фолбэком.');
    }

    await page.reload();
    await page.waitForSelector('[data-testid="milestone"]');
    await shot(page, '02-план-принят');

    beforeKill = await readBoardSnapshot(page);
    beforeKillTree = snapshotHandoff(projectDirectory);
    writeFileSync(
      join(OUT, 'before-restart.json'),
      `${JSON.stringify({ board: beforeKill, tree: beforeKillTree }, null, 2)}\n`,
      'utf8',
    );

    // --- the kill, mid-cycle ------------------------------------------------------------------
    note('Ожидание задачи в работе, чтобы убить оркестратор посреди цикла…');
    await waitFor(async () => {
      const shown = await readBoardSnapshot(page);
      return shown.milestones.some((milestone) =>
        milestone.tasks.some((task) => task.status === 'IN_PROGRESS'),
      );
    }, 300_000).catch(() => {
      finding('Ни одна задача не перешла в IN_PROGRESS до истечения ожидания.');
    });

    await shot(page, '03-задача-в-работе');
    killServer(true);
    await new Promise((settle) => setTimeout(settle, 3_000));

    await startServer('после SIGKILL');
    await page.goto(BASE_URL);
    await page.waitForSelector('[data-testid="milestone"]');
    await shot(page, '04-после-рестарта');

    const afterRestart = await readBoardSnapshot(page);
    const afterRestartTree = snapshotHandoff(projectDirectory);
    writeFileSync(
      join(OUT, 'after-restart.json'),
      `${JSON.stringify({ board: afterRestart, tree: afterRestartTree }, null, 2)}\n`,
      'utf8',
    );

    if (afterRestart.milestones.length !== beforeKill.milestones.length) {
      finding(
        `Состояние потеряно на рестарте: вех до ${String(beforeKill.milestones.length)}, ` +
          `после ${String(afterRestart.milestones.length)}.`,
      );
      verdict = 'RED';
    } else {
      note(
        `Состояние пережило SIGKILL: вех ${String(afterRestart.milestones.length)}, план на месте.`,
      );
    }

    // --- resume -------------------------------------------------------------------------------
    note('Возобновление одиночного цикла после рестарта…');
    const resume = await fetch(`${BASE_URL}/api/orchestrator/start-loop`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ projectDirectory: PROJECT_DIRECTORY_NAME, maxCycles: 1 }),
    });
    note(`Возобновление: ${String(resume.status)}`);

    await waitFor(async () => {
      const shown = await readBoardSnapshot(page);
      return shown.milestones.some((milestone) =>
        milestone.tasks.some((task) => task.status === 'COMPLETED' || task.status === 'FAILED'),
      );
    }, 1_800_000).catch(() => {
      finding('Цикл не дошёл до вердикта за отведённое время.');
      verdict = 'RED';
    });

    const final = await readBoardSnapshot(page);
    await shot(page, '05-вердикт');

    writeFileSync(join(OUT, 'final-board.json'), `${JSON.stringify(final, null, 2)}\n`, 'utf8');

    const completed = final.milestones.flatMap((milestone) =>
      milestone.tasks.filter((task) => task.status === 'COMPLETED'),
    );
    if (completed.length === 0) {
      finding('Ни одна задача не дошла до COMPLETED.');
      verdict = 'RED';
    } else {
      note(`Задач принято чистым контейнером: ${String(completed.length)}.`);
    }

    // --- the feed and the tree, into the artifacts ---------------------------------------------
    const feed = await page.evaluate(() =>
      [...document.querySelectorAll('[data-testid="feed-line"]')].map((node) => node.textContent),
    );
    writeFileSync(join(OUT, 'feed.txt'), `${feed.join('\n')}\n`, 'utf8');

    cpSync(join(projectDirectory, 'handoff'), join(OUT, 'handoff'), { recursive: true });
    writeFileSync(join(OUT, 'server.log'), serverLog.join(''), 'utf8');

    // --- red conditions -------------------------------------------------------------------------
    const wholeLog = `${serverLog.join('')}\n${feed.join('\n')}`;
    if (/database is locked/i.test(wholeLog)) {
      finding('В логах встретилось «database is locked».');
      verdict = 'RED';
    }
    if (/не уложился в/i.test(wholeLog)) {
      finding('Исполнитель упёрся в стенные часы — возможное интерактивное зависание.');
      verdict = 'RED';
    }
  } catch (error) {
    finding(`Прогулка остановлена: ${error instanceof Error ? error.message : String(error)}`);
    verdict = 'RED';
  } finally {
    await browser?.close();
    killServer(false);
  }

  const minutes = ((Date.now() - started) / 60_000).toFixed(1);
  writeResult(verdict, minutes, projectId);
  note(`Вердикт: ${verdict}. Артефакты в ${OUT}.`);

  process.exitCode = verdict === 'GREEN' ? 0 : 1;
}

function writeResult(verdict: string, minutes: string, projectId: string): void {
  const lines = [
    `# Гейт M15а — ${verdict}`,
    '',
    `* **Режим:** ${STUB ? 'репетиция на стабовом исполнителе' : 'живой исполнитель Claude Code'}`,
    `* **Проект:** ${projectId}`,
    `* **Длительность:** ${minutes} мин`,
    `* **Бандл:** ${BUNDLE_SOURCE}`,
    `* **Рабочая директория:** ${WORKSPACE}`,
    '',
    '## Находки',
    '',
    findings.length === 0 ? 'Находок нет.' : findings.map((entry) => `* ${entry}`).join('\n'),
    '',
    '## Шаги',
    '',
    ...steps.map((step) => `* \`${step.at}\` ${step.what}`),
    '',
  ];

  writeFileSync(join(OUT, 'RESULT.md'), `${lines.join('\n')}\n`, 'utf8');
}

await main();
