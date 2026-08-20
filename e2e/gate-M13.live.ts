/* eslint-disable no-restricted-properties -- a hand-run gate script, not application code: it takes
   its target from the environment because that is how a person points it at a running server. */
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import pg from 'pg';

import { unexpectedConsole } from './fixtures/console-noise.ts';

/**
 * **The M13п gate, walked by the executor** (task 146; А-2.1).
 *
 * Two walks, because this milestone added two things that only a live model can show:
 *
 * **(A) the «Concrete» interview, by hand.** Three live rounds on the Russian interface, judged by
 * `concrete-rubric.ts` — which is the acceptance criterion task 144 could not measure in round 2,
 * and the reason its checkbox is still open. The rubric itself runs next door, in
 * `round-preflight.preflight.ts`, against the raw draft: the schema drops a hallucinated link and an
 * unknown logo slug in silence (D-221), so a rubric that read the *rendered* round would report a
 * clean one every time. What this walk adds is the half a rubric cannot see — that the round
 * renders, that its справки open, that a person can answer it.
 *
 * **(B) the autonomous run, watched.** A one-sentence seed, the driver on, and then nothing: the
 * script waits and screenshots. That is the acceptance criterion stated as a procedure — «reaches
 * Session completed without any click» is only proved by a walk that does not click, so this one
 * counts its own clicks and fails if the number moves after the session opens.
 *
 * The invariants every gate since round 2 has carried apply unchanged: **liveness** (Д-1/Р-3) on
 * every snapshot, the **truncation** rule of round 4, and the **structural rejection** rule of
 * M10п — one record of either is a red run whatever else went well. To them this milestone adds one
 * of its own: **every act the driver takes is marked in the feed**, counted rather than read.
 *
 * Usage:
 *   pnpm db:test-server        (one terminal — leave it running)
 *   pnpm dev:gate              (another; chain google,ollama, the raised local timeout, and the
 *                               same window declared to the application — round 4, А-8)
 *   node --experimental-strip-types e2e/gate-M13.live.ts
 *
 * Artifacts land in `artifacts/gate-M13/` and are committed: the gate is accepted from them.
 */
const BASE_URL = process.env.GATE_URL ?? 'http://127.0.0.1:3000';
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:5497/postgres';
const OUT = process.env.GATE_OUT ?? 'artifacts/gate-M13';

/** The reference product's own methodology — the walk's default (Эталон §1.4). */
const METHODOLOGY = process.env.GATE_METHODOLOGY ?? 'myspec-greenfield-v1';

/** One sentence, which is what the autonomous AC asks the driver to work from. */
const SEED =
  process.env.GATE_IDEA ??
  'Инструмент, который следит за сроками грантовых заявок небольшого благотворительного фонда и сам готовит письма-напоминания';

const VIEWPORT = { width: 1440, height: 900 };

