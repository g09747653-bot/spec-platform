/* eslint-disable no-restricted-properties -- a hand-run gate script, not application code: it takes
   its target from the environment because that is how a person points it at a running server. */
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import pg from 'pg';

/**
 * **The M12п gate, walked by the executor** (task 140; А-2.1) — the live half of the design finale.
 *
 * The scripted half of this task is `e2e/bug-hunt-M12.spec.ts`, and it is green: collapse, resize,
 * reload, theme, viewer and composer, all abused against the deterministic double. What a stub can
 * never give it is the thing this milestone is actually about — **a stream that takes real seconds**.
 * Every destructive technique in that suite holds the socket open with a routed response, which is a
 * faithful shape and a dishonest duration: the interesting states of a generation last a frame there
 * and half a minute here. So this walk repeats the three that only mean something live —
 *
 * 1. the **viewer opened over a document being written** by a model, not by a route handler;
 * 2. the **theme switched mid-stream**, in both directions, while tokens are arriving;
 * 3. a **reload mid-stream**, which is the resumable reader's whole reason to exist —
 *
 * and reads, on the final shell, the numbers the customer's two complaints were made of: the width
 * of the composer's text box and whether the page itself scrolls. Forty-six pixels was the defect;
 * a walk that fixes it should be able to say what the number is now.
 *
 * The rest is deliberately short. The machinery — state machine, export contract, revision chain —
 * was walked live at the M10п gate and re-walked at M11п, and nothing in M12п touched it; this
 * milestone changed widths, doors and what survives a reload. One live interview round, one live
 * document under abuse, one board, both themes, one small window.
 *
 * The invariants every gate since round 2 has carried apply unchanged: the **liveness** rule of
 * Д-1/Р-3 on every snapshot, the **truncation** rule of round 4, and the **structural rejection**
 * rule of M10п — one record of either is a red run whatever else went well.
 *
 * Usage:
 *   pnpm db:test-server        (one terminal — leave it running)
 *   pnpm dev:gate              (another; chain google,ollama, the raised local timeout, and the
 *                               same window declared to the application — round 4, А-8)
 *   node --experimental-strip-types e2e/gate-M12.live.ts
 *
 * Artifacts land in `artifacts/gate-M12/` and are committed: the gate is accepted from them, and
 * for this milestone the customer accepts from them **by eye** — the screens here are the live half
 * of that set, `shots/` is the scripted half.
 */
const BASE_URL = process.env.GATE_URL ?? 'http://127.0.0.1:3000';
const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:5497/postgres';
const OUT = process.env.GATE_OUT ?? 'artifacts/gate-M12';

/** The reference product's own methodology — the walk's default (Эталон §1.4). */
const METHODOLOGY = process.env.GATE_METHODOLOGY ?? 'myspec-greenfield-v1';

const IDEA =
  process.env.GATE_IDEA ??
  'A tool that tracks which of a small charity’s grant applications are due, and drafts the reminder emails';

/** The size the customer's own screenshots were taken at, and the size `shots/` uses. */
const VIEWPORT = { width: 1440, height: 900 };

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
  'request-changes',
  'submit-changes',
  'review-accept',
  'review-ignore',
  'review-request-changes',
  'accept-diff',
  'reject-diff',
  'submit-refinement',
  'chat-send',
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
const measurements: string[] = [];

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

/** A number the customer's complaint was made of, written down rather than described. */
function measure(line: string): void {
  console.log(`[${stamp()}] · ${line}`);
  measurements.push(`- ${line}`);
}

/**
 * The console noise a browser makes that is not the product's fault, and why each line is here.
 *
 * Taken from `bug-hunt-M12.spec.ts` on purpose: a walk that reloads a page mid-stream aborts its own
 * in-flight requests, and every engine reports that as a console error. Kept deliberately short — an
 * allow-list that grows is a console check that has stopped working.
 */
const EXPECTED_CONSOLE = [
  /Failed to load resource/i,
  /net::ERR_ABORTED/i,
  /The user aborted a request/i,
  /Failed to fetch/i,
  /NS_BINDING_ABORTED/i,
];

