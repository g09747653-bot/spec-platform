import { expect, test, type Page } from '@playwright/test';

import { createSignedInUser, downloadBundle, signIn } from './fixtures';

/**
 * **The autonomous run, walked by nobody** (task 145; А-7 «Программа А»).
 *
 * The claim this file exists to make is a negative one: from the moment the chat is created, *no
 * control is clicked*. Every `page.getByTestId(...).click()` below happens either before the session
 * exists or after the driver has been stopped — and that is asserted rather than left to inspection,
 * by counting the clicks the walk makes and by watching the session move while the test does nothing
 * but wait.
 *
 * Three tests, one for each half of the acceptance criteria:
 *
 * 1. **seed → complete, zero clicks**, on the gate chain and within the budgets, with a bundle that
 *    passes the same structural check the hand-walked journey ends on;
 * 2. **every auto-decision is marked and explained** — the transparency requirement, asserted as a
 *    property of the feed rather than by reading sentences;
 * 3. **Stop hands the session back** at exactly the position it was standing on, and the session
 *    continues by hand from there.
 *
 * The seed is one sentence, as the AC requires: everything the bundle says comes from it.
 */
const SEED =
  'A tool that tracks which grant applications a small charity owes and drafts reminders';

/** Creates a chat with the driver already on it — the one place a person acts. */
async function startAutonomousSession(page: Page, prompt = SEED): Promise<string> {
  await page.goto('/projects');
  await expect(page.getByTestId('create-project')).toBeEnabled();

  await page.getByTestId('prompt-input').fill(prompt);
  await page.getByTestId('autonomous-toggle').check();
  await page.getByTestId('create-project').click();

  await expect(page.getByTestId('session')).toBeVisible();
  await expect(page.getByTestId('driver-panel')).toHaveAttribute('data-driver', 'running');

  return page.url();
}

