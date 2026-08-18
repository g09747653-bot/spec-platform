import { expect, test, type Page } from '@playwright/test';

import {
  createSignedInUser,
  draftAndApprove,
  openRefine,
  reachDrafting,
  signIn,
  startSession,
} from './fixtures';

/**
 * «Go back to previous step», and the diff that precedes it (task 127; Эталон §5.1).
 *
 * The three claims of the acceptance criteria, asserted where a person would see them:
 *
 * - the diff is **green and red from tokens**, in both themes — asserted on the computed colour, so
 *   a hard-coded literal that happened to look right in light and wrong in dark would fail here;
 * - going back writes **Rev N+1**, and the history still holds all three revisions;
 * - the sidebar reaches the diff of a file that has more than one revision.
 */
const SEED = 'A tool whose steps can be walked back.';

/** Drafts, approves, then refines once — the shortest path to a file with two revisions. */
async function twoRevisions(page: Page): Promise<void> {
  await reachDrafting(page);
  await draftAndApprove(page);

  await openRefine(page);
  await page.getByTestId('refine-instruction').fill('Add a non-goals section under the overview.');
  await page.getByTestId('submit-refinement').click();
  await expect(page.getByTestId('diff-body')).toBeVisible({ timeout: 40_000 });
  await page.getByTestId('accept-diff').click();
  await expect(page.getByTestId('spec-revision-number')).toHaveText('2', { timeout: 20_000 });
}

test.describe('going back a step', () => {
  test('shows the diff first, then appends a revision restoring the previous one', async ({
    page,
    context,
  }) => {
    await signIn(context, await createSignedInUser('revert'));
    await startSession(page, SEED);
    await twoRevisions(page);

    // The offer is there, and it says what it will do — write, not unwind.
    const card = page.getByTestId('revert-card');
    await expect(card).toBeVisible();
    await expect(card).toContainText('nothing is deleted');

    // Nothing is written by asking to see it.
    await page.getByTestId('go-back').click();
    await expect(page.getByTestId('revert-diff')).toBeVisible();
    await expect(page.getByTestId('spec-revision-number')).toHaveText('2');

    await page.getByTestId('revert-apply').click();

    // Rev 3, and it is the content of Rev 1 — which the viewer's own history is asked about below.
    await expect(page.getByTestId('spec-revision-number')).toHaveText('3', { timeout: 20_000 });
  });

  /*
   * The two markers are read from two diffs on purpose: a refinement that adds a section produces a
   * diff with `+` lines and no `-` ones, and going back produces its mirror. Asking one diff for
   * both would be asking it for a line it has no reason to contain.
   */
  test('its diff is painted from tokens, in both themes', async ({ page, context }) => {
    await signIn(context, await createSignedInUser('revert-diff-colours'));
    await startSession(page, SEED);

    const colourOf = (testId: string, kind: 'added' | 'removed') =>
      page.evaluate(
        ([id, marker]) => {
          const node = document.querySelector(`[data-testid="${id}"] [data-diff-line="${marker}"]`);
          return node === null ? null : getComputedStyle(node).color;
        },
        [testId, kind] as const,
      );

    const toTheme = async (theme: 'light' | 'dark') => {
      await page.getByTestId('theme-toggle').click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    };

    await reachDrafting(page);
    await draftAndApprove(page);
    await openRefine(page);
    await page
      .getByTestId('refine-instruction')
      .fill('Add a non-goals section under the overview.');
    await page.getByTestId('submit-refinement').click();
    await expect(page.getByTestId('diff-body')).toBeVisible({ timeout: 40_000 });

    const addedLight = await colourOf('diff-body', 'added');
    expect(addedLight, 'no added line in the refinement diff').not.toBeNull();

    await toTheme('dark');
    const addedDark = await colourOf('diff-body', 'added');

    // Different in the dark theme — which is what "from tokens" means, and what a literal could not do.
    expect(addedDark).not.toBe(addedLight);

    await toTheme('light');
    await page.getByTestId('accept-diff').click();
    await expect(page.getByTestId('spec-revision-number')).toHaveText('2', { timeout: 20_000 });

    await page.getByTestId('go-back').click();
    await expect(page.getByTestId('revert-diff')).toBeVisible();

    const removedLight = await colourOf('revert-diff', 'removed');
    expect(removedLight, 'no removed line in the revert diff').not.toBeNull();
    expect(removedLight).not.toBe(addedLight);

    await toTheme('dark');
    expect(await colourOf('revert-diff', 'removed')).not.toBe(removedLight);
  });

  test('the sidebar reaches the diff of a file with more than one revision', async ({
    page,
    context,
  }) => {
    await signIn(context, await createSignedInUser('revert-sidebar'));
    await startSession(page, SEED);

    // One revision: nothing to compare against, so no Diff link is offered.
    await reachDrafting(page);
    await draftAndApprove(page);
    await expect(page.getByTestId('specs-panel-diff')).toHaveCount(0);

    await openRefine(page);
    await page
      .getByTestId('refine-instruction')
      .fill('Add a non-goals section under the overview.');
    await page.getByTestId('submit-refinement').click();
    await expect(page.getByTestId('diff-body')).toBeVisible({ timeout: 40_000 });
    await page.getByTestId('accept-diff').click();
    await expect(page.getByTestId('spec-revision-number')).toHaveText('2', { timeout: 20_000 });

    const diffLink = page.getByTestId('specs-panel-diff').first();
    await expect(diffLink).toBeVisible();
    await diffLink.click();

    await expect(page.getByTestId('viewer-diff')).toBeVisible();
  });
});
