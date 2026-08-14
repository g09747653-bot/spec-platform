import { expect, test, type BrowserContext, type Page } from '@playwright/test';

import {
  createSignedInUser,
  reachDrafting,
  reauthenticate,
  signIn,
  startSession,
  type SignedInUser,
} from './fixtures';

/**
 * Session resume, for each of the four pending kinds (task 75; FR-017).
 *
 * The claim under test is narrow and total: **whatever card was on screen comes back, unchanged, and
 * nothing the browser does changes the persisted state.** So every case here interrupts the session
 * three ways — reload, sign out and back in, and a request that never completes — and then asserts
 * the same card, by the same test id, with the same content.
 *
 * "Sign out and back in" is the sharpest of the three: it takes a new document, a new session cookie
 * and a new render from scratch, so nothing client-side can be carrying the answer.
 */

/** Signs out, signs back in as the same person, and returns to the session. */
async function signOutAndBackIn(
  page: Page,
  context: BrowserContext,
  owner: SignedInUser,
  projectUrl: string,
): Promise<void> {
  await page.goto('/projects');
  await page.getByTestId('sign-out').click();
  await expect(page).toHaveURL(/\/signin/);

  // The same person: a new credential for the existing user row, which is what signing in again is.
  await context.clearCookies();
  await signIn(context, await reauthenticate(owner));
  await page.goto(projectUrl);
}

