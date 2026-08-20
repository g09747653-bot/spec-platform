/* eslint-disable no-restricted-properties -- a hand-run walk, not application code: it takes its
   target from the environment because that is how a person points it at a running server. */
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { unzipSync } from 'fflate';
import pg from 'pg';

import { unexpectedConsole } from './fixtures/console-noise.ts';

/**
 * **Программа А, шаг 0 — dogfooding** (START_HERE 2026-08-19): the product autonomously writes the
 * specification bundle of its own next stage, and this walk only watches it happen.
 *
 * Modelled on walk B of `e2e/gate-M13.live.ts` — the same harness, the same claim, one addition.
 * The claim: after the session is created from the seed with «Пусть ИИ проведёт этот чат сам»
 * checked, **not a single click** moves the session; the script counts its own clicks and fails if
 * the number moves. The addition: when the run ends, the walk fixes the raw material — it exports
 * the bundle through the same endpoint the download button calls (cookie-authenticated GET, no
 * click) and lays the ZIP's contents byte-for-byte into `.specs/research/programma-a/`, beside a
 * machine report of everything the run did: steps, revisions, boards, driver notes with their
 * stated reasons, packing lines, console.
 *
 * An honest named stop is **a finding, not a failure**: the walk's verdict is about its own health
 * (truncation, structural rejection, console, liveness, a click that moved) — the run's ending is
 * reported, whatever it is. Nothing is finished by hand; a hand-completed session would be worthless
 * as raw material, which is the only thing this walk exists to produce.
 *
 * Usage:
 *   pnpm db:test-server        (one terminal — leave it running)
 *   pnpm dev:gate              (another; google,ollama chain, the raised local timeout, and the
 *                               16384 window declared to the application — round 4, А-8)
 *   OLLAMA_CONTEXT_LENGTH=16384 OLLAMA_KEEP_ALIVE=4h OLLAMA_NUM_PARALLEL=1 ollama serve
 *   node --experimental-strip-types e2e/dogfood-A0.live.ts
 */
const BASE_URL = process.env.GATE_URL ?? 'http://127.0.0.1:3000';
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:5497/postgres';
const OUT = process.env.GATE_OUT ?? '.specs/research/programma-a';

/** The reference product's own methodology — as the session brief names it. */
const METHODOLOGY = process.env.GATE_METHODOLOGY ?? 'myspec-greenfield-v1';

/**
 * The seed, **verbatim from START_HERE §Seed** — one message, one paragraph. The content language
 * follows it (Russian), which is the brief's third axis and needs no control on the form.
 */
const SEED =
  process.env.GATE_IDEA ??
  'Автономный контур доставки: система, которая ведёт короткую задумку — текст или голос — до готового протестированного продукта без участия человека. Вход контура — готовый спецификационный бандл из Spec Platform (конституция, требования, архитектура, задачи). Дальше работают агенты на машине владельца: агент-архитектор читает бандл, нарезает работу на milestone-сессии и пишет файловые handoff-задания; агенты-исполнители (Claude Code) выполняют по одному milestone за сессию, сами тестируют каждый гейт (юниты, e2e, живые прогулки с артефактами) и пишут рапорты; архитектор проверяет артефакты и принимает или возвращает на доработку. Человек может в любой момент наблюдать ленту, остановить контур и забрать управление. Первая обязательная часть — локальный однопользовательский режим самой Spec Platform: запуск всего стека на машине владельца без облака и без OAuth (авто-сессия владельца, локальная база, локальная цепочка моделей, облачные ключи по выбору). Вторая — кодификация handoff-протокола как исполняемого конвейера: роли, гейты приёмки, уровни решений, BLOCKED-протокол, красный CI как полная остановка. Третья — параллельность: до десяти исполнителей под одним архитектором, с контроллерами и исследователями, для проектов уровня игры на движке. Телеграм-вход (короткая задумка текстом или голосом) подключается последним, когда контур уже доказан. Ограничения: одна машина Windows с 16 ГБ VRAM; протокол файловый и переживает обрыв любой сессии; каждое действие агентов оставляет читаемый след.';

const VIEWPORT = { width: 1440, height: 900 };

/**
 * How long the watch waits before calling the walk itself stuck, in milliseconds.
 *
 * Four hours — deliberately far past any honest ending. The run's real bounds are its own: the
 * 200-step ceiling, the idle detector, the round and revision budgets. This budget exists only so a
 * hung walk ends as a report rather than as a terminal nobody comes back to; it must never be the
 * thing that decides what the driver managed to do, because a watch that cuts a moving run has
 * manufactured a `running` row and lost the ending.
 */
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
  /* The run's own way out — the only control that means anything while a driver is moving. */
  'driver-stop',
];

