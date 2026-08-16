import { expect, test } from '@playwright/test';

import {
  createSignedInUser,
  draftAndApprove,
  reachDrafting,
  signIn,
  startSession,
} from './fixtures';

/**
 * The theme (task 124; Эталон §1.5 — dark/light through client-side storage).
 *
 * Three claims:
 *
 * - the choice **persists across reloads**, which is the acceptance criterion;
 * - it is applied **before the first paint** — the attribute is already right in the HTML the
 *   browser parses, so a dark-theme user never sees a white flash. This is asserted by disabling
 *   JavaScript entirely for the page load: with no React at all, the pre-hydration inline script is
 *   the only thing that could have set the attribute;
 * - a **smoke pass per theme**: the same journey a person walks renders and works in dark as it does
 *   in light. Every other suite runs in the default theme, so this is the second pass the AC asks
 *   for rather than a duplicate of them.
 */
const STORAGE_KEY = 'spec-platform-theme';

test.describe('the theme', () => {
  test('switches, persists across a reload, and is applied before paint', async ({
    page,
    context,
  }) => {
    const user = await createSignedInUser('theme-persist');
    await signIn(context, user);

    await page.goto('/projects');

    const html = page.locator('html');
    const toggle = page.getByTestId('theme-toggle');

    await expect(html).toHaveAttribute('data-theme', 'light');
    await expect(toggle).toHaveAttribute('data-theme-state', 'light');

    await toggle.click();
    await expect(html).toHaveAttribute('data-theme', 'dark');
    await expect(toggle).toHaveAttribute('data-theme-state', 'dark');

    expect(await page.evaluate((key) => localStorage.getItem(key), STORAGE_KEY)).toBe('dark');

    await page.reload();
    await expect(html).toHaveAttribute('data-theme', 'dark');
    await expect(toggle).toHaveAttribute('data-theme-state', 'dark');

    // Navigating elsewhere keeps it: the script runs on every hard load, and soft navigations never
    // touch the attribute.
    await page.goto('/projects');
    await expect(html).toHaveAttribute('data-theme', 'dark');

    await toggle.click();
    await expect(html).toHaveAttribute('data-theme', 'light');
    await page.reload();
    await expect(html).toHaveAttribute('data-theme', 'light');
  });

  test('serves an explicit theme in the HTML, before any script runs', async ({ browser }) => {
    /*
     * `javaScriptEnabled: false` runs nothing — not React, and not the inline script either. So this
     * cannot assert the script; what it asserts is the other half of the no-flash contract: the
     * document the server sends already carries an explicit `data-theme`, so nothing is ever painted
     * against an *absent* theme while the bundle loads.
     */
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();

    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    await context.close();
  });

  test('walks a stage in the dark theme', async ({ page, context }) => {
    const user = await createSignedInUser('theme-dark-walk');
    await signIn(context, user);

    // Seeded before the first paint of the session page, the way a returning user arrives.
    await context.addInitScript(
      ([key, value]) => {
        localStorage.setItem(key, value);
      },
      [STORAGE_KEY, 'dark'] as const,
    );

    await startSession(page, 'A tool for writing specifications, walked in the dark theme.');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await reachDrafting(page);
    await draftAndApprove(page);

    await expect(page.getByTestId('spec-card')).toContainText('approved');
    await expect(page.getByTestId('review-board')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });
});
