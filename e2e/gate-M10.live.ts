/* eslint-disable no-restricted-properties -- a hand-run gate script, not application code: it takes
   its target from the environment because that is how a person points it at a running server. */
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import pg from 'pg';

/**
 * **The M10п gate, walked by the executor** (task 129; А-2.1) — the seal on stage 1.
 *
 * The three gates before it walked mechanics: M7п the feed, M8п the review cycle, M9п the
 * methodologies. What none of them could walk is the layer that landed in this milestone — the one a
 * person actually looks at. So this walk is the same journey those gates established, taken over the
 * **final visual layer**, plus the surfaces tasks 124–127 added and nothing else:
 *
 * 1. one **full** live journey on the default methodology, from the seed to the completion panel,
 *    with the M6 resume checks on it;
 * 2. the **completion panel** and the honest handoff: bundle, file count, Generate AI Prompt, and a
 *    Download that is the export contract rather than a second implementation of it (task 126);
 * 3. **both themes smoked** — the same live states re-read in dark, because a token that is right in
 *    one theme and wrong in the other looks right until it is switched (task 124);
 * 4. the **diff and the go-back** of task 127: a revert writes a new revision rather than rewriting
 *    one, and the walk reads that from the database, not from the page.
 *
 * The invariants every gate since round 2 has carried apply unchanged: the **liveness** rule of
 * Д-1/Р-3 on every snapshot, and the **truncation** rule of round 4 — one `truncating input prompt`
 * record is a red run whatever else went well. M10п adds a third of the same kind: a **structural
 * rejection** in the server log is red, because a document rejected on structure is the symptom
 * every local-model defect of this programme has presented with.
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
 *   node --experimental-strip-types e2e/gate-M10.live.ts
 *
 * Artifacts land in `artifacts/gate-M10/` and are committed: the gate is accepted from them.
 */
