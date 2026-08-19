/* eslint-disable no-restricted-properties -- a hand-run gate script, not application code: it takes
   its target from the environment because that is how a person points it at a running server. */
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';

import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import pg from 'pg';

/**
 * **The M8п gate, walked by the executor** (task 115; А-2.1).
 *
 * M7п walked the whole journey on the feed. M8п walks the thing that journey could not do: the
 * **review cycle**. Prompt → interview → one document → a needs-revision board → request changes
 * with a *subset* of its points → the writer's paragraph → Rev N+1 → a re-review of the new bytes →
 * a decision, taken by typing a sentence rather than by pressing a button → and out.
 *
 * What it is looking for, in the order the walk meets it:
 *
 * - the board is Эталон §1.3 — a verdict badge, a summary paragraph, Must Fix ticked by default and
 *   Recommendations not, a confidence score on every point and an italic Suggestion under it;
 * - deterministic linter findings (task 114) sit on the same board as machine items, and they are
 *   there whatever the model said;
 * - request-changes takes exactly the points that were ticked, and the page then offers to *apply*
 *   them rather than to "generate" something;
 * - the paragraph the writer says before it rewrites is in the conversation, above the revision;
 * - the second board is a review of the **new** revision, not the old one re-presented;
 * - a typed sentence decides that board exactly as the button would (M4's contract, on the feed);
 * - and the liveness invariant of Д-1/Р-3 holds at every single state: a session page with zero
 *   usable session-moving controls is a red run, however good everything else looks.
 *
 * It is not part of any suite and never runs in CI: CI must not depend on a model having a good day
 * (NFR-012 AC-5). This is the opposite instrument — the one that only says something *because* it
 * depends on one.
 *
 * Run it as the gate is run:
 *   pnpm db:test-server        (one terminal — leave it running)
 *   pnpm dev:gate              (another; chain google,ollama and the raised local timeout)
 *   node --experimental-strip-types e2e/gate-M8.live.ts
 *
 * Artifacts land in `artifacts/gate-M8/` and are committed: the gate is accepted from them.
 */
const BASE_URL = process.env.GATE_URL ?? 'http://127.0.0.1:3000';
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:5497/postgres';
const OUT = process.env.GATE_OUT ?? 'artifacts/gate-M8';

const IDEA =
  process.env.GATE_IDEA ??
  'A tool that tracks which of a small charity’s grant applications are due, and drafts the reminder emails';

/** How many request-changes cycles the walk will take before it accepts whatever it has. */
const MAX_CYCLES = Number(process.env.GATE_CYCLES ?? '2');

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
  'chat-message',
  'refine-instruction',
];

