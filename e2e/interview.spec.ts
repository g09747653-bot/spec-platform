import { expect, test } from '@playwright/test';

import { createSignedInUser, signIn } from './fixtures';

/**
 * Milestone 2 end to end: real gates and the MCQ interview drive the flow.
 *
 * The journey this pins: a fresh session cannot leave the interview (the gate names what is
 * missing), a question round is asked and survives a reload, answering it satisfies needs and
 * persists the summary, the same gate then opens, and the next stage runs its own collection
 * before drafting is reachable. Everything runs against the deterministic stub provider — no
 * model call anywhere (NFR-012 AC-5).
 */
test.describe('workflow gates and the structured interview', () => {
  test('interview → constitution: gated exit, MCQ round, reload-safe card, per-stage collection', async ({
    page,
    context,
  }) => {
    const owner = await createSignedInUser('interviewee');
    await signIn(context, owner);

    await page.goto('/projects');
    // Hydration first (D-28): filling before React subscribes loses the state on WebKit.
    await expect(page.getByTestId('create-project')).toBeEnabled();
    await page
      .getByTestId('prompt-input')
      .fill('A hosted platform that turns a prompt into an agent-ready spec bundle');
    await page.getByTestId('create-project').click();

    await expect(page.getByTestId('session')).toBeVisible();
    await expect(page.getByTestId('stage-current')).toHaveText(/Interview/);

    // --- The exit is shut and says why (FR-006 AC-2; task 29: 409 + machine-readable reason) ---
    await expect(page.getByTestId('interview-panel')).toBeVisible();
    await expect(page.getByTestId('gate-unmet')).toContainText('one answered question round');
    await page.getByTestId('proceed').click();
    await expect(page.getByTestId('interview-notice')).toBeVisible();
    await expect(page.getByTestId('stage-current')).toHaveText(/Interview/);

    // --- Asking presents a validated MCQ card (FR-005 AC-1/AC-2) ---
    await page.getByTestId('ask-round').click();
    await expect(page.getByTestId('mcq-card')).toBeVisible();

    // Exactly one free-text escape per question (FR-005 AC-3; task 34 AC).
    await expect(page.getByTestId('mcq-question-q-audience')).toBeVisible();
    await expect(
      page.getByTestId('mcq-question-q-audience').locator('[data-testid^="mcq-other-"]'),
    ).toHaveCount(1);
    await expect(
      page.getByTestId('mcq-question-q-problem').locator('[data-testid^="mcq-other-"]'),
    ).toHaveCount(1);

    // While the card waits, generation is blocked in this interaction (task 34; FR-005 AC-4).
    await expect(page.getByTestId('generation-blocked')).toBeVisible();
    await expect(page.getByTestId('generate-spec')).toHaveCount(0);

    // --- The same card comes back after a reload (FR-017 AC-3) ---
    await page.reload();
    await expect(page.getByTestId('mcq-card')).toBeVisible();
    await expect(page.getByTestId('mcq-question-q-audience')).toBeVisible();

    // --- Answering: one radio, one checkbox set, one free-text escape (FR-005 AC-5) ---
    await page.getByTestId('mcq-option-q-audience-solo-devs').check();
    await page.getByTestId('mcq-option-q-problem-context').check();
    await page.getByTestId('mcq-other-q-problem').fill('and no export formats to speak of');
    await page.getByTestId('mcq-submit').click();

    // The panel reflects persisted state: a round answered, the summary saved (task 38).
    await expect(page.getByTestId('interview-panel')).toBeVisible();
    await expect(page.getByTestId('interview-panel')).toContainText('1 of 3 question rounds');
    await expect(page.getByTestId('interview-panel')).toContainText('summary saved');

    // --- The gate that refused now permits (FR-006 AC-3; task 38) ---
    await page.getByTestId('proceed').click();
    await expect(page.getByTestId('stage-current')).toHaveText(/Constitution/);
    await expect(page.getByTestId('stage-substage')).toHaveText(/collect/);

    // --- The next stage collects for itself (FR-007 AC-2: rounds are per stage) ---
    await expect(page.getByTestId('gate-unmet')).toContainText('answered question round');
    await page.getByTestId('ask-round').click();
    await expect(page.getByTestId('mcq-card')).toBeVisible();
    await page.getByTestId('mcq-option-q-constitution-scope-strict').check();
    await page.getByTestId('mcq-submit').click();

    await expect(page.getByTestId('interview-panel')).toBeVisible();
    await page.getByTestId('proceed').click();
    await expect(page.getByTestId('stage-substage')).toHaveText(/generate/);

    // --- At generate, the drafting path is open again (no pending card), and it streams ---
    await expect(page.getByTestId('generate-spec')).toBeVisible();
    await page.getByTestId('generate-spec').click();
    await expect(page.getByTestId('spec-card')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('spec-file-name')).toHaveText('constitution.md');
  });

  test('a reply in free text yields a narrower follow-up instead of dismissal (FR-005 AC-6)', async ({
    page,
    context,
  }) => {
    const owner = await createSignedInUser('replier');
    await signIn(context, owner);

    await page.goto('/projects');
    await expect(page.getByTestId('create-project')).toBeEnabled();
    await page.getByTestId('prompt-input').fill('An idea answered mostly in free text');
    await page.getByTestId('create-project').click();
    await expect(page.getByTestId('session')).toBeVisible();

    // Round 1 answered through the card.
    await page.getByTestId('ask-round').click();
    await page.getByTestId('mcq-option-q-audience-solo-devs').check();
    await page.getByTestId('mcq-option-q-problem-context').check();
    await page.getByTestId('mcq-submit').click();
    await expect(page.getByTestId('interview-panel')).toContainText('1 of 3');

    // Round 2 answered by replying instead of submitting the card (task 36).
    await page.getByTestId('ask-round').click();
    await expect(page.getByTestId('mcq-card')).toBeVisible();
    await page.getByTestId('mcq-reply-toggle').click();
    await page
      .getByTestId('mcq-reply-text')
      .fill('Success is a bundle an agent can build from without rewriting.');
    await page.getByTestId('mcq-reply-send').click();

    // The narrower follow-up replaces the card — the reply was not silently dismissed.
    await expect(page.getByTestId('mcq-card')).toBeVisible();
    await expect(page.getByTestId('mcq-question-q-success-narrow')).toBeVisible();

    // Answer the follow-up; three rounds are now spent.
    await page.getByTestId('mcq-option-q-success-narrow-no-rewrite').check();
    await page.getByTestId('mcq-submit').click();
    await expect(page.getByTestId('interview-panel')).toContainText('3 of 3');

    // --- Exhaustion: the fallback lists what stayed open, and records it directly (task 37) ---
    await expect(page.getByTestId('fallback-panel')).toBeVisible();
    await expect(page.getByTestId('fallback-input-constraints')).toBeVisible();
    await page.getByTestId('fallback-input-constraints').fill('Mandated stack, fixed deadline.');
    await page.getByTestId('fallback-submit').click();

    await expect(page.getByTestId('fallback-panel')).toHaveCount(0);

    // The exit gate was never blocked by needs — and is open with round + summary in place.
    await page.getByTestId('proceed').click();
    await expect(page.getByTestId('stage-current')).toHaveText(/Constitution/);
  });
});
