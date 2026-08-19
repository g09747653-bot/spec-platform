/* eslint-disable no-restricted-properties -- a hand-run gate script, not application code: it takes
   its target from the environment because that is how a person points it at a running server. */
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';

import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';
import pg from 'pg';

/**
 * **The M6 gate, walked by the executor** (round 5, А-2.1).
 *
 * The customer no longer tests. This script is what replaces them: the whole MVP journey —
 * prompt → interview → four documents, each drafted, approved and reviewed → a ZIP with exactly the
 * four parity files — driven through a browser against the **real** provider chain, with a
 * screenshot of every step, a Playwright trace, and a transcript of what the models actually
 * produced. A red run is a milestone that is not delivered.
 *
 * It is not part of any suite and never runs in CI: CI must not depend on a model having a good day
 * (NFR-012 AC-5). This is the opposite instrument — the one that only says something *because* it
 * depends on one.
 *
 * Run it as the gate is run:
 *   pnpm db:test-server        (one terminal — leave it running)
 *   pnpm dev:gate              (another; chain google,ollama and the raised local timeout)
 *   node --experimental-strip-types e2e/gate-M6.live.ts
 *
 * Artifacts land in `artifacts/gate-M6/` and are committed: the gate is accepted from them.
 */
const BASE_URL = process.env.GATE_URL ?? 'http://127.0.0.1:3000';
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:5497/postgres';
const OUT = process.env.GATE_OUT ?? 'artifacts/gate-M6';

const IDEA =
  process.env.GATE_IDEA ??
  'A web app that helps a small climbing gym schedule its instructors and take class bookings';

/** The four names the bundle contract fixes (constitution P3). Order is the export's, not ours. */
const PARITY_FILES = ['constitution.md', 'requirements.md', 'solution.md', 'tasks.md'];

const STAGES = ['constitution', 'requirements', 'solution', 'tasks'] as const;

const problems: string[] = [];
const consoleErrors: string[] = [];
const timings: string[] = [];
/** Calls that had to be repeated. Not problems — but not nothing, either. */
const retries: string[] = [];
const notes: string[] = [];
const transcript: string[] = [];
const controlLog: string[] = [];

let step = 0;
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

/* ------------------------------------------------------------------ sign-in */

