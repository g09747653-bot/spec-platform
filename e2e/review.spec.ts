import { expect, test, type Page } from '@playwright/test';

import {
  createSignedInUser,
  pendingReviewIdFor,
  reachDrafting,
  signIn,
  startSession as startProjectSession,
} from './fixtures';

/**
 * The review board, end to end (tasks 55 and 56; FR-010).
 *
 * The board is a decision surface, and its acceptance criteria are about what the *user* can and
 * cannot do — three actions, request-changes only with something ticked, and a subset that is
 * genuinely a subset. Those are claims about rendered controls, so they are asserted here rather
 * than in a unit test; the unit suite covers the endpoint, the gate and the artifact contract.
 *
 * Driven against the deterministic stub provider, whose review document carries two blocking items
 * and one advisory item — enough for "some but not all" to mean something.
 */

/**
 * Draft, approve, then walk through the door into `review`.
 *
 * The last step is deliberate rather than incidental: approving *permits* `generate → review`
 * (FR-009 AC-3) and **entering** review is what produces the feedback (FR-010 AC-1). A flow that
 * conjured the board at approval time would be showing a review from a position the state machine
 * says the session is not in.
 */
async function generateApproveAndEnterReview(page: Page): Promise<void> {
  await reachDrafting(page);

  await page.getByTestId('generate-spec').click();
  await expect(page.getByTestId('spec-card')).toBeVisible({ timeout: 20_000 });

  /*
   * The door is shut until the draft is approved, and it says what is missing. The control itself
   * stays clickable — the gate is the server's answer, never the page's (P1; task 105) — so what is
   * asserted is the reason on offer, not a disabled attribute.
   */
  await expect(page.getByTestId('gate-unmet')).toContainText('approval');

  await page.getByTestId('approve-spec').click();
  await expect(page.getByTestId('spec-card')).toContainText('approved');

  await expect(page.getByTestId('proceed')).toBeEnabled();
  await page.getByTestId('proceed').click();
  await expect(page.getByTestId('stage-substage')).toHaveText(/review/);
}

const startSession = (page: Page): Promise<string> =>
  startProjectSession(page, 'A tool that reviews specifications automatically');

