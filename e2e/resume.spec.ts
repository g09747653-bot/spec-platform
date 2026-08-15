import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { Client } from 'pg';

import {
  createSignedInUser,
  reachDrafting,
  reauthenticate,
  signIn,
  startSession,
  type SignedInUser,
} from './fixtures';
import { TEST_DATABASE_URL } from './test-database';

/**
 * Session resume, for each of the four pending kinds (task 75; FR-017).
 *
 * The claim under test is narrow and total: **whatever card was on screen comes back, unchanged, and
 * nothing the browser does changes the persisted state.** So every case here interrupts the session
 * three ways — reload, sign out and back in, and a request that never completes — and then asserts
 * the same card, by the same test id, with the same content.
 *
 * "Sign out and back in" is the sharpest of the three: it takes a new document, a new session cookie
 * and a new render from scratch, so nothing client-side can be carrying the answer.
 */

async function withDatabase<T>(body: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();

  try {
    return await body(client);
  } finally {
    await client.end();
  }
}

/**
 * A generation left in flight, written exactly as the handler would have left it (round 5, Р-3).
 *
 * Seeded rather than clicked because the stub provider finishes a generation instantly: there is no
 * honest click that holds a run open long enough for a page load to land inside one, and the state
 * under test is precisely "a page loads while a run is going".
 */
async function seedRunningGeneration(
  projectUrl: string,
  stage: string,
  deltas: readonly string[],
): Promise<string> {
  const projectId = projectUrl.split('/').at(-1) ?? '';

  return withDatabase(async (client) => {
    const session = await client.query<{ id: string }>(
      'SELECT id FROM sessions WHERE project_id = $1',
      [projectId],
    );

    const run = await client.query<{ id: string }>(
      "INSERT INTO generation_runs (session_id, stage, status, attempt) VALUES ($1, $2, 'running', 1) RETURNING id",
      [session.rows[0]?.id ?? '', stage],
    );
    const runId = run.rows[0]?.id ?? '';

    for (const [sequence, delta] of deltas.entries()) {
      await client.query(
        'INSERT INTO generation_chunks (run_id, sequence, delta) VALUES ($1, $2, $3)',
        [runId, sequence, delta],
      );
    }

    return runId;
  });
}

/** Ends the seeded run the way an exhausted provider chain would. */
async function failRun(runId: string): Promise<void> {
  await withDatabase(async (client) => {
    await client.query("UPDATE generation_runs SET status = 'failed' WHERE id = $1", [runId]);
  });
}

/** Signs out, signs back in as the same person, and returns to the session. */
async function signOutAndBackIn(
  page: Page,
  context: BrowserContext,
  owner: SignedInUser,
  projectUrl: string,
): Promise<void> {
  await page.goto('/projects');
  await page.getByTestId('sign-out').click();
  await expect(page).toHaveURL(/\/signin/);

  // The same person: a new credential for the existing user row, which is what signing in again is.
  await context.clearCookies();
  await signIn(context, await reauthenticate(owner));
  await page.goto(projectUrl);
}