const problems: string[] = [];
const consoleErrors: string[] = [];
const timings: string[] = [];
const retries: string[] = [];
const notes: string[] = [];
const transcript: string[] = [];
const controlLog: string[] = [];
/** What each board carried — the readable evidence of the review contract (Эталон §1.3). */
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
    const email = `gate-m8-${randomUUID().slice(0, 8)}@example.test`;
    const inserted = await client.query<{ id: string }>(
      'INSERT INTO users (email, name) VALUES ($1, $2) RETURNING id',
      [email, 'M8 gate'],
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

/** What the database says about this file's boards — the half the DOM cannot show. */
async function boardsFor(projectId: string): Promise<
  {
    revision: number;
    outcome: string;
    decision: string | null;
    selected: string[] | null;
    note: string | null;
    linterItems: number;
    modelItems: number;
  }[]
> {
  const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();

  try {
    const rows = await client.query<{
      revision_number: number;
      outcome: string;
      decision: string | null;
      selected_item_ids: string[] | null;
      revision_note: string | null;
      items: { source?: string }[];
    }>(
      `SELECT r.revision_number, f.outcome, f.decision, f.selected_item_ids, f.revision_note, f.items
         FROM review_feedback f
         JOIN spec_revisions r ON r.id = f.spec_revision_id
         JOIN spec_files s ON s.id = r.spec_file_id
        WHERE s.project_id = $1
        ORDER BY f.created_at ASC`,
      [projectId],
    );

    return rows.rows.map((row) => ({
      revision: row.revision_number,
      outcome: row.outcome,
      decision: row.decision,
      selected: row.selected_item_ids,
      note: row.revision_note,
      linterItems: row.items.filter((item) => item.source === 'linter').length,
      modelItems: row.items.filter((item) => item.source !== 'linter').length,
    }));
  } finally {
    await client.end();
  }
}

const projectIdOf = (url: string): string => url.split('/projects/')[1]?.split(/[?#]/)[0] ?? '';

/* ------------------------------------------------------------ the instrument */

/**
 * A screenshot plus the state of every control, and the liveness invariant checked on the spot.
 *
 * `caret: 'initial'` — the instrument must not edit the page it is judging (D-110). Playwright's
 * default hides the caret by writing an inline `caret-color` onto every input, and a capture that
 * races hydration then leaves React an attribute its client render does not produce: that, and
 * nothing else, was the hydration warning the M7п walk recorded on five of its states.
 */
async function snapshot(page: Page, label: string): Promise<void> {
  step += 1;
  const name = `${String(step).padStart(2, '0')}-${label.replace(/[^\w]+/g, '-')}`;

  await page.screenshot({ path: `${OUT}/screens/${name}.png`, fullPage: true, caret: 'initial' });

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
 * One round: ask, answer, and **wait for the answers to land**.
 *
 * The wait is the whole difficulty, and the first M8п run walked straight into it. In a feed every
 * control is on screen at all times, so "the submit button came back" says nothing; and submitting a
 * grounding round persists the answers and *then* calls the summariser, so the page does not re-read
 * the server until a provider chain has answered — minutes, on this one. The walk therefore
 * synchronises on the fact rather than on a timer: **one more answered round fixed in the feed**,
 * which is also exactly what task 106 promises, so the wait and the assertion are the same act.
 */
async function askAndAnswer(page: Page, stage: string): Promise<boolean> {
  const askable = await page
    .getByTestId('ask-round')
    .isVisible()
    .catch(() => false);

  if (!askable) return false;

  const began = Date.now();
  let arrived = false;

  /*
   * Asked up to three times: "nothing came back" and "there is nothing to ask" are different
   * answers, and only the second is a reason to move on — a spec stage cannot leave `collect`
   * until one of its rounds has been *answered*, which is a fact about stored rows.
   */
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
  if (asked !== null)
    transcript.push(`### ${stage} — the round asked

\`\`\`
${asked}
\`\`\`
`);

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

/* -------------------------------------------------------------- the review board */

interface BoardView {
  /**
   * The verdict as a token — `pass` or `needs_revision` (task 143).
   *
   * Kept beside `verdict` rather than instead of it: the badge's words are what a reader of the
   * artifact wants to see, and the token is what the walk decides on. Reading the decision off the
   * words was reading it off a sentence that is about to exist in two languages.
   */
  outcome: string | null;
  verdict: string;
  summary: string;
  mustFix: string[];
  recommendations: string[];
  ticked: string[];
  confidences: string[];
  suggestions: number;
  linterMarks: number;
}

/** Everything the card is showing, read out of the DOM as a person would read it. */
async function readBoard(page: Page): Promise<BoardView | null> {
  const board = page.getByTestId('review-board');
  if ((await board.count()) === 0) return null;

  return board.evaluate((root) => {
    const ids = (group: string): string[] =>
      [...root.querySelectorAll(`[data-testid="${group}"] input[type="checkbox"]`)].map(
        (input) => input.getAttribute('data-testid')?.replace('review-item-checkbox-', '') ?? '',
      );

    const ticked = [...root.querySelectorAll('input[type="checkbox"]')]
      .filter((input) => (input as HTMLInputElement).checked)
      .map(
        (input) => input.getAttribute('data-testid')?.replace('review-item-checkbox-', '') ?? '',
      );

    return {
      outcome:
        root.querySelector('[data-testid="review-outcome"]')?.getAttribute('data-outcome') ?? null,
      verdict: root.querySelector('[data-testid="review-outcome"]')?.textContent.trim() ?? '',
      summary: root.querySelector('[data-testid="review-summary"]')?.textContent.trim() ?? '',
      mustFix: ids('review-mustfix'),
      recommendations: ids('review-recommendations'),
      ticked,
      confidences: [...root.querySelectorAll('[data-testid^="review-item-confidence-"]')].map(
        (node) => node.textContent.trim(),
      ),
      suggestions: root.querySelectorAll('[data-testid^="review-item-suggestion-"]').length,
      linterMarks: root.querySelectorAll('[data-testid^="review-item-source-"]').length,
    };
  });
}

function recordBoard(label: string, view: BoardView): void {
  boardLog.push(
    `\n### ${label}\n`,
    `- verdict: **${view.verdict}**`,
    `- summary: ${view.summary === '' ? '_none_' : view.summary}`,
    `- Must Fix (${String(view.mustFix.length)}): ${view.mustFix.join(', ') || '_none_'}`,
    `- Recommendations (${String(view.recommendations.length)}): ${view.recommendations.join(', ') || '_none_'}`,
    `- ticked on arrival: ${view.ticked.join(', ') || '_none_'}`,
    `- confidence badges: ${view.confidences.join(' · ') || '_none_'}`,
    `- suggestions rendered: ${String(view.suggestions)}`,
    `- items marked as automated checks: ${String(view.linterMarks)}`,
  );
}

/** The parity contract of Эталон §1.3, checked against what the card actually rendered. */
function auditBoard(label: string, view: BoardView): void {
  if (view.outcome !== 'pass' && view.outcome !== 'needs_revision') {
    problem(`${label}: the board states no verdict (found ${JSON.stringify(view.verdict)})`);
  }

  if (view.mustFix.length + view.recommendations.length === 0) {
    say(`${label}: the reviewer raised nothing — a valid answer, and nothing to select`);
    return;
  }

  if (view.summary === '') problem(`${label}: the board has no summary paragraph`);

  const unticked = view.mustFix.filter((id) => !view.ticked.includes(id));
  const tickedAdvice = view.recommendations.filter((id) => view.ticked.includes(id));

  if (unticked.length > 0) {
    problem(`${label}: Must Fix items arrived unticked: ${unticked.join(', ')}`);
  }
  if (tickedAdvice.length > 0) {
    problem(`${label}: Recommendations arrived ticked: ${tickedAdvice.join(', ')}`);
  }
  if (
    view.confidences.length + view.linterMarks <
    view.mustFix.length + view.recommendations.length
  ) {
    problem(`${label}: not every point carries a confidence score or an automated-check mark`);
  }
  if (view.suggestions < view.mustFix.length + view.recommendations.length) {
    problem(`${label}: not every point carries a Suggestion`);
  }

  say(
    `${label}: ${String(view.mustFix.length)} Must Fix (all ticked), ${String(view.recommendations.length)} recommendation(s) (none ticked)`,
  );
}

/* ------------------------------------------------------------------- the walk */

/**
 * Drafts, approves and enters review. Returns whether a board is on screen.
 *
 * **Waits for one more document, not for a document.** In a feed every revision the session has ever
 * produced is still on screen, so `spec-card` is visible the whole time a *second* one is being
 * written — and a walk that waits for it is not waiting at all. The first M8п run did exactly that:
 * it "found" Rev 2 thirty seconds after asking for it, while the run was still streaming, and then
 * failed to click an Approve button that could not exist yet. This is the same lesson the M7п walk
 * wrote down for review boards, applied to documents: count the blocks, and wait for one more.
 */
async function draftApproveAndReview(page: Page, stage: string, label: string): Promise<boolean> {
  const began = Date.now();
  const documentsBefore = await page.locator('[data-msg-kind="document"]').count();

  if (!(await click(page, 'generate-spec', `${label}: generate`))) return false;
  await page.waitForTimeout(3000);
  await snapshot(page, `${label}-generating`);

  const settled = await Promise.race([
    page
      .waitForFunction(
        (count: number) => document.querySelectorAll('[data-msg-kind="document"]').length > count,
        documentsBefore,
        { timeout: 900_000 },
      )
      .then(() => 'card'),
    page
      .getByTestId('generation-error')
      .waitFor({ timeout: 900_000 })
      .then(() => 'error'),
  ]).catch(() => 'nothing');

  timings.push(`${label} generation: ${String(Math.round((Date.now() - began) / 100) / 10)} s`);

  if (settled !== 'card') {
    problem(`${label}: generation ended as "${settled}" rather than a revision`);
    await snapshot(page, `${label}-generation-failed`);
    return false;
  }

  // The card for the new revision, with its decision controls, is what the walk acts on next.
  const approvable = await page
    .getByTestId('approve-spec')
    .waitFor({ timeout: 120_000 })
    .then(() => true)
    .catch(() => false);

  if (!approvable) {
    problem(`${label}: a revision landed but never offered an approval`);
    await snapshot(page, `${label}-no-approval`);
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

  if (!(await click(page, 'approve-spec', `${label}: approve`))) return false;
  await page
    // The card's own flag, not the word it prints (task 143): these walks run in Russian too.
    .locator('[data-testid="spec-card"][data-approved="true"]')
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
    const substage = await page
      .getByTestId('stage-substage')
      .getAttribute('data-substage')
      .catch(() => null);

    if (substage === 'review') {
      say(`${label}: the stage entered review with no board — the chain could not produce one`);
    } else {
      problem(`${label}: neither a review board nor a review position`);
    }
    return false;
  }

  await snapshot(page, `${label}-review-board`);

  const text = await page
    .getByTestId('review-board')
    .innerText()
    .catch(() => null);
  if (text !== null)
    transcript.push(`### ${label} — the review board\n\n\`\`\`\n${text}\n\`\`\`\n`);

  // Resume: a pending board survives a reload (FR-017 AC-4), and so do its default ticks (task 112).
  await page.reload();
  const survived = await page
    .getByTestId('review-board')
    .waitFor({ timeout: 60_000 })
    .then(() => true)
    .catch(() => false);

  if (survived) say(`${label}: the pending board survived a reload, ticks and all`);
  else problem(`${label}: the pending review did not survive a reload (FR-017 AC-4)`);

  return survived;
}

async function walk(browser: Browser): Promise<void> {
  const context = await browser.newContext({
    baseURL: BASE_URL,
    viewport: { width: 1280, height: 800 },
  });
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

    const sessionUrl = page.url();
    const projectId = projectIdOf(sessionUrl);

    /*
     * ——— the grounding interview, only as far as its exit gate needs ———
     *
     * Answer a round, then try the door; if the gate refuses, answer another and try again. The
     * door is *always* offered now (D-103) — the gate is the server's answer, not the button's
     * state — so "is proceed enabled?" says nothing and the walk has to ask the server instead.
     * Three attempts, because the third condition of the interview gate is a persisted summary and
     * that is a model call which can legitimately come back empty (D-89).
     */
    say('—— interview ——');
    let left = false;

    for (let round = 1; round <= 3 && !left; round += 1) {
      const answered = await askAndAnswer(page, 'interview');
      if (!answered) break;

      await snapshot(page, 'interview-complete');
      if (!(await click(page, 'proceed', 'leave the interview'))) break;

      left = await page
        // The position, in the machine's spelling — a methodology may call it «Proposal» and a
        // translation may call it something else again (task 143).
        .locator('[data-testid="stage-current"][data-stage="constitution"]')
        .waitFor({ timeout: 180_000 })
        .then(() => true)
        .catch(() => false);

      if (!left) {
        const unmet = await page
          .getByTestId('gate-unmet')
          .textContent()
          .catch(() => null);
        say(`interview: the gate is not open yet${unmet === null ? '' : ` — ${unmet.trim()}`}`);
        retries.push(`interview: the exit gate refused after round ${String(round)}`);
      }
    }

    if (!left) {
      problem('the session never left the interview');
      return;
    }

    await snapshot(page, 'constitution-collect');

    // ——— the constitution, up to its first board ———
    say('—— constitution ——');
    await askAndAnswer(page, 'constitution');

    if (!(await click(page, 'proceed', 'constitution: collect → generate'))) return;
    await page
      // The substage the pill stands in, not the «Generating» it prints for it (task 143).
      .locator('[data-testid="stage-substage"][data-substage="generate"]')
      .waitFor({ timeout: 180_000 })
      .catch(() => {
        problem('constitution: the session did not reach generate');
      });
    await snapshot(page, 'constitution-generate');

    if (!(await draftApproveAndReview(page, 'constitution', 'rev-1'))) return;

    const first = await readBoard(page);
    if (first === null) {
      problem('the first board could not be read');
      return;
    }

    recordBoard('Rev 1 — the first board', first);
    auditBoard('Rev 1', first);

    const boardsAfterFirst = await boardsFor(projectId);
    const linterOnFirst = boardsAfterFirst.at(-1)?.linterItems ?? 0;
    say(
      `Rev 1: the board carries ${String(linterOnFirst)} deterministic linter finding(s) and ${String(boardsAfterFirst.at(-1)?.modelItems ?? 0)} from the model (task 114)`,
    );

    /* ——— the cycle ——— */
    let cycle = 0;
    let view: BoardView | null = first;

    while (view !== null && cycle < MAX_CYCLES) {
      const points = [...view.mustFix, ...view.recommendations];

      if (points.length === 0) {
        say('the board raised nothing — there is no subset to send back, so the cycle ends here');
        break;
      }

      if (view.outcome === 'pass') {
        say('the reviewer returned Pass — the cycle has converged, and the walk accepts');
        break;
      }

      cycle += 1;
      say(`—— cycle ${String(cycle)} ——`);

      /*
       * A **subset**, and one that is not the default: the first Must Fix is untied and a
       * recommendation is ticked in its place where there is one. A "subset" that happened to be
       * whatever the card arrived with would prove nothing about selection.
       */
      const dropped = view.mustFix[0];
      const added = view.recommendations[0];

      if (dropped !== undefined && points.length > 1) {
        await page
          .getByTestId(`review-item-checkbox-${dropped}`)
          .uncheck()
          .catch(() => undefined);
      }
      if (added !== undefined) {
        await page
          .getByTestId(`review-item-checkbox-${added}`)
          .check()
          .catch(() => undefined);
      }

      const chosen = await page
        .getByTestId('review-board')
        .evaluate((root) =>
          [...root.querySelectorAll('input[type="checkbox"]')]
            .filter((input) => (input as HTMLInputElement).checked)
            .map(
              (input) =>
                input.getAttribute('data-testid')?.replace('review-item-checkbox-', '') ?? '',
            ),
        );

      say(
        `cycle ${String(cycle)}: sending back ${String(chosen.length)} point(s): ${chosen.join(', ')}`,
      );
      await snapshot(page, `cycle-${String(cycle)}-selection`);

      if (!(await click(page, 'review-request-changes', `cycle ${String(cycle)}: request changes`)))
        return;

      await page
        // The substage the pill stands in, not the «Generating» it prints for it (task 143).
        .locator('[data-testid="stage-substage"][data-substage="generate"]')
        .waitFor({ timeout: 120_000 })
        .catch(() => {
          problem(`cycle ${String(cycle)}: request-changes did not return the stage to generate`);
        });
      await snapshot(page, `cycle-${String(cycle)}-returned-to-generate`);

      // The page must now offer to *apply* the points, not merely to "generate" (task 113).
      const owed = await page
        .getByTestId('revision-owed')
        .textContent()
        .catch(() => null);

      if (owed === null) {
        problem(`cycle ${String(cycle)}: the page does not say a rewrite is owed`);
      } else {
        say(`cycle ${String(cycle)}: the page offers to apply the points — “${owed.trim()}”`);
      }

      // The selection, as the database recorded it — the half the screen cannot show.
      const decidedBoards = (await boardsFor(projectId)).filter((board) => board.decision !== null);
      const recorded = decidedBoards[decidedBoards.length - 1];
      if (recorded?.selected !== undefined && recorded.selected !== null) {
        const same =
          recorded.selected.length === chosen.length &&
          chosen.every((id) => recorded.selected?.includes(id) === true);
        if (!same) {
          problem(
            `cycle ${String(cycle)}: the recorded selection ${JSON.stringify(recorded.selected)} is not what was ticked ${JSON.stringify(chosen)}`,
          );
        } else {
          say(
            `cycle ${String(cycle)}: the ticked subset is exactly what was recorded (FR-010 AC-7)`,
          );
        }
      }

      if (!(await draftApproveAndReview(page, 'constitution', `rev-${String(cycle + 1)}`))) return;

      // The writer's paragraph: in the conversation, above the document it precedes (Эталон §1.3).
      const note = await page
        .getByTestId('revision-note')
        .last()
        .innerText()
        .catch(() => null);

      if (note === null) {
        problem(`cycle ${String(cycle)}: no paragraph saying what the writer folded in`);
      } else {
        say(`cycle ${String(cycle)}: the writer said what it folded in`);
        transcript.push(
          `### cycle ${String(cycle)} — what the writer said it was folding in\n\n\`\`\`\n${note}\n\`\`\`\n`,
        );
      }

      const boards = await boardsFor(projectId);
      const newest = boards.at(-1);

      if (newest !== undefined && boards.length > 1) {
        const previous = boards.at(-2);
        if (newest.revision === previous?.revision) {
          problem(
            `cycle ${String(cycle)}: the second board is keyed to the same revision as the first — the review was not re-run on the new bytes`,
          );
        } else {
          say(
            `cycle ${String(cycle)}: the new board reviews revision ${String(newest.revision)}, and the earlier board is still there, decided (task 111)`,
          );
        }
      }

      view = await readBoard(page);
      if (view !== null) {
        recordBoard(`Rev ${String(cycle + 1)} — the board after cycle ${String(cycle)}`, view);
        auditBoard(`Rev ${String(cycle + 1)}`, view);
      }
    }

    /* ——— the decision, typed rather than clicked (M4's contract, on the feed) ——— */
    if ((await page.getByTestId('review-board').count()) > 0) {
      say('deciding the board by typing a sentence, not by pressing the button');

      const before = await page
        .getByTestId('stage-substage')
        .textContent()
        .catch(() => null);

      await page.getByTestId('chat-message').fill('accept the review, please');
      if (!(await click(page, 'chat-send', 'type a decision'))) return;

      const decided = await page
        .getByTestId('review-board')
        .waitFor({ state: 'detached', timeout: 900_000 })
        .then(() => true)
        .catch(() => false);

      await page.waitForTimeout(2000);
      await snapshot(page, 'decided-by-typing');

      if (!decided) {
        problem('a typed decision did not decide the board');
      } else {
        const decision = await page
          .getByTestId('review-decision')
          .last()
          .innerText()
          .catch(() => null);
        say(
          `the typed sentence decided the board: “${decision ?? '(unreadable)'}” (position was ${String(before)})`,
        );
      }

      const proceedable = await page
        .getByTestId('proceed')
        .isEnabled()
        .catch(() => false);
      if (!proceedable) problem('the gate did not open after the typed decision');
      else say('the gate the decision opens is open — the typed path is the button’s equal');
    } else {
      say('no undecided board remained for the typed decision — recorded, not asserted');
    }

    // ——— and out of the stage, which is what a decided review permits ———
    await click(page, 'proceed', 'leave the constitution stage');
    await page.waitForTimeout(4000);
    await snapshot(page, 'stage-left');

    // ——— the whole conversation, reopened from scratch ———
    await page.goto('/projects');
    await page.waitForTimeout(1500);
    await page.goto(sessionUrl);
    await page.getByTestId('session').waitFor({ timeout: 60_000 });
    await page.waitForTimeout(2500);
    await snapshot(page, 'session-reopened');

    const finalBoards = await boardsFor(projectId);
    for (const board of finalBoards) {
      boardLog.push(
        `\n- revision ${String(board.revision)}: **${board.outcome}**, decision \`${board.decision ?? 'undecided'}\`,` +
          ` selected ${JSON.stringify(board.selected)}, linter items ${String(board.linterItems)},` +
          ` model items ${String(board.modelItems)}, note ${board.note === null ? 'none' : `${String(board.note.length)} chars`}`,
      );
    }

    const overwritten = finalBoards.filter((board) => board.decision === null).length;
    say(
      `${String(finalBoards.length)} board(s) in the file's history, ${String(overwritten)} still undecided — every cycle appended (task 111)`,
    );
  } finally {
    await context.tracing.stop({ path: `${OUT}/trace.zip` });
    await context.close();
  }
}

/* ------------------------------------------------------------------- run it */

for (const directory of [OUT, `${OUT}/screens`]) {
  mkdirSync(directory, { recursive: true });
}

console.log(`Walking the M8п gate against ${BASE_URL}. Artifacts: ${OUT}/`);

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
    '# M8п gate walk — result',
    '',
    'Journey: prompt → interview → a document → a needs-revision board → request changes with a',
    'subset → the writer’s paragraph → Rev N+1 → a re-review of the new bytes → a decision typed as',
    `a sentence. Walked through a browser against the live provider chain. Idea: _${IDEA}_`,
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
    '## The boards, as they were rendered and as they were stored',
    '',
    'The review contract of Эталон §1.3 in its readable form: a verdict, a summary, two groups with',
    'their default tick state, a confidence score on every point, and — below — what the database',
    'holds for each board, including which points travelled with the decision.',
    '',
    boardLog.join('\n'),
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
