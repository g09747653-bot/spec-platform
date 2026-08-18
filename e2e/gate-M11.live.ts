/* eslint-disable no-restricted-properties -- a hand-run gate script, not application code: it takes
   its target from the environment because that is how a person points it at a running server. */
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import pg from 'pg';

/**
 * **The M11п gate, walked by the executor** (task 135; А-2.1) — the seal on stage 1, earned.
 *
 * M10п walked the whole journey on the final visual layer and the red-team then found 22 gaps in
 * what that journey had *not* looked at. Tasks 132–134 closed them; this walk is the live half of
 * checking that, and it is deliberately **short**. Nothing in M11п touched the machinery the M10п
 * gate proved — the state machine, the export contract, the revision chain — so re-walking it would
 * spend a day and a daily quota re-proving what is already on record. What M11п changed is the
 * conversation, and this is the conversation:
 *
 * 1. one live interview round, and the **analytical bridge** the interviewer writes after it (`1.2-3`);
 * 2. a free-chat exchange, then a **reload**, and the exchange still there at the position it was
 *    written at (`1.2-4`);
 * 3. the **crossing** out of the interview: the bundle event, the chip, and a step pill that prints
 *    a word rather than a token (`1.2-5`, `1.4-5`);
 * 4. one live document with its board — the machinery, re-proved cheaply on the way past;
 * 5. the **surfaces** of tasks 133–134, read twice: once in each theme (`1.5-2`, `1.5-3`, `1.5-4`,
 *    `1.4-8`).
 *
 * The invariants every gate since round 2 has carried apply unchanged: the **liveness** rule of
 * Д-1/Р-3 on every snapshot, the **truncation** rule of round 4, and the **structural rejection**
 * rule of M10п — one record of either is a red run whatever else went well.
 *
 * It is not part of any suite and never runs in CI: CI must not depend on a model having a good day
 * (NFR-012 AC-5). This is the opposite instrument — the one that only says something *because* it
 * depends on one.
 *
 * Run it as the gate is run:
 *   OLLAMA_CONTEXT_LENGTH=16384 OLLAMA_KEEP_ALIVE=4h OLLAMA_NUM_PARALLEL=1 ollama serve
 *                              (one terminal, logging to `<OUT>/ollama-serve.err` — D-92, D-145)
 *   pnpm db:test-server        (another — leave it running; restart it before every walk)
 *   pnpm dev:gate              (another; chain google,ollama, the raised local timeout, and the
 *                               same window declared to the application — round 4, А-8)
 *   node --experimental-strip-types e2e/gate-M11.live.ts
 *
 * Artifacts land in `artifacts/gate-M11/` and are committed: the gate is accepted from them.
 */
const BASE_URL = process.env.GATE_URL ?? 'http://127.0.0.1:3000';
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:5497/postgres';
const OUT = process.env.GATE_OUT ?? 'artifacts/gate-M11';

/** The reference product's own methodology — the walk's default (Эталон §1.4). */
const METHODOLOGY = process.env.GATE_METHODOLOGY ?? 'myspec-greenfield-v1';

const IDEA =
  process.env.GATE_IDEA ??
  'A tool that tracks which of a small charity’s grant applications are due, and drafts the reminder emails';

/** Controls that move the session on. Zero of them usable on a session page is a red run (Д-1). */
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
  /*
   * `download-export`, not `export-download` (round 3). The two words were transposed here, and the
   * cost was not a missing line in a log: at a completed session the Download ZIP button is the *only*
   * enabled control that moves anything, so the liveness rule reported zero live controls on a page
   * that had one and called four healthy states red. An invariant that names a control by a testid the
   * product never had cannot fail safe — it fails silent until the one state that depends on it.
   */
  'download-export',
];

const problems: string[] = [];
const consoleErrors: string[] = [];
const timings: string[] = [];
const retries: string[] = [];
const notes: string[] = [];
const transcript: string[] = [];
const controlLog: string[] = [];
const boardLog: string[] = [];

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
    const email = `gate-m11-${randomUUID().slice(0, 8)}@example.test`;
    const inserted = await client.query<{ id: string }>(
      'INSERT INTO users (email, name) VALUES ($1, $2) RETURNING id',
      [email, 'M11 gate'],
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
  ]);
}

/** One query, for whatever the DOM cannot show. */
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

/**
 * The boards of a project, with the linter/model split — the M8п open question, answered per board.
 */
async function boardsFor(
  projectId: string,
): Promise<
  { specType: string; revision: number; outcome: string; linterItems: number; modelItems: number }[]