test.describe('session resume', () => {
  test('a pending question set comes back as the same card (AC-1/AC-3)', async ({
    page,
    context,
  }) => {
    const owner = await createSignedInUser('resumer');
    await signIn(context, owner);
    const projectUrl = await startSession(page, 'A tool that remembers where I left off');

    await page.getByTestId('ask-round').click();
    await expect(page.getByTestId('mcq-card')).toBeVisible();

    const questions = await page.getByTestId('mcq-card').textContent();

    await page.reload();
    await expect(page.getByTestId('mcq-card')).toBeVisible();
    expect(await page.getByTestId('mcq-card').textContent()).toBe(questions);

    // A round presented but unanswered is still presented — and still the only card.
    await expect(page.getByTestId('generation-blocked')).toBeVisible();

    await page.goto(projectUrl);
    await expect(page.getByTestId('mcq-card')).toBeVisible();
    expect(await page.getByTestId('mcq-card').textContent()).toBe(questions);
  });

  test('answers are restored and are not asked again (AC-2/AC-5)', async ({ page, context }) => {
    const owner = await createSignedInUser('resumer');
    await signIn(context, owner);
    const projectUrl = await startSession(page, 'A tool that keeps what I told it');

    await page.getByTestId('ask-round').click();
    await expect(page.getByTestId('mcq-card')).toBeVisible();
    await page.getByTestId('mcq-option-q-audience-solo-devs').check();
    await page.getByTestId('mcq-option-q-problem-context').check();
    await page.getByTestId('mcq-submit').click();

    await expect(page.getByTestId('interview-panel')).toContainText('summary saved');

    /*
     * The answers are shown back where they were given — the round itself, fixed in place, by the
     * labels of what was chosen rather than by option ids. In the feed there is no separate history
     * panel: the conversation *is* the history, which is the whole of task 104.
     */
    const answered = page.getByTestId('round-answered');
    await expect(answered).toBeVisible();
    await expect(answered).not.toContainText('q-audience-solo-devs');
    const restored = await answered.textContent();

    await signOutAndBackIn(page, context, owner, projectUrl);

    await expect(page.getByTestId('round-answered')).toBeVisible();
    expect(await page.getByTestId('round-answered').textContent()).toBe(restored);

    // AC-5: the answered round is not re-presented — the feed is offering a *new* round, not that one.
    await expect(page.getByTestId('mcq-card')).toHaveCount(0);
    await expect(page.getByTestId('ask-round')).toBeVisible();
  });

  test('a pending spec approval comes back as the same card (AC-4)', async ({ page, context }) => {
    const owner = await createSignedInUser('resumer');
    await signIn(context, owner);
    const projectUrl = await startSession(page, 'A tool that keeps a draft awaiting my decision');

    await reachDrafting(page);
    await page.getByTestId('generate-spec').click();
    await expect(page.getByTestId('spec-card')).toBeVisible({ timeout: 20_000 });

    const content = await page.getByTestId('spec-content').textContent();

    await signOutAndBackIn(page, context, owner, projectUrl);

    await expect(page.getByTestId('spec-revision-number')).toHaveText('1');
    await expect(page.getByTestId('approve-spec')).toBeVisible();
    expect(await page.getByTestId('spec-content').textContent()).toBe(content);
  });

  test('a pending diff comes back as the same card (AC-4)', async ({ page, context }) => {
    const owner = await createSignedInUser('resumer');
    await signIn(context, owner);
    const projectUrl = await startSession(page, 'A tool that keeps a proposed change on screen');

    await reachDrafting(page);
    await page.getByTestId('generate-spec').click();
    await expect(page.getByTestId('spec-card')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('approve-spec').click();
    await expect(page.getByTestId('spec-card')).toContainText('approved');

    await page.getByTestId('refine-instruction').fill('Add a section about non-goals.');
    await page.getByTestId('submit-refinement').click();
    await expect(page.getByTestId('diff-card')).toBeVisible({ timeout: 20_000 });

    const diff = await page.getByTestId('diff-body').textContent();

    await signOutAndBackIn(page, context, owner, projectUrl);

    await expect(page.getByTestId('diff-card')).toBeVisible();
    expect(await page.getByTestId('diff-body').textContent()).toBe(diff);
    // Still undecided: resume restored the decision, it did not take it.
    await expect(page.getByTestId('accept-diff')).toBeVisible();
    await expect(page.getByTestId('spec-revision-number')).toHaveText('1');
  });

  test('a pending review comes back as the same board (AC-4)', async ({ page, context }) => {
    const owner = await createSignedInUser('resumer');
    await signIn(context, owner);
    const projectUrl = await startSession(page, 'A tool that keeps a review awaiting my decision');

    await reachDrafting(page);
    await page.getByTestId('generate-spec').click();
    await expect(page.getByTestId('spec-card')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('approve-spec').click();
    await expect(page.getByTestId('spec-card')).toContainText('approved');
    await page.getByTestId('proceed').click();
    await expect(page.getByTestId('review-board')).toBeVisible({ timeout: 20_000 });

    const board = await page.getByTestId('review-board').textContent();

    await signOutAndBackIn(page, context, owner, projectUrl);

    await expect(page.getByTestId('review-board')).toBeVisible();
    expect(await page.getByTestId('review-board').textContent()).toBe(board);
    await expect(page.getByTestId('stage-substage')).toHaveText(/review/);
  });

  /*
   * Round 5, Р-3 — **a page that comes back mid-generation reattaches instead of offering a second
   * one.** Round 4 (Р-2) made the run outlive its reader; the page did not follow. Landing on a
   * session while a run was going showed an empty card with a Generate button, and taking it started
   * a *second* run over the same stage — the "no duplicates" half of the M3 resume rule, broken by a
   * page that simply did not know a run existed.
   *
   * Found by the M6 gate walk (А-2.1), which is the point of walking it.
   */
  test('a generation in flight is reattached to, not duplicated (Р-3)', async ({
    page,
    context,
  }) => {
    await signIn(context, await createSignedInUser('resumer'));
    const projectUrl = await startSession(page, 'A tool whose generation outlives its page');
    await reachDrafting(page);

    /*
     * A run in flight, seeded exactly as the handler would have left it: a `running` row for the
     * stage the session is on, and two batches already in the durable chunk log. Seeding is what
     * makes this deterministic — the stub provider finishes instantly, so no honest click can hold a
     * run open long enough for a page load to land inside it.
     */
    const runId = await seedRunningGeneration(projectUrl, 'constitution', [
      '# Constitution\n\n',
      '## Project Vision\n',
    ]);

    let generationsStarted = 0;
    await page.route('**/api/sessions/*/generate', async (route) => {
      generationsStarted += 1;
      await route.fallback();
    });

    await page.goto(projectUrl);
    await expect(page.getByTestId('session')).toBeVisible();

    /*
     * First, the part that owes nothing to JavaScript: the server rendered the run in flight, so the
     * control that would have duplicated it is not on offer — Stop is. This is asserted before the
     * streamed text because it must hold whether or not the reattaching effect has run yet.
     */
    await expect(page.getByTestId('stop-generation')).toBeEnabled();
    await expect(page.getByTestId('generate-spec')).toHaveCount(0);

    // Then the reattachment itself: the text on screen is the durable log replayed.
    await expect(page.getByTestId('spec-stream')).toContainText('# Constitution', {
      timeout: 20_000,
    });
    // Both batches, and patiently: a reattach that lands twice replays from the start, so the second
    // batch can arrive after the first has been drawn once already.
    await expect(page.getByTestId('spec-stream')).toContainText('Project Vision', {
      timeout: 20_000,
    });

    expect(generationsStarted, 'landing on a running generation must not start another').toBe(0);

    // When the run ends badly, the reattached page is told — it does not sit there for ever.
    await failRun(runId);
    await expect(page.getByTestId('generation-error')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('generate-spec')).toBeEnabled();
  });

  /*
   * AC-6, the half that is not about reloading: a request that never completes must leave the
   * session exactly as it was. The route is aborted mid-flight, which is what a dropped connection
   * looks like from the server's side of a fetch.
   */
  test('an interrupted request changes nothing (AC-6)', async ({ page, context }) => {
    const owner = await createSignedInUser('resumer');
    await signIn(context, owner);
    const projectUrl = await startSession(page, 'A tool that survives a dropped connection');

    await reachDrafting(page);
    await page.getByTestId('generate-spec').click();
    await expect(page.getByTestId('spec-card')).toBeVisible({ timeout: 20_000 });

    const before = {
      revision: await page.getByTestId('spec-revision-number').textContent(),
      substage: await page.getByTestId('stage-substage').textContent(),
    };

    // Every transition request is dropped before it reaches the handler.
    await page.route('**/api/sessions/*/transition', (route) => route.abort());
    await page.getByTestId('approve-spec').click();
    await page
      .getByTestId('proceed')
      .click()
      .catch(() => undefined);

    /*
     * Wait for the dropped request to be *reported* before navigating (round 5, Р-3). A settled
     * request now re-reads the server whatever its outcome, so leaving immediately raced that
     * refresh — the assertion below is about persisted state, and it should be taken after the page
     * has finished saying what happened, not in the middle of it.
     */
    // The door lives at the tail of the feed now, so its notice is the tail's (task 105).
    await expect(page.getByTestId('interview-notice')).toContainText('did not reach the server');
    await page.unroute('**/api/sessions/*/transition');

    // Tolerant of that refresh being in flight: a navigation interrupted by the page's own re-read
    // is not a failure, it is the two of them arriving at the same place.
    await page.goto(projectUrl).catch(() => page.goto(projectUrl));
    await expect(page.getByTestId('session')).toBeVisible();

    expect(await page.getByTestId('stage-substage').textContent()).toBe(before.substage);
    expect(await page.getByTestId('spec-revision-number').textContent()).toBe(before.revision);
  });
});
