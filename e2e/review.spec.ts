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

    // --- An overall outcome is stated (AC-3) ---
    await expect(page.getByTestId('review-outcome')).toHaveText('needs revision');

    // --- All three actions are offered, and the board waits for one of them (AC-4) ---
    await expect(page.getByTestId('review-accept')).toBeEnabled();
    await expect(page.getByTestId('review-ignore')).toBeEnabled();

    // --- Request-changes is disabled with nothing ticked (task 55 AC-3) ---
    await expect(page.getByTestId('review-request-changes')).toBeDisabled();
    await expect(page.getByTestId('review-selection-hint')).toBeVisible();

    // --- Ticking one item enables it, unticking disables it again ---
    await page.getByTestId('review-item-checkbox-mf-untestable-criterion').check();
    await expect(page.getByTestId('review-request-changes')).toBeEnabled();
    await page.getByTestId('review-item-checkbox-mf-untestable-criterion').uncheck();
    await expect(page.getByTestId('review-request-changes')).toBeDisabled();

    // --- The pending board survives a reload (FR-017 AC-4) ---
    await page.reload();
    await expect(page.getByTestId('review-board')).toBeVisible();
    await expect(page.getByTestId('review-request-changes')).toBeDisabled();

    // --- Accepting records the decision and clears the pending board (AC-5) ---
    await page.getByTestId('review-accept').click();
    await expect(page.getByTestId('review-board')).toHaveCount(0);
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

    // Tick one of the three — the subset is what the endpoint must record (AC-7).
    await page.getByTestId('review-item-checkbox-rec-example').check();
    await page.getByTestId('review-request-changes').click();

    // The stage goes back to drafting (AC-6), and the decided board is no longer pending.
    await expect(page.getByTestId('stage-substage')).toHaveText(/generate/);
    await expect(page.getByTestId('review-board')).toHaveCount(0);
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