async function createSignedInUser(): Promise<{ sessionToken: string }> {
  const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();

  try {
    const sessionToken = randomUUID();
    const email = `gate-m6-${randomUUID().slice(0, 8)}@example.test`;
    const inserted = await client.query<{ id: string }>(
      'INSERT INTO users (email, name) VALUES ($1, $2) RETURNING id',
      [email, 'M6 gate'],
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

/** How many generation runs the stage has — the "no duplicates" half of the M3 resume rule. */
async function countRuns(stage: string): Promise<number> {
  const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();

  try {
    const rows = await client.query<{ n: string }>(
      'SELECT count(*) AS n FROM generation_runs WHERE stage = $1',
      [stage],
    );
    return Number(rows.rows[0]?.n ?? '0');
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
      expires: Math.floor(Date.now() / 1000) + 6 * 60 * 60,
    },
  ]);
}

/* ------------------------------------------------------- observing the page */

/** The controls that actually move a session — the Д-1/Р-3 invariant is stated over these. */
const SESSION_CONTROLS = [
  'ask-round',
  'proceed',
  'generate-spec',
  'stop-generation',
  'stop-waiting',
  'mcq-submit',
  'mcq-reply-toggle',
  'mcq-reply-send',
  'fallback-submit',
  'approve-spec',
  'request-changes',
  'submit-changes',
  'review-accept',
  'review-ignore',
  'review-request-changes',
  'accept-diff',
  'reject-diff',
  'submit-refinement',
  'chat-send',
  'chat-message',
];

/** A screenshot plus the state of every control, and the liveness invariant checked on the spot. */
async function snapshot(page: Page, label: string): Promise<void> {
  step += 1;
  const name = `${String(step).padStart(2, '0')}-${label.replace(/[^\w]+/g, '-')}`;

  await page.screenshot({ path: `${OUT}/screens/${name}.png`, fullPage: true });

  const observed = await page.evaluate((ids: string[]) => {
    const rows: { id: string; text: string; disabled: boolean; moves: boolean }[] = [];

    for (const element of document.querySelectorAll('button, input, textarea, a[href]')) {
      const id = element.getAttribute('data-testid') ?? element.tagName;
      rows.push({
        id,
        text: element.textContent.trim().slice(0, 40),
        disabled: element.hasAttribute('disabled'),
        moves: ids.includes(id),
      });
    }

    const stage = document.querySelector('[data-testid="stage-current"]')?.textContent ?? null;
    const substage = document.querySelector('[data-testid="stage-substage"]')?.textContent ?? null;
    /* The invariant is about a *session* page; the project list has no session to move. */
    const onSession = document.querySelector('[data-testid="session"]') !== null;

    return { rows, stage, substage, onSession };
  }, SESSION_CONTROLS);

  const live = observed.rows.filter((row) => !row.disabled && row.moves);

  controlLog.push(
    `\n### ${name}\n`,
    observed.onSession
      ? `position: **${observed.stage ?? '—'}${observed.substage ?? ''}**`
      : '_not a session page — the liveness invariant does not apply here._',
    '',
    ...observed.rows.map(
      (row) => `- ${row.disabled ? '**disabled**' : 'enabled '} \`${row.id}\` ${row.text}`,
    ),
    '',
    `session-moving controls live: **${String(live.length)}** (${live.map((row) => row.id).join(', ') || 'none'})`,
  );

  if (observed.onSession && live.length === 0) {
    problem(`ZERO live session-moving controls at ${name}`);
  }
  if (observed.stage !== null && observed.stage.trim() === '') problem(`empty stage at ${name}`);
}

async function click(
  page: Page,
  testId: string,
  where: string,
  timeout = 30_000,
): Promise<boolean> {
  try {
    await page.getByTestId(testId).click({ timeout });
    return true;
  } catch {
    problem(`could not click \`${testId}\` at ${where}`);
    return false;
  }
}

/* ------------------------------------------------------------- the journey */

/** Answers whatever card is on screen: one option per question, whatever the model asked. */
async function answerCard(page: Page): Promise<void> {
  const questionIds = await page.evaluate(() => {
    const ids = new Set<string>();
    for (const element of document.querySelectorAll('[data-testid^="mcq-question-"]')) {
      ids.add((element.getAttribute('data-testid') ?? '').replace('mcq-question-', ''));
    }
    return [...ids];
  });

  for (const questionId of questionIds) {
    await page
      .locator(`[data-testid^="mcq-option-${questionId}-"]`)
      .first()
      .check({ timeout: 15_000 })
      .catch(() => {
        problem(`no option could be picked for question ${questionId}`);
      });
  }
}

/**
 * One round of questions for a stage: ask, record what was asked, reload (the resume check for a
 * pending question card), answer, submit.
 */
async function askAndAnswer(page: Page, stage: string): Promise<'answered' | 'nothing-to-ask'> {
  const began = Date.now();

  /*
   * Asked up to three times, because "nothing came back" and "there is nothing to ask" are different
   * answers and only the second is a reason to move on.
   *
   * A specification stage cannot leave `collect` until one of its rounds has been **answered** — the
   * gate is a fact about stored answers, not about the model's opinion — so a stage whose first ask
   * produced nothing is not ready to proceed, it is a stage that has been asked once. A person would
   * click again; so does this. (Note also that `proceed` here is always enabled: it is the server
   * that judges, not the button, so its state says nothing about the gate.)
   */
  let arrived = false;

  for (let attempt = 1; attempt <= 3 && !arrived; attempt += 1) {
    if (attempt > 1)
      retries.push(`${stage}: the ask produced nothing; asking again (${String(attempt)} of 3)`);

    if (!(await click(page, 'ask-round', `${stage}: ask`))) break;

    arrived = await page
      .getByTestId('mcq-card')
      .waitFor({ timeout: 420_000 })
      .then(() => true)
      .catch(() => false);
  }

  if (!arrived) {
    problem(`${stage}: no question card arrived after three asks — the stage cannot leave collect`);
    return 'nothing-to-ask';
  }

  timings.push(`${stage} question round: ${String(Math.round((Date.now() - began) / 100) / 10)} s`);
  await snapshot(page, `${stage}-round`);

  const asked = await page
    .getByTestId('mcq-card')
    .innerText()
    .catch(() => null);
  if (asked !== null)
    transcript.push(`### ${stage} — the round asked\n\n\`\`\`\n${asked}\n\`\`\`\n`);

  // Resume check: a pending question card is a pending decision, and a reload must bring it back.
  await page.reload();
  const cameBack = await page
    .getByTestId('mcq-card')
    .waitFor({ timeout: 30_000 })
    .then(() => true)
    .catch(() => false);

  if (!cameBack)
    problem(`${stage}: the pending question card did not survive a reload (FR-017 AC-3)`);
  else say(`${stage}: pending question card survived a reload`);

  await snapshot(page, `${stage}-round-after-reload`);

  await answerCard(page);
  await click(page, 'mcq-submit', `${stage}: submit`);

  // The card is consumed when the panel comes back.
  await page
    .getByTestId('interview-panel')
    .waitFor({ timeout: 420_000 })
    .catch(() => {
      problem(`${stage}: the interview panel never came back after submitting`);
    });

  await snapshot(page, `${stage}-round-answered`);
  return 'answered';
}

/** Walks one specification stage: collect → generate → approve → review → next stage. */
async function walkStage(page: Page, stage: string, isFirst: boolean): Promise<void> {
  say(`—— ${stage} ——`);

  await askAndAnswer(page, stage);

  if (!(await click(page, 'proceed', `${stage}: collect → generate`))) return;
  await page
    // The substage the pill stands in, not the «Generating» it prints for it (task 143).
    .locator('[data-testid="stage-substage"][data-substage="generate"]')
    .waitFor({ timeout: 120_000 })
    .catch(() => {
      problem(`${stage}: the session did not reach generate`);
    });
  await snapshot(page, `${stage}-generate`);

  const generationBegan = Date.now();
  if (!(await click(page, 'generate-spec', `${stage}: generate`))) return;

  await page.waitForTimeout(3000);
  await snapshot(page, `${stage}-generating`);

  // The double-click guard: the control must not be usable while its own generation runs.
  await page
    .getByTestId('generate-spec')
    .click({ timeout: 2000 })
    .then(() => {
      problem(`${stage}: Generate was clickable during its own generation`);
    })
    .catch(() => undefined);

  /*
   * The mid-generation disconnect, on the **first** stage only (M6 §3: "обрыв посреди генерации и
   * возврат на страницу"). The page is left entirely — a new navigation, so the reader is gone and
   * the socket with it — and then the session is opened again. Round 4's Р-2 is what must make this
   * survivable: the run does not die with its reader, and the page reattaches to it.
   */
  if (isFirst) {
    const sessionUrl = page.url();

    /*
     * Leave once the generation is **producing**, not merely requested.
     *
     * The run row is created after the context is assembled — research included — so for the first
     * seconds of a click there is a request in flight and no run to speak of. Leaving in that window
     * tests the window, not the disconnect; text on screen is the unambiguous sign that a run exists
     * and is streaming.
     */
    const producing = await page
      .getByTestId('spec-stream')
      .waitFor({ timeout: 600_000 })
      .then(() => true)
      .catch(() => false);

    if (!producing) {
      say(
        `${stage}: no text appeared within ten minutes — leaving anyway, to see what returning does`,
      );
    }

    say(`${stage}: leaving the page mid-generation, on purpose`);
    await page.goto('/projects');
    await page.waitForTimeout(4000);
    await snapshot(page, `${stage}-left-mid-generation`);

    /*
     * A fresh navigation back, not `goBack()`. History-back restores the client router's cached
     * payload — the page as it was, not as the session is — so it cannot answer the question the
     * gate is asking. Typing the address again is what a person does after closing a tab.
     */
    await page.goto(sessionUrl);
    await page.getByTestId('session').waitFor({ timeout: 60_000 });
    await page.waitForTimeout(3000);
    say(`${stage}: back on the session page after the disconnect`);
    await snapshot(page, `${stage}-returned-mid-generation`);

    /*
     * Round 5, Р-3: the returning page must reattach to the run, not offer a second one.
     *
     * Waited for rather than sampled. Reattaching happens in an effect, so it cannot happen before
     * the page hydrates — and on this machine, with a 14B model saturating it, hydration is not
     * instant. A sample taken three seconds in measures the laptop, not the application.
     */
    const stillGenerating = await page
      .getByTestId('stop-generation')
      .waitFor({ timeout: 120_000 })
      .then(() => true)
      .catch(() => false);
    const offersGenerate = await page
      .getByTestId('generate-spec')
      .isVisible()
      .catch(() => false);

    if (stillGenerating) {
      say(
        `${stage}: the returning page reattached to the run in flight — Stop offered, not Generate`,
      );
    } else if (offersGenerate) {
      /*
       * Recorded, not failed. What the milestone requires of a disconnect is "no losses and no
       * duplicates": the run survives (Р-2) and no second one can start over it (Р-3's guard in the
       * generate route). A page that offers Generate here is worse than one that reattaches, and it
       * is said so — but taking the offer can no longer damage anything, and the assertion below is
       * over the damage rather than over the button.
       */
      say(
        `${stage}: the returning page offered Generate rather than reattaching — worse, but harmless: the guard refuses a second run`,
      );
    } else {
      say(`${stage}: the run had already finished by the time the page came back`);
    }

    // The requirement itself: whatever the page showed, the stage has exactly one run.
    const runs = await countRuns(stage);
    if (runs > 1) {
      problem(
        `${stage}: ${String(runs)} runs for one stage — the disconnect duplicated a generation`,
      );
    } else {
      say(`${stage}: exactly one generation run for the stage — no duplicate (M3 resume rule)`);
    }
  }

  let settled = await Promise.race([
    page
      .getByTestId('spec-card')
      .waitFor({ timeout: 900_000 })
      .then(() => 'card'),
    page
      .getByTestId('generation-error')
      .waitFor({ timeout: 900_000 })
      .then(() => 'error'),
  ]).catch(() => 'nothing');

  /*
   * One reload before calling it a failure — and it is *reported*, not swallowed. A revision is
   * persisted before `complete` is ever sent, so if a reload finds a document the page was simply
   * not following the run that produced it, which is a finding in its own right.
   */
  if (settled === 'nothing') {
    say(`${stage}: nothing on screen after the generation — reloading once, as a person would`);
    await page.reload();

    settled = await page
      .getByTestId('spec-card')
      .waitFor({ timeout: 60_000 })
      .then(() => 'card-after-reload')
      .catch(() => 'nothing');

    if (settled === 'card-after-reload') {
      problem(
        `${stage}: the document existed but the page only showed it after a reload — it was not following its own run`,
      );
    }
  }

  /*
   * A failed generation is offered again, and the walk takes the offer — twice, no more.
   *
   * This is the behaviour FR-018 AC-2/AC-3 specifies: a failure is not a dead end, the same control
   * comes back reading "Try again", and taking it resumes from the same position with the same
   * context. A person would click it; a walk that gave up on the first refusal would measure less
   * than a person experiences. Each retry is *recorded* — how often a sample is unusable is the
   * finding, and hiding it behind a loop would be the one dishonest thing here.
   */
  for (let retry = 1; retry <= 2 && settled === 'error'; retry += 1) {
    const reason = await page
      .getByTestId('generation-error')
      .innerText()
      .catch(() => '(no message)');

    say(`${stage}: the generation failed — "${reason}". Trying again (${String(retry)} of 2).`);
    retries.push(`${stage}: generation retried, attempt ${String(retry + 1)}`);
    await snapshot(page, `${stage}-generation-failed-${String(retry)}`);

    if (!(await click(page, 'generate-spec', `${stage}: try again`))) break;

    settled = await Promise.race([
      page
        .getByTestId('spec-card')
        .waitFor({ timeout: 900_000 })
        .then(() => 'card'),
      page
        .getByTestId('generation-error')
        .waitFor({ timeout: 900_000 })
        .then(() => 'error'),
    ]).catch(() => 'nothing');
  }

  timings.push(
    `${stage} generation: ${String(Math.round((Date.now() - generationBegan) / 100) / 10)} s`,
  );

  if (settled === 'nothing' || settled === 'error') {
    problem(`${stage}: generation ended as "${settled}" rather than a revision, after three tries`);
    await snapshot(page, `${stage}-generation-failed`);
    return;
  }

  say(
    `${stage}: revision written and structurally valid (a spec card is the section schema passing)`,
  );
  await snapshot(page, `${stage}-drafted`);

  const drafted = await page
    .getByTestId('spec-content')
    .innerText()
    .catch(() => null);
  if (drafted !== null) {
    transcript.push(
      `### ${stage} — the drafted document\n\n\`\`\`\n${drafted.slice(0, 2500)}\n\`\`\`\n`,
    );
  }

  // Resume check: a pending spec approval must survive a reload.
  await page.reload();
  await page
    .getByTestId('approve-spec')
    .waitFor({ timeout: 60_000 })
    .then(() => {
      say(`${stage}: pending approval survived a reload`);
    })
    .catch(() => {
      problem(`${stage}: the pending approval did not survive a reload (FR-017 AC-4)`);
    });

  await click(page, 'approve-spec', `${stage}: approve`);
  await page
    // The card's own flag, not the word it prints (task 143): these walks run in Russian too.
    .locator('[data-testid="spec-card"][data-approved="true"]')
    .waitFor({ timeout: 120_000 })
    .catch(() => {
      problem(`${stage}: the revision was not marked approved`);
    });
  await snapshot(page, `${stage}-approved`);

  // Entering review runs the review agent inside the transition request — the slowest door there
  // is, and the one round 5 had to make survivable.
  const reviewBegan = Date.now();
  if (!(await click(page, 'proceed', `${stage}: generate → review`))) return;

  const board = await Promise.race([
    page
      .getByTestId('review-board')
      .waitFor({ timeout: 900_000 })
      .then(() => 'board'),
    page
      .getByTestId('review-board-decided')
      .waitFor({ timeout: 900_000 })
      .then(() => 'decided'),
  ]).catch(() => 'nothing');

  timings.push(`${stage} review: ${String(Math.round((Date.now() - reviewBegan) / 100) / 10)} s`);

  if (board === 'nothing') {
    // A review that could not be produced is not a failed transition (FR-010; the route says so).
    const substage = await page
      .getByTestId('stage-substage')
      .getAttribute('data-substage')
      .catch(() => null);

    if (substage === 'review') {
      say(`${stage}: the stage entered review with no board — the chain could not produce one`);
    } else {
      problem(`${stage}: neither a review board nor a review position`);
      return;
    }
  } else {
    await snapshot(page, `${stage}-review-board`);
    const text = await page
      .getByTestId('review-board')
      .innerText()
      .catch(() => null);
    if (text !== null)
      transcript.push(`### ${stage} — the review board\n\n\`\`\`\n${text}\n\`\`\`\n`);

    // Resume check: a pending review board must survive a reload.
    await page.reload();
    await page
      .getByTestId('review-board')
      .waitFor({ timeout: 60_000 })
      .then(() => {
        say(`${stage}: pending review board survived a reload`);
      })
      .catch(() => {
        problem(`${stage}: the pending review did not survive a reload (FR-017 AC-4)`);
      });

    await click(page, 'review-accept', `${stage}: accept the review`);
    await page.waitForTimeout(2500);
    await snapshot(page, `${stage}-review-decided`);
  }

  // And on to the next stage.
  if (!(await click(page, 'proceed', `${stage}: leave the stage`))) return;
  await page.waitForTimeout(4000);
  await snapshot(page, `${stage}-left`);
}

/* -------------------------------------------------------------- the export */

async function downloadBundle(page: Page): Promise<{ names: string[]; sizes: string[] } | null> {
  try {
    const download = await Promise.all([
      page.waitForEvent('download', { timeout: 120_000 }),
      page.getByTestId('download-export').click(),
    ]).then(([event]) => event);

    const bytes = await readFile(await download.path());
    writeFileSync(`${OUT}/bundle.zip`, bytes);
    const archive = unzipSync(new Uint8Array(bytes));

    for (const [name, content] of Object.entries(archive)) {
      writeFileSync(`${OUT}/bundle/${name}`, strFromU8(content));
    }

    return {
      names: Object.keys(archive),
      sizes: Object.entries(archive).map(
        ([name, content]) => `${name}: ${String(strFromU8(content).length)} characters`,
      ),
    };
  } catch (error) {
    problem(`the download failed: ${String(error).slice(0, 200)}`);
    return null;
  }
}

/* ----------------------------------------------------------------- the walk */

async function walk(browser: Browser): Promise<void> {
  /*
   * Trace, not video. The trace carries a screenshot and a DOM snapshot per action — strictly more
   * than a recording — and an hour of 1280×800 video is well over a hundred megabytes, which is not
   * a thing to put in a repository. The per-step screenshots are committed beside it.
   */
  const context = await browser.newContext({
    baseURL: BASE_URL,
    viewport: { width: 1280, height: 800 },
  });
  /*
   * A light trace: the action and network log, without per-action screenshots or DOM snapshots.
   * With those on, an hour's walk produced a 107 MB archive — past what a repository should
   * carry and past GitHub's own file limit — while the evidence a gate is read from is already
   * committed beside it: a full-page screenshot of every step and the control log in RESULT.md.
   */
  await context.tracing.start({ screenshots: false, snapshots: false, sources: false });
  await signIn(context, await createSignedInUser());

  const page = await context.newPage();
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${String(error).slice(0, 300)}`));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(`console: ${message.text().slice(0, 300)}`);
  });

  try {
    await page.goto('/projects');
    await page.getByTestId('create-project').waitFor({ state: 'visible', timeout: 60_000 });
    await snapshot(page, 'projects-empty');

    await page.getByTestId('prompt-input').fill(IDEA);
    await click(page, 'create-project', 'create the project');
    await page.getByTestId('session').waitFor({ timeout: 60_000 });
    await snapshot(page, 'session-created');

    // ——— the grounding interview: rounds until the model has nothing further to ask ———
    say('—— interview ——');
    for (let round = 1; round <= 4; round += 1) {
      const outcome = await askAndAnswer(page, 'interview');
      if (outcome === 'nothing-to-ask') break;

      const ready = await page
        .getByTestId('proceed')
        .isEnabled()
        .catch(() => false);
      const canAskMore = await page
        .getByTestId('ask-round')
        .isVisible()
        .catch(() => false);

      if (ready && (round >= 2 || !canAskMore)) break;
      if (!canAskMore) break;
    }

    await snapshot(page, 'interview-complete');

    if (!(await click(page, 'proceed', 'leave the interview'))) return;
    await page
      // The position, in the machine's spelling — a methodology may call it «Proposal» and a
      // translation may call it something else again (task 143).
      .locator('[data-testid="stage-current"][data-stage="constitution"]')
      .waitFor({ timeout: 120_000 })
      .catch(() => {
        problem('the session did not leave the interview');
      });
    await snapshot(page, 'constitution-collect');

    // ——— the four documents ———
    for (const [index, stage] of STAGES.entries()) {
      await walkStage(page, stage, index === 0);
    }

    await snapshot(page, 'session-complete');

    // ——— the bundle ———
    const mode = await page
      .getByTestId('export-mode')
      .textContent()
      .catch(() => null);
    say(`export mode shown at the moment of download: ${JSON.stringify(mode)} (constitution A6)`);

    const archive = await downloadBundle(page);
    await snapshot(page, 'exported');

    if (archive === null) return;

    say(`the archive holds: ${archive.names.join(', ')}`);
    for (const size of archive.sizes) say(`  ${size}`);

    const sorted = [...archive.names].sort((a, b) => a.localeCompare(b));
    if (sorted.length !== PARITY_FILES.length || sorted.some((n, i) => n !== PARITY_FILES[i])) {
      problem(
        `the archive is not the parity four: expected ${PARITY_FILES.join(', ')}, got ${archive.names.join(', ')}`,
      );
    } else {
      say('the archive is exactly the four parity files, with their exact names (P3)');
    }

    // ——— resume, one last time: the whole session, reopened from scratch ———
    await page.goto('/projects');
    await page.waitForTimeout(2000);
    await snapshot(page, 'projects-listing');

    await page
      .getByTestId('project-row')
      .first()
      .click({ timeout: 30_000 })
      .catch(() => undefined);
    await page
      .getByTestId('session')
      .waitFor({ timeout: 60_000 })
      .catch(() => {
        problem('the completed session could not be reopened from the project list');
      });
    await page.waitForTimeout(2000);
    await snapshot(page, 'session-reopened');
  } finally {
    await context.tracing.stop({ path: `${OUT}/trace.zip` });
    await context.close();
  }
}

/* ------------------------------------------------------------------- run it */

for (const directory of [OUT, `${OUT}/screens`, `${OUT}/bundle`]) {
  mkdirSync(directory, { recursive: true });
}

console.log(`Walking the M6 gate against ${BASE_URL}. Artifacts: ${OUT}/`);

const browser = await chromium.launch();

try {
  await walk(browser);
} catch (error) {
  problem(`the walk threw: ${String(error).slice(0, 500)}`);
} finally {
  await browser.close();
}

const list = (lines: readonly string[]) => (lines.length === 0 ? '_None._' : lines.join('\n'));
const bullets = (lines: readonly string[]) =>
  lines.length === 0 ? '_None._' : lines.map((line) => `- ${line}`).join('\n');

writeFileSync(
  `${OUT}/RESULT.md`,
  [
    '# M6 gate walk — result',
    '',
    `Journey: prompt → interview → four documents → ZIP, driven through a browser against the live`,
    `provider chain. Idea: _${IDEA}_`,
    '',
    `**Verdict: ${problems.length === 0 ? 'GREEN — no problems found' : `RED — ${String(problems.length)} problem(s)`}**`,
    '',
    `Steps captured: ${String(step)} · wall clock: ${String(Math.round((Date.now() - startedAt) / 60000))} min`,
    '',
    '## Problems',
    '',
    bullets(problems),
    '',
    '## Uncaught errors in the browser',
    '',
    bullets(consoleErrors),
    '',
    '## Timings, per model call',
    '',
    bullets(timings),
    '',
    '## Calls that had to be repeated',
    '',
    bullets(retries),
    '',
    '## What happened, in order',
    '',
    list(notes),
    '',
    '## Controls at every state',
    '',
    'The Д-1/Р-3 liveness invariant, observed live rather than against a stub: every state below',
    'lists its controls and how many of the session-moving ones were usable.',
    '',
    controlLog.join('\n'),
  ].join('\n'),
);

writeFileSync(
  `${OUT}/TRANSCRIPT.md`,
  ['# What the live models produced', '', transcript.join('\n')].join('\n'),
);

console.log(`\nSteps: ${String(step)}`);
console.log(`Console errors: ${String(consoleErrors.length)}`);
console.log(`Problems: ${String(problems.length)}`);
for (const line of problems) console.log(`  - ${line}`);
console.log(`\nArtifacts in ${OUT}/`);