const problems: string[] = [];
const consoleErrors: string[] = [];
const notes: string[] = [];
const measurements: string[] = [];
const driverLog: string[] = [];
const feedLog: string[] = [];
const boardLog: string[] = [];
const exportLog: string[] = [];

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

/* ------------------------------------------------------------------ sign-in and data */

async function createSignedInUser(): Promise<{ sessionToken: string }> {
  const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();

  try {
    const sessionToken = randomUUID();
    const email = `dogfood-a0-${randomUUID().slice(0, 8)}@example.test`;
    const inserted = await client.query<{ id: string }>(
      'INSERT INTO users (email, name) VALUES ($1, $2) RETURNING id',
      [email, 'A0 dogfooding'],
    );

    await client.query(
      "INSERT INTO auth_sessions (session_token, user_id, expires) VALUES ($1, $2, now() + interval '1 day')",
      [sessionToken, inserted.rows[0]?.id ?? ''],
    );

    return { sessionToken };
  } finally {
    await client.end();
  }
}

async function signIn(context: BrowserContext, user: { sessionToken: string }): Promise<void> {
  const { hostname } = new URL(BASE_URL);

  await context.addCookies([
    {
      name: 'authjs.session-token',
      value: user.sessionToken,
      domain: hostname,
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
    /* The brief's interface language — the run is watched in Russian (task 143). */
    { name: 'spec-platform-locale', value: 'ru', domain: hostname, path: '/', sameSite: 'Lax' },
  ]);
}

/**
 * One query, for whatever the DOM cannot show.
 *
 * **Never called while the autonomous run is moving.** A second connection to the throwaway PGlite
 * server hangs, and a walk that hangs on its own bookkeeping is a walk that reports nothing.
 */
async function query<T extends pg.QueryResultRow>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();

  try {
    return (await client.query<T>(sql, params)).rows;
  } finally {
    await client.end();
  }
}

/* ------------------------------------------------------------------ snapshots and liveness */

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
  await page.screenshot({ path: `${OUT}/screens/${name}.png`, fullPage: false });

  return `screens/${name}.png`;
}

/** A click, counted. The walk's whole claim is that this number stops moving at the seed. */
async function click(page: Page, testId: string): Promise<void> {
  clicks += 1;
  await page.getByTestId(testId).click();
}

/* ------------------------------------------------------------------ the session, from the brief */

/**
 * The session exactly as the brief names it: MySpec greenfield, профиль «технический», стиль
 * «Конкретный», the seed as the one message, «Пусть ИИ проведёт этот чат сам» checked. Setting the
 * radios is form state, not session movement; the one counted click is the create button, and the
 * count must never move again.
 */
async function createSession(page: Page): Promise<string> {
  await page.goto(`${BASE_URL}/projects`);
  await page.getByTestId('create-project').waitFor({ state: 'visible', timeout: 60_000 });
  await page.waitForFunction(() => {
    const button = document.querySelector('[data-testid="create-project"]');
    return button instanceof HTMLButtonElement && !button.disabled;
  });

  await page.getByTestId('prompt-input').fill(SEED);
  await page.getByTestId('audience-technical').check();
  await page.getByTestId('style-concrete').check();
  await page.getByTestId('autonomous-toggle').check();
  await page.getByTestId(`methodology-${METHODOLOGY}`).check();
  await click(page, 'create-project');

  await page.getByTestId('session').waitFor({ state: 'visible', timeout: 120_000 });

  return page.url();
}

/* ------------------------------------------------------------------ watching the run */

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
 * Watches the run to its end, screenshotting each position it reaches for the first time.
 *
 * It never clicks and never queries the database: the first would break the claim it exists to
 * make, and the second hangs against PGlite while the application holds its own connection.
 */
async function watchTheRun(page: Page): Promise<RunProgress> {
  const seen = new Set<string>();
  const deadline = Date.now() + RUN_BUDGET_MS;
  let last: RunProgress = await readProgress(page);

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

  return last;
}

/* ------------------------------------------------------------------ fixing the raw material */

const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/**
 * The bundle, byte-for-byte — through the same endpoint the download button calls, authenticated by
 * the same cookie, with no click to spend. The ZIP itself is kept beside its unpacked contents, so
 * the byte-fidelity claim stays checkable after the fact.
 */
