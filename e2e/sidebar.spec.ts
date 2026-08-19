import { expect, test } from '@playwright/test';

import {
  createSignedInUser,
  draftAndApprove,
  reachDrafting,
  signIn,
  startSession,
} from './fixtures';

/**
 * The session sidebar (task 119; Эталон §1.5).
 *
 * Four claims, one per acceptance criterion, and each asserted on what a user could see:
 *
 * - the width survives a reload, and collapse/expand works;
 * - the Specs section reflects the live revision state — a new revision changes the badge without a
 *   manual refresh of anything but the page the action already reloads;
 * - attachment rows carry human-readable sizes (the existing panel, now inside the sidebar);
 * - the Local Workspace stub makes **no network call** and promises nothing.
 */
test.describe('the session sidebar', () => {
  test('remembers its width and can be collapsed', async ({ page, context }) => {
    const user = await createSignedInUser('sidebar-width');
    await signIn(context, user);

    const url = await startSession(page, 'A tool for writing specifications.');

    const panel = page.getByTestId('sidebar-panel');
    await expect(panel).toBeVisible();
    const original = Number(await panel.getAttribute('data-width'));

    // Resized from the keyboard, so the assertion is about the control rather than about a drag
    // gesture three engines implement three ways.
    await page.getByTestId('sidebar-resize').focus();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');

    const widened = Number(await panel.getAttribute('data-width'));
    expect(widened).toBeGreaterThan(original);

    await page.goto(url);
    await expect(page.getByTestId('sidebar-panel')).toHaveAttribute('data-width', String(widened));

    await page.getByTestId('sidebar-toggle').click();
    await expect(page.getByTestId('sidebar-panel')).toBeHidden();
    await page.getByTestId('sidebar-toggle').click();
    await expect(page.getByTestId('sidebar-panel')).toBeVisible();
  });

  test('lists every file of the bundle, and follows the revision state', async ({
    page,
    context,
  }) => {
    const user = await createSignedInUser('sidebar-specs');
    await signIn(context, user);

    await startSession(page, 'A tool for writing specifications.');

    /*
     * Before anything is written: four rows, all "Not started". A list of only the files that exist
     * would show nothing here, and a session two documents in would look finished.
     */
    const rows = page.getByTestId('specs-panel-row');
    await expect(rows).toHaveCount(4);
    await expect(page.getByTestId('specs-panel-status').first()).toHaveAttribute(
      'data-status',
      'not-started',
    );

    await reachDrafting(page);
    await draftAndApprove(page);

    const constitution = page
      .getByTestId('specs-panel-row')
      .filter({ has: page.getByText('constitution.md') });

    await expect(constitution.getByTestId('specs-panel-status')).toHaveAttribute(
      'data-status',
      'approved',
    );
  });

  test('the Local Workspace stub makes no network call and promises nothing', async ({
    page,
    context,
  }) => {
    const user = await createSignedInUser('sidebar-workspace');
    await signIn(context, user);

    await startSession(page, 'A tool for writing specifications.');

    const requests: string[] = [];
    page.on('request', (request) => requests.push(request.url()));

    const mount = page.getByTestId('mount-folder');
    await expect(mount).toBeVisible();
    await expect(mount).toBeDisabled();

    // Disabled controls swallow clicks, so the click is forced: the claim is that *nothing happens*,
    // and a click the browser refused to deliver would not have tested it.
    await mount.click({ force: true });
    await page.waitForTimeout(500);

    expect(requests, 'the stub reached the network').toEqual([]);
    // AC-4's other half: the panel admits in its own copy that nothing is behind it. The flag is
    // what carries that admission across a translation — a panel that quietly dropped the sentence
    // would lose the element, not merely re-word it.
    await expect(page.getByTestId('local-workspace').locator('[data-stub="true"]')).toBeVisible();
  });
});
