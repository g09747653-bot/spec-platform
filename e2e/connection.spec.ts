import { expect, test, type Page } from '@playwright/test';

import { createSignedInUser, reachDrafting, signIn, startSession } from './fixtures';

/**
 * The connection surface, the loader and the toasts (task 125; Эталон §1.5).
 *
 * **How the outage is produced.** Playwright aborts the page's requests rather than the suite
 * killing and restarting `next dev`. From the browser's side the two are the same event — a request
 * that does not reach the server — and only one of them is deterministic, re-runnable on three
 * engines, and safe to run alongside the rest of the suite on one port. Restoring the route is the
 * server coming back.
 *
 * The invariant of round 2 (Д-1) is asserted throughout: the surface must never be the thing
 * standing between the user and their session, which is why it is a banner rather than the
 * reference product's modal.
 */

/** Session-moving controls that are present and enabled — the Д-1 count, in miniature. */
async function liveControlCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const ids = ['ask-round', 'proceed', 'generate-spec', 'stop-generation', 'chat-send'];

    return ids.filter((id) => {
      const element = document.querySelector(`[data-testid="${id}"]`);
      return element !== null && !element.hasAttribute('disabled');
    }).length;
  });
}

test.describe('when the server stops answering', () => {
  /*
   * The other half of the contract, and the one that keeps the banner worth reading: a generation
   * the provider chain refused is a failure of the run, not of the connection.
   */
  test('a failed generation does not raise it', async ({ page, context }) => {
    await signIn(context, await createSignedInUser('connection-not-lost'));
    await startSession(page, 'A tool whose failures are told apart.');
    await reachDrafting(page);

    await page.route('**/api/sessions/*/generate', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/x-ndjson',
        body: `${JSON.stringify({
          type: 'error',
          code: 'GENERATION_FAILED',
          message: 'Generation did not complete. Your answers and approved specs are safe.',
          retryable: true,
        })}\n`,
      }),
    );

    await page.getByTestId('generate-spec').click();
    await expect(page.getByTestId('generation-error')).toBeVisible({ timeout: 20_000 });

    expect(await page.getByTestId('connection-lost').count()).toBe(0);
  });

  /*
   * The stream's own path into the banner: the reader cannot open the generation stream at all, ends
   * on `STREAM_DISCONNECTED`, and the same retry that already existed is what recovers — the resume
   * machinery, not a second one.
   *
   * **Why the stream and not a session request.** A session-moving POST re-reads the page the moment
   * it settles, and a re-read that *succeeds* is evidence the server is there — so the banner
   * correctly clears itself a moment after appearing, and asserting on it would be racing that. When
   * the re-read fails too, Next falls back to a full navigation, which reloads the page and resets
   * the client. Neither is a state a test can stand in; the reader's is, and the `checking` state
   * the Reconnect control produces is asserted in `connection.test.ts` where it is deterministic.
   */
  test('a generation that cannot reach the server raises it, and the retry clears it', async ({
    page,
    context,
  }) => {
    await signIn(context, await createSignedInUser('connection-stream'));
    await startSession(page, 'A tool whose reader reports what it knows.');
    await reachDrafting(page);

    await page.route('**/api/sessions/*/generate', (route) => route.abort('failed'), { times: 1 });

    await page.getByTestId('generate-spec').click();

    const banner = page.getByTestId('connection-lost');
    await expect(banner).toBeVisible({ timeout: 20_000 });
    /*
     * The reassurance is chosen from this state and from nothing else (task 143): `lost` is the
     * sentence that says a running generation carries on and everything approved is saved, `checking`
     * the one that says it is still trying. Reading the state is reading which of the two is on
     * screen, in either language.
     */
    await expect(banner).toHaveAttribute('data-connection-state', 'lost');
    await expect(page.getByTestId('connection-reconnect')).toBeEnabled();

    // Д-1: the banner is not a wall. The session's own controls are still there to press.
    expect(await liveControlCount(page)).toBeGreaterThan(0);

    // The card offers its own retry, and taking it is what proves nothing was broken but the socket.
    const retry = page.getByTestId('generate-spec');
    await expect(retry).toBeEnabled();
    await retry.click();

    await expect(page.getByTestId('spec-card')).toBeVisible({ timeout: 20_000 });
    await expect(banner).toHaveCount(0);
  });
});

test.describe('the brand loader', () => {
  /*
   * Asserted on **the stream the server sends**, not by racing the browser for a screenshot.
   *
   * The loader is the route's Suspense fallback, so it is emitted first and replaced by the session
   * as the server component resolves — both halves are in one response body, in that order. Holding
   * the network cannot produce that state (with nothing arriving, there is no shell to render the
   * fallback into), and a delay tuned to catch it on screen would be a test that passes on a cold
   * dev server and fails on a warm one. The order of the two markers in the payload is the fact.
   */
  test('is what a session route paints first, and is replaced by the session', async ({
    page,
    context,
  }) => {
    await signIn(context, await createSignedInUser('loader'));
    const url = await startSession(page, 'A tool that shows its own mark while it opens.');

    const response = await page.goto(url);
    const html = (await response?.text()) ?? '';

    const loaderAt = html.indexOf('data-testid="brand-loader"');
    const sessionAt = html.indexOf('data-testid="session"');

    expect(loaderAt, 'the session route served no loading fallback').toBeGreaterThanOrEqual(0);
    expect(sessionAt, 'the session never streamed in behind it').toBeGreaterThanOrEqual(0);
    expect(loaderAt, 'the loader did not come first').toBeLessThan(sessionAt);

    // Announced, not merely animated.
    expect(html.slice(loaderAt - 200, loaderAt)).toContain('aria-live="polite"');

    // And it is a fallback, not a state: what the user is left looking at is the session, live.
    await expect(page.getByTestId('session')).toBeVisible();
    await expect(page.getByTestId('brand-loader')).toHaveCount(0);
    expect(await liveControlCount(page)).toBeGreaterThan(0);
  });
});

test.describe('toasts', () => {
  test('announce an archive accessibly and can be dismissed', async ({ page, context }) => {
    await signIn(context, await createSignedInUser('toast-archive'));
    await startSession(page, 'A tool that confirms what it just did.');

    await page.getByTestId('back-to-project').click();
    await expect(page.getByTestId('chats-list')).toBeVisible();

    // The live region exists before the first message: one inserted with its message is a region
    // assistive technology was not watching yet.
    const viewport = page.getByTestId('toast-viewport');
    await expect(viewport).toHaveAttribute('aria-live', 'polite');

    await page.getByTestId('archive-chat').first().click();

    const toast = page.getByTestId('toast').first();
    await expect(toast).toBeVisible();
    // Which event was announced, not how it was worded — a restore raises the same tone (task 143).
    await expect(toast).toHaveAttribute('data-toast-kind', 'chat-archived');
    await expect(toast).toHaveAttribute('data-tone', 'success');

    await page.getByTestId('toast-dismiss').first().click();
    await expect(page.getByTestId('toast')).toHaveCount(0);
  });
});