/** How long the autonomous run may take before the walk calls it stuck, in milliseconds. */
const RUN_BUDGET_MS = Number(process.env.GATE_RUN_BUDGET_MS ?? 5_400_000);

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
const roundLog: string[] = [];

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
    const email = `gate-m13-${randomUUID().slice(0, 8)}@example.test`;
    const inserted = await client.query<{ id: string }>(
      'INSERT INTO users (email, name) VALUES ($1, $2) RETURNING id',
      [email, 'M13 gate'],
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
    /* The customer's own interface language (task 143) — both walks are Russian. */
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

/** A click, counted. The autonomous walk's whole claim is that this number stops moving. */
async function click(page: Page, testId: string): Promise<void> {
  clicks += 1;
  await page.getByTestId(testId).click();
}

/* ------------------------------------------------------------------ walk A — «Concrete» by hand */

async function createSession(
  page: Page,
  options: { style?: 'default' | 'concrete'; autonomous?: boolean },
): Promise<string> {
  await page.goto(`${BASE_URL}/projects`);
  await page.getByTestId('create-project').waitFor({ state: 'visible', timeout: 60_000 });
  await page.waitForFunction(() => {
    const button = document.querySelector('[data-testid="create-project"]');
    return button instanceof HTMLButtonElement && !button.disabled;
  });

  await page.getByTestId('prompt-input').fill(SEED);
  if (options.style === 'concrete') await page.getByTestId('style-concrete').check();
  if (options.autonomous === true) await page.getByTestId('autonomous-toggle').check();
  await page.getByTestId(`methodology-${METHODOLOGY}`).check();
  await click(page, 'create-project');

  await page.getByTestId('session').waitFor({ state: 'visible', timeout: 120_000 });

  return page.url();
}

/**
 * Three live rounds in «Concrete», answered — the half of task 144's AC a rubric cannot judge.
 *
 * What is recorded per round: how many questions it asked, how many options carried a справка, and
 * whether the note opens. The rubric's own verdict on the same register comes from
 * `round-preflight.preflight.ts`, which scores the raw draft rather than the rendered round.
 */
async function concreteRounds(page: Page): Promise<void> {
  for (let round = 1; round <= 3; round += 1) {
    const ask = page.getByTestId('ask-round');
    if ((await ask.count()) === 0) {
      say(`round ${String(round)}: no Ask control — the budget is spent or the gate has opened`);
      break;
    }

    /*
     * How many answered rounds are already on screen.
     *
     * The feed **appends**, so waiting for `round-answered` to appear stops being a wait the moment
     * one exists: the first round's card satisfies the wait for the second round's answer instantly,
     * the loop runs on before the submission has landed, and the next iteration finds a pending card
     * where it expected an Ask control. That is exactly what the first run of this walk did. Count
     * the blocks and wait for one more — the lesson `e2e/feed.spec.ts` already carries.
     */
    const answeredBefore = await page.getByTestId('round-answered').count();

    await click(page, 'ask-round');
    await page.getByTestId('mcq-card').waitFor({ state: 'visible', timeout: 900_000 });
    await stillAlive(page, `concrete round ${String(round)}`);

    const card = page.getByTestId('mcq-card');
    const questions = await card.locator('fieldset').count();
    const notesOnOptions = await card.locator('[data-testid^="mcq-note-"]').count();
    const links = await card.locator('[data-testid^="mcq-link-"]').count();

    roundLog.push(
      `- **раунд ${String(round)}** — вопросов ${String(questions)}, опций со справкой ${String(
        notesOnOptions,
      )}, внешних ссылок ${String(links)}`,
    );

    const shot = await snapshot(page, `concrete-round-${String(round)}`);
    roundLog.push(`  · \`${shot}\``);

    if (notesOnOptions > 0) {
      await card.locator('[data-testid^="mcq-note-"]').first().click();
      clicks += 1;
      const opened = await card.locator('[data-testid^="mcq-note-text-"]:visible').count();
      if (opened === 0) problem(`round ${String(round)}: a справка did not open`);
      roundLog.push(`  · справка раскрылась: ${opened > 0 ? 'да' : 'нет'}`);
    }

    /* Answer it the way a person does: the first option of every question. */
    const groups = await card.locator('fieldset').all();
    for (const group of groups) {
      const option = group.locator('input[type="radio"], input[type="checkbox"]').first();
      if ((await option.count()) > 0) await option.check();
    }

    await click(page, 'mcq-submit');
    await page.waitForFunction(
      (expected: number) =>
        document.querySelectorAll('[data-testid="round-answered"]').length >= expected,
      answeredBefore + 1,
      { timeout: 900_000 },
    );
    await stillAlive(page, `after round ${String(round)}`);
  }
}

/* ------------------------------------------------------------------ walk B — the autonomous run */

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

  return last;
}

/* ------------------------------------------------------------------ the walk */

/**
 * Which walk to make, so a defect in one does not cost a re-run of the other.
 *
 * `both` by default — the gate is both — but the autonomous walk takes half an hour of live model
 * time, and re-running it to re-take three screenshots would let the walk's own cost decide what
 * gets measured.
 */
const WALK = process.env.GATE_WALK ?? 'both';

