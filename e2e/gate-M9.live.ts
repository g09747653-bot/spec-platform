/* eslint-disable no-restricted-properties -- a hand-run gate script, not application code: it takes
   its target from the environment because that is how a person points it at a running server. */
import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';

import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import pg from 'pg';

/**
 * **The M9п gate, walked by the executor** (task 123; А-2.1).
 *
 * M7п walked the feed and M8п walked the review cycle — both on the default methodology. M9п walks
 * what those two could not: **methodologies as data, and a project that holds more than one chat.**
 *
 * The live set is bounded deliberately (START_HERE §5), because the default configuration is already
 * covered by the M7п gate and because a journey added to a walk costs a journey:
 *
 * 1. one **full** live journey on `speckit-greenfield-v1` — the longest foreign graph, four
 *    documents under their own names, written from a vendored template;
 * 2. one on `myspec-brownfield-v1` — the shortest, whose review of Requirements carries **two
 *    doors** and whose terminal is reachable without visiting Tasks (D-120/D-125);
 * 3. one live **Edit** session over the bundle the SpecKit walk produced: reference, describe,
 *    review, and an atomic apply across the files the model chose;
 * 4. a live **model-picker** check — pick the local model explicitly, and see the next call go to it.
 *
 * And the two invariants every gate since round 2 has carried: the **liveness** rule of Д-1/Р-3 on
 * every snapshot (a session page with zero usable session-moving controls is a red run, however good
 * everything else looks), and the M6 **resume** checks, taken here on a non-default methodology.
 *
 * It closes the M8п open question by recording, for every requirements and tasks board the walks
 * produce, that the deterministic linters ran and how many machine items each board carried. Zero is
 * a valid count on a clean document — the record is the evidence, not the number.
 *
 * It is not part of any suite and never runs in CI: CI must not depend on a model having a good day
 * (NFR-012 AC-5). This is the opposite instrument — the one that only says something *because* it
 * depends on one.
 *
 * Run it as the gate is run:
 *   pnpm db:test-server        (one terminal — leave it running; restart it before every walk)
 *   pnpm dev:gate              (another; chain google,ollama and the raised local timeout)
 *   node --experimental-strip-types e2e/gate-M9.live.ts
 *
 * Artifacts land in `artifacts/gate-M9/` and are committed: the gate is accepted from them.
 */
const BASE_URL = process.env.GATE_URL ?? 'http://127.0.0.1:3000';
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:5497/postgres';
const OUT = process.env.GATE_OUT ?? 'artifacts/gate-M9';

const IDEA =
  process.env.GATE_IDEA ??
  'A tool that tracks which of a small charity’s grant applications are due, and drafts the reminder emails';