async function fixTheBundle(context: BrowserContext, projectId: string): Promise<void> {
  const response = await context.request.get(
    `${BASE_URL}/api/projects/${projectId}/export?mode=default`,
  );

  if (!response.ok()) {
    problem(`export answered ${String(response.status())} rather than a bundle`);
    return;
  }

  const headers = response.headers();
  exportLog.push(`- режим экспорта: \`${headers['x-spec-export-mode'] ?? '—'}\``);
  exportLog.push(`- включено: \`${headers['x-spec-export-included'] ?? '—'}\``);
  exportLog.push(
    `- опущено: \`${headers['x-spec-export-omitted'] === '' ? 'ничего' : (headers['x-spec-export-omitted'] ?? '—')}\``,
  );

  const zip = new Uint8Array(await response.body());
  writeFileSync(`${OUT}/bundle.zip`, zip);
  exportLog.push(`- \`bundle.zip\` — ${String(zip.byteLength)} байт, sha256 \`${sha256(zip)}\``);

  const unpacked = unzipSync(zip);
  for (const [name, bytes] of Object.entries(unpacked)) {
    /* Flat names only — the parity bundle has no directories, and a path would escape OUT. */
    if (name.includes('/') || name.includes('\\')) {
      problem(`the export ZIP holds a pathed entry «${name}» — not the flat parity bundle`);
      continue;
    }
    writeFileSync(`${OUT}/${name}`, bytes);
    exportLog.push(`- \`${name}\` — ${String(bytes.byteLength)} байт, sha256 \`${sha256(bytes)}\``);
  }
}

/* ------------------------------------------------------------------ the walk */

async function run(browser: Browser): Promise<void> {
  const user = await createSignedInUser();

  const auto = await browser.newContext({ viewport: VIEWPORT });
  await signIn(auto, user);
  const page = await auto.newPage();

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => {
    consoleErrors.push(`pageerror: ${error.message}`);
  });

  say(
    `dogfooding A0 — автономный прогон от seed Программы А (${String(SEED.trim().split(/\s+/u).length)} слов)`,
  );
  const sessionUrl = await createSession(page);
  const clicksAtStart = clicks;
  say(`clicks so far: ${String(clicksAtStart)} — this number must not move again`);

  await snapshot(page, 'auto-session-open');

  const finished = await watchTheRun(page);

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

  /* The dark theme on the finished session — both themes, as every gate profile asks. */
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
  });
  await snapshot(page, 'auto-final-dark');
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'light');
  });

  /* The final state, surviving a reload — and the one screenshot the brief asks for by name. */
  await page.goto(sessionUrl);
  await page.getByTestId('session').waitFor({ state: 'visible', timeout: 60_000 });
  if (finished.stage === 'complete') {
    const sealed = await page.getByTestId('session-complete').count();
    if (sealed === 0) problem('the completed session did not come back sealed after a reload');
  }
  await stillAlive(page, 'the session after a reload');
  await snapshot(page, 'auto-reloaded');
  await page.screenshot({ path: `${OUT}/final-state.png`, fullPage: true });

  /*
   * The page goes first, so nothing of ours still talks to the application while the queries below
   * run; the context stays, because its cookie is what authenticates the export. Closing it before
   * the export was this script's first defect — `context.request` of a closed context answers
   * nothing at all.
   */
  await page.close();

  /* -------------------------------------------------- what the database says about it */

  const driverRows = await query<{ stage: string; at: string; body: string }>(
    "SELECT stage, to_char(created_at, 'HH24:MI:SS') AS at, body FROM session_messages WHERE origin = 'driver' ORDER BY created_at ASC",
  );

  for (const row of driverRows) {
    feedLog.push(`- \`${row.at}\` \`${row.stage}\` ${row.body}`);
  }

  measure(`строк драйвера в ленте: ${String(driverRows.length)}`);

  const bridges = await query<{ count: string }>(
    "SELECT count(*)::text AS count FROM session_messages WHERE origin = 'bridge'",
  );
  measure(`мостиков интервьюера в ленте: ${bridges[0]?.count ?? '0'}`);

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

  /* `question_rounds` stamps `presented_at`, not `created_at` — the first fixation threw on this. */
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

  /* The boards — every review the run sat, with the two countable facts the policy decided from. */
  const boards = await query<{
    spec_type: string;
    revision_number: number;
    outcome: string;
    decision: string | null;
    blocking: string;
    advisory: string;
    selected: string;
    summary: string | null;
  }>(
    `SELECT f.spec_type,
            r.revision_number,
            b.outcome,
            b.decision,
            (SELECT count(*) FROM jsonb_array_elements(b.items) item WHERE item->>'severity' = 'blocking')::text AS blocking,
            (SELECT count(*) FROM jsonb_array_elements(b.items) item WHERE item->>'severity' = 'advisory')::text AS advisory,
            COALESCE(jsonb_array_length(b.selected_item_ids), 0)::text AS selected,
            b.summary
       FROM review_feedback b
       JOIN spec_revisions r ON r.id = b.spec_revision_id
       JOIN spec_files f ON f.id = r.spec_file_id
      ORDER BY b.created_at ASC`,
  );

  for (const board of boards) {
    boardLog.push(
      `- **${board.spec_type} Rev ${String(board.revision_number)}** — итог \`${board.outcome}\`, решение \`${
        board.decision ?? 'не принято'
      }\`, блокирующих ${board.blocking}, советов ${board.advisory}, отобрано в переписывание ${board.selected}`,
    );
    if (board.summary !== null && board.summary !== '') {
      boardLog.push(`  · ${board.summary.replaceAll('\n', ' ')}`);
    }
  }

  measure(`досок ревью: ${String(boards.length)}`);

  /* -------------------------------------------------- the bundle, if there is one to take */

  const projects = await query<{ id: string; name: string }>('SELECT id, name FROM projects');
  const project = projects[0];

  if (project === undefined) {
    problem('no project row — the session never created one');
    return;
  }

  measure(`проект: «${project.name}», сессия ${sessionUrl.split('/').pop() ?? '—'}`);

  await fixTheBundle(auto, project.id);
  await auto.close();
}

