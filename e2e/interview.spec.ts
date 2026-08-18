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
    await expect(page.getByTestId('stage-current')).toHaveAttribute('data-stage', 'interview');

    // --- The exit is shut and says why (FR-006 AC-2; task 29: 409 + machine-readable reason) ---
    await expect(page.getByTestId('interview-panel')).toBeVisible();
    /*
     * `data-reasons` is the gate's own unmet conditions, space-joined (task 143). The claim is that
     * the missing answered round is among them, which is what the wording said; the bounded match
     * keeps it from being satisfied by some future condition that merely ends in this one's name.
     */
    await expect(page.getByTestId('gate-unmet')).toHaveAttribute(
      'data-reasons',
      /(^| )answered-round( |$)/,
    );
    await page.getByTestId('proceed').click();
    await expect(page.getByTestId('interview-notice')).toBeVisible();
    await expect(page.getByTestId('stage-current')).toHaveAttribute('data-stage', 'interview');

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

    /*
     * While the card waits, nothing else is on offer (task 34; FR-005 AC-4).
     *
     * In the feed the card and the stage's own controls are on screen together, so this has to be
     * stated where the panel used to state it by simply not existing: no Ask (a second ask hands
     * back the same round — FR-017 AC-3), no door, no drafting.
     */
    await expect(page.getByTestId('generation-blocked')).toBeVisible();
    await expect(page.getByTestId('generate-spec')).toHaveCount(0);
    await expect(page.getByTestId('awaiting-round')).toBeVisible();
    await expect(page.getByTestId('ask-round')).toHaveCount(0);
    await expect(page.getByTestId('proceed')).toHaveCount(0);

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
    await expect(page.getByTestId('interview-panel')).toHaveAttribute('data-answered-rounds', '1');
    await expect(page.getByTestId('interview-panel')).toHaveAttribute('data-round-budget', '3');
    // `data-summary` is `saved` or `none`; only the interview keeps one, so it is absent elsewhere.
    await expect(page.getByTestId('interview-panel')).toHaveAttribute('data-summary', 'saved');

    // --- The gate that refused now permits (FR-006 AC-3; task 38) ---
    await page.getByTestId('proceed').click();
    await expect(page.getByTestId('stage-current')).toHaveAttribute('data-stage', 'constitution');
    await expect(page.getByTestId('stage-substage')).toHaveAttribute('data-substage', 'collect');

    // --- The next stage collects for itself (FR-007 AC-2: rounds are per stage) ---
    // This gate refuses with a reason code rather than the interview's condition list.
    await expect(page.getByTestId('gate-unmet')).toHaveAttribute(
      'data-reasons',
      'NO_ANSWERED_ROUND',
    );
    await page.getByTestId('ask-round').click();
    await expect(page.getByTestId('mcq-card')).toBeVisible();
    await page.getByTestId('mcq-option-q-constitution-scope-strict').check();
    await page.getByTestId('mcq-submit').click();

    await expect(page.getByTestId('interview-panel')).toBeVisible();
    await page.getByTestId('proceed').click();
    await expect(page.getByTestId('stage-substage')).toHaveAttribute('data-substage', 'generate');

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
    await expect(page.getByTestId('interview-panel')).toHaveAttribute('data-answered-rounds', '1');
    await expect(page.getByTestId('interview-panel')).toHaveAttribute('data-round-budget', '3');

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
    await expect(page.getByTestId('interview-panel')).toHaveAttribute('data-answered-rounds', '3');
    await expect(page.getByTestId('interview-panel')).toHaveAttribute('data-round-budget', '3');

    // --- Exhaustion: the fallback lists what stayed open, and records it directly (task 37) ---
    await expect(page.getByTestId('fallback-panel')).toBeVisible();
    await expect(page.getByTestId('fallback-input-constraints')).toBeVisible();
    await page.getByTestId('fallback-input-constraints').fill('Mandated stack, fixed deadline.');
    await page.getByTestId('fallback-submit').click();

    await expect(page.getByTestId('fallback-panel')).toHaveCount(0);

    // The exit gate was never blocked by needs — and is open with round + summary in place.
    await page.getByTestId('proceed').click();
    await expect(page.getByTestId('stage-current')).toHaveAttribute('data-stage', 'constitution');
  });
  /**
   * Task 106 — the round as the reference product presents it, and as the feed keeps it.
   *
   * The four things the acceptance criteria name are all here in one walk, because they are one
   * interaction: the badge appears only where the model marked it, select-all takes more than one,
   * Other carries free text, and after Submit the form stays in the conversation with the choices
   * fixed. The last is the one that could not be tested before M7п: there was no conversation to
   * stay in.
   */
  test('a round renders v3, and stays in the feed once answered (task 106)', async ({
    page,
    context,
  }) => {
    await signIn(context, await createSignedInUser('rounds-v3'));

    await page.goto('/projects');
    await expect(page.getByTestId('create-project')).toBeEnabled();

    // У-5: the profile is asked here, once, before the session exists.
    await expect(page.getByTestId('audience-profile')).toBeVisible();
    await page.getByTestId('audience-technical').check();

    await page.getByTestId('prompt-input').fill('A scheduling tool for climbing gyms');
    await page.getByTestId('create-project').click();
    await expect(page.getByTestId('session')).toBeVisible();

    // …and never again: the session surface offers no second chance to change register.
    await expect(page.getByTestId('audience-profile')).toHaveCount(0);

    await page.getByTestId('ask-round').click();
    await expect(page.getByTestId('mcq-card')).toBeVisible();

    // The header names the round and how much it asks (Эталон §1.1) — the two numbers it reads out.
    const heading = page.getByTestId('round-heading').first();
    await expect(heading).toHaveAttribute('data-round', '1');
    await expect(heading).toHaveAttribute('data-questions', '2');

    // Required markers, and how many answers each question takes: `single` is the select-one caption.
    await expect(page.getByTestId('mcq-required-q-audience')).toBeVisible();
    await expect(page.getByTestId('mcq-hint-q-audience')).toHaveAttribute('data-select', 'single');
    await expect(page.getByTestId('mcq-hint-q-problem')).toHaveAttribute('data-select', 'multiple');

    // One recommendation, on the one option the model marked — the id says which — and nowhere else.
    await expect(page.getByTestId('mcq-recommended-teams')).toBeVisible();
    await expect(
      page.getByTestId('mcq-card').locator('[data-testid^="mcq-recommended-"]'),
    ).toHaveCount(1);

    // Select-all takes more than one; Other carries free text.
    await page.getByTestId('mcq-option-q-audience-solo-devs').check();
    await page.getByTestId('mcq-option-q-problem-context').check();
    await page.getByTestId('mcq-option-q-problem-review').check();
    await page.getByTestId('mcq-other-q-problem').fill('and no export formats to speak of');
    await page.getByTestId('mcq-submit').click();

    // The form stays where it was asked, fixed, with the answers visible — and asks nothing more.
    const answered = page.getByTestId('round-answered');
    await expect(answered).toBeVisible();
    await expect(page.getByTestId('mcq-card')).toHaveCount(0);
    await expect(answered).toContainText('Solo developers and indie hackers');
    await expect(answered).toContainText('Agents lose context');
    await expect(answered).toContainText('No review workflow');
    await expect(answered).toContainText('and no export formats to speak of');

    // And it survives a reload as exactly that (FR-017 AC-2).
    const fixed = await answered.textContent();
    await page.reload();
    await expect(page.getByTestId('round-answered')).toBeVisible();
    expect(await page.getByTestId('round-answered').textContent()).toBe(fixed);
  });
});