/* ------------------------------------------------------------------ sign-in */

async function createSignedInUser(): Promise<{ sessionToken: string }> {
  const client = new pg.Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();

  try {
    const sessionToken = randomUUID();
    const email = `gate-m12-${randomUUID().slice(0, 8)}@example.test`;
    const inserted = await client.query<{ id: string }>(
      'INSERT INTO users (email, name) VALUES ($1, $2) RETURNING id',
      [email, 'M12 gate'],
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

/** The boards of a project, with the linter/model split — the M8п question, answered per board. */
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

  await page.screenshot({ path: `${OUT}/screens/${name}.png`, caret: 'initial' });

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
    const theme = document.documentElement.dataset.theme ?? '(none)';

    return { rows, stage, substage, onSession, theme };
  }, SESSION_CONTROLS);

  const live = observed.rows.filter((row) => !row.disabled && row.moves);

  controlLog.push(
    `\n### ${name}\n`,
    observed.onSession
      ? `position: **${observed.stage ?? '—'}${observed.substage ?? ''}**, theme «${observed.theme}»`
      : `_not a session page — the liveness invariant does not apply here._ theme «${observed.theme}»`,
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

/**
 * Д-1, polled rather than sampled once — the lesson `bug-hunt-M12.spec.ts` learned the hard way.
 *
 * The session surface suspends while the server streams it, so immediately after a reload «no
 * control yet» and «no control ever» look identical. A liveness check that can fail on a page still
 * arriving is a check that will be muted, which is worse than not having one.
 */
async function stillAlive(page: Page, where: string): Promise<void> {
  const deadline = Date.now() + 20_000;

  for (;;) {
    const live = await page
      .evaluate((ids: string[]) => {
        const found: string[] = [];
        for (const element of document.querySelectorAll('[data-testid]')) {
          const id = element.getAttribute('data-testid') ?? '';
          if (ids.includes(id) && !element.hasAttribute('disabled')) found.push(id);
        }
        return found;
      }, SESSION_CONTROLS)
      .catch(() => [] as string[]);

    if (live.length > 0) {
      say(`still alive at ${where}: ${live.join(', ')}`);
      return;
    }

    if (Date.now() > deadline) {
      problem(`no session-moving control at: ${where}`);
      await snapshot(page, `dead-${where}`);
      return;
    }

    await page.waitForTimeout(500);
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

/* ------------------------------------------------------- the shell, measured */

/**
 * **The customer's two complaints, as numbers on the final shell** (tasks 136, 137, 141).
 *
 * «Композер сжат в вертикальную полосу» was 46 px of text box on every monitor, and «поверхность
 * была документом, а не приложением» was a page that scrolled as a whole with the collapse control
 * 420 px above the viewport. Both are measurable, so the walk measures them rather than declaring
 * them fixed: a screenshot proves what a frame looked like, a number proves what the layout does.
 */
async function readShell(page: Page, label: string): Promise<void> {
  const shell = await page.evaluate(() => {
    const box = (testId: string): { width: number; height: number } | null => {
      const element = document.querySelector(`[data-testid="${testId}"]`);
      if (element === null) return null;
      const rect = element.getBoundingClientRect();
      return { width: Math.round(rect.width), height: Math.round(rect.height) };
    };

    const scrolls = (testId: string): boolean => {
      const element = document.querySelector(`[data-testid="${testId}"]`);
      return element !== null && element.scrollHeight > element.clientHeight + 1;
    };

    const root = document.documentElement;

    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      pageScrollsVertically: root.scrollHeight > root.clientHeight + 1,
      pageScrollsHorizontally: root.scrollWidth > root.clientWidth + 1,
      composer: box('chat-message'),
      // The column and one of its panels: `sidebar-panel` is a section inside `session-sidebar`,
      // and quoting the inner width as «the sidebar» would understate it by its own padding.
      sidebarColumn: box('session-sidebar'),
      sidebar: box('sidebar-panel'),
      feed: box('feed'),
      feedScrollsInside: scrolls('feed'),
      theme: root.dataset.theme ?? '(none)',
    };
  });

  measure(
    `**${label}** — viewport ${String(shell.viewport.width)}×${String(shell.viewport.height)}, ` +
      `theme «${shell.theme}»: composer text box **${String(shell.composer?.width ?? 0)} px**, ` +
      `sidebar column ${String(shell.sidebarColumn?.width ?? 0)} px ` +
      `(its panels ${String(shell.sidebar?.width ?? 0)} px), feed ${String(shell.feed?.width ?? 0)} px ` +
      `(scrolls inside itself: ${shell.feedScrollsInside ? 'yes' : 'not yet — nothing to scroll'}); ` +
      `page-level scroll: ${shell.pageScrollsVertically ? 'YES' : 'none'} vertical, ` +
      `${shell.pageScrollsHorizontally ? 'YES' : 'none'} horizontal`,
  );

  /*
   * The application-layout rule of task 141: the page itself never scrolls, the panes do. A vertical
   * page scrollbar here is the exact defect the customer reported, back again.
   */
  if (shell.pageScrollsVertically) {
    problem(
      `${label}: the page itself scrolls vertically — the shell is a document again (task 141)`,
    );
  }
  if (shell.pageScrollsHorizontally) {
    problem(`${label}: the page scrolls horizontally at ${String(shell.viewport.width)} px`);
  }

  /*
   * 46 px was the defect. The floor is deliberately far above it and far below what the fix
   * measured (766–894 px at these widths): this asserts «a text box, not a strip», not a pixel.
   */
  const composerWidth = shell.composer?.width ?? 0;
  if (composerWidth > 0 && composerWidth < 320) {
    problem(
      `${label}: the composer text box is ${String(composerWidth)} px wide — the strip is back ` +
        '(the reported defect measured 46 px)',
    );
  }
}

/* -------------------------------------------------- a document, written live */

/**
 * **The live stream, interfered with** — the three techniques a stub cannot honestly rehearse.
 *
 * A routed response holds the socket for as long as the test wants; a model holds it for as long as
 * it takes to write a constitution. Everything below therefore happens inside a window that is real,
 * in the order a person would produce it: look at what is being written, change the theme because
 * the room got dark, and reload because that is what people do when they are not sure anything is
 * happening.
 *
 * Two things are asserted throughout and neither is cosmetic: **Stop stays reachable** (Д-1 — one
 * reader behind card and pane, so the control that ends the wait is on the surface being looked at)
 * and **the text keeps growing** (the reader survived; a reload did not silently orphan the run).
 */
async function abuseTheLiveStream(page: Page, label: string): Promise<void> {
  const streamText = async (): Promise<string> =>
    page
      .getByTestId('spec-stream')
      .innerText()
      .catch(() => '');

  const live = await page
    .getByTestId('stop-generation')
    .waitFor({ timeout: 120_000 })
    .then(() => true)
    .catch(() => false);

  if (!live) {
    say(`${label}: the generation settled before it could be interfered with — nothing to abuse`);
    return;
  }

  say(`${label}: the run is live — Stop is on the page`);
  await snapshot(page, `${label}-live-generating`);
  await readShell(page, `${label} mid-stream`);

  /* 1 — the viewer, opened over a document a model is writing. */
  if (await click(page, 'open-viewer-live', `${label}: open the viewer over the live run`)) {
    const kind = await page
      .getByTestId('viewer-pane')
      .getAttribute('data-viewer-kind')
      .catch(() => null);

    say(`${label}: the viewer opened over the live run as «${kind ?? '(no kind)'}»`);
    if (kind !== 'live') {
      problem(`${label}: the viewer over a running generation reports kind «${kind ?? 'none'}»`);
    }

    const stopInPane = await page
      .getByTestId('viewer-stop-generation')
      .isVisible()
      .catch(() => false);

    if (!stopInPane) {
      problem(`${label}: the viewer is open over a live run and Stop is not reachable in it (Д-1)`);
    }

    await snapshot(page, `${label}-viewer-over-live-stream`);
    await stillAlive(page, `${label} viewer open over a live run`);
  }

  /* 2 — the theme, switched under the tokens, and switched back. */
  const before = await streamText();

  for (const pass of ['flipped', 'restored']) {
    if (!(await click(page, 'theme-toggle', `${label}: theme ${pass} mid-stream`, 10_000))) break;
    await page.waitForTimeout(700);

    const theme = await page.evaluate(() => document.documentElement.dataset.theme ?? '(none)');
    const stopStillThere = await page
      .getByTestId('viewer-stop-generation')
      .isVisible()
      .catch(() => false);

    say(
      `${label}: theme ${pass} to «${theme}» mid-stream; Stop still reachable: ${String(stopStillThere)}`,
    );
    if (!stopStillThere) {
      problem(`${label}: switching the theme mid-stream cost the run its Stop control (Д-1)`);
    }

    await snapshot(page, `${label}-live-stream-theme-${theme}`);
  }

  const afterThemes = await streamText();
  if (afterThemes.length < before.length) {
    problem(
      `${label}: the streamed text shrank across the theme switches ` +
        `(${String(before.length)} → ${String(afterThemes.length)} characters)`,
    );
  } else {
    say(
      `${label}: the stream kept its words across two theme switches ` +
        `(${String(before.length)} → ${String(afterThemes.length)} characters)`,
    );
  }

  /* 3 — the reload, mid-stream: the resumable reader's whole reason to exist. */
  const stillRunning = await page
    .getByTestId('stop-generation')
    .isVisible()
    .catch(() => false);

  if (!stillRunning) {
    say(`${label}: the document finished before the reload — the reader was not asked to resume`);
    return;
  }

  await page.reload();
  await page.getByTestId('session').waitFor({ timeout: 120_000 });
  await stillAlive(page, `${label} reloaded mid-stream`);

  const resumed = await page
    .getByTestId('stop-generation')
    .isVisible()
    .catch(() => false);
  const alreadyDone = (await page.locator('[data-msg-kind="document"]').count()) > 0;

  const verdict = resumed
    ? 'still running (the reader resumed it)'
    : alreadyDone
      ? 'finished'
      : 'neither running nor finished';

  say(`${label}: after a mid-stream reload the run reads ${verdict}`);

  if (!resumed && !alreadyDone) {
    problem(
      `${label}: a mid-stream reload left the session with neither a running run nor a document`,
    );
  }

  const afterReload = await streamText();
  if (resumed && afterReload.length === 0) {
    problem(`${label}: the run survived a reload but the reader delivered no text`);
  }

  await snapshot(page, `${label}-after-mid-stream-reload`);
}

/**
 * One attempt at drafting: press Generate, abuse the live stream, and wait for a document or a
 * refusal. Returned rather than judged — a refusal is not necessarily a failure of the walk.
 */
async function draftOnce(
  page: Page,
  label: string,
  options: { abuse?: boolean } = {},
): Promise<'card' | 'error' | 'nothing'> {
  const began = Date.now();
  const documentsBefore = await page.locator('[data-msg-kind="document"]').count();

  if (!(await click(page, 'generate-spec', `${label}: generate`))) return 'nothing';

  if (options.abuse === true) await abuseTheLiveStream(page, label);
  else await page.waitForTimeout(3000);

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

/* ---------------------------------------------------------------- the viewer */

/**
 * **The card is a door** (task 138) — read on a real document rather than a fixture's.
 *
 * The counts are checked against the exported bytes, because that is the claim the header makes: the
 * numbers a person sees are the numbers `wc` would print about the file they download.
 */
async function readViewer(page: Page): Promise<void> {
  say('— the viewer —');

  if (!(await click(page, 'open-viewer', 'viewer: open from the card'))) return;

  const name = await page
    .getByTestId('viewer-pane-name')
    .innerText()
    .catch(() => '(no name)');
  const revision = await page
    .getByTestId('viewer-metric-revision')
    .innerText()
    .catch(() => '(no revision)');
  const lines = await page
    .getByTestId('viewer-metric-lines')
    .innerText()
    .catch(() => '(no lines)');
  const words = await page
    .getByTestId('viewer-metric-words')
    .innerText()
    .catch(() => '(no words)');

  say(`viewer header: «${name}» · ${revision} · ${lines} · ${words}`);

  /* The four views, each proven by the pane's own attribute rather than by a screenshot. */
  for (const view of ['outline', 'preview', 'raw', 'diff']) {
    if (!(await click(page, `viewer-pane-tab-${view}`, `viewer: ${view}`, 15_000))) continue;

    const shown = await page
      .getByTestId('viewer-pane')
      .getAttribute('data-view')
      .catch(() => null);

    if (shown !== view) problem(`viewer: asked for «${view}», the pane shows «${shown ?? 'none'}»`);
    if (view === 'raw' || view === 'outline') await snapshot(page, `viewer-${view}`);
  }

  /* Raw carries a number for every line of the document, in a gutter that is not the document. */
  await click(page, 'viewer-pane-tab-raw', 'viewer: raw again', 15_000);
  const raw = await page
    .getByTestId('viewer-raw')
    .innerText()
    .catch(() => '');
  const gutter = await page
    .getByTestId('viewer-raw-gutter')
    .getAttribute('data-lines')
    .catch(() => null);
  const rawLines = raw.replace(/\n$/u, '').split('\n').length;

  say(`viewer raw: ${String(rawLines)} line(s) of text, the gutter numbers ${gutter ?? 'none'}`);
  if (gutter !== String(rawLines)) {
    problem(`viewer: the Raw gutter numbers ${gutter ?? 'nothing'} for ${String(rawLines)} lines`);
  }

  /*
   * The counts against the exported bytes — the endpoint the archive and the clipboard resolve
   * through, so this compares the header with the file the customer downloads.
   *
   * **Asked by revision number, and the first draft of this check was not** (fixed after run 1).
   * The walk reads the document at the moment «the card is a door» is most interesting: a draft
   * nobody has approved yet. Without `?rev=N` the endpoint answers the *export* question — «which
   * bytes would leave here», which for an unapproved file is «none» — and it says so with a
   * `NOT_FOUND` body, which the first version of this check happily counted: one line, two words,
   * and two problems reported against a viewer whose header was right all along. The endpoint's own
   * docblock names both questions; the instrument has to pick the one it means (task 138).
   */
  const href = await page
    .getByTestId('viewer-pane-full')
    .getAttribute('href')
    .catch(() => null);
  const specFileId = (href ?? '').split('/').at(-1)?.split('?')[0] ?? '';
  const revisionNumber = /Rev\s+(\d+)/.exec(revision)?.[1] ?? '';

  if (specFileId !== '') {
    const exported = await page.evaluate(
      async ([id, rev]: [string, string]) =>
        (await fetch(`/api/specs/${id}/content${rev === '' ? '' : `?rev=${rev}`}`)).text(),
      [specFileId, revisionNumber] as [string, string],
    );

    const expectedLines = exported.replace(/\n$/u, '').split('\n').length;
    const expectedWords = exported.trim().split(/\s+/u).length;

    measure(
      `**the viewer header against the exported bytes** — header «${lines}» / «${words}», ` +
        `file ${String(expectedLines)} lines / ${String(expectedWords)} words`,
    );

    if (lines !== `${String(expectedLines)} lines`) {
      problem(`viewer: the header says «${lines}» for a file of ${String(expectedLines)} lines`);
    }
    if (words !== `${String(expectedWords)} words`) {
      problem(`viewer: the header says «${words}» for a file of ${String(expectedWords)} words`);
    }

    transcript.push(
      `### the document, as the customer downloads it\n\n\`\`\`\n${exported.slice(0, 2500)}\n\`\`\`\n`,
    );
  }

  await click(page, 'viewer-pane-close', 'viewer: close', 15_000);

  const closed = (await page.getByTestId('viewer-pane').count()) === 0;
  const panelsBack = await page
    .getByTestId('sidebar-panel')
    .isVisible()
    .catch(() => false);

  say(`viewer closed: ${String(closed)}; the panels came back: ${String(panelsBack)}`);
  if (!closed || !panelsBack) problem('viewer: closing the pane did not return the panels');
}

/* --------------------------------------------------- approval and the board */

/** Approve the draft, enter the board, and decide it — one spec stage of a live journey. */
async function decideStage(page: Page, label: string): Promise<boolean> {
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

  /* The product's own marker, and one *more* of it than there was (round 4; D-103). */
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
 * Both themes, on live states (task 124), and this time on the finished shell.
 *
 * Not a screenshot pair for the album: the check is that the tokens resolve to *different* colours
 * in the two themes on the same element, which is what tells a theme that switches from a theme that
 * is painted twice in the same ink.
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
  await snapshot(page, `shell-theme-${before.theme}`);
  await readShell(page, `the finished shell, «${before.theme}»`);

  if (!(await click(page, 'theme-toggle', 'theme: switch'))) return;
  await page.waitForTimeout(500);

  const after = await readTheme();
  await snapshot(page, `shell-theme-${after.theme}`);
  await readShell(page, `the finished shell, «${after.theme}»`);

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

  await snapshot(page, 'shell-theme-after-reload');
}

/**
 * **1000×700, the floor task 141 named** — and the collapse control, which is what the customer
 * could not reach on the old shell.
 */
async function smallWindow(page: Page): Promise<void> {
  say('— the small window —');

  await page.setViewportSize({ width: 1000, height: 700 });
  await page.waitForTimeout(500);

  await readShell(page, 'the floor, 1000×700');
  await stillAlive(page, '1000×700');
  await snapshot(page, 'small-window');

  /*
   * The reported defect, walked rather than asserted: collapse, and expand again. On the old shell
   * the control sat at the top of a page-tall column — 420 px above the viewport on a scrolled
   * session — so «press it again» was impossible in the literal sense.
   */
  if (await click(page, 'sidebar-toggle', 'small window: collapse the sidebar', 15_000)) {
    const collapsed = await page
      .getByTestId('session-sidebar')
      .getAttribute('data-collapsed')
      .catch(() => null);
    await snapshot(page, 'small-window-collapsed');
    await stillAlive(page, 'collapsed at 1000×700');

    if (collapsed !== 'true')
      problem(`the sidebar did not collapse at 1000×700 («${collapsed ?? 'none'}»)`);

    await page.reload();
    await page.getByTestId('session').waitFor({ timeout: 60_000 });

    /*
     * **Polled, and timed** — and the first version of this check was neither (fixed after run 1).
     *
     * The collapse is a client preference: the server cannot know it, so the markup it sends says
     * «not collapsed» and the client corrects that on hydration. Only the sidebar *width* is stamped
     * before first paint (D-198), because a wrong width is a visible jump. So a single reading taken
     * the instant `session` appears reads the server's answer, not the product's — the same defect
     * class this milestone's own report named twice, arriving in a third place.
     *
     * The delay is recorded rather than swallowed: it is the difference between «the preference did
     * not survive» (a defect) and «the preference survives, and the panel is on screen for N ms
     * before it does» (a flash, and the Architect's call whether it earns a pre-paint stamp).
     */
    const reloadedAt = Date.now();
    let survived: string | null = null;
    let settledAfter = -1;

    for (let attempt = 0; attempt < 40; attempt += 1) {
      survived = await page
        .getByTestId('session-sidebar')
        .getAttribute('data-collapsed')
        .catch(() => null);

      if (attempt === 0) {
        say(`the first paint after the reload reads data-collapsed=«${survived ?? 'none'}»`);
      }
      if (survived === 'true') {
        settledAfter = Date.now() - reloadedAt;
        break;
      }

      await page.waitForTimeout(250);
    }

    say(
      `the collapse survived a reload: ${
        survived === 'true'
          ? `yes, settled ${String(settledAfter)} ms after the reload returned`
          : `no («${survived ?? 'none'}»)`
      }`,
    );
    if (survived !== 'true') problem('the collapsed sidebar did not survive a reload (task 136)');
    else if (settledAfter > 0) {
      measure(
        `**the collapsed sidebar after a reload** — restored, but only once the client had ` +
          `hydrated: the panel is painted expanded for ~${String(settledAfter)} ms first. Only the ` +
          'sidebar *width* is stamped before first paint (D-198); the collapse is not.',
      );
    }

    if (await click(page, 'sidebar-toggle', 'small window: expand again', 15_000)) {
      const expanded = await page
        .getByTestId('session-sidebar')
        .getAttribute('data-collapsed')
        .catch(() => null);
      say(`and it expands again: ${expanded === 'false' ? 'yes' : `no («${expanded ?? 'none'}»)`}`);
      if (expanded !== 'false') {
        problem('the sidebar could not be expanded again — the reported defect, back (task 136)');
      }
      await snapshot(page, 'small-window-expanded-again');
    }
  }

  await page.setViewportSize(VIEWPORT);
  await page.waitForTimeout(500);
}

/** The in-app shortcut list (task 141) — discoverable, or it is not keyboard-first. */
async function shortcuts(page: Page): Promise<void> {
  say('— the shortcuts —');

  if (!(await click(page, 'shortcuts-open', 'shortcuts: open the list', 15_000))) return;

  const rows = await page.getByTestId('shortcut-row').count();
  say(`the shortcut list is on the page with ${String(rows)} row(s)`);
  if (rows === 0) problem('the shortcut list opened empty (task 141)');

  await snapshot(page, 'shortcuts');
  await page.keyboard.press('Escape');

  const closed = (await page.getByTestId('shortcuts-dialog').count()) === 0;
  if (!closed) problem('Escape did not close the shortcut list');
}

/* ------------------------------------------------------------------ the walk */

async function run(browser: Browser): Promise<void> {
  const context = await browser.newContext({ baseURL: BASE_URL, viewport: VIEWPORT });
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
  await readShell(page, 'a new session');

  const seedLine = await page
    .getByTestId('session-prompt-line')
    .first()
    .innerText()
    .catch(() => '(no seed line)');

  say(`seed bubble: «${seedLine.replace(/\s+/g, ' ')}»`);
  transcript.push(`### the seed bubble\n\n\`\`\`\n${seedLine}\n\`\`\`\n`);

  /* ------------------------------------------------- one live interview round */

  const answered = await askAndAnswer(page, 'interview');
  if (!answered) problem('interview: no round could be answered — the walk cannot continue');

  await shortcuts(page);

  /* ------------------------------------------ the crossing, and one live document */

  if (!(await click(page, 'proceed', 'interview: proceed'))) return;
  await page
    .getByTestId('stage-substage')
    .waitFor({ timeout: 120_000 })
    .catch(() => undefined);

  await snapshot(page, 'crossed-into-constitution');

  await askAndAnswer(page, 'constitution');
  await click(page, 'proceed', 'constitution: proceed to drafting');

  /*
   * **The live document, written under interference.** A refused generation is retried by pressing
   * the retry the product itself offers, up to three times (FR-018 AC-3) — the abuse happens on the
   * first attempt only, because what a retry proves is that the product recovers, and mixing the two
   * questions would leave neither answered.
   */
  let settled = await draftOnce(page, 'constitution', { abuse: true });

  for (let attempt = 2; settled === 'error' && attempt <= 3; attempt += 1) {
    retries.push(
      `constitution: the draft was refused; pressing the page's own retry (${String(attempt)} of 3)`,
    );
    await snapshot(page, `constitution-refused-${String(attempt - 1)}`);
    settled = await draftOnce(page, `constitution-retry-${String(attempt - 1)}`);
  }

  if (settled !== 'card') {
    problem(`constitution: generation ended as "${settled}" after three attempts, not a revision`);
    await snapshot(page, 'constitution-generation-failed');
    return;
  }

  await readViewer(page);

  const decided = await decideStage(page, 'constitution');
  if (!decided) problem('constitution: the stage did not reach an accepted board');

  for (const board of await boardsFor(projectId)) {
    boardLog.push(
      `- **${board.specType}** Rev ${String(board.revision)} — ${board.outcome}: ` +
        `${String(board.linterItems)} linter item(s), ${String(board.modelItems)} model item(s)`,
    );
  }

  /* ------------------------------------------------ the shell, read for the eye */

  await smallWindow(page);
  await themeSmoke(page, sessionUrl);

  await page.goto(`/projects/${projectId}`);
  await page.getByTestId('project-page').waitFor({ timeout: 60_000 });
  await snapshot(page, 'project-page');

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

/*
 * The console rule, applied after the fact rather than during: a walk that reloads a page mid-stream
 * aborts its own requests, and those are the browser's words about the harness, not the product's
 * about itself.
 */
const unexpectedConsole = consoleErrors.filter(
  (line) => !EXPECTED_CONSOLE.some((pattern) => pattern.test(line)),
);

if (unexpectedConsole.length > 0) {
  problem(
    `${String(unexpectedConsole.length)} unexpected console error(s) — a React warning or an ` +
      'uncaught exception is a defect even when the pixels are right. First: ' +
      (unexpectedConsole[0] ?? ''),
  );
}

/* ------------------------------------------------- the prompt-truncation rule (round 4, А-8) */

/**
 * **One `truncating input prompt` record is a red run, whatever else went well.**
 *
 * A local runtime handed more than it can read does not refuse: it drops the head of the prompt —
 * the system instruction and the required section list — reads the tail, and answers confidently
 * from the web research that survived there. The document that comes back is fluent, plausible,
 * about the wrong thing, and is rejected on structure three retries running, because truncation is
 * deterministic (D-146).
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

const walkStartedAt = new Date(startedAt).toISOString();

/**
 * Parsed, never compared as text. Ollama stamps local time with an offset (`…+03:00`) and
 * `toISOString` writes UTC with a `Z`; comparing those two spellings as strings is not a comparison
 * at all (M11п).
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
 * `generated document rejected on structure` is what `run-generation.ts` logs when a draft comes
 * back without the headings the section schema requires. Retrying is correct behaviour; a walk that
 * needed it is not a walk that proved the milestone, so the record is read from the log rather than
 * inferred from the screen.
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
    '# M12п gate — RESULT',
    '',
    `Walked ${new Date().toISOString()} against \`${BASE_URL}\`, live providers, throwaway database.`,
    '',
    `**Verdict: ${problems.length === 0 ? 'GREEN' : 'RED'}** — ${String(problems.length)} problem(s), ` +
      `${String(step)} state(s) captured, ${String(consoleErrors.length)} console record(s) of which ` +
      `${String(unexpectedConsole.length)} unexpected.`,
    '',
    '## Problems',
    '',
    bullets(problems),
    '',
    '## The shell, measured',
    '',
    'The customer reported a composer «сжатый в вертикальную полосу» and a surface that behaved like',
    'a document. Both were measurable then — 46 px of text box on every monitor, the collapse control',
    '420 px above the viewport — so both are measured now rather than declared fixed.',
    '',
    list(measurements),
    '',
    '## Prompt truncation (round 4 — the red condition)',
    '',
    `\`truncating input prompt\` records for the whole walk: **${String(truncationRecords.length)}**. ` +
      'One is a red run, whatever else went well: what a local runtime drops is the head of the ' +
      'prompt — the instruction and the required-section list (D-146; А-8).',
    '',
    bullets(truncationRecords.slice(0, 10)),
    '',
    `Counted from \`${walkStartedAt}\`, when this walk began. The same log holds ` +
      `**${String(earlierTruncations)}** earlier record(s) from before it.`,
    '',
    '## Structural rejections (M10п — the second red condition)',
    '',
    `\`generated document rejected on structure\` records: **${String(structuralRejections.length)}**. ` +
      'The milestone asks for zero: a retry that succeeds hides the first sample, and the first ' +
      'sample is what says whether the link can hold the contract.',
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
    '## Console records',
    '',
    'Aborted requests are the harness reloading a page over its own in-flight fetch, and are',
    'expected; anything else is a defect even when the pixels are right.',
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
  ['# M12п gate — what the models said', '', transcript.join('\n')].join('\n'),
);

console.log(`\n${problems.length === 0 ? 'GREEN' : 'RED'} — artifacts in ${OUT}`);