const BASE_URL = process.env.GATE_URL ?? 'http://127.0.0.1:3000';
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:5497/postgres';
const OUT = process.env.GATE_OUT ?? 'artifacts/gate-M10';

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
    const email = `gate-m10-${randomUUID().slice(0, 8)}@example.test`;
    const inserted = await client.query<{ id: string }>(
      'INSERT INTO users (email, name) VALUES ($1, $2) RETURNING id',
      [email, 'M10 gate'],
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

interface JourneyResult {
  sessionUrl: string;
  projectId: string;
  reached: string;
}

/** A full live journey on one methodology, from the seed to whatever terminal its graph has. */
async function journey(
  page: Page,
  methodology: string,
  labels: readonly string[],
  options: { resumeChecks?: boolean } = {},
): Promise<JourneyResult> {
  say(`— walking ${methodology} —`);

  await page.goto(`${BASE_URL}/projects`);
  await page.getByTestId('create-project').waitFor({ timeout: 60_000 });
  await page.getByTestId('prompt-input').fill(IDEA);
  await page.getByTestId(`methodology-${methodology}`).check();
  await snapshot(page, `${methodology}-picker`);
  await click(page, 'create-project', `${methodology}: create`);

  await page.getByTestId('session').waitFor({ timeout: 120_000 });
  const sessionUrl = page.url();
  const projectId = await projectIdOf(page);

  await snapshot(page, `${methodology}-seeded`);

  const badge = await page
    .getByTestId('methodology-badge')
    .innerText()
    .catch(() => '(no badge)');
  const steps = await page
    .getByTestId('step-pills')
    .innerText()
    .catch(() => '(no pills)');
  say(
    `${methodology}: badge «${badge.replace(/\s+/g, ' ')}», steps «${steps.replace(/\s+/g, ' ')}»`,
  );

  // --- the grounding interview ---
  await askAndAnswer(page, `${methodology}-interview`);

  if (options.resumeChecks === true) {
    /*
     * The M6 resume checks, taken on a **non-default** methodology (task 123 AC-4). Reloading is the
     * cheapest honest test of "the session resumes from persisted state" (FR-017): the page is a
     * projection, so a reload that reproduced a different position would be a projection that lied.
     */
    await page.reload();
    await page.getByTestId('session').waitFor({ timeout: 60_000 });
    const after = await page
      .getByTestId('stage-current')
      .innerText()
      .catch(() => '(none)');
    say(`${methodology}: after a reload the header still reads «${after}»`);
    await snapshot(page, `${methodology}-resumed`);
  }

  if (!(await click(page, 'proceed', `${methodology}: leave the interview`))) {
    return { sessionUrl, projectId, reached: 'interview' };
  }

  await page.waitForTimeout(1500);
  await snapshot(page, `${methodology}-after-interview`);

  for (const label of labels) {
    if (!(await askAndAnswer(page, `${methodology}-${label}`))) {
      problem(`${methodology}: could not collect for ${label}`);
      return { sessionUrl, projectId, reached: label };
    }
    if (!(await click(page, 'proceed', `${methodology}-${label}: collect → generate`))) {
      return { sessionUrl, projectId, reached: label };
    }
    /*
     * **The LAST spec stage sends its document back**, not the first, and the position is the point:
     * the revert offer is made for the file this session **last touched** (`page.tsx` — «an offer
     * whose only outcome is a refusal is not an offer»), so a second revision on the first stage is
     * invisible by the time the journey ends. Walk 4 proved that the expensive way.
     */
    if (
      !(await walkStage(page, `${methodology}-${label}`, {
        requestChanges: label === labels.at(-1),
      }))
    ) {
      return { sessionUrl, projectId, reached: label };
    }

    // The door out of this stage. For brownfield's Requirements there are two, and the walk takes
    // the terminal one deliberately — that fork is what makes «Tasks optional» a graph property.
    const doors = await page.locator('[data-testid^="proceed"]').count();
    say(`${methodology}-${label}: ${String(doors)} forward door(s) offered`);

    /*
     * **The terminal door, when the stage offers one** (round 4).
     *
     * The comment above has always said the walk takes it deliberately, and the code below has
     * always clicked plain `proceed` — the *primary* door, which for brownfield's Requirements is
     * the one into Tasks. So the walk left the session sitting in a stage it had no labels for and
     * then spent 120 s waiting for a completion panel that was correctly absent, and called it red.
     * `proceed-alternate-complete` is the door D-120/D-125 are about: «Tasks optional» is a property
     * of the graph, and taking the terminal exit is what demonstrates it.
     */
    const terminal = page.getByTestId('proceed-alternate-complete');
    const takesTerminal = (await terminal.count()) > 0;

    if (
      !(await click(
        page,
        takesTerminal ? 'proceed-alternate-complete' : 'proceed',
        `${methodology}-${label}: leave the stage`,
      ))
    ) {
      return { sessionUrl, projectId, reached: label };
    }

    if (takesTerminal)
      say(`${methodology}-${label}: took the terminal door, skipping the optional stage`);
    await page.waitForTimeout(1500);
    await snapshot(page, `${methodology}-${label}-left`);
  }

  // `session-complete` is what the feed renders for a sealed session (`bubbles.tsx`); there has never
  // been a `completion-panel` testid, so this wait could only ever spend its 120 s and then lie.
  const finished = await page
    .getByTestId('session-complete')
    .waitFor({ timeout: 120_000 })
    .then(() => true)
    .catch(() => false);

  if (finished) say(`${methodology}: reached the terminal`);
  else problem(`${methodology}: the walk ended without a completion panel`);

  await snapshot(page, `${methodology}-complete`);

  return { sessionUrl, projectId, reached: finished ? 'complete' : 'unfinished' };
}

/* ------------------------------------------------------------------- the run */

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

  // 1 — the reference product's own methodology, walked whole on the final visual layer.
  const walk = await journey(
    page,
    'myspec-greenfield-v1',
    ['constitution', 'requirements', 'solution', 'tasks'],
    { resumeChecks: true },
  );

  for (const board of await boardsFor(walk.projectId)) {
    boardLog.push(
      `- **${board.specType}** Rev ${String(board.revision)} — ${board.outcome}: ` +
        `${String(board.linterItems)} linter item(s), ${String(board.modelItems)} model item(s)`,
    );
  }

  // 2 — the completion panel and the honest handoff (task 126).
  if (walk.reached === 'complete') await completionPanel(page, walk.projectId);

  // 3 — the same live states, read again in the other theme (task 124).
  await themeSmoke(page, walk.sessionUrl);

  // 4 — the diff and the go-back (task 127), asserted against the revision chain.
  if (walk.projectId !== '') await goBack(page, walk.projectId, walk.sessionUrl);

  await context.close();
}