/** The local model the picker check selects explicitly. It is the second link of the gate chain. */
const LOCAL_MODEL = process.env.GATE_LOCAL_MODEL ?? 'ollama';

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
    const email = `gate-m9-${randomUUID().slice(0, 8)}@example.test`;
    const inserted = await client.query<{ id: string }>(
      'INSERT INTO users (email, name) VALUES ($1, $2) RETURNING id',
      [email, 'M9 gate'],
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
async function walkStage(page: Page, label: string): Promise<boolean> {
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

  if (!(await click(page, 'approve-spec', `${label}: approve`))) return false;
  await page
    .getByTestId('spec-card')
    .filter({ hasText: 'approved' })
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
    if (!(await walkStage(page, `${methodology}-${label}`))) {
      return { sessionUrl, projectId, reached: label };
    }

    // The door out of this stage. For brownfield's Requirements there are two, and the walk takes
    // the terminal one deliberately — that fork is what makes «Tasks optional» a graph property.
    const doors = await page.locator('[data-testid^="proceed"]').count();
    say(`${methodology}-${label}: ${String(doors)} forward door(s) offered`);

    if (!(await click(page, 'proceed', `${methodology}-${label}: leave the stage`))) {
      return { sessionUrl, projectId, reached: label };
    }
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

/** The Edit chat: reference the bundle, describe a change, review it, apply it (task 118). */
async function editSession(page: Page, projectId: string): Promise<void> {
  say('— the Edit chat —');

  await page.goto(`${BASE_URL}/projects/${projectId}`);
  await page.getByTestId('project-page').waitFor({ timeout: 60_000 });
  await snapshot(page, 'edit-project-page');

  const offered = await page.locator('[data-testid^="reference-"]').count();
  say(`the Reference step offers ${String(offered)} approved document(s)`);

  if (!(await click(page, 'start-edit-chat', 'edit: start'))) return;
  await page.getByTestId('session').waitFor({ timeout: 60_000 });
  await snapshot(page, 'edit-reference');

  const steps = await page
    .getByTestId('step-pills')
    .innerText()
    .catch(() => '(no pills)');
  say(`edit: steps «${steps.replace(/\s+/g, ' ')}»`);

  if (!(await click(page, 'proceed', 'edit: Reference → Describe'))) return;

  const card = await page
    .getByTestId('mcq-card')
    .waitFor({ timeout: 60_000 })
    .then(() => true)
    .catch(() => false);

  if (!card) {
    problem('edit: the Describe card never arrived');
    return;
  }

  const prefill = await page
    .getByTestId('mcq-other-q-edit-describe')
    .inputValue()
    .catch(() => '');
  say(`edit: the Describe box opens on «${prefill}»`);
  transcript.push(`### Edit — the Describe prefill\n\n\`\`\`\n${prefill}\n\`\`\`\n`);
  await snapshot(page, 'edit-describe');

  await page
    .getByTestId('mcq-other-q-edit-describe')
    .fill(
      `${prefill}state plainly that reminder emails are never sent without a human approving them.`,
    );
  await click(page, 'mcq-submit', 'edit: submit the description');
  await page.waitForTimeout(2000);

  if (!(await click(page, 'proceed', 'edit: Describe → Review'))) return;

  // Same rule as a spec stage: a refused proposal is retried by pressing the product's own retry.
  let arrived = false;

  for (let attempt = 1; attempt <= 3 && !arrived; attempt += 1) {
    if (attempt > 1) {
      retries.push(`edit: the proposal was refused; retrying (${String(attempt)} of 3)`);
    }

    const began = Date.now();
    if (!(await click(page, 'generate-spec', 'edit: propose the changes'))) return;
    await snapshot(page, `edit-proposing-${String(attempt)}`);

    arrived = await Promise.race([
      page
        .getByTestId('edit-card')
        .waitFor({ timeout: 900_000 })
        .then(() => true),
      page
        .getByTestId('generation-error')
        .waitFor({ timeout: 900_000 })
        .then(() => false),
    ]).catch(() => false);

    timings.push(`edit proposal: ${String(Math.round((Date.now() - began) / 100) / 10)} s`);
  }

  if (!arrived) {
    problem('edit: no proposal card arrived after three attempts');
    await snapshot(page, 'edit-no-proposal');
    return;
  }

  const files = await page.getByTestId('diff-file-name').allInnerTexts();
  say(`edit: the model proposed changes to ${files.join(', ')}`);

  const card_text = await page
    .getByTestId('edit-card')
    .innerText()
    .catch(() => null);
  if (card_text !== null) {
    transcript.push(`### Edit — the proposal\n\n\`\`\`\n${card_text.slice(0, 3000)}\n\`\`\`\n`);
  }

  await snapshot(page, 'edit-proposal');

  const before = await query<{ spec_type: string; revision_number: number }>(
    `SELECT s.spec_type, max(r.revision_number) AS revision_number
       FROM spec_revisions r JOIN spec_files s ON s.id = r.spec_file_id
      WHERE s.project_id = $1 GROUP BY s.spec_type ORDER BY s.spec_type`,
    [projectId],
  );

  if (!(await click(page, 'accept-diff', 'edit: approve and apply'))) return;

  await page
    .getByTestId('proposal-decided')
    .waitFor({ timeout: 120_000 })
    .catch(() => {
      problem('edit: the proposal never became decided');
    });
  await snapshot(page, 'edit-applied');

  const after = await query<{ spec_type: string; revision_number: number; source: string | null }>(
    `SELECT s.spec_type, r.revision_number, r.source_session_id::text AS source
       FROM spec_revisions r JOIN spec_files s ON s.id = r.spec_file_id
      WHERE s.project_id = $1
        AND r.revision_number = (SELECT max(r2.revision_number) FROM spec_revisions r2
                                  WHERE r2.spec_file_id = r.spec_file_id)
      ORDER BY s.spec_type`,
    [projectId],
  );

  const moved = after.filter((row) => {
    const previous = before.find((candidate) => candidate.spec_type === row.spec_type);
    return previous !== undefined && row.revision_number > previous.revision_number;
  });

  say(
    `edit: ${String(moved.length)} file(s) gained a revision — ${moved
      .map((row) => `${row.spec_type} → Rev ${String(row.revision_number)}`)
      .join(', ')}`,
  );

  if (moved.length === 0) problem('edit: approve applied nothing');
  if (moved.some((row) => row.source === null)) {
    problem('edit: an applied revision does not name the chat that produced it (AC-4)');
  } else if (moved.length > 0) {
    say('edit: every applied revision names the edit chat as its source (AC-4)');
  }
}

/** The picker, live: choose the local model and see the next call go to it (task 121). */
async function modelPicker(page: Page, sessionUrl: string): Promise<void> {
  say('— the model picker —');

  await page.goto(sessionUrl);
  await page.getByTestId('session').waitFor({ timeout: 60_000 });

  const options = await page.locator('[data-testid="model-picker"] option').allInnerTexts();
  say(`the picker offers: ${options.join(', ')}`);

  const sessionId = sessionUrl.split('/').at(-1) ?? '';

  await page
    .getByTestId('model-picker')
    .selectOption(LOCAL_MODEL)
    .catch(() => {
      problem(`the picker does not offer «${LOCAL_MODEL}»`);
    });

  await page.waitForTimeout(2000);
  await snapshot(page, 'model-picked');

  const stored = await query<{ model_id: string | null }>(
    'SELECT model_id FROM sessions WHERE id = $1',
    [sessionId],
  );
  const chosen = stored[0]?.model_id ?? null;

  if (chosen === LOCAL_MODEL) say(`the choice is persisted on the session: ${chosen}`);
  else problem(`the picker did not persist: the session holds ${String(chosen)}`);

  await page.reload();
  await page.getByTestId('session').waitFor({ timeout: 60_000 });
  const shown = await page.getByTestId('model-picker').inputValue();
  if (shown === LOCAL_MODEL) say('the choice survives a reload');
  else problem(`after a reload the picker reads ${shown}`);

  /*
   * And the call actually goes there. A chat message is the cheapest live agent call on this page,
   * and `generation_runs` is not written by it — so the evidence is the *answer arriving at all*
   * with the chain pinned to one provider that is not the funded one.
   */
  const began = Date.now();
  await page.getByTestId('chat-message').fill('In one sentence: what is this session about?');
  await click(page, 'chat-send', 'picker: ask the local model');

  const answered = await page
    .locator('[data-msg-role="assistant"]')
    .last()
    .waitFor({ timeout: 900_000 })
    .then(() => true)
    .catch(() => false);

  timings.push(`local-model reply: ${String(Math.round((Date.now() - began) / 100) / 10)} s`);

  if (answered) say(`the pinned model answered a chat message`);
  else problem('the pinned model produced no answer');

  await snapshot(page, 'model-answered');
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

  // 1 — the longest foreign graph, walked whole, with the resume checks on it.
  const speckit = await journey(
    page,
    'speckit-greenfield-v1',
    ['constitution', 'requirements', 'solution', 'tasks'],
    { resumeChecks: true },
  );

  for (const board of await boardsFor(speckit.projectId)) {
    boardLog.push(
      `- **speckit ${board.specType}** Rev ${String(board.revision)} — ${board.outcome}: ` +
        `${String(board.linterItems)} linter item(s), ${String(board.modelItems)} model item(s)`,
    );
  }

  // 2 — the shortest graph, whose Requirements review carries two doors.
  const brownfield = await journey(page, 'myspec-brownfield-v1', ['constitution', 'requirements']);

  for (const board of await boardsFor(brownfield.projectId)) {
    boardLog.push(
      `- **brownfield ${board.specType}** Rev ${String(board.revision)} — ${board.outcome}: ` +
        `${String(board.linterItems)} linter item(s), ${String(board.modelItems)} model item(s)`,
    );
  }

  // 3 — an Edit chat over the bundle the SpecKit walk produced.
  if (speckit.projectId !== '') await editSession(page, speckit.projectId);

  // 4 — the picker, on the SpecKit chat.
  if (speckit.sessionUrl !== '') await modelPicker(page, speckit.sessionUrl);

  await context.close();
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

writeFileSync(
  `${OUT}/RESULT.md`,
  [
    '# M9п gate — RESULT',
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
  ['# M9п gate — what the models said', '', transcript.join('\n')].join('\n'),
);

console.log(`\n${problems.length === 0 ? 'GREEN' : 'RED'} — artifacts in ${OUT}`);
