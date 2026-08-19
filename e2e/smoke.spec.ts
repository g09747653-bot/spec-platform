import { expect, test } from '@playwright/test';

import { LOCAL_SINGLE_USER_RUN } from './fixtures/local-mode';

/**
 * Milestone 0 smoke test: the application boots and serves its placeholder route on every
 * supported browser engine (NFR-011 AC-1; SC-12).
 *
 * The critical journey `prompt → interview → four stages with approvals → ZIP download`
 * is added in task 23 and deepened thereafter.
 */
test('placeholder route renders on every supported engine', async ({ page }) => {
  // In local single-user mode `/` is the owner's doorstep, not a marketing page: it redirects to
  // the projects (task 148 AC-1), and the local-mode suite asserts that instead.
  test.skip(LOCAL_SINGLE_USER_RUN, 'local mode redirects `/` to the projects (task 148)');

  const response = await page.goto('/');

  expect(response?.status()).toBe(200);
  await expect(page.getByTestId('app-heading')).toHaveText('Spec Platform');
  await expect(page).toHaveTitle(/Spec Platform/);
});
