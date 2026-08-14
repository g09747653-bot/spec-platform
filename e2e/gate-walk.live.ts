/* eslint-disable no-restricted-properties -- a hand-run script, not application code: it takes its
   target from the environment because that is how a person points it at a running server. */
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';

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
 * The auth helper is inlined rather than imported from `fixtures/`: this runs under
 * `--experimental-strip-types`, which needs explicit `.ts` extensions on relative imports, and those
 * are a type error for the rest of the repository. Six duplicated lines beat bending tsconfig for a
 * script meant to be run by hand once a milestone.
 */
const BASE_URL = process.env.GATE_URL ?? 'http://127.0.0.1:3000';
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:5497/postgres';
const OUT = '.gate-artifacts';

const IDEA = 'An app for keeping track of what my family spends each month';

const problems: string[] = [];
const consoleErrors: string[] = [];
const controlLog: string[] = [];
const questions: string[] = [];

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
  const name = `${String(step).padStart(2, '0')}-${label.replace(/[^\w]+/g, '-')}`;

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

/** Waits for a round to arrive, records what it asked, and answers it. */
async function askAndAnswer(page: Page, label: string): Promise<void> {
  await tryClick(page, 'ask-round', `${label} ask`);

  const arrived = await page
    .getByTestId('mcq-card')
    .waitFor({ timeout: 180_000 })
    .then(() => true)
    .catch(() => false);

  if (!arrived) {
    problems.push(`the ${label} round never arrived`);
    return;
  }

  await snapshot(page, `${label}-round`);

  const asked = await page
    .getByTestId('mcq-card')
    .innerText()
    .catch(() => null);

  if (asked !== null) questions.push(`## ${label} round\n\n\`\`\`\n${asked}\n\`\`\`\n`);

  await answerCard(page);
  await tryClick(page, 'mcq-submit', `${label} submit`);
  await page.waitForTimeout(5000);
  await snapshot(page, `${label}-answered`);
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

  await askAndAnswer(page, 'interview');

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

  await Promise.race([
    page.getByTestId('spec-card').waitFor({ timeout: 240_000 }),
    page.getByTestId('generation-error').waitFor({ timeout: 240_000 }),
  ]).catch(() => problems.push('generation neither completed nor failed within four minutes'));

  await snapshot(page, 'after-generation');

  const drafted = await page
    .getByTestId('spec-content')
    .innerText()
    .catch(() => null);

  if (drafted !== null) {
    questions.push(`## The drafted constitution\n\n\`\`\`\n${drafted.slice(0, 3000)}\n\`\`\`\n`);
  }

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

writeFileSync(`${OUT}/controls.md`, `# Controls at every state\n${controlLog.join('\n')}\n`);
writeFileSync(
  `${OUT}/console.md`,
  `# Console and uncaught errors\n\n${consoleErrors.length === 0 ? 'None.' : consoleErrors.map((line) => `- ${line}`).join('\n')}\n`,
);
writeFileSync(`${OUT}/questions.md`, `# What the live model asked\n\n${questions.join('\n')}\n`);
writeFileSync(
  `${OUT}/problems.md`,
  `# Problems found\n\n${problems.length === 0 ? 'None.' : problems.map((line) => `- ${line}`).join('\n')}\n`,
);

console.log(`\nSteps: ${String(step)}`);
console.log(`Console errors: ${String(consoleErrors.length)}`);
console.log(`Problems: ${String(problems.length)}`);
for (const problem of problems) console.log(`  - ${problem}`);
