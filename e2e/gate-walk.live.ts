/* eslint-disable no-restricted-properties -- a hand-run script, not application code: it takes its
   target from the environment because that is how a person points it at a running server. */
import { randomUUID } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';

import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import pg from 'pg';

/**
 * Round 2, Д-6 — the live exploratory walk. **Not part of any suite.**
 *
 * The M6 gate was walked by a person against real providers and hit a wall no green suite predicted.
 * This is that walk done by the executor: the same application, the same keys, the same money,
 * driven by a script that records what a person would have seen.
 *
 * Artifacts land in `.gate-artifacts/` (gitignored): a screenshot of every state, `controls.md`
 * listing every control and whether it was usable, `console.md` for uncaught errors, `questions.md`
 * for what the model actually asked, and `problems.md`.
 *
 * Run with the app up as for the gate:
 *   pnpm db:test-server        (one terminal)
 *   pnpm dev:gate              (another)
 *   node --experimental-strip-types e2e/gate-walk.live.ts
 *
 * Round 3 additions. The idea, the label and the chain are read from the environment, and
 * `questions.md` is appended to rather than overwritten, so the same walk can be run for several
 * ideas on several providers and the results compared side by side — which is what Д-3 asks for and
 * what one hard-coded idea could not give. The walk also carries on past generation into approval and
 * the review board, because "the model can write a constitution" and "the model can review one" are
 * different claims and only the second closes the cycle.
 *
 *   GATE_LABEL=family GATE_IDEA="..." GATE_CHAIN=ollama node --experimental-strip-types e2e/...
 *
 * The auth helper is inlined rather than imported from `fixtures/`: this runs under
 * `--experimental-strip-types`, which needs explicit `.ts` extensions on relative imports, and those
 * are a type error for the rest of the repository. Six duplicated lines beat bending tsconfig for a
 * script meant to be run by hand once a milestone.
 */
const BASE_URL = process.env.GATE_URL ?? 'http://127.0.0.1:3000';
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:5497/postgres';
const OUT = '.gate-artifacts';

const IDEA =
  process.env.GATE_IDEA ?? 'An app for keeping track of what my family spends each month';
/** Distinguishes one run's artifacts from another's, so two ideas do not overwrite each other. */
const LABEL = process.env.GATE_LABEL ?? 'walk';
/** Recorded in the transcript only — the chain itself is set by whoever started the server. */
const CHAIN = process.env.GATE_CHAIN ?? 'unstated';

const problems: string[] = [];
const consoleErrors: string[] = [];
const controlLog: string[] = [];
const questions: string[] = [];
/** Wall-clock per model call. A local model is expected to be slower; "how much" is a number. */
const timings: string[] = [];
/** Calls that had to be repeated. Not problems — but not nothing, either. */
const retries: string[] = [];

let step = 0;

async function createSignedInUser(label: string): Promise<{ sessionToken: string }> {
  const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();

  try {
    const sessionToken = randomUUID();
    const email = `${label}-${randomUUID().slice(0, 8)}@example.test`;
    const inserted = await client.query<{ id: string }>(
      'INSERT INTO users (email, name) VALUES ($1, $2) RETURNING id',
      [email, label],
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
  await context.addCookies([
    {
      name: 'authjs.session-token',
      value: user.sessionToken,
      domain: '127.0.0.1',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
      expires: Math.floor(Date.now() / 1000) + 60 * 60,
    },
  ]);
}

/** Every control on the page, with whether it can be used. */
async function snapshot(page: Page, label: string): Promise<void> {
  step += 1;
  const name = `${LABEL}-${String(step).padStart(2, '0')}-${label.replace(/[^\w]+/g, '-')}`;

  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });

  const controls = await page.evaluate(() => {
    const rows: { testId: string; tag: string; text: string; disabled: boolean }[] = [];

    for (const element of document.querySelectorAll('button, input, textarea, a[href]')) {
      rows.push({
        testId: element.getAttribute('data-testid') ?? '',
        tag: element.tagName,
        text: element.textContent.trim().slice(0, 40),
        disabled: element.hasAttribute('disabled'),
      });
    }

    return rows;
  });

  const stage = await page
    .getByTestId('stage-current')
    .textContent()
    .catch(() => null);

  const live = controls.filter((control) => !control.disabled);

  controlLog.push(
    `\n## ${name}\n`,
    `stage-current: ${JSON.stringify(stage)}`,
    '',
    ...controls.map(
      (control) =>
        `- ${control.disabled ? '**disabled**' : 'enabled '} \`${control.testId || control.tag}\` ${control.text}`,
    ),
    '',
    `live controls: ${String(live.length)}`,
  );

  // The Д-1 invariant, checked live rather than against a stub.
  if (live.length === 0) problems.push(`ZERO ENABLED CONTROLS at ${name}`);
  if (stage !== null && stage.trim() === '') problems.push(`EMPTY stage-current at ${name}`);
}

async function tryClick(page: Page, testId: string, label: string): Promise<boolean> {
  try {
    await page.getByTestId(testId).click({ timeout: 20_000 });
    return true;
  } catch {
    problems.push(`COULD NOT CLICK ${testId} at ${label}`);
    return false;
  }
}

