import { expect, test, type Page } from '@playwright/test';

import { createSignedInUser, reachDrafting, signIn } from './fixtures';

/**
 * Deciding by typing (task 62; FR-009 AC-6/AC-7; SC-14).
 *
 * Two claims, and they pull in opposite directions, which is why both are here: a plain decision
 * typed into chat must do exactly what the button does, and everything that is *not* a plain
 * decision must leave the card precisely where it was.
 */
async function draftASpec(page: Page): Promise<void> {
  await page.goto('/projects');
  await expect(page.getByTestId('create-project')).toBeEnabled();
  await page.getByTestId('prompt-input').fill('A tool that turns prompts into specifications');
  await page.getByTestId('create-project').click();
  await expect(page.getByTestId('session')).toBeVisible();

  await reachDrafting(page);
  await page.getByTestId('generate-spec').click();
  await expect(page.getByTestId('spec-card')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('approve-spec')).toBeVisible();
}

async function say(page: Page, message: string): Promise<void> {
  await page.getByTestId('chat-message').fill(message);
  await page.getByTestId('chat-send').click();
}

test.describe('deciding from chat', () => {
  test('a typed approval approves the file, exactly as the button does (AC-1)', async ({
    page,
    context,
  }) => {
    await signIn(context, await createSignedInUser('typist'));
    await draftASpec(page);

    await expect(page.getByTestId('spec-card')).toContainText('awaiting your decision');

    await say(page, 'approve it');

    // The same outcome the button produces: the revision is approved and the card says so.
    await expect(page.getByTestId('spec-card')).toContainText('approved');
    await expect(page.getByTestId('approve-spec')).toHaveCount(0);
    await expect(page.getByTestId('export-included')).toContainText('constitution.md');
  });

  test('a question is answered and the decision stays pending (AC-2; FR-009 AC-6)', async ({
    page,
    context,
  }) => {
    await signIn(context, await createSignedInUser('asker'));
    await draftASpec(page);

    await say(page, 'what is this file for?');

    // An answer arrives...
    await expect(page.getByTestId('chat-turn-assistant')).toBeVisible();
    // ...and the card is exactly where it was.
    await expect(page.getByTestId('approve-spec')).toBeVisible();
    await expect(page.getByTestId('spec-card')).toContainText('awaiting your decision');
    await expect(page.getByTestId('spec-revision-number')).toHaveText('1');
  });

  test('a near-decision does not decide (constitution P2)', async ({ page, context }) => {
    await signIn(context, await createSignedInUser('hesitant'));
    await draftASpec(page);

    for (const message of ['should I approve this?', 'maybe approve it', 'I might approve it']) {
      await say(page, message);
      await expect(page.getByTestId('approve-spec')).toBeVisible();
    }

    // Three near-misses later, the decision is still the user's to make.
    await expect(page.getByTestId('spec-card')).toContainText('awaiting your decision');

    // And the real thing still works, so the guards are refusing rather than broken.
    await say(page, 'approve it');
    await expect(page.getByTestId('spec-card')).toContainText('approved');
  });

  test('a typed decision survives a reload, because it changed persisted state', async ({
    page,
    context,
  }) => {
    await signIn(context, await createSignedInUser('reloader'));
    await draftASpec(page);

    await say(page, 'lgtm');
    await expect(page.getByTestId('spec-card')).toContainText('approved');

    await page.reload();
    await expect(page.getByTestId('spec-card')).toContainText('approved');
    await expect(page.getByTestId('approve-spec')).toHaveCount(0);
  });
});