async function run(browser: Browser): Promise<void> {
  const user = await createSignedInUser();

  /* ---------------------------------------------------------- walk A: «Concrete», by hand, ru */

  const manual = await browser.newContext({ viewport: VIEWPORT });
  await signIn(manual, user);
  const manualPage = await manual.newPage();

  manualPage.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(`[A] ${message.text()}`);
  });
  manualPage.on('pageerror', (error) => {
    consoleErrors.push(`[A] pageerror: ${error.message}`);
  });

  if (WALK !== 'B') {
    say('walk A — «Конкретный», вручную, русский интерфейс');
    await createSession(manualPage, { style: 'concrete' });
    await snapshot(manualPage, 'concrete-session-open');
    await stillAlive(manualPage, 'a new concrete session');

    await concreteRounds(manualPage);
    await snapshot(manualPage, 'concrete-after-three-rounds');

    /* The dark theme, on the same surface — both themes, as the gate profile asks. */
    await manualPage.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });
    await snapshot(manualPage, 'concrete-dark');
    await manualPage.evaluate(() => {
      document.documentElement.setAttribute('data-theme', 'light');
    });
  }

  await manual.close();

  if (WALK === 'A') return;

  /* ---------------------------------------------------------- walk B: the autonomous run, ru */

  const auto = await browser.newContext({ viewport: VIEWPORT });
  await signIn(auto, user);
  const autoPage = await auto.newPage();

  autoPage.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(`[B] ${message.text()}`);
  });
  autoPage.on('pageerror', (error) => {
    consoleErrors.push(`[B] pageerror: ${error.message}`);
  });

  say('walk B — автономный прогон от односложного seed');
  const sessionUrl = await createSession(autoPage, { autonomous: true });
  const clicksAtStart = clicks;
  say(`clicks so far: ${String(clicksAtStart)} — this number must not move again`);

  await snapshot(autoPage, 'auto-session-open');

  const finished = await watchTheRun(autoPage);

  if (clicks !== clicksAtStart) {
    problem(`the autonomous walk clicked ${String(clicks - clicksAtStart)} time(s) after the seed`);
  }

  measure(
    `автономный прогон: шагов ${String(finished.steps)}, записей драйвера ${String(finished.driverNotes)}`,
  );
  measure(
    `итог: позиция ${finished.stage}/${finished.substage || '—'}, причина остановки «${finished.stopReason}»`,
  );

  if (finished.stage !== 'complete') {
    problem(
      `the autonomous run ended at ${finished.stage}/${finished.substage} rather than complete`,
    );
  }

  if (finished.stopReason !== 'completed' && finished.stopReason !== '') {
    problem(`the run stopped with «${finished.stopReason}»`);
  }

  await snapshot(autoPage, 'auto-complete');

  /* The dark theme on the finished session — the other half of «both themes». */
  await autoPage.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
  });
  await snapshot(autoPage, 'auto-complete-dark');
  await autoPage.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'light');
  });

  /* The bundle, and the seal surviving a reload. */
  await autoPage.goto(sessionUrl);
  const sealed = await autoPage.getByTestId('session-complete').count();
  if (sealed === 0) problem('the completed session did not come back sealed after a reload');

  await stillAlive(autoPage, 'the sealed autonomous session');
  await snapshot(autoPage, 'auto-reloaded');

  await auto.close();

  /* ---------------------------------------------------------- what the database says about it */

  const driverRows = await query<{ origin: string; body: string; stage: string }>(
    "SELECT origin, body, stage FROM session_messages WHERE origin = 'driver' ORDER BY created_at ASC",
  );

  for (const row of driverRows) {
    driverLog.push(`- \`${row.stage}\` ${row.body}`);
  }

  measure(`строк драйвера в ленте: ${String(driverRows.length)}`);

  const runs = await query<{
    status: string;
    /* Null while a run is live, which is exactly the state a stuck walk leaves behind. */
    stop_reason: string | null;
    steps: number;
    idle_steps: number;
  }>('SELECT status, stop_reason, steps, idle_steps FROM autonomous_runs ORDER BY started_at ASC');

  for (const row of runs) {
    measure(
      `прогон: ${row.status}/${row.stop_reason ?? '—'}, шагов ${String(row.steps)}, холостых ${String(row.idle_steps)}`,
    );
  }

  const revisions = await query<{ spec_type: string; revision_number: number; approved: boolean }>(
    'SELECT f.spec_type, r.revision_number, r.approved FROM spec_revisions r JOIN spec_files f ON f.id = r.spec_file_id ORDER BY f.spec_type, r.revision_number',
  );

  for (const row of revisions) {
    measure(
      `${row.spec_type} Rev ${String(row.revision_number)} — ${row.approved ? 'одобрен' : 'не одобрен'}`,
    );
  }
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

const red =
  problems.length > 0 ||
  truncations.length > 0 ||
  structuralRejections.length > 0 ||
  unexpected.length > 0;

mkdirSync(OUT, { recursive: true });

writeFileSync(
  `${OUT}/RESULT.md`,
  `# M13п gate — RESULT

Walked ${new Date(startedAt).toISOString()} against \`${BASE_URL}\`, live providers, throwaway database.

**Verdict: ${red ? 'RED' : 'GREEN'}** — ${String(problems.length)} problem(s), ${String(step)} state(s) captured, ${String(
    consoleErrors.length,
  )} console record(s) of which ${String(unexpected.length)} unexpected.

## Problems

${list(problems)}

## Walk A — «Конкретный», три живых раунда

${list(roundLog)}

The rubric's own verdict on the same register is in \`preflight/ROUND.md\`, written by
\`pnpm test:preflight\`: it scores the **raw** draft, because the schema drops a hallucinated link and
an unknown logo slug in silence (D-221) and a rubric reading the rendered round would report a clean
one every time.

## Walk B — автономный прогон

Clicks after the session was created: **${String(clicks)}** total for the whole script, of which the
autonomous half contributed **0** by construction (the count is asserted above).

${list(driverLog)}

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

console.log(`\n${red ? 'RED' : 'GREEN'} — ${OUT}/RESULT.md`);
