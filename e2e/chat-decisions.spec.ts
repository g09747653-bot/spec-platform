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

    await expect(page.getByTestId('spec-card')).toHaveAttribute('data-approved', 'false');

    await say(page, 'approve it');

    // The same outcome the button produces: the revision is approved and the card says so.
    await expect(page.getByTestId('spec-card')).toHaveAttribute('data-approved', 'true');
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
    await expect(page.getByTestId('spec-card')).toHaveAttribute('data-approved', 'false');
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
    await expect(page.getByTestId('spec-card')).toHaveAttribute('data-approved', 'false');

    // And the real thing still works, so the guards are refusing rather than broken.
    await say(page, 'approve it');
    await expect(page.getByTestId('spec-card')).toHaveAttribute('data-approved', 'true');
  });

  test('a typed decision survives a reload, because it changed persisted state', async ({
    page,
    context,
  }) => {
    await signIn(context, await createSignedInUser('reloader'));
    await draftASpec(page);

    await say(page, 'lgtm');
    await expect(page.getByTestId('spec-card')).toHaveAttribute('data-approved', 'true');

    await page.reload();
    await expect(page.getByTestId('spec-card')).toHaveAttribute('data-approved', 'true');
    await expect(page.getByTestId('approve-spec')).toHaveCount(0);
  });
  /**
   * Task 109 — the composer is live at every position, and asking does not move anything.
   *
   * The M4 suite proved chat could decide a *spec card*. In a chat-first session the composer is on
   * screen the whole way through, so the claim has to hold at the positions the user actually
   * spends time in — and the sharpest of those is a review, where a question and a decision look
   * very much alike.
   */
  test('a question asked mid-review answers without moving the session (AC-1)', async ({
    page,
    context,
  }) => {
    test.slow();

    await signIn(context, await createSignedInUser('mid-review'));
    await draftASpec(page);

    await page.getByTestId('approve-spec').click();
    await expect(page.getByTestId('spec-card')).toHaveAttribute('data-approved', 'true');
    await page.getByTestId('proceed').click();
    await expect(page.getByTestId('review-board')).toBeVisible({ timeout: 20_000 });

    const before = {
      stage: await page.getByTestId('stage-current').textContent(),
      substage: await page.getByTestId('stage-substage').textContent(),
      revision: await page.getByTestId('spec-revision-number').textContent(),
    };

    await say(page, 'what should I pick here?');
    await expect(page.getByTestId('chat-turn-assistant')).toBeVisible({ timeout: 20_000 });

    // The position is untouched, and so is the board: a question is not a decision.
    expect(await page.getByTestId('stage-current').textContent()).toBe(before.stage);
    expect(await page.getByTestId('stage-substage').textContent()).toBe(before.substage);
    expect(await page.getByTestId('spec-revision-number').textContent()).toBe(before.revision);
    await expect(page.getByTestId('review-board')).toBeVisible();
    await expect(page.getByTestId('review-accept')).toBeEnabled();

    // …and it survives a reload as what it is: a turn of this visit, not a persisted decision.
    await page.reload();
    await expect(page.getByTestId('review-board')).toBeVisible();
    expect(await page.getByTestId('stage-substage').textContent()).toBe(before.substage);
  });

  /**
   * The M4 contract, extended to the card M7п put in the feed: a review decided by typing lands the
   * same persisted state as the button, because it is the same endpoint on the same input.
   */
  test('a decision phrase decides the review, exactly as the button does (AC-2)', async ({
    page,
    context,
  }) => {
    test.slow();

    await signIn(context, await createSignedInUser('typed-review'));
    await draftASpec(page);

    await page.getByTestId('approve-spec').click();
    await expect(page.getByTestId('spec-card')).toHaveAttribute('data-approved', 'true');
    await page.getByTestId('proceed').click();
    await expect(page.getByTestId('review-board')).toBeVisible({ timeout: 20_000 });

    await say(page, 'accept the review');

    await expect(page.getByTestId('review-board')).toHaveCount(0, { timeout: 20_000 });
    // The decided card carries the decision the row holds (task 112), read as the table spells it
    // rather than as the sentence the card puts it in (task 143); the fact asserted is the same.
    await expect(page.getByTestId('review-decision')).toHaveAttribute('data-decision', 'accept');

    // The gate the decision opens is open — which is the whole point of it being the same write.
    await expect(page.getByTestId('proceed')).toBeEnabled();
    await page.reload();
    await expect(page.getByTestId('review-decision')).toHaveAttribute('data-decision', 'accept');
  });

  /** The composer is never the thing that is disabled — that is the liveness invariant's floor. */
  test('the composer stays usable while a reply is still arriving (AC-3)', async ({
    page,
    context,
  }) => {
    await signIn(context, await createSignedInUser('streamer'));
    await draftASpec(page);

    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });

    await page.route(
      '**/api/sessions/*/messages',
      async (route) => {
        await held;
        await route.continue();
      },
      { times: 1 },
    );

    await page.getByTestId('chat-message').fill('what does this file do?');
    await page.getByTestId('chat-send').click();

    // Send waits for its own request; the box beside it does not, and neither does the card.
    await expect(page.getByTestId('chat-send')).toBeDisabled();
    await expect(page.getByTestId('chat-message')).toBeEnabled();
    await expect(page.getByTestId('approve-spec')).toBeEnabled();

    release();
    await expect(page.getByTestId('chat-turn-assistant')).toBeVisible({ timeout: 20_000 });

    /*
     * Send comes back once the reply has *finished* — the turn above appears on the first delta,
     * which is the point of streaming, so its visibility says the answer started rather than ended.
     * The box is what has to hold something for Send to be offered at all: it is empty, not busy.
     */
    await page.getByTestId('chat-message').fill('and another thing');
    await expect(page.getByTestId('chat-send')).toBeEnabled({ timeout: 20_000 });
  });
});