/* ------------------------------------------------- the surfaces this milestone added */

/**
 * The completion panel, and the two claims it makes that are worth checking live (task 126).
 *
 * The generated prompt has to name **this** bundle's approved revisions — a prompt that named
 * plausible ones would be indistinguishable on screen and wrong in the hands of a coding agent — and
 * Download has to be the export contract rather than a second implementation of it.
 */
async function completionPanel(page: Page, projectId: string): Promise<void> {
  say('— the completion panel —');

  const bundle = await page
    .getByTestId('completion-bundle')
    .innerText()
    .catch(() => '(no bundle name)');
  const files = await page
    .getByTestId('completion-file-count')
    .innerText()
    .catch(() => '(no file count)');

  say(`completion: bundle «${bundle}», ${files}`);
  await snapshot(page, 'completion-panel');

  if (!(await click(page, 'generate-ai-prompt', 'completion: generate the handoff prompt'))) return;

  /*
   * Waited for, and read as a **value**. The first version of this probe did neither: the prompt is
   * assembled from a request the click starts, and it lands in a `<textarea>`, whose text content is
   * empty however full it is. So the walk reported «Generate AI Prompt produced nothing» about a
   * panel that had produced it correctly — an instrument failing, reported as a product failing.
   */
  const arrived = await page
    .getByTestId('handoff-prompt')
    .waitFor({ timeout: 120_000 })
    .then(() => true)
    .catch(() => false);

  const prompt = arrived ? await page.getByTestId('handoff-prompt').inputValue() : '';

  if (prompt === '') {
    problem('completion: Generate AI Prompt produced nothing');
    return;
  }

  transcript.push(`### The handoff prompt\n\n\`\`\`\n${prompt.slice(0, 3000)}\n\`\`\`\n`);
  await snapshot(page, 'handoff-prompt');

  /*
   * The revisions the export will actually resolve to, read from the database, and checked against
   * the ones the prompt names. Reading the page for both halves would be checking the panel against
   * itself.
   */
  const latest = await query<{ spec_type: string; revision_number: number }>(
    `SELECT s.spec_type, max(r.revision_number) AS revision_number
       FROM spec_revisions r JOIN spec_files s ON s.id = r.spec_file_id
      WHERE s.project_id = $1 AND r.approved
      GROUP BY s.spec_type ORDER BY s.spec_type`,
    [projectId],
  );

  /*
   * The prompt writes «approved revision N», so that is what is looked for — the wording the asset
   * actually uses, read from `handoff-prompt.ts`, rather than the «Rev N» the feed's cards use. A
   * check built on a guess about phrasing fails on a correct product and passes on a wrong one.
   */
  const named = latest.filter((row) =>
    new RegExp(`approved revision ${String(row.revision_number)}\\b`).test(prompt),
  );

  say(
    `completion: the prompt names ${String(named.length)} of ${String(latest.length)} approved revisions ` +
      `(${latest.map((row) => `${row.spec_type}=Rev ${String(row.revision_number)}`).join(', ')})`,
  );

  if (named.length < latest.length) {
    problem('completion: the handoff prompt does not name every approved revision of this bundle');
  }

  const downloadable = await page
    .getByTestId('completion-download')
    .isEnabled()
    .catch(() => false);

  if (downloadable) say('completion: Download is offered from the panel');
  else problem('completion: the panel offers no Download');
}

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

