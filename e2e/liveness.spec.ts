import { expect, test, type Page } from '@playwright/test';

import { createSignedInUser, reachDrafting, signIn, startSession } from './fixtures';

/**
 * Round 2, Д-1 — **the page is never dead.**
 *
 * The M6 gate walk ended on a page where a stalled provider had left the generate control disabled,
 * no way to cancel, and nothing else that moved the session. Every automated suite was green: they
 * all asserted that the happy path works, and none asserted that the unhappy ones leave a way out.
 *
 * So the invariant is stated directly here, and it is stated over *controls that move the session* —
 * not over any enabled element. Sign out and Download would satisfy a naive count while the session
 * itself was frozen, which is exactly how this defect survived.
 */

/** Controls that actually advance, unblock, or abandon something. Sign out and export are not. */
const SESSION_CONTROLS = [
  'ask-round',
  'proceed',
  'generate-spec',
  'stop-generation',
  // Round 5, Р-3: the way out of a request in flight — the transition's equivalent of `stop-generation`.
  'stop-waiting',
  'mcq-submit',
  'mcq-reply-toggle',
  'mcq-reply-send',
  'fallback-submit',
  'approve-spec',
  'request-changes',
  'submit-changes',
  'review-accept',
  'review-ignore',
  'review-request-changes',
  'accept-diff',
  'reject-diff',
  'submit-refinement',
  'chat-send',
  'refine-instruction',
  'chat-message',
] as const;

/** The session-moving controls that are present and enabled right now. */
async function liveControls(page: Page): Promise<string[]> {
  return page.evaluate((ids: readonly string[]) => {
    const live: string[] = [];

    for (const id of ids) {
      const element = document.querySelector(`[data-testid="${id}"]`);
      if (element !== null && !element.hasAttribute('disabled')) live.push(id);
    }

    return live;
  }, SESSION_CONTROLS);
}

async function expectAlive(page: Page, state: string): Promise<void> {
  const live = await liveControls(page);

  expect(live, `no way to move the session in state: ${state}`).not.toEqual([]);
}

/**
 * Round 5, Р-3 — the same invariant, checked **while a stage transition is in flight**.
 *
 * The round-2 test asserted liveness at each *position*: before the click and after it. The gate
 * died in between, in a state no test visited — the transition request open, the door disabled,
 * a caption that never changed. This holds the response so the in-between is a state a test can
 * stand in, and every transition of the journey is walked through it.
 */
async function proceedAliveInFlight(page: Page, where: string): Promise<void> {
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });

  // `times: 1` retires the handler after this one transition, so repeated calls neither stack nor
  // need an `unroute` racing a route that is still being held.
  await page.route(
    '**/transition',
    async (route) => {
      await held;
      await route.continue();
    },
    { times: 1 },
  );

  const responded = page.waitForResponse((response) => response.url().includes('/transition'));

  await page.getByTestId('proceed').click();

  // The door is busy — and something else is not.
  await expect(page.getByTestId('proceed'), `door not busy at ${where}`).toBeDisabled();
  await expect(
    page.getByTestId('stop-waiting'),
    `no way out of an in-flight transition at ${where}`,
  ).toBeEnabled();
  await expect(page.getByTestId('waiting-status')).toBeVisible();
  await expectAlive(page, `transition in flight at ${where}`);

  release();
  await responded;
}

