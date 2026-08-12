import { expect, test } from '@playwright/test';

/**
 * Milestone 0 smoke test: the application boots and serves its placeholder route on every
 * supported browser engine (NFR-011 AC-1; SC-12).
 *
 * The critical journey `prompt → interview → four stages with approvals → ZIP download`
 * is added in task 23 and deepened thereafter.
 */
test('placeholder route renders on every supported engine', async ({ page }) => {
  const response = await page.goto('/');

  expect(response?.status()).toBe(200);
  await expect(page.getByTestId('app-heading')).toHaveText('Spec Platform');
  await expect(page).toHaveTitle(/Spec Platform/);
});