/**
 * «Go back to previous step» — and the property that makes it safe (task 127; D-171).
 *
 * A revert is an **append**: Rev N+1 carrying the content of Rev N−1. The page shows a diff first and
 * applies on a second press, so what the walk checks is the revision chain in the database, where a
 * rewrite would be visible as a missing revision rather than as a different-looking card.
 */
async function goBack(page: Page, projectId: string, sessionUrl: string): Promise<void> {
  say('— the diff and the go-back —');

  const before = await query<{ spec_type: string; revisions: number }>(
    `SELECT s.spec_type, count(r.id)::int AS revisions
       FROM spec_revisions r JOIN spec_files s ON s.id = r.spec_file_id
      WHERE s.project_id = $1 GROUP BY s.spec_type ORDER BY s.spec_type`,
    [projectId],
  );

  const revisable = before.find((row) => row.revisions >= 2);

  if (revisable === undefined) {
    notes.push(
      '- no document reached a second revision on this walk, so «go back» had nothing to undo; ' +
        'the behaviour is covered by `revert.spec.ts` on the double.',
    );
    return;
  }

  /*
   * The offer lives on the session that owns the file, not in a chat command: `revert-card` appears
   * as soon as a document has a predecessor to restore, and it states what it will do before it does
   * anything. The first version of this probe opened an Edit chat and typed «go back to previous
   * step» into it — which the resolver correctly answered as an ordinary question, because an Edit
   * chat at its Reference step has no file in hand. The card was never going to arrive, and the walk
   * spent its whole 900-second budget proving it.
   */
  await page.goto(sessionUrl);
  await page.getByTestId('session').waitFor({ timeout: 60_000 });

  const card = await page
    .getByTestId('revert-card')
    .waitFor({ timeout: 60_000 })
    .then(() => true)
    .catch(() => false);

  if (!card) {
    problem('go-back: no revert card on a session whose document has two revisions');
    await snapshot(page, 'go-back-no-card');
    return;
  }

  await snapshot(page, 'go-back-offered');

  // Asking to see the diff writes nothing — that is the property, so it is read before applying.
  if (!(await click(page, 'go-back', 'go-back: show the diff'))) return;
  const shown = await page
    .getByTestId('revert-diff')
    .waitFor({ timeout: 60_000 })
    .then(() => true)
    .catch(() => false);

  if (!shown) problem('go-back: the card offered no diff before applying');
  await snapshot(page, 'go-back-diff');

  if (!(await click(page, 'revert-apply', 'go-back: apply the revert'))) return;
  await page.waitForTimeout(4000);
  await snapshot(page, 'go-back-applied');

  const after = await query<{ spec_type: string; revisions: number; source: string | null }>(
    `SELECT s.spec_type, count(r.id)::int AS revisions,
            (SELECT r2.source_session_id::text
               FROM spec_revisions r2
              WHERE r2.spec_file_id = s.id
              ORDER BY r2.revision_number DESC LIMIT 1) AS source
       FROM spec_revisions r JOIN spec_files s ON s.id = r.spec_file_id
      WHERE s.project_id = $1 GROUP BY s.spec_type, s.id ORDER BY s.spec_type`,
    [projectId],
  );

  const grew = after.filter((row) => {
    const previous = before.find((candidate) => candidate.spec_type === row.spec_type);
    return previous !== undefined && row.revisions > previous.revisions;
  });

  if (grew.length === 0) problem('go-back: no file gained a revision — the revert applied nothing');
  else {
    say(
      `go-back: ${grew.map((row) => `${row.spec_type} now has ${String(row.revisions)} revisions`).join(', ')}`,
    );
  }

  if (grew.some((row) => row.source === null)) {
    problem('go-back: the appended revision does not name the chat that produced it');
  }
}

mkdirSync(`${OUT}/screens`, { recursive: true });

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
    '# M10п gate — RESULT',
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
  ['# M10п gate — what the models said', '', transcript.join('\n')].join('\n'),
);

console.log(`\n${problems.length === 0 ? 'GREEN' : 'RED'} — artifacts in ${OUT}`);