test.describe('the page always offers a way forward', () => {
  test('a failed generation leaves a retry that actually retries (Д-1 b)', async ({
    page,
    context,
  }) => {
    await signIn(context, await createSignedInUser('liveness'));
    await startSession(page, 'A tool that must never strand its user');
    await reachDrafting(page);

    // Every provider failed, as the server reports it (FR-018 AC-2).
    let attempts = 0;
    await page.route('**/api/sessions/*/generate', async (route) => {
      attempts += 1;

      if (attempts === 1) {
        await route.fulfill({
          status: 200,
          contentType: 'application/x-ndjson',
          body: `${JSON.stringify({
            type: 'error',
            code: 'GENERATION_FAILED',
            message: 'Generation did not complete. Your answers and approved specs are safe.',
            retryable: true,
          })}\n`,
        });
        return;
      }

      // The retry is a real one: it goes to the real handler and produces a real revision.
      await route.fallback();
    });

    await page.getByTestId('generate-spec').click();
    await expect(page.getByTestId('generation-error')).toBeVisible({ timeout: 20_000 });

    await expectAlive(page, 'generation failed');

    // The retry control is offered, enabled, and named as a retry.
    const retry = page.getByTestId('generate-spec');
    await expect(retry).toBeEnabled();
    await expect(retry).toHaveText('Try again');

    // Clicking it starts a new generation that succeeds — the failure was not terminal.
    await retry.click();
    await expect(page.getByTestId('spec-card')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('spec-revision-number')).toHaveText('1');
    expect(attempts).toBe(2);
  });

  /*
   * The state the gate actually died in: the response opens, says `run`, and then goes quiet with the
   * socket held. Before the fix this disabled the generate control for as long as the server chose to
   * hold on — with nothing else to click.
   */
  test('a stalled generation can be abandoned (Д-1 a)', async ({ page, context }) => {
    await signIn(context, await createSignedInUser('liveness'));
    await startSession(page, 'A tool that must survive a stalled provider');
    await reachDrafting(page);

    await page.route('**/api/sessions/*/generate', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/x-ndjson',
        body:
          `${JSON.stringify({
            type: 'run',
            runId: '11111111-2222-4333-8444-555555555555',
            stage: 'constitution',
            attempt: 1,
          })}\n` + `${JSON.stringify({ type: 'delta', sequence: 0, text: '# Constitution\n' })}\n`,
      }),
    );
    await page.route('**/api/generations/*/stream*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: '' }),
    );

    await page.getByTestId('generate-spec').click();
    await expect(page.getByTestId('stop-generation')).toBeVisible();

    await expectAlive(page, 'mid-stream');
    await page.waitForTimeout(2000);
    await expectAlive(page, 'reconnecting');

    // Stopping returns the page to a state it can act from, keeping what was rendered.
    await page.getByTestId('stop-generation').click();
    await expect(page.getByTestId('generate-spec')).toBeEnabled();
    await expect(page.getByTestId('spec-stream')).toContainText('# Constitution');
  });

  /*
   * Д-1 c: a failing model call in chat must cost the chat its answer and nothing else. The endpoint
   * is made to fail outright, which is stronger than the provider fallback the handler produces.
   */
  test('a failing chat message disables nothing but its own send (Д-1 c)', async ({
    page,
    context,
  }) => {
    await signIn(context, await createSignedInUser('liveness'));
    await startSession(page, 'A tool whose chat can fail safely');
    await reachDrafting(page);

    await page.route('**/api/sessions/*/messages', (route) =>
      route.fulfill({ status: 502, contentType: 'application/json', body: '{}' }),
    );

    const before = await liveControls(page);

    await page.getByTestId('chat-message').fill('am I stuck?');
    await page.getByTestId('chat-send').click();
    await expect(page.getByTestId('chat-error')).toBeVisible({ timeout: 20_000 });

    await expectAlive(page, 'chat failed');

    // Everything that was live before the failed message is live after it.
    const after = await liveControls(page);
    for (const control of before) {
      expect(after, `${control} went dead after a failed chat message`).toContain(control);
    }
  });

  /*
   * The state the M6 gate actually died in (round 5, Р-3): the transition request open, and nothing
   * on the page that moved the session. Reproduced here by holding the response — which is what a
   * provider chain does for real, since entering `review` runs the review agent inside this very
   * request.
   */
  test('a stalled stage transition can be abandoned (Р-3 a)', async ({ page, context }) => {
    await signIn(context, await createSignedInUser('liveness'));
    await startSession(page, 'A tool that must survive a stalled transition');

    await page.getByTestId('ask-round').click();
    await expect(page.getByTestId('mcq-card')).toBeVisible();
    await page.getByTestId('mcq-option-q-audience-solo-devs').check();
    await page.getByTestId('mcq-option-q-problem-context').check();
    await page.getByTestId('mcq-submit').click();
    await expect(page.getByTestId('interview-panel')).toContainText('summary saved');

    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(
      '**/transition',
      async (route) => {
        await held;
        // The client's own abort may already have finished this route — that is the point of the
        // test, not a failure of it.
        await route.abort().catch(() => undefined);
      },
      { times: 1 },
    );

    await page.getByTestId('proceed').click();

    // Disabled door, live way out, honest status — the three the frozen page had none of.
    await expect(page.getByTestId('proceed')).toBeDisabled();
    await expect(page.getByTestId('proceed')).toHaveText('Checking the gate…');
    await expect(page.getByTestId('stop-waiting')).toBeEnabled();
    await expectAlive(page, 'stage transition in flight');

    // The status is not a frozen caption: the count keeps moving, which is the whole difference
    // between a page that is working and a page that is dead.
    const status = page.getByTestId('waiting-status');
    await expect(status).toContainText(/\d+ s/);
    const firstReading = await status.innerText();
    await expect(status, 'the elapsed reading never moved').not.toHaveText(firstReading, {
      timeout: 10_000,
    });

    // Stopping says so, and gives the door back.
    await page.getByTestId('stop-waiting').click();
    await expect(page.getByTestId('interview-notice')).toContainText('You stopped waiting');
    await expect(page.getByTestId('proceed')).toBeEnabled();
    await expectAlive(page, 'transition abandoned');

    release();

    // And the session is exactly where the server says it is — the click can simply be made again.
    await page.getByTestId('proceed').click();
    await expect(page.getByTestId('stage-current')).toHaveText(/Constitution/i, { timeout: 20_000 });
  });

  /*
   * Р-3 c: a refused transition is visible, and it says which gate refused — not "that step is not
   * available yet", which was the whole of what the gate walk was told.
   */
  test('a refused stage transition says why, and leaves the page usable (Р-3 b)', async ({
    page,
    context,
  }) => {
    await signIn(context, await createSignedInUser('liveness'));
    await startSession(page, 'A tool whose refusals explain themselves');

    await page.getByTestId('ask-round').click();
    await expect(page.getByTestId('mcq-card')).toBeVisible();
    await page.getByTestId('mcq-option-q-audience-solo-devs').check();
    await page.getByTestId('mcq-option-q-problem-context').check();
    await page.getByTestId('mcq-submit').click();
    await expect(page.getByTestId('interview-panel')).toContainText('summary saved');

    await page.route('**/transition', (route) =>
      route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            code: 'ROUND_LIMIT_REACHED',
            message: 'anything at all',
            details: { reason: 'ROUND_LIMIT_REACHED' },
          },
        }),
      }),
    );

    await page.getByTestId('proceed').click();

    const notice = page.getByTestId('interview-notice');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('question round');
    await expect(notice).toContainText('next step');
    // The identifier is never the explanation.
    await expect(notice).not.toContainText('ROUND_LIMIT_REACHED');

    await expect(page.getByTestId('proceed')).toBeEnabled();
    await expectAlive(page, 'transition refused');
  });

  /*
   * Р-3 c, the other half: a request that never reaches the server is a visible failure too, not a
   * caption that stays put.
   */
  test('a transition that cannot reach the server says so (Р-3 c)', async ({ page, context }) => {
    await signIn(context, await createSignedInUser('liveness'));
    await startSession(page, 'A tool that survives a dropped connection');

    await page.route('**/transition', (route) => route.abort('failed'));

    await page.getByTestId('proceed').click();

    await expect(page.getByTestId('interview-notice')).toContainText('did not reach the server');
    await expect(page.getByTestId('proceed')).toBeEnabled();
    await expectAlive(page, 'transition unreachable');
  });

  /*
   * The walk that matters most: the invariant checked at every position of the real journey, so a
   * future change that strands the user at some stage fails here rather than at a customer's gate.
   *
   * Round 5: every `proceed` of the walk now goes through `proceedAliveInFlight`, so the invariant
   * is asserted **during** each transition as well as on either side of it.
   */
  test('every position of the journey offers a way forward', async ({ page, context }) => {
    await signIn(context, await createSignedInUser('liveness'));
    await startSession(page, 'A tool that stays usable all the way through');

    await expectAlive(page, 'interview, nothing pending');

    await page.getByTestId('ask-round').click();
    await expect(page.getByTestId('mcq-card')).toBeVisible();
    await expectAlive(page, 'interview, round pending');

    await page.getByTestId('mcq-option-q-audience-solo-devs').check();
    await page.getByTestId('mcq-option-q-problem-context').check();
    await page.getByTestId('mcq-submit').click();
    await expect(page.getByTestId('interview-panel')).toContainText('summary saved');
    await expectAlive(page, 'interview, round answered');

    await proceedAliveInFlight(page, 'leaving the interview');
    await expect(page.getByTestId('stage-current')).toHaveText(/Constitution/i);
    await expectAlive(page, 'constitution/collect');

    await page.getByTestId('ask-round').click();
    await expect(page.getByTestId('mcq-card')).toBeVisible();
    await page.getByTestId('mcq-option-q-constitution-scope-strict').check();
    await page.getByTestId('mcq-submit').click();

    await proceedAliveInFlight(page, 'constitution collect → generate');
    await expect(page.getByTestId('stage-substage')).toHaveText(/generate/);
    await expectAlive(page, 'constitution/generate, nothing drafted');

    await page.getByTestId('generate-spec').click();
    await expect(page.getByTestId('spec-card')).toBeVisible({ timeout: 20_000 });
    await expectAlive(page, 'constitution/generate, awaiting approval');

    await page.getByTestId('approve-spec').click();
    await expect(page.getByTestId('spec-card')).toContainText('approved');
    await expectAlive(page, 'constitution/generate, approved');

    // The transition that runs the review agent inside the request — the slowest door in the app,
    // and the one whose in-flight state is least like a fast one.
    await proceedAliveInFlight(page, 'constitution generate → review');
    await expect(page.getByTestId('review-board')).toBeVisible({ timeout: 20_000 });
    await expectAlive(page, 'constitution/review, board pending');

    await page.getByTestId('review-accept').click();
    await expect(page.getByTestId('proceed')).toBeEnabled();
    await expectAlive(page, 'constitution/review, decided');
  });
});
