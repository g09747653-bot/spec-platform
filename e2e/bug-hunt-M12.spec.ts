import { expect, test, type Page } from '@playwright/test';

import { createSignedInUser, signIn } from './fixtures/auth';
import { collectFor, completeInterview, completeStage, startSession } from './fixtures/journey';

/**
 * The destructive pass (task 140 — «сразу протестировать на баги»).
 *
 * The customer's directive, written as a suite rather than performed once: collapse and resize
 * everything repeatedly, reload in every state, switch themes mid-generation, open and close the
 * viewer while a document is being written, spam the composer. The point is not that these are
 * normal things to do — it is that none of them may leave the page unable to continue, and that
 * every one of them is somewhere a person will eventually be.
 *
 * Two invariants are asserted throughout and are what makes this a hunt rather than a demo:
 *
 * - **Д-1** — after every abuse there is still a control that moves the session.
 * - **A clean console** — an uncaught error or a React warning is a defect even when the pixels
 *   look right, and the state after a reload is exactly where those hide.
 */

/** Console errors and uncaught exceptions, collected for the whole test. */
function watchConsole(page: Page): string[] {
  const problems: string[] = [];

  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console.error: ${message.text()}`);
  });
  page.on('pageerror', (error) => {
    problems.push(`pageerror: ${error.message}`);
  });

  return problems;
}

/**
 * The console noise this application cannot prevent, and why each line is here.
 *
 * Kept deliberately short: an allow-list that grows is a console check that stops working.
 */
const EXPECTED = [
  // Playwright aborts in-flight requests when a test navigates or reloads.
  /Failed to load resource/i,
  /net::ERR_ABORTED/i,
  /The user aborted a request/i,
  /Failed to fetch/i,
];

function unexpected(problems: readonly string[]): string[] {
  return problems.filter((problem) => !EXPECTED.some((pattern) => pattern.test(problem)));
}

const CONTROLS = [
  'ask-round',
  'mcq-submit',
  'generate-spec',
  'stop-generation',
  'approve-spec',
  'review-accept',
  'proceed',
  'chat-send',
  'download-export',
];

/**
 * Д-1: something on the page moves the session.
 *
 * Polled rather than sampled once. The first draft of this helper took a single reading, and it
 * reported a dead page immediately after a reload — the session surface suspends while the server
 * streams it, so «no control yet» and «no control ever» looked identical. A liveness check that can
 * fail on a page still arriving is a check that will be muted, which is worse than not having one.
 */
async function stillAlive(page: Page, where: string): Promise<void> {
  await expect
    .poll(
      async () => {
        const live: string[] = [];
        for (const control of CONTROLS) {
          const locator = page.getByTestId(control).first();
          if ((await locator.count()) > 0 && (await locator.isVisible())) live.push(control);
        }

        return live.length;
      },
      { message: `no session-moving control at: ${where}`, timeout: 15_000 },
    )
    .toBeGreaterThan(0);
}

test.describe('M12п bug hunt', () => {
  test.describe.configure({ timeout: 180_000 });

  test('the panes survive being collapsed, resized and reloaded, over and over', async ({
    page,
    context,
  }) => {
    const problems = watchConsole(page);

    await signIn(context, await createSignedInUser('hunt'));
    await page.setViewportSize({ width: 1280, height: 800 });

    await startSession(page, 'A tool that survives being poked');
    await completeInterview(page);
    await collectFor(page, 'constitution');

    for (let round = 0; round < 3; round += 1) {
      await page.getByTestId('sidebar-toggle').click();
      await expect(page.getByTestId('session-sidebar')).toHaveAttribute('data-collapsed', 'true');
      await stillAlive(page, `collapsed, round ${String(round)}`);

      await page.getByTestId('sidebar-toggle').click();
      await expect(page.getByTestId('sidebar-panel')).toBeVisible();
      await stillAlive(page, `expanded, round ${String(round)}`);

      const handle = page.getByTestId('sidebar-resize');
      await handle.focus();
      // To both stops and back — the clamp is what stops this ending in an unusable layout.
      for (let step = 0; step < 18; step += 1) await handle.press('ArrowLeft');
      await stillAlive(page, `dragged wide, round ${String(round)}`);
      expect(await widthOf(page, 'chat-message')).toBeGreaterThan(360);

      for (let step = 0; step < 22; step += 1) await handle.press('ArrowRight');
      await stillAlive(page, `dragged narrow, round ${String(round)}`);
      expect(await widthOf(page, 'sidebar-panel')).toBeGreaterThan(180);
    }

    // Reload in the collapsed state, and again in the expanded one.
    await page.getByTestId('sidebar-toggle').click();
    await page.reload();
    await expect(page.getByTestId('session')).toBeVisible();
    await expect(page.getByTestId('session-sidebar')).toHaveAttribute('data-collapsed', 'true');
    await stillAlive(page, 'reloaded collapsed');

    await page.getByTestId('sidebar-toggle').click();
    await page.reload();
    await expect(page.getByTestId('sidebar-panel')).toBeVisible();
    await stillAlive(page, 'reloaded expanded');

    expect(unexpected(problems)).toEqual([]);
  });

  test('a theme switch and a viewer opened mid-generation cost the run nothing', async ({
    page,
    context,
  }) => {
    const problems = watchConsole(page);

    await signIn(context, await createSignedInUser('hunt'));
    await page.setViewportSize({ width: 1440, height: 900 });

    await startSession(page, 'A tool whose theme can change mid-sentence');
    await completeInterview(page);
    await collectFor(page, 'constitution');

    /* A generation that opens, writes, and holds — long enough to be interfered with. */
    await page.route('**/api/sessions/*/generate', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/x-ndjson',
        body:
          `${JSON.stringify({
            type: 'run',
            runId: '11111111-2222-4333-8444-777777777777',
            stage: 'constitution',
            attempt: 1,
          })}\n` +
          `${JSON.stringify({ type: 'delta', sequence: 0, text: '# Constitution\n\nA line.\n' })}\n`,
      }),
    );
    await page.route('**/api/generations/*/stream*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: '' }),
    );

    await page.getByTestId('generate-spec').click();
    await expect(page.getByTestId('stop-generation')).toBeVisible();

    // Theme, twice, while the run is in flight.
    for (let flip = 0; flip < 4; flip += 1) {
      await page.getByTestId('theme-toggle').click();
      await expect(page.getByTestId('stop-generation')).toBeVisible();
    }
    await expect(page.getByTestId('spec-stream')).toContainText('# Constitution');

    // The viewer, opened and closed repeatedly over the live stream.
    for (let open = 0; open < 3; open += 1) {
      await page.getByTestId('open-viewer-live').click();
      await expect(page.getByTestId('viewer-pane')).toBeVisible();
      await expect(page.getByTestId('viewer-stop-generation')).toBeVisible();
      await stillAlive(page, `viewer open over a live run, ${String(open)}`);

      await page.getByTestId('viewer-pane-close').click();
      await expect(page.getByTestId('viewer-pane')).toHaveCount(0);
      await stillAlive(page, `viewer closed over a live run, ${String(open)}`);
    }

    // And the text is still the text: one reader, whatever was opened over it.
    await expect(page.getByTestId('spec-stream')).toContainText('A line.');
    await page.getByTestId('stop-generation').click();
    await expect(page.getByTestId('generate-spec')).toBeEnabled();

    expect(unexpected(problems)).toEqual([]);
  });

  test('the composer can be spammed, and every reload lands on the same state', async ({
    page,
    context,
  }) => {
    const problems = watchConsole(page);

    await signIn(context, await createSignedInUser('hunt'));
    await page.setViewportSize({ width: 1280, height: 800 });

    await startSession(page, 'A tool whose composer can be leaned on');
    await completeInterview(page);
    await completeStage(page, 'constitution');

    /*
     * Send, then lean on the button while the first message is in flight. The property is the one
     * the composer's docblock claims: **one message at a time** — the send disables itself, and the
     * box beside it never does. A second click during that window is refused by the control rather
     * than by a guard somewhere else, which is why it is asserted as «disabled» and not attempted.
     */
    for (let message = 0; message < 3; message += 1) {
      const text = `question number ${String(message)}`;

      // The previous message has landed: the control says «Send» rather than «Sending…».
      await expect(page.getByTestId('chat-send')).toHaveText('Send', { timeout: 30_000 });

      /*
       * Filled with a retry, and this is a harness concern rather than a product one. A programmatic
       * `fill` on a controlled `<textarea>` can be overwritten by a React re-render that lands in
       * the same tick — under load on WebKit it was, and the box came back empty. Checked separately
       * that a person typing during an in-flight reply keeps every character, which is the property
       * that matters; this only makes the robot's typing as reliable as theirs.
       */
      await expect
        .poll(async () => {
          await page.getByTestId('chat-message').fill(text);

          return page.getByTestId('chat-message').inputValue();
        })
        .toBe(text);

      await expect(page.getByTestId('chat-send')).toBeEnabled();
      await page.getByTestId('chat-send').click();

      await expect(page.getByTestId('chat-send')).toBeDisabled();
      await expect(page.getByTestId('chat-message')).toBeEnabled();
      await stillAlive(page, `after message ${String(message)}`);
    }

    // Reload at this state and at every state a stage passes through.
    await page.reload();
    await expect(page.getByTestId('session')).toBeVisible();
    await stillAlive(page, 'reloaded after chat');

    await collectFor(page, 'requirements');
    await page.reload();
    await stillAlive(page, 'reloaded at generate');

    /*
     * Hydrated, proven rather than assumed: the collapse control is client state, so a toggle that
     * lands is a page whose JavaScript is running. A button that is server-rendered but not yet
     * hydrated accepts a click and does nothing, which on WebKit is how «Generate» was pressed into
     * a void and the test waited forty seconds for a card nobody had asked for.
     */
    await page.getByTestId('sidebar-toggle').click();
    await expect(page.getByTestId('session-sidebar')).toHaveAttribute('data-collapsed', 'true');
    await page.getByTestId('sidebar-toggle').click();
    await expect(page.getByTestId('session-sidebar')).toHaveAttribute('data-collapsed', 'false');

    await page.getByTestId('generate-spec').click();
    await expect(page.getByTestId('spec-card')).toBeVisible({ timeout: 40_000 });
    await page.reload();
    await expect(page.getByTestId('spec-card')).toBeVisible();
    await stillAlive(page, 'reloaded at pending approval');

    await page.getByTestId('approve-spec').click();
    await expect(page.getByTestId('spec-card')).toContainText('approved');
    await page.getByTestId('proceed').click();
    await expect(page.getByTestId('review-board')).toBeVisible({ timeout: 40_000 });
    await page.reload();
    await expect(page.getByTestId('review-board')).toBeVisible();
    await stillAlive(page, 'reloaded at pending review');

    expect(unexpected(problems)).toEqual([]);
  });

  test('the viewer follows the document it was opened on, across revisions and reloads', async ({
    page,
    context,
  }) => {
    const problems = watchConsole(page);

    await signIn(context, await createSignedInUser('hunt'));
    await page.setViewportSize({ width: 1440, height: 900 });

    await startSession(page, 'A tool whose viewer keeps up');
    await completeInterview(page);
    await collectFor(page, 'constitution');

    await page.getByTestId('generate-spec').click();
    await expect(page.getByTestId('spec-card')).toBeVisible({ timeout: 40_000 });

    // Two revisions of the same file, so the Diff view has something to compare.
    await page.getByTestId('refine-instruction').fill('Add a note about non-goals.');
    await page.getByTestId('submit-refinement').click();
    await expect(page.getByTestId('diff-card')).toBeVisible({ timeout: 40_000 });
    await page.getByTestId('accept-diff').click();
    await expect(page.getByTestId('spec-revision-number')).toHaveText('2');

    const cards = page.locator('[data-testid="document-card"], [data-testid="spec-card"]');
    await expect(cards.first()).toBeVisible();

    // Open each revision in turn: the pane must show that one, not whichever loaded last.
    const count = await cards.count();
    for (let index = 0; index < count; index += 1) {
      const card = cards.nth(index);
      const revision = (await card.getByTestId('document-revision').innerText()).trim();

      await card.getByTestId('open-viewer').click();
      await expect(page.getByTestId('viewer-metric-revision')).toHaveText(revision);
      await expect(page.getByTestId('viewer-metric-lines')).toBeVisible();
    }

    // A reload closes the pane rather than restoring a stale one — and leaves the session usable.
    await page.reload();
    await expect(page.getByTestId('session')).toBeVisible();
    await expect(page.getByTestId('viewer-pane')).toHaveCount(0);
    await stillAlive(page, 'reloaded with the viewer having been open');

    expect(unexpected(problems)).toEqual([]);
  });
});

async function widthOf(page: Page, testId: string): Promise<number> {
  const box = await page.getByTestId(testId).boundingBox();

  return Math.round(box?.width ?? 0);
}
