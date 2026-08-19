import { expect, test } from '@playwright/test';

import { LOCAL_SINGLE_USER_RUN } from './fixtures/local-mode';

/**
 * Task 148 — the local single-user deployment, asserted from outside.
 *
 * Every test here runs **only** when the suite drives the application with `LOCAL_SINGLE_USER=1`
 * (the `e2e-local` job; locally `LOCAL_SINGLE_USER=1 pnpm test:e2e`). With the flag off the file
 * skips itself: these claims are about the local deployment kind, and asserting them against an
 * OAuth deployment would test nothing.
 *
 * The mirror-image tests — the ones that assert the OAuth surface these claims replace — carry the
 * same guard the other way around (`smoke.spec.ts`, `skeleton.spec.ts`).
 */
test.describe('local single-user mode (task 148)', () => {
  test.skip(
    !LOCAL_SINGLE_USER_RUN,
    'asserts the local single-user deployment; this run drives the OAuth one',
  );

  test('opening the platform lands in the owner’s projects with no login step, before any script runs (AC-1)', async ({
    browser,
  }) => {
    /*
     * `javaScriptEnabled: false` is the claim's teeth: whatever lands on this page was decided and
     * rendered by the **server** — no client redirect, no script-made session, no hydration. A
     * cookieless request to `/` must arrive at the owner's project list as served HTML.
     */
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    try {
      await page.goto('/');

      await expect(page).toHaveURL(/\/projects$/);
      await expect(page.getByTestId('prompt-input')).toBeVisible();

      // The account slot names the mode; nothing offers to end a session that does not exist.
      await expect(page.getByTestId('account-local')).toBeVisible();
      await expect(page.getByTestId('sign-out')).toHaveCount(0);
      await expect(page.getByTestId('account-email')).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test('two anonymous visitors are the same owner — one machine, one person (task 148)', async ({
    browser,
  }) => {
    const name = `Локальный проект ${Date.now().toString(36)}`;

    const first = await browser.newContext();
    const second = await browser.newContext();

    try {
      const creator = await first.newPage();
      await creator.goto('/projects');
      await creator.getByTestId('prompt-input').fill(name);
      await creator.getByTestId('create-project').click();
      await creator.getByTestId('session').waitFor({ state: 'visible' });

      // A different browser context — different cookies, same deployment — sees the same list.
      const reader = await second.newPage();
      await reader.goto('/projects');
      await expect(reader.getByTestId('project-name').filter({ hasText: name })).toBeVisible();
    } finally {
      await first.close();
      await second.close();
    }
  });

  test('the OAuth surface refuses: its routes answer 404 and the sign-in screen is not rendered', async ({
    page,
  }) => {
    for (const path of ['/api/auth/session', '/api/auth/signin', '/api/auth/csrf']) {
      const response = await page.request.get(path);
      expect(response.status(), `${path} must answer 404`).toBe(404);
    }

    const signin = await page.goto('/signin');
    expect(signin?.status()).toBe(404);
    await expect(page.getByTestId('signin-google')).toHaveCount(0);
    await expect(page.getByTestId('signin-github')).toHaveCount(0);
  });
});