/**
 * Answers whatever card is on screen: exactly one option per question.
 *
 * Written generically because the questions come from a live model and their ids are not knowable in
 * advance — which is the point of running this against a real provider rather than the stub.
 */
async function answerCard(page: Page): Promise<void> {
  const questionIds = await page.evaluate(() => {
    const ids = new Set<string>();

    for (const element of document.querySelectorAll('[data-testid^="mcq-question-"]')) {
      ids.add((element.getAttribute('data-testid') ?? '').replace('mcq-question-', ''));
    }

    return [...ids];
  });

  for (const questionId of questionIds) {
    const option = page.locator(`[data-testid^="mcq-option-${questionId}-"]`).first();

    await option.check({ timeout: 10_000 }).catch(() => {
      problems.push(`could not pick an option for ${questionId}`);
    });
  }
}

/**
 * Waits for a round to arrive, records what it asked, and answers it.
 *
 * Asks again if the first attempt produced nothing, and says so. A local model returns an
 * unparseable draft often enough to matter (round 3), and the endpoint answers that with
 * `DRAFT_INVALID` rather than a retry — so asking again is exactly what the page offers a person, and
 * a walk that gave up on the first refusal would be measuring less than a user would experience. The
 * retries are counted rather than hidden: how often it takes two goes is the finding.
 */
async function askAndAnswer(page: Page, label: string): Promise<void> {
  const started = Date.now();
  let arrived = false;

  for (let attempt = 1; attempt <= 3 && !arrived; attempt += 1) {
    if (attempt > 1) retries.push(`${label} round needed attempt ${String(attempt)}`);

    await tryClick(page, 'ask-round', `${label} ask`);

    arrived = await page
      .getByTestId('mcq-card')
      .waitFor({ timeout: 120_000 })
      .then(() => true)
      .catch(() => false);
  }

  if (!arrived) {
    /*
     * No card is not automatically a fault. A model that answers "nothing further is worth asking"
     * is exercising FR-005 AC-10's proceed branch, and the page shows that by enabling `proceed`
     * rather than by rendering a round. Recording the two as one thing would have this walk report
     * a defect every time the interview finished early.
     */
    const canProceed = await page
      .getByTestId('proceed')
      .isEnabled()
      .catch(() => false);

    if (canProceed)
      retries.push(`${label}: nothing further to ask — the stage is ready to proceed`);
    else problems.push(`the ${label} round never arrived, after three attempts`);

    return;
  }

  const elapsed = Date.now() - started;
  timings.push(`${label} round: ${String(Math.round(elapsed / 100) / 10)} s`);

  await snapshot(page, `${label}-round`);

  const asked = await page
    .getByTestId('mcq-card')
    .innerText()
    .catch(() => null);

  if (asked !== null) {
    questions.push(
      `### ${label} round — ${String(Math.round(elapsed / 100) / 10)} s\n\n\`\`\`\n${asked}\n\`\`\`\n`,
    );
  }

  await answerCard(page);
  await tryClick(page, 'mcq-submit', `${label} submit`);
  await page.waitForTimeout(5000);
  await snapshot(page, `${label}-answered`);
}

/**
 * Approve the draft and read what the review board came back with (round 3).
 *
 * The last model call of the cycle, and the one with the strictest output contract: the board is a
 * JSON artifact that is validated and repaired once before anything is persisted, so a model that can
 * write prose but cannot hold a schema fails exactly here — which is why the walk goes this far.
 */
async function reviewTheDraft(page: Page): Promise<void> {
  const started = Date.now();

  if (!(await tryClick(page, 'approve-spec', 'approve the draft'))) return;

  // Approving is not entering review: `proceed` stays disabled until a revision is approved, and it
  // is the click that opens the board (P2 — every stage transition is a decision someone makes).
  await page.waitForTimeout(2000);
  if (!(await tryClick(page, 'proceed', 'proceed to review'))) return;

  const arrived = await Promise.race([
    page
      .getByTestId('review-board')
      .waitFor({ timeout: 240_000 })
      .then(() => 'board'),
    page
      .getByTestId('review-error')
      .waitFor({ timeout: 240_000 })
      .then(() => 'error'),
  ]).catch(() => 'nothing');

  timings.push(`review board: ${String(Math.round((Date.now() - started) / 100) / 10)} s`);

  await snapshot(page, 'review-board');

  if (arrived !== 'board') {
    problems.push(`the review board did not arrive (${arrived})`);
    return;
  }

  const board = await page
    .getByTestId('review-board')
    .innerText()
    .catch(() => null);

  if (board !== null) questions.push(`### The review board\n\n\`\`\`\n${board}\n\`\`\`\n`);

  // A decision is required before the stage can advance (P2), so the walk makes one.
  await tryClick(page, 'review-ignore', 'ignore the first item');
  await page.waitForTimeout(1500);
  await snapshot(page, 'review-decided');
}