> {
  const rows = await query<{
    spec_type: string;
    revision_number: number;
    outcome: string;
    items: { source?: string }[];
  }>(
    `SELECT s.spec_type, r.revision_number, f.outcome, f.items
       FROM review_feedback f
       JOIN spec_revisions r ON r.id = f.spec_revision_id
       JOIN spec_files s ON s.id = r.spec_file_id
      WHERE s.project_id = $1
      ORDER BY f.created_at ASC`,
    [projectId],
  );

  return rows.map((row) => ({
    specType: row.spec_type,
    revision: row.revision_number,
    outcome: row.outcome,
    linterItems: row.items.filter((item) => item.source === 'linter').length,
    modelItems: row.items.filter((item) => item.source !== 'linter').length,
  }));
}

/**
 * The project a session page belongs to.
 *
 * Read from the page's own «All chats» link rather than parsed out of the URL: since А-6 the URL
 * names the *session*, and a walk that derived a project id from it would be inventing one.
 */
async function projectIdOf(page: Page): Promise<string> {
  const href = await page
    .getByTestId('back-to-project')
    .getAttribute('href')
    .catch(() => null);

  return href?.split('/').at(-1) ?? '';
}

/* ------------------------------------------------------------ the instrument */

/**
 * A screenshot plus the state of every control, and the liveness invariant checked on the spot.
 *
 * `caret: 'initial'` — the instrument must not edit the page it is judging (D-110).
 */