const browser = await chromium.launch();

try {
  await run(browser);
} catch (error) {
  problem(`the walk threw: ${error instanceof Error ? error.message : String(error)}`);
} finally {
  await browser.close();
}

/* ------------------------------------------------------------------ the report */

const list = (lines: readonly string[]) => (lines.length === 0 ? '_None._' : lines.join('\n'));

/*
 * The one dictionary of browser noise, read from `e2e/fixtures/console-noise.ts` (task 173).
 *
 * It was copied into this file and three other walks; D-276 fixed the copy that runs in CI and left
 * the rest stale, which is a fix waiting to be undone by whoever reads the wrong one next.
 */
const unexpected = unexpectedConsole(consoleErrors);

function readLog(path: string): string {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
}

const OLLAMA_LOG = process.env.OLLAMA_LOG ?? `${OUT}/ollama-serve.err`;
const SERVER_LOG = process.env.SERVER_LOG ?? `${OUT}/dev-server.log`;

const truncations = [...readLog(OLLAMA_LOG).matchAll(/.*truncating input prompt.*/g)].map(
  (match) => match[0],
);
const structuralRejections = [
  ...readLog(SERVER_LOG).matchAll(/.*generated document rejected on structure.*/g),
].map((match) => match[0]);
const packingRecords = [...readLog(SERVER_LOG).matchAll(/context packing .*/g)].map(
  (match) => match[0],
);

/*
 * The walk's own health only. A named stop is an outcome the report carries, not a defect of the
 * measurement — the brief says so in one line: «честная остановка драйвера — находка, а не провал».
 */
const red =
  problems.length > 0 ||
  truncations.length > 0 ||
  structuralRejections.length > 0 ||
  unexpected.length > 0;

mkdirSync(OUT, { recursive: true });

writeFileSync(
  `${OUT}/RESULT-A0.md`,
  `# Программа А, шаг 0 — RESULT (машинный отчёт прогона)

Walked ${new Date(startedAt).toISOString()} against \`${BASE_URL}\`, live providers, throwaway
database. Сессия: MySpec greenfield · профиль «технический» · стиль «Конкретный» · автономный
режим; seed Программы А дословно из START_HERE (${String(SEED.trim().split(/\s+/u).length)} слов), русский интерфейс.

**Verdict (здоровье прогулки): ${red ? 'RED' : 'GREEN'}** — ${String(problems.length)} problem(s), ${String(step)} state(s)
captured, ${String(consoleErrors.length)} console record(s) of which ${String(unexpected.length)} unexpected.

Clicks after the session was created: **0** by construction — the count is asserted in code; the
export below is a cookie-authenticated \`GET\` of the same endpoint the download button calls.

## Problems

${list(problems)}

## Хронология позиций

${list(driverLog)}

## Записи драйвера (лента, origin='driver', с обоснованиями)

${list(feedLog)}

## Доски ревью

${list(boardLog)}

## Экспорт (фиксация бандла)

${list(exportLog)}

## Measured

${list(measurements)}

## Prompt truncation (round 4 — the red condition)

\`truncating input prompt\` records: **${String(truncations.length)}**. One is a red run, whatever else
went well: what a local runtime drops is the head of the prompt — the instruction and the
required-section list (D-146; А-8).

${list(truncations)}

## Structural rejections (M10п — the second red condition)

\`generated document rejected on structure\` records: **${String(structuralRejections.length)}**.

${list(structuralRejections)}

## Context packing (А-8)

${String(packingRecords.length)} packing record(s).

${list(packingRecords)}

## Console

${list(unexpected)}

## Transcript

${list(notes)}
`,
  'utf8',
);

console.log(`\n${red ? 'RED' : 'GREEN'} — ${OUT}/RESULT-A0.md`);