test.describe('the autonomous driver', () => {
  test('carries a one-sentence seed to a finished bundle without a single click', async ({
    page,
    context,
  }) => {
    /*
     * The longest journey in the suite: an interview, four stages, four drafts, a rewrite each and
     * nine board decisions, all of them taken a step at a time over HTTP. `test.slow()` triples the
     * envelope; the explicit waits below carry their own budgets on top.
     */
    test.slow();

    await signIn(context, await createSignedInUser('autonomous'));

    /*
     * Every click this walk makes, counted. The three before the session exists are the mode being
     * chosen; after that the number must not move, because a click after this point would be a
     * person driving.
     */
    let clicks = 0;
    await page.exposeFunction('__countClick', () => {
      clicks += 1;
    });
    await page.addInitScript(() => {
      document.addEventListener(
        'click',
        () => {
          (window as unknown as { __countClick?: () => void }).__countClick?.();
        },
        true,
      );
    });

    const sessionUrl = await startAutonomousSession(page);
    const clicksAtStart = clicks;

    /*
     * From here the test only waits. The session moves because the page is ticking the driver, and
     * the assertions are on the same attributes the hand-walked journey asserts on — the position
     * and the bundle — so «the driver got there» means the same thing it means for a person.
     */
    await expect(page.getByTestId('stage-current')).toHaveAttribute('data-stage', 'complete', {
      timeout: 240_000,
    });

    expect(clicks, 'the run took a click after the session was created').toBe(clicksAtStart);

    await expect(page.getByTestId('session-complete')).toBeVisible();
    await expect(page.getByTestId('export-panel')).toBeVisible();
    await expect(page.getByTestId('export-omitted')).toHaveCount(0);

    // The driver stopped itself, and said which ending this was.
    await expect(page.getByTestId('driver-panel')).toHaveAttribute('data-driver', 'stopped');
    await expect(page.getByTestId('driver-panel')).toHaveAttribute('data-stop-reason', 'completed');

    /*
     * The bundle, judged by the same rule the critical journey judges it by: four files, named
     * exactly, none empty, each with headings. An autonomous run that produced a bundle no coding
     * agent could use would have satisfied every other assertion here.
     */
    const archive = await downloadBundle(page);

    expect(archive.names).toEqual([
      'constitution.md',
      'requirements.md',
      'solution.md',
      'tasks.md',
    ]);

    for (const name of archive.names) {
      const content = archive.entries[name] ?? '';
      expect(content.trim(), `${name} is empty`).not.toBe('');
      expect(content, `${name} has no headings`).toMatch(/^#/m);
    }

    // …and the run survives a reload as history, like every other part of a session (FR-017 AC-1).
    await page.goto(sessionUrl);
    await expect(page.getByTestId('stage-current')).toHaveAttribute('data-stage', 'complete');
    await expect(page.getByTestId('driver-panel')).toHaveAttribute('data-stop-reason', 'completed');
  });

  test('every answer and decision it took is marked as the machine’s, with a reason', async ({
    page,
    context,
  }) => {
    test.slow();

    await signIn(context, await createSignedInUser('transparent'));
    await startAutonomousSession(page);

    /*
     * Waited on the *first* stage rather than the whole run: the property is about every driver act,
     * and one interview plus one document plus one board exercises all four kinds of act. Waiting for
     * `complete` here would make this test a slower copy of the one above.
     */
    await expect(page.getByTestId('stage-current')).toHaveAttribute('data-stage', 'requirements', {
      timeout: 180_000,
    });

    /*
     * The marker is an attribute, not a badge in prose (task 145). A walk can count
     * `[data-msg-origin="driver"]`; it cannot count a sentence that happens to begin with a word.
     */
    const notes = page.locator('[data-msg-origin="driver"]');
    expect(await notes.count()).toBeGreaterThanOrEqual(4);

    // Each one says something. A rationale that is empty is a decision with no account of itself.
    for (const text of await notes.allInnerTexts()) {
      expect(text.trim().length).toBeGreaterThan(10);
    }

    // The badge is on screen too, so a reader sees what a walk measures.
    await expect(page.getByTestId('driver-badge').first()).toBeVisible();

    /*
     * The answers themselves are ordinary answered rounds — the driver submitted them through the
     * same endpoint the card posts to, so the feed cannot tell them apart, and that is the point of
     * the identity test in `route.test.ts`. What distinguishes them is the note beside them.
     */
    await expect(page.getByTestId('round-answered').first()).toBeVisible();
  });

  test('Stop hands the session back at exactly the position it was standing on', async ({
    page,
    context,
  }) => {
    test.slow();

    await signIn(context, await createSignedInUser('sovereign'));
    await startAutonomousSession(page);

    // Let it get somewhere first — a Stop before the first move proves nothing about a run.
    await expect(page.getByTestId('driver-panel')).toHaveAttribute('data-driver', 'running');
    await expect
      .poll(async () => Number(await page.getByTestId('driver-panel').getAttribute('data-steps')), {
        timeout: 60_000,
      })
      .toBeGreaterThan(1);

    await page.getByTestId('driver-stop').click();
    await expect(page.getByTestId('driver-panel')).toHaveAttribute('data-driver', 'stopped');
    await expect(page.getByTestId('driver-panel')).toHaveAttribute(
      'data-stop-reason',
      'stopped-by-user',
    );

    const stage = await page.getByTestId('stage-current').getAttribute('data-stage');
    const substage = await page.getByTestId('stage-substage').getAttribute('data-substage');

    /*
     * Ten seconds of nothing. A driver that kept a tick alive after Stop — a stale interval, a step
     * that had already claimed its turn — would move the session inside this window, and the
     * assertions after it would fail on the position rather than on a timeout.
     */
    await page.waitForTimeout(10_000);

    await expect(page.getByTestId('stage-current')).toHaveAttribute('data-stage', stage ?? '');
    await expect(page.getByTestId('stage-substage')).toHaveAttribute(
      'data-substage',
      substage ?? '',
    );

    /*
     * …and it is an ordinary chat now. Whatever the tail is holding, the control that answers it is
     * live and a person can press it — which is the whole of «continues manually from exactly this
     * position».
     */
    await page.reload();
    await expect(page.getByTestId('driver-panel')).toHaveAttribute('data-driver', 'stopped');

    const tailControls = [
      'mcq-submit',
      'approve-spec',
      'review-accept',
      'generate-spec',
      'proceed',
    ];
    const live = await Promise.all(
      tailControls.map(async (id) => {
        const control = page.getByTestId(id).first();
        return (await control.count()) > 0 && (await control.isEnabled());
      }),
    );

    expect(live.some(Boolean), 'the stopped session offers nothing a person can press').toBe(true);

    // The offer to hand it back is there too: a stopped run is a pause, not a one-way door.
    await expect(page.getByTestId('driver-start')).toBeVisible();
  });
});