async function walk(browser: Browser): Promise<void> {
  const context = await browser.newContext({ baseURL: BASE_URL });
  await signIn(context, await createSignedInUser('gate-walk'));

  const page = await context.newPage();

  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${String(error)}`));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(`console: ${message.text()}`);
  });

  await page.goto('/projects');
  await page.getByTestId('create-project').waitFor({ state: 'visible' });
  await snapshot(page, 'project-list-empty');

  await page.getByTestId('prompt-input').fill(IDEA);
  await tryClick(page, 'create-project', 'create');
  await page.getByTestId('session').waitFor({ timeout: 30_000 });
  await snapshot(page, 'session-start');

  // Two rounds in the interview stage: Д-3 asks for two, and the second is where a model either
  // narrows on what it just heard or repeats itself — which the first round cannot show.
  await askAndAnswer(page, 'interview-1');
  await askAndAnswer(page, 'interview-2');

  await tryClick(page, 'proceed', 'leave interview');
  await page.waitForTimeout(4000);
  await snapshot(page, 'constitution-collect');

  await askAndAnswer(page, 'constitution');

  await tryClick(page, 'proceed', 'into drafting');
  await page.waitForTimeout(4000);
  await snapshot(page, 'constitution-generate');

  // Stress: click Generate, then try to click it again while it runs.
  await tryClick(page, 'generate-spec', 'generate');
  await page.waitForTimeout(2000);
  await snapshot(page, 'generating');

  await page
    .getByTestId('generate-spec')
    .click({ timeout: 3000 })
    .then(() => problems.push('Generate was clickable during a generation'))
    .catch(() => undefined);

  const generationStarted = Date.now();

  await Promise.race([
    page.getByTestId('spec-card').waitFor({ timeout: 420_000 }),
    page.getByTestId('generation-error').waitFor({ timeout: 420_000 }),
  ]).catch(() => problems.push('generation neither completed nor failed within seven minutes'));

  timings.push(
    `constitution generation: ${String(Math.round((Date.now() - generationStarted) / 100) / 10)} s`,
  );

  await snapshot(page, 'after-generation');

  const drafted = await page
    .getByTestId('spec-content')
    .innerText()
    .catch(() => null);

  /*
   * A `spec-card` on screen is the structural check having passed, not a rendering detail: a document
   * missing or reordering a required section never becomes a revision — `runGeneration` reports
   * `reason: 'structure'` and the page shows `generation-error` instead (constitution P3). So which of
   * the two appeared is the section-schema verdict, observed from outside.
   */
  if (drafted === null) {
    problems.push('no constitution was drafted — see the generation-error snapshot');
  } else {
    questions.push(`### The drafted constitution\n\n\`\`\`\n${drafted.slice(0, 3000)}\n\`\`\`\n`);
  }

  await reviewTheDraft(page);

  await page.reload();
  await page.waitForTimeout(3000);
  await snapshot(page, 'after-reload');

  await page.goBack().catch(() => undefined);
  await page.waitForTimeout(2000);
  await snapshot(page, 'after-browser-back');
  await page.goForward().catch(() => undefined);
  await page.waitForTimeout(2000);

  await page
    .getByTestId('chat-message')
    .fill('am I stuck?')
    .catch(() => undefined);
  await tryClick(page, 'chat-send', 'chat');
  await page.waitForTimeout(30_000);
  await snapshot(page, 'after-chat');

  await context.close();
}

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();

try {
  await walk(browser);
} catch (error) {
  problems.push(`WALK THREW: ${String(error)}`);
} finally {
  await browser.close();
}

const list = (lines: readonly string[]) =>
  lines.length === 0 ? 'None.' : lines.map((line) => `- ${line}`).join('\n');

writeFileSync(
  `${OUT}/${LABEL}-controls.md`,
  `# Controls at every state\n${controlLog.join('\n')}\n`,
);
writeFileSync(
  `${OUT}/${LABEL}-console.md`,
  `# Console and uncaught errors\n\n${list(consoleErrors)}\n`,
);
writeFileSync(`${OUT}/${LABEL}-problems.md`, `# Problems found\n\n${list(problems)}\n`);

/*
 * Appended, not overwritten. The point of Д-3 is comparison — one idea against another, and the local
 * model against the funded one — and a file that keeps only the last run cannot show it.
 */
if (!existsSync(`${OUT}/questions.md`)) {
  writeFileSync(`${OUT}/questions.md`, '# What the live model asked\n');
}

appendFileSync(
  `${OUT}/questions.md`,
  [
    `\n## ${LABEL} — chain \`${CHAIN}\``,
    '',
    `Idea: ${IDEA}`,
    '',
    `Timings: ${timings.join(' · ')}`,
    `Retries: ${retries.length === 0 ? 'none' : retries.join('; ')}`,
    `Problems: ${problems.length === 0 ? 'none' : String(problems.length)}`,
    '',
    questions.join('\n'),
  ].join('\n'),
);

console.log(`\nSteps: ${String(step)}`);
console.log(`Console errors: ${String(consoleErrors.length)}`);
console.log(`Problems: ${String(problems.length)}`);
for (const problem of problems) console.log(`  - ${problem}`);