async function snapshot(page: Page, label: string): Promise<void> {
  step += 1;
  mkdirSync(`${OUT}/screens`, { recursive: true });
  const name = `${String(step).padStart(2, '0')}-${label.replace(/[^\w]+/g, '-')}`;

  await page.screenshot({ path: `${OUT}/screens/${name}.png`, fullPage: true, caret: 'initial' });

  const observed = await page.evaluate((ids: string[]) => {
    const rows: { id: string; text: string; disabled: boolean; moves: boolean }[] = [];

    for (const element of document.querySelectorAll('button, input, textarea, select, a[href]')) {
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
    problem(`${where}: could not click \`${testId}\``);
    await snapshot(page, `could-not-click-${testId}`);
    return false;
  }
}

/* --------------------------------------------------------------- the interview */

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
 * One round: ask, answer, and **wait for the answers to land** (D-118).
 *
 * Synchronised on the fact — one more answered round fixed in the feed — rather than on a selector
 * that is on screen the whole time or on a timer.
 */
async function askAndAnswer(page: Page, stage: string): Promise<boolean> {
  const askable = await page
    .getByTestId('ask-round')
    .isVisible()
    .catch(() => false);

  if (!askable) return false;

  const began = Date.now();
  let arrived = false;

  for (let attempt = 1; attempt <= 3 && !arrived; attempt += 1) {
    if (attempt > 1)
      retries.push(`${stage}: the ask produced nothing; asking again (${String(attempt)} of 3)`);

    if (!(await click(page, 'ask-round', `${stage}: ask a round`))) break;

    arrived = await page
      .getByTestId('mcq-card')
      .waitFor({ timeout: 600_000 })
      .then(() => true)
      .catch(() => false);
  }

  timings.push(`${stage} question round: ${String(Math.round((Date.now() - began) / 100) / 10)} s`);

  if (!arrived) {
    say(`${stage}: no question card arrived after three asks`);
    return false;
  }

  await snapshot(page, `${stage}-round`);

  const asked = await page
    .getByTestId('mcq-card')
    .innerText()
    .catch(() => null);
  if (asked !== null) {
    transcript.push(`### ${stage} — the round asked\n\n\`\`\`\n${asked}\n\`\`\`\n`);
  }

  const fixedBefore = await page.getByTestId('round-answered').count();

  await answerCard(page);
  await click(page, 'mcq-submit', `${stage}: submit`);

  const landed = await page
    .waitForFunction(
      (count: number) => document.querySelectorAll('[data-testid="round-answered"]').length > count,
      fixedBefore,
      { timeout: 600_000 },
    )
    .then(() => true)
    .catch(() => false);

  if (landed) say(`${stage}: the answered round stayed in the feed, fixed`);
  else problem(`${stage}: the answers were submitted but never landed as a fixed round`);

  await snapshot(page, `${stage}-round-answered`);

  return landed;
}

/**
 * One attempt at drafting: press Generate, and wait for a document or a refusal.
 *
 * Returned rather than judged, because a refusal is not necessarily a failure of the walk — see
 * `walkStage`, which presses the product's own retry.
 */
async function draftOnce(page: Page, label: string): Promise<'card' | 'error' | 'nothing'> {
  const began = Date.now();
  const documentsBefore = await page.locator('[data-msg-kind="document"]').count();

  if (!(await click(page, 'generate-spec', `${label}: generate`))) return 'nothing';
  await page.waitForTimeout(3000);
  await snapshot(page, `${label}-generating`);

  const settled = await Promise.race([
    page
      .waitForFunction(
        (count: number) => document.querySelectorAll('[data-msg-kind="document"]').length > count,
        documentsBefore,
        { timeout: 900_000 },
      )
      .then(() => 'card' as const),
    page
      .getByTestId('generation-error')
      .waitFor({ timeout: 900_000 })
      .then(() => 'error' as const),
  ]).catch(() => 'nothing' as const);

  timings.push(`${label} generation: ${String(Math.round((Date.now() - began) / 100) / 10)} s`);

  return settled;
}

/** Draft, approve, enter review, and decide it — one spec stage of a live journey. */
async function walkStage(
  page: Page,
  label: string,
  options: { requestChanges?: boolean } = {},
): Promise<boolean> {
  /*
   * **A refused generation is retried, up to three times, by pressing the retry the product itself
   * offers** (FR-018 AC-3; `liveness.spec.ts` asserts that control actually retries).
   *
   * The first M9п walk treated the first refusal as fatal and lost two journeys to it. That was the
   * harness being stricter than the product: a structurally invalid draft is *expected* on a small
   * local model — M6 recorded exactly this and recorded that the next pass on the same model came
   * back conformant — and the honest question is not «did the first sample conform?» but «does the
   * session reach a conformant document by the route a person would take?». Every retry is recorded,
   * so a walk that needed three is visibly different from one that needed none.
   */
  let settled = await draftOnce(page, label);

  for (let attempt = 2; settled === 'error' && attempt <= 3; attempt += 1) {
    retries.push(
      `${label}: the draft was refused; pressing the page's own retry (${String(attempt)} of 3)`,
    );
    await snapshot(page, `${label}-refused-${String(attempt - 1)}`);
    settled = await draftOnce(page, `${label}-retry-${String(attempt - 1)}`);
  }

  if (settled !== 'card') {
    problem(`${label}: generation ended as "${settled}" after three attempts, not a revision`);
    await snapshot(page, `${label}-generation-failed`);
    return false;
  }

  const approvable = await page
    .getByTestId('approve-spec')
    .waitFor({ timeout: 120_000 })
    .then(() => true)
    .catch(() => false);

  if (!approvable) {
    problem(`${label}: a revision landed but never offered an approval`);
    return false;
  }

  await snapshot(page, `${label}-drafted`);

  const drafted = await page
    .getByTestId('spec-content')
    .innerText()
    .catch(() => null);
  if (drafted !== null) {
    transcript.push(`### ${label} — the document\n\n\`\`\`\n${drafted.slice(0, 2500)}\n\`\`\`\n`);
  }

  /*
   * **The product's own marker, and one *more* of it than there was** (round 4).
   *
   * Two defects in one line, and together they cost a journey. It waited for a `spec-card` whose
   * text contained «approved» — but the card contains the *document the model wrote*, so any
   * specification using the word satisfied it. On the SpecKit walk it was satisfied while the
   * approval was still in flight: the next line clicked «Proceed to review», the transition was
   * refused 409 because the approval had not landed, and the walk then spent 900 s waiting for a
   * review board nobody had asked for. The snapshot of that state shows the button still reading
   * «Approving…».
   *
   * `document-approved` is rendered by `document-block.tsx` only when a revision *is* approved —
   * the fact rather than the prose, which is the rule D-103 wrote two functions below. And it is
   * counted first, because by the third document of a journey the feed already carries two of
   * them: waiting for a badge that is on screen already is not waiting.
   */
  const approvedBefore = await page.getByTestId('document-approved').count();

  if (!(await click(page, 'approve-spec', `${label}: approve`))) return false;

  await page
    .getByTestId('document-approved')
    .nth(approvedBefore)
    .waitFor({ timeout: 120_000 })
    .catch(() => {
      problem(`${label}: the revision was not marked approved`);
    });
  await snapshot(page, `${label}-approved`);

  const reviewBegan = Date.now();
  if (!(await click(page, 'proceed', `${label}: generate → review`))) return false;

  const arrived = await page
    .getByTestId('review-board')
    .waitFor({ timeout: 900_000 })
    .then(() => true)
    .catch(() => false);

  timings.push(`${label} review: ${String(Math.round((Date.now() - reviewBegan) / 100) / 10)} s`);

  if (!arrived) {
    problem(`${label}: no review board arrived`);
    return false;
  }

  await snapshot(page, `${label}-review-board`);

  const text = await page
    .getByTestId('review-board')
    .innerText()
    .catch(() => null);
  if (text !== null) {
    transcript.push(`### ${label} — the review board\n\n\`\`\`\n${text.slice(0, 2500)}\n\`\`\`\n`);
  }

  /*
   * **One stage of this walk sends the document back**, and it is not decoration (task 129).
   *
   * A journey that accepts every board leaves every file at Rev 1, and a bundle with no second
   * revision has nothing for «go back to previous step» to undo and nothing for the diff renderer to
   * draw. Both are what this milestone shipped. So the first stage takes the other door: tick the
   * blocking points the board opened with, send it back, draft again, and approve Rev 2.
   */
  if (options.requestChanges === true) {
    if (!(await click(page, 'review-request-changes', `${label}: request changes`))) return false;

    await page
      .getByTestId('stage-substage')
      .waitFor({ timeout: 120_000 })
      .catch(() => undefined);
    await snapshot(page, `${label}-changes-requested`);

    const redrafted = await draftOnce(page, `${label}-rev2`);

    if (redrafted !== 'card') {
      problem(`${label}: the requested revision ended as "${redrafted}"`);
      return false;
    }

    const approvedAgain = await page.getByTestId('document-approved').count();
    if (!(await click(page, 'approve-spec', `${label}: approve Rev 2`))) return false;
    await page
      .getByTestId('document-approved')
      .nth(approvedAgain)
      .waitFor({ timeout: 120_000 })
      .catch(() => {
        problem(`${label}: Rev 2 was not marked approved`);
      });

    await snapshot(page, `${label}-rev2-approved`);

    if (!(await click(page, 'proceed', `${label}: Rev 2 → review`))) return false;

    const reviewed = await page
      .getByTestId('review-board')
      .waitFor({ timeout: 900_000 })
      .then(() => true)
      .catch(() => false);

    if (!reviewed) {
      problem(`${label}: no board arrived for the revision`);
      return false;
    }

    say(`${label}: the revision was re-reviewed against the points that were ticked`);
    await snapshot(page, `${label}-rev2-review-board`);
  }

  if (!(await click(page, 'review-accept', `${label}: accept the review`))) return false;

  // Wait for the **fact** (the board is decided), not for a button (D-103).
  await page
    .getByTestId('review-board')
    .waitFor({ state: 'detached', timeout: 120_000 })
    .catch(() => {
      problem(`${label}: the board never became decided`);
    });

  await snapshot(page, `${label}-review-decided`);

  return true;
}

/* ------------------------------------------------------------------ the walks */

/**
 * Both themes, on live states (task 124).
 *
 * Not a screenshot pair for the album: the check is that the tokens resolve to *different* colours in
 * the two themes on the same element, which is what tells a theme that switches from a theme that is
 * painted twice in the same ink. The suite already asserts contrast on token pairs; what only a live
 * walk can add is that the switch survives a real session's markup.
 */
async function themeSmoke(page: Page, sessionUrl: string): Promise<void> {
  say('— both themes —');

  if (sessionUrl === '') return;

  await page.goto(sessionUrl);
  await page.getByTestId('session').waitFor({ timeout: 60_000 });

  const readTheme = async (): Promise<{ theme: string; background: string; foreground: string }> =>
    page.evaluate(() => {
      const style = getComputedStyle(document.body);

      return {
        theme: document.documentElement.dataset.theme ?? '(none)',
        background: style.backgroundColor,
        foreground: style.color,
      };
    });

  const before = await readTheme();
  await snapshot(page, `theme-${before.theme}`);

  if (!(await click(page, 'theme-toggle', 'theme: switch'))) return;
  await page.waitForTimeout(500);

  const after = await readTheme();
  await snapshot(page, `theme-${after.theme}`);

  say(
    `theme: «${before.theme}» body ${before.background}/${before.foreground} → ` +
      `«${after.theme}» body ${after.background}/${after.foreground}`,
  );

  if (before.theme === after.theme) problem('theme: the toggle did not change the theme');
  if (before.background === after.background) {
    problem('theme: the two themes paint the same background — the tokens are not switching');
  }

  await page.reload();
  await page.getByTestId('session').waitFor({ timeout: 60_000 });
  const survived = await readTheme();

  if (survived.theme === after.theme) say('theme: the choice survives a reload');
  else problem(`theme: after a reload the page reads «${survived.theme}»`);

  await snapshot(page, 'theme-after-reload');
}

/* ------------------------------------------------------------------ the walk */

/** What the surfaces of tasks 133–134 print, read off the running page rather than asserted. */
async function readSurfaces(page: Page): Promise<void> {
  say('— the surfaces —');

  const sendFill = await page.evaluate(() => {
    const send = document.querySelector('[data-testid="chat-send"]');
    return send === null ? '(no send button)' : getComputedStyle(send).backgroundImage;
  });

  const attach = await page
    .getByTestId('composer')
    .getByTestId('composer-attach')
    .count()
    .catch(() => 0);

  say(`composer: attach inside it ${String(attach)}, Send painted ${sendFill.slice(0, 80)}`);
  if (attach === 0) problem('the composer has no attach control (row `1.5-2`)');
  if (!sendFill.includes('gradient')) problem('the Send button carries no gradient (row `1.5-2`)');

  /*
   * The panel's heading read as a heading, not as the word «Attachments» (task 143). What row
   * `1.5-3` asks is that the panel is titled at all; the title itself is exactly the part of it a
   * Russian interface rewrites.
   */
  const attachmentsTitle = await page
    .getByTestId('attachments-panel')
    .locator('h3, h2')
    .first()
    .innerText()
    .catch(() => '');

  const width = await page
    .getByTestId('sidebar-panel')
    .boundingBox()
    .then((box) => Math.round(box?.width ?? 0));

  await page.getByTestId('sidebar-resize').focus();
  for (let step_ = 0; step_ < 6; step_ += 1) await page.keyboard.press('ArrowLeft');
  const widened = await page
    .getByTestId('sidebar-panel')
    .boundingBox()
    .then((box) => Math.round(box?.width ?? 0));

  const titled = attachmentsTitle.trim();

  say(
    `sidebar: «${titled === '' ? 'no title' : titled}», ${String(width)}px → ${String(widened)}px after six steps`,
  );
  if (titled === '') problem('the attachments panel carries no title (row `1.5-3`)');
  if (widened <= width) problem('the resize handle does not widen the sidebar (row `1.5-3`)');

  /*
   * The export mode as the panel's own token (task 143). Row `1.4-8` was a copy defect — the panel
   * called the baseline «parity files», a word from the bundle contract rather than from the export
   * vocabulary — and the fact under it is that the mode on screen is one the vocabulary has.
   */
  const exportMode = await page
    .getByTestId('export-mode')
    .getAttribute('data-mode')
    .catch(() => null);

  say(`export panel: mode «${exportMode ?? 'none'}»`);
  if (exportMode !== 'default' && exportMode !== 'quality')
    problem('the export panel names no mode from the vocabulary (row `1.4-8`)');

  await snapshot(page, 'surfaces');
}

/**
 * **The M11п walk** (task 135) — short by design, and pointed at what M11п changed.
 *
 * The full journey was walked live at the M10п gate and nothing in this milestone touched the
 * machinery it proved; what M11п changed is the conversation, and this walk is the conversation:
 * one interview round on a live model, the bridge it writes afterwards, a chat reply that has to
 * survive a reload, the crossing into the first stage, one live document with its board, and the
 * surfaces — each in both themes.
 *
 * The invariants are the gate's own, unchanged: liveness on every snapshot, zero truncations, zero
 * structural rejections.
 */
async function run(browser: Browser): Promise<void> {
  const context = await browser.newContext({
    baseURL: BASE_URL,
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();

  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(`\`${stamp()}\` ${message.text()}`);
  });
  page.on('pageerror', (error) => {
    consoleErrors.push(`\`${stamp()}\` uncaught: ${error.message}`);
  });

  await signIn(context, await createSignedInUser());

  /* ------------------------------------------------------------- the seed */

  await page.goto('/projects');
  // Enabled only after hydration — the point from which a click is a real click (journey fixture).
  await page.getByTestId('create-project').waitFor({ timeout: 60_000 });
  await page
    .waitForFunction(
      () =>
        document.querySelector('[data-testid="create-project"]')?.hasAttribute('disabled') ===
        false,
      undefined,
      { timeout: 60_000 },
    )
    .catch(() => undefined);

  await page.getByTestId('prompt-input').fill(IDEA);
  await page.getByTestId(`methodology-${METHODOLOGY}`).check();
  await page.getByTestId('create-project').click();
  await page.getByTestId('session').waitFor({ timeout: 120_000 });

  const sessionUrl = page.url();
  const projectId = await projectIdOf(page);

  await snapshot(page, 'seeded');

  const seedLine = await page
    .getByTestId('session-prompt-line')
    .first()
    .innerText()
    .catch(() => '(no seed line)');

  say(`seed bubble: «${seedLine.replace(/\s+/g, ' ')}»`);
  transcript.push(`### the seed bubble\n\n\`\`\`\n${seedLine}\n\`\`\`\n`);

  /* --------------------------------------------- one live round, and the bridge */

  const answered = await askAndAnswer(page, 'interview');
  if (!answered) problem('interview: no round could be answered — the walk cannot continue');

  /*
   * The bridge is written while the answers are being stored, so it is on the page by the time the
   * next render arrives. Waited for rather than assumed: it is a live model call.
   */
  const bridged = await page
    .getByTestId('interview-bridge')
    .first()
    .waitFor({ timeout: 300_000 })
    .then(() => true)
    .catch(() => false);

  if (bridged) {
    const bridge = await page.getByTestId('interview-bridge').first().innerText();
    say(`the bridge was written: «${bridge.replace(/\s+/g, ' ').slice(0, 160)}…»`);
    transcript.push(`### the analytical bridge (row \`1.2-3\`)\n\n\`\`\`\n${bridge}\n\`\`\`\n`);
  } else {
    problem('no analytical bridge was written between the rounds (row `1.2-3`)');
  }

  await snapshot(page, 'bridge');

  /*
   * The budget as its two numbers rather than as the sentence «1 of 3 question rounds» (task 143).
   * Reading it out of the prose meant matching a plural rule as well as a language, and the plural
   * is the first half of that sentence a translation changes.
   */
  const panel = page.getByTestId('interview-panel');
  const answeredRounds = await panel.getAttribute('data-answered-rounds').catch(() => null);
  const roundBudget = await panel.getAttribute('data-round-budget').catch(() => null);

  say(`the round budget on the card: ${answeredRounds ?? 'none'} of ${roundBudget ?? 'none'}`);

  /* ------------------------------------------- a chat reply that survives a reload */

  const messagesBefore = await page.locator('[data-msg-kind="message"]').count();
  const question = 'Что мне здесь выбрать?';

  await page.getByTestId('composer').getByRole('textbox').fill(question);
  await click(page, 'chat-send', 'chat: send');

  const replied = await page
    .waitForFunction(
      (count: number) => document.querySelectorAll('[data-msg-kind="message"]').length > count + 1,
      messagesBefore,
      { timeout: 300_000 },
    )
    .then(() => true)
    .catch(() => false);

  if (!replied) problem('the chat message was sent but no reply arrived');
  await snapshot(page, 'chat-answered');

  const beforeReload = await page.evaluate(
    (needle: string) =>
      [...document.querySelectorAll('[data-msg-kind="message"]')]
        .filter((node) => node.textContent.includes(needle))
        .map((node) => ({
          stage: node.getAttribute('data-msg-stage') ?? '',
          substage: node.getAttribute('data-msg-substage') ?? '',
        })),
    question,
  );

  await page.reload();
  await page.getByTestId('session').waitFor({ timeout: 120_000 });

  const afterReload = await page.evaluate(
    (needle: string) =>
      [...document.querySelectorAll('[data-msg-kind="message"]')]
        .filter((node) => node.textContent.includes(needle))
        .map((node) => ({
          stage: node.getAttribute('data-msg-stage') ?? '',
          substage: node.getAttribute('data-msg-substage') ?? '',
          text: node.textContent.trim().slice(0, 80),
        })),
    question,
  );

  say(
    `the chat reply: ${String(beforeReload.length)} block(s) before the reload, ` +
      `${String(afterReload.length)} after — at ${afterReload[0]?.stage ?? '—'}/${afterReload[0]?.substage ?? '—'}`,
  );

  if (afterReload.length === 0) {
    problem('the chat exchange did not survive a reload (row `1.2-4`)');
  }

  const assistantAfter = await page.getByTestId('chat-turn-assistant').count();
  say(`assistant chat turns after the reload: ${String(assistantAfter)}`);
  if (assistantAfter === 0)
    problem('the assistant’s answer did not survive the reload (row `1.2-4`)');

  await snapshot(page, 'chat-after-reload');

  /* ----------------------------------------- the crossing, and one live document */

  if (!(await click(page, 'proceed', 'interview: proceed'))) return;
  await page
    .getByTestId('stage-substage')
    .waitFor({ timeout: 120_000 })
    .catch(() => undefined);

  const crossed = (await page.getByTestId('bundle-created').count()) > 0;
  const created = crossed
    ? await page
        .getByTestId('bundle-created')
        .innerText()
        .catch(() => '(unreadable)')
    : '(no bundle event)';
  const chip = await page
    .getByTestId('stage-chip')
    .last()
    .innerText()
    .catch(() => '(no chip)');
  const substage = await page
    .getByTestId('stage-substage')
    .innerText()
    .catch(() => '(no substage)');

  say(`the crossing: «${created.replace(/\s+/g, ' ')}»`);
  say(`the chip: «${chip.replace(/\s+/g, ' ')}»; the pill's substage: «${substage.trim()}»`);

  /*
   * The block's presence, not its sentence (task 143). `bundle-created` is the block's own name and
   * the only thing row `1.2-5` is about — that the crossing is marked in the feed at all — while
   * «Project bundle created» is the wording, which is the part that changes language.
   */
  if (!crossed) {
    problem('no bundle-created block at the interview’s exit (row `1.2-5`)');
  }
  if (/collect|generate|review/.test(substage)) {
    problem(`the step pill prints the raw substage token «${substage.trim()}» (row \`1.4-5\`)`);
  }

  await snapshot(page, 'crossed-into-constitution');

  await askAndAnswer(page, 'constitution');
  await click(page, 'proceed', 'constitution: proceed to drafting');

  const drafted = await walkStage(page, 'constitution');
  if (!drafted) problem('constitution: the stage did not reach an accepted board');

  for (const board of await boardsFor(projectId)) {
    boardLog.push(
      `- **${board.specType}** Rev ${String(board.revision)} — ${board.outcome}: ` +
        `${String(board.linterItems)} linter item(s), ${String(board.modelItems)} model item(s)`,
    );
  }

  /* ---------------------------------------------------- the surfaces, both themes */

  await readSurfaces(page);

  await page.goto(`/projects/${projectId}`);
  await page.getByTestId('project-page').waitFor({ timeout: 60_000 });

  const description = await page
    .getByTestId('project-description')
    .innerText()
    .catch(() => '(no description)');

  say(
    `the project page describes the project: «${description.replace(/\s+/g, ' ').slice(0, 100)}»`,
  );
  if (description === '(no description)') {
    problem('the project page shows no description (row `1.5-4`)');
  }
  await snapshot(page, 'project-page');

  await themeSmoke(page, sessionUrl);
  await readSurfaces(page);

  await context.close();
}

const browser = await chromium.launch();

try {
  await run(browser);
} catch (error) {
  problem(`the walk threw: ${error instanceof Error ? error.message : String(error)}`);
} finally {
  await browser.close();
}

const list = (lines: readonly string[]) => (lines.length === 0 ? '_None._' : lines.join('\n'));
const bullets = (lines: readonly string[]) =>
  lines.length === 0 ? '_None._' : lines.map((line) => `- ${line}`).join('\n');

/* ------------------------------------------------- the prompt-truncation rule (round 4, А-8) */

/**
 * **One `truncating input prompt` record is a red run, whatever else went well** (START_HERE §3).
 *
 * This is the invariant round 3 did not have, and its absence is what let the gate stay red for
 * three rounds against a diagnosis that was wrong twice. A local runtime handed more than it can
 * read does not refuse: it drops the head of the prompt — the system instruction and the required
 * section list — reads the tail, and answers confidently from the web research it found there. The
 * document that comes back is fluent, plausible, about the wrong thing, and is rejected on structure
 * three retries running, because truncation is deterministic (D-146).
 *
 * So the runtime's own log is read as evidence rather than the walk's outcome being trusted: a walk
 * can be green in every visible way while every local document was written from a mutilated prompt.
 *
 * The packing records are counted from the server log for the same reason, though they are not a
 * verdict: how often the research was shrunk or dropped is the difference between "the local link
 * carried the walk" and "the local link carried a walk with most of its context removed".
 */
function readLog(path: string): string {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
}

const OLLAMA_LOG = process.env.OLLAMA_LOG ?? `${OUT}/ollama-serve.err`;
const SERVER_LOG = process.env.SERVER_LOG ?? `${OUT}/dev-server.log`;

/**
 * **The window is this walk, not this file** — and getting that wrong is its own D-147.
 *
 * `OLLAMA_KEEP_ALIVE=4h` (D-145) exists precisely so the local server outlives the gaps in a walk,
 * which means it also outlives the walk: one server, one log, several sessions. The pre-flight that
 * precedes a round deliberately sends one **unpacked** prompt in order to reproduce the failure it
 * is fixing, so its truncation record is evidence rather than a defect — and a rule that counted the
 * whole file would read that evidence as a red verdict on a walk that never truncated anything.
 *
 * Ollama stamps every line with an ISO timestamp, so the window is exact. The dev-server log needs
 * no filter: `pnpm dev:gate` is started for the walk and its log begins there.
 */
const walkStartedAt = new Date(startedAt).toISOString();

/**
 * Parsed, never compared as text. Ollama stamps local time with an offset (`…+03:00`) and
 * `toISOString` writes UTC with a `Z`; comparing those two spellings as strings is not a comparison
 * at all, and the first version of this rule did exactly that — and reported four pre-flight records
 * as a red verdict on a walk that truncated nothing.
 */
const stampOf = (line: string) => {
  const raw = /^time=(\S+)/.exec(line)?.[1];
  const parsed = raw === undefined ? Number.NaN : new Date(raw).getTime();

  return Number.isNaN(parsed) ? 0 : parsed;
};

const ollamaTruncations = [...readLog(OLLAMA_LOG).matchAll(/.*truncating input prompt.*/g)]
  .map((match) => match[0].trim())
  .filter((line) => stampOf(line) >= startedAt);

const earlierTruncations =
  [...readLog(OLLAMA_LOG).matchAll(/truncating input prompt/g)].length - ollamaTruncations.length;

const truncationRecords = [
  ...ollamaTruncations,
  ...[...readLog(SERVER_LOG).matchAll(/.*truncating input prompt.*/g)].map((match) =>
    match[0].trim(),
  ),
];

const packingRecords = [...readLog(SERVER_LOG).matchAll(/context packing .*/g)].map((match) =>
  match[0].trim(),
);

const shrunkResearch = packingRecords.filter((line) => /research=\d/.test(line)).length;
const droppedResearch = packingRecords.filter((line) => line.includes('research=dropped')).length;

if (truncationRecords.length > 0) {
  problem(
    `the local runtime truncated ${String(truncationRecords.length)} prompt(s) — ` +
      'the instruction and the required-section list are what it drops (D-146; А-8). ' +
      `First record: ${truncationRecords[0] ?? ''}`,
  );
}

/**
 * **A structural rejection is red too** (M10п, task 129's acceptance criterion).
 *
 * `generated document rejected on structure` is what `run-generation.ts` logs when a draft comes back
 * without the headings the section schema requires. It is the symptom every local-model defect of
 * this programme has presented with — a truncated prompt (D-146), an overrun window, a model that
 * cannot hold a contract — and each time the walk itself stayed green because the product retried and
 * the second sample conformed. Retrying is correct behaviour; a walk that needed it is not a walk
 * that proved the milestone, so the record is read from the log rather than inferred from the screen.
 */
const structuralRejections = [
  ...readLog(SERVER_LOG).matchAll(/.*generated document rejected on structure.*/g),
].map((match) => match[0].trim());

if (structuralRejections.length > 0) {
  problem(
    `${String(structuralRejections.length)} generated document(s) were rejected on structure — ` +
      'the milestone asks for zero. First record: ' +
      (structuralRejections[0] ?? ''),
  );
}

if (packingRecords.length === 0) {
  notes.push(
    '- no packing records in the server log: either no generation reached a model, or the log was ' +
      'not captured (`SERVER_LOG`). The truncation rule cannot be evidence without one.',
  );
}

writeFileSync(
  `${OUT}/RESULT.md`,
  [
    '# M11п gate — RESULT',
    '',
    `Walked ${new Date().toISOString()} against \`${BASE_URL}\`, live providers, throwaway database.`,
    '',
    `**Verdict: ${problems.length === 0 ? 'GREEN' : 'RED'}** — ${String(problems.length)} problem(s), ` +
      `${String(step)} state(s) captured, ${String(consoleErrors.length)} console error(s).`,
    '',
    '## Problems',
    '',
    bullets(problems),
    '',
    '## Prompt truncation (round 4 — the new red condition)',
    '',
    `\`truncating input prompt\` records for the whole walk: **${String(truncationRecords.length)}**. ` +
      'One is a red run, whatever else went well: what a local runtime drops is the head of the ' +
      'prompt — the instruction and the required-section list (D-146; А-8).',
    '',
    bullets(truncationRecords.slice(0, 10)),
    '',
    `Counted from \`${walkStartedAt}\`, when this walk began. The same log holds ` +
      `**${String(earlierTruncations)}** earlier record(s) from before it — the pre-flight sends one ` +
      'unpacked prompt on purpose, to reproduce the failure being fixed, and its record is evidence ' +
      'rather than a defect (`preflight/RUN-2-STATE.md`).',
    '',
    '## Structural rejections (M10п — the second red condition)',
    '',
    `\`generated document rejected on structure\` records: **${String(structuralRejections.length)}**. ` +
      'The milestone asks for zero: a retry that succeeds hides the first sample, and the first ' +
      'sample is what says whether the local link can hold the contract.',
    '',
    bullets(structuralRejections.slice(0, 10)),
    '',
    '## Context packing (А-8, point 4)',
    '',
    `${String(packingRecords.length)} packing record(s): the web research was shrunk in ` +
      `**${String(shrunkResearch)}** and dropped entirely in **${String(droppedResearch)}** of them.`,
    '',
    bullets(packingRecords),
    '',
    '## Review boards, and what the linters found on each',
    '',
    'The M8п open question, answered per board. Zero machine items is a valid count on a clean',
    'document — the record is the evidence that the deterministic pass ran, not the number it found.',
    '',
    list(boardLog),
    '',
    '## What happened',
    '',
    list(notes),
    '',
    '## Timings',
    '',
    bullets(timings),
    '',
    '## Retries',
    '',
    bullets(retries),
    '',
    '## Console errors',
    '',
    bullets(consoleErrors),
    '',
    '## Controls at every state (the liveness invariant)',
    '',
    controlLog.join('\n'),
    '',
  ].join('\n'),
);

writeFileSync(
  `${OUT}/TRANSCRIPT.md`,
  ['# M11п gate — what the models said', '', transcript.join('\n')].join('\n'),
);

console.log(`\n${problems.length === 0 ? 'GREEN' : 'RED'} — artifacts in ${OUT}`);