test.describe('review board', () => {
  test('entering review produces a review the user must decide (FR-010 AC-1..AC-5)', async ({
    page,
    context,
  }) => {
    await signIn(context, await createSignedInUser('reviewer'));
    await startSession(page);
    await generateApproveAndEnterReview(page);

    // --- The review is generated for the approved file and presented (AC-1) ---
    await expect(page.getByTestId('review-board')).toBeVisible();

    // --- Blocking and advisory findings are rendered separately (AC-2) ---
    await expect(page.getByTestId('review-mustfix')).toBeVisible();
    await expect(page.getByTestId('review-recommendations')).toBeVisible();
    await expect(page.getByTestId('review-mustfix').getByRole('checkbox')).toHaveCount(2);
    await expect(page.getByTestId('review-recommendations').getByRole('checkbox')).toHaveCount(1);

    // --- An overall verdict and a summary are stated (AC-3; task 112) ---
    await expect(page.getByTestId('review-outcome')).toHaveText('Needs Revision');
    await expect(page.getByTestId('review-summary')).toBeVisible();

    // --- Every item carries its confidence and its suggestion (Эталон §1.3) ---
    await expect(page.getByTestId('review-item-confidence-mf-untestable-criterion')).toHaveText(
      'Confidence score 9/10',
    );
    await expect(page.getByTestId('review-item-suggestion-mf-untestable-criterion')).toContainText(
      'Suggestion:',
    );

    // --- All three actions are offered, and the board waits for one of them (AC-4) ---
    await expect(page.getByTestId('review-accept')).toBeEnabled();
    await expect(page.getByTestId('review-ignore')).toBeEnabled();

    /*
     * --- The defaults are the parity behaviour (task 112) ---
     *
     * Must Fix arrives ticked and Recommendations does not, so Request changes is live from the
     * first paint. Until M8п the card arrived entirely unticked, which made the control something
     * the user had to earn before they could see what it did.
     */
    await expect(page.getByTestId('review-item-checkbox-mf-untestable-criterion')).toBeChecked();
    await expect(page.getByTestId('review-item-checkbox-mf-unnamed-actor')).toBeChecked();
    await expect(page.getByTestId('review-item-checkbox-rec-example')).not.toBeChecked();
    await expect(page.getByTestId('review-request-changes')).toBeEnabled();

    // --- Unticking everything disables it again, and says why (task 55 AC-3) ---
    await page.getByTestId('review-item-checkbox-mf-untestable-criterion').uncheck();
    await page.getByTestId('review-item-checkbox-mf-unnamed-actor').uncheck();
    await expect(page.getByTestId('review-request-changes')).toBeDisabled();
    await expect(page.getByTestId('review-selection-hint')).toBeVisible();

    // --- The pending board survives a reload, defaults and all (FR-017 AC-4) ---
    await page.reload();
    await expect(page.getByTestId('review-board')).toBeVisible();
    await expect(page.getByTestId('review-item-checkbox-mf-untestable-criterion')).toBeChecked();

    // --- Accepting records the decision and clears the pending board (AC-5) ---
    await page.getByTestId('review-accept').click();
    await expect(page.getByTestId('review-board')).toHaveCount(0);

    /*
     * --- And the decided board stays in the feed as history (task 112) ---
     *
     * Accept applies nothing, so it records no selection — the table stores `NULL` for it by
     * constraint — and the card says what was decided rather than showing tick marks nobody kept.
     */
    await expect(page.getByTestId('review-board-decided')).toBeVisible();
    await expect(page.getByTestId('review-decision')).toContainText('accepted');
    await expect(page.getByTestId('review-mustfix').getByRole('checkbox')).toHaveCount(0);

    await page.reload();
    await expect(page.getByTestId('review-board-decided')).toBeVisible();
    await expect(page.getByTestId('review-decision')).toContainText('accepted');
  });

  test('request-changes submits only the ticked items and returns the stage to generate (AC-6/AC-7)', async ({
    page,
    context,
  }) => {
    await signIn(context, await createSignedInUser('selector'));
    await startSession(page);
    await generateApproveAndEnterReview(page);

    await expect(page.getByTestId('review-board')).toBeVisible();
    await expect(page.getByTestId('stage-substage')).toHaveText(/review/);

    // One of the three, and not the two that arrive ticked — the subset is what the endpoint must
    // record (AC-7), and a subset that happened to be the default would prove nothing.
    await page.getByTestId('review-item-checkbox-mf-untestable-criterion').uncheck();
    await page.getByTestId('review-item-checkbox-mf-unnamed-actor').uncheck();
    await page.getByTestId('review-item-checkbox-rec-example').check();
    await page.getByTestId('review-request-changes').click();

    // The stage goes back to drafting (AC-6), and the decided board is no longer pending.
    await expect(page.getByTestId('stage-substage')).toHaveText(/generate/);
    await expect(page.getByTestId('review-board')).toHaveCount(0);

    /*
     * --- The ticks travel with the decision and are frozen in history (task 112) ---
     *
     * Exactly the one that was ticked, still ticked, still disabled, after a reload. This is the
     * only decision that carries a selection, so it is the only one with a tick state to keep.
     */
    await page.reload();
    await expect(page.getByTestId('review-board-decided')).toBeVisible();
    await expect(page.getByTestId('review-item-checkbox-rec-example')).toBeChecked();
    await expect(page.getByTestId('review-item-checkbox-rec-example')).toBeDisabled();
    await expect(
      page.getByTestId('review-item-checkbox-mf-untestable-criterion'),
    ).not.toBeChecked();
  });

  test('ignoring is a decision too, and it is not the same as accepting (AC-4/AC-5)', async ({
    page,
    context,
  }) => {
    await signIn(context, await createSignedInUser('ignorer'));
    await startSession(page);
    await generateApproveAndEnterReview(page);

    await expect(page.getByTestId('review-board')).toBeVisible();
    await page.getByTestId('review-ignore').click();

    await expect(page.getByTestId('review-board')).toHaveCount(0);
    // The stage stays where it was: a decision opens the gate, it does not walk through it.
    await expect(page.getByTestId('stage-substage')).toHaveText(/review/);
  });

  test("another user cannot decide someone else's review (AR-2)", async ({ page, context }) => {
    const owner = await createSignedInUser('owner');
    await signIn(context, owner);
    await startSession(page);
    await generateApproveAndEnterReview(page);
    await expect(page.getByTestId('review-board')).toBeVisible();

    const reviewId = await pendingReviewIdFor(owner.userId);

    const intruder = await createSignedInUser('intruder');
    const intruderContext = await page.context().browser()?.newContext();
    if (intruderContext === undefined) throw new Error('could not open a second browser context');

    try {
      await signIn(intruderContext, intruder);

      const owned = await intruderContext.request.post(`/api/reviews/${reviewId}/decision`, {
        data: { decision: 'accept' },
      });
      const imaginary = await intruderContext.request.post(
        '/api/reviews/11111111-2222-3333-4444-555555555555/decision',
        { data: { decision: 'accept' } },
      );

      // A real review owned by someone else answers exactly as one that does not exist.
      expect(owned.status()).toBe(404);
      expect(imaginary.status()).toBe(404);
      expect(await owned.text()).toBe(await imaginary.text());
    } finally {
      await intruderContext.close();
    }

    // And the owner's review is still pending — the refused call changed nothing.
    await page.reload();
    await expect(page.getByTestId('review-board')).toBeVisible();
  });
});