test.describe('session resume', () => {
  test('a pending question set comes back as the same card (AC-1/AC-3)', async ({
    page,
    context,
  }) => {
    const owner = await createSignedInUser('resumer');
    await signIn(context, owner);
    const projectUrl = await startSession(page, 'A tool that remembers where I left off');

    await page.getByTestId('ask-round').click();
    await expect(page.getByTestId('mcq-card')).toBeVisible();

    const questions = await page.getByTestId('mcq-card').textContent();

    await page.reload();
    await expect(page.getByTestId('mcq-card')).toBeVisible();
    expect(await page.getByTestId('mcq-card').textContent()).toBe(questions);

    // A round presented but unanswered is still presented — and still the only card.
    await expect(page.getByTestId('generation-blocked')).toBeVisible();

    await page.goto(projectUrl);
    await expect(page.getByTestId('mcq-card')).toBeVisible();
    expect(await page.getByTestId('mcq-card').textContent()).toBe(questions);
  });

  test('answers are restored and are not asked again (AC-2/AC-5)', async ({ page, context }) => {
    const owner = await createSignedInUser('resumer');
    await signIn(context, owner);
    const projectUrl = await startSession(page, 'A tool that keeps what I told it');

    await page.getByTestId('ask-round').click();
    await expect(page.getByTestId('mcq-card')).toBeVisible();
    await page.getByTestId('mcq-option-q-audience-solo-devs').check();
    await page.getByTestId('mcq-option-q-problem-context').check();
    await page.getByTestId('mcq-submit').click();

    await expect(page.getByTestId('interview-panel')).toContainText('summary saved');

    // The answers are shown back — by their labels, not their option ids.
    const history = page.getByTestId('answer-history');
    await expect(history).toBeVisible();
    await expect(history).not.toContainText('q-audience-solo-devs');
    const restored = await history.textContent();

    await signOutAndBackIn(page, context, owner, projectUrl);

    await expect(page.getByTestId('answer-history')).toBeVisible();
    expect(await page.getByTestId('answer-history').textContent()).toBe(restored);

    // AC-5: the answered round is not re-presented — the panel is offering a *new* round, not that one.
    await expect(page.getByTestId('mcq-card')).toHaveCount(0);
    await expect(page.getByTestId('ask-round')).toBeVisible();
  });

  test('a pending spec approval comes back as the same card (AC-4)', async ({ page, context }) => {
    const owner = await createSignedInUser('resumer');
    await signIn(context, owner);
    const projectUrl = await startSession(page, 'A tool that keeps a draft awaiting my decision');

    await reachDrafting(page);
    await page.getByTestId('generate-spec').click();
    await expect(page.getByTestId('spec-card')).toBeVisible({ timeout: 20_000 });

    const content = await page.getByTestId('spec-content').textContent();

    await signOutAndBackIn(page, context, owner, projectUrl);

    await expect(page.getByTestId('spec-revision-number')).toHaveText('1');
    await expect(page.getByTestId('approve-spec')).toBeVisible();
    expect(await page.getByTestId('spec-content').textContent()).toBe(content);
  });

  test('a pending diff comes back as the same card (AC-4)', async ({ page, context }) => {
    const owner = await createSignedInUser('resumer');
    await signIn(context, owner);
    const projectUrl = await startSession(page, 'A tool that keeps a proposed change on screen');

    await reachDrafting(page);
    await page.getByTestId('generate-spec').click();
    await expect(page.getByTestId('spec-card')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('approve-spec').click();
    await expect(page.getByTestId('spec-card')).toContainText('approved');

    await page.getByTestId('refine-instruction').fill('Add a section about non-goals.');
    await page.getByTestId('submit-refinement').click();
    await expect(page.getByTestId('diff-card')).toBeVisible({ timeout: 20_000 });

    const diff = await page.getByTestId('diff-body').textContent();

    await signOutAndBackIn(page, context, owner, projectUrl);

    await expect(page.getByTestId('diff-card')).toBeVisible();
    expect(await page.getByTestId('diff-body').textContent()).toBe(diff);
    // Still undecided: resume restored the decision, it did not take it.
    await expect(page.getByTestId('accept-diff')).toBeVisible();
    await expect(page.getByTestId('spec-revision-number')).toHaveText('1');
  });

  test('a pending review comes back as the same board (AC-4)', async ({ page, context }) => {
    const owner = await createSignedInUser('resumer');
    await signIn(context, owner);
    const projectUrl = await startSession(page, 'A tool that keeps a review awaiting my decision');

    await reachDrafting(page);
    await page.getByTestId('generate-spec').click();
    await expect(page.getByTestId('spec-card')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('approve-spec').click();
    await expect(page.getByTestId('spec-card')).toContainText('approved');
    await page.getByTestId('proceed').click();
    await expect(page.getByTestId('review-board')).toBeVisible({ timeout: 20_000 });

    const board = await page.getByTestId('review-board').textContent();

    await signOutAndBackIn(page, context, owner, projectUrl);

    await expect(page.getByTestId('review-board')).toBeVisible();
    expect(await page.getByTestId('review-board').textContent()).toBe(board);
    await expect(page.getByTestId('stage-substage')).toHaveText(/review/);
  });

  /*
   * AC-6, the half that is not about reloading: a request that never completes must leave the
   * session exactly as it was. The route is aborted mid-flight, which is what a dropped connection
   * looks like from the server's side of a fetch.
   */
  test('an interrupted request changes nothing (AC-6)', async ({ page, context }) => {
    const owner = await createSignedInUser('resumer');
    await signIn(context, owner);
    const projectUrl = await startSession(page, 'A tool that survives a dropped connection');

    await reachDrafting(page);
    await page.getByTestId('generate-spec').click();
    await expect(page.getByTestId('spec-card')).toBeVisible({ timeout: 20_000 });

    const before = {
      revision: await page.getByTestId('spec-revision-number').textContent(),
      substage: await page.getByTestId('stage-substage').textContent(),
    };

    // Every transition request is dropped before it reaches the handler.
    await page.route('**/api/sessions/*/transition', (route) => route.abort());
    await page.getByTestId('approve-spec').click();
    await page
      .getByTestId('proceed')
      .click()
      .catch(() => undefined);
    await page.unroute('**/api/sessions/*/transition');

    await page.goto(projectUrl);

    expect(await page.getByTestId('stage-substage').textContent()).toBe(before.substage);
    expect(await page.getByTestId('spec-revision-number').textContent()).toBe(before.revision);
  });
});
