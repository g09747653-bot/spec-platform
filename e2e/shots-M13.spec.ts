/* eslint-disable no-restricted-properties -- a hand-run evidence walk, not application code: it
   is switched on from the environment because it writes artifacts and is not part of any CI run. */
import { mkdirSync } from 'node:fs';

import { expect, test, type Page } from '@playwright/test';

import { createSignedInUser, signIn } from './fixtures/auth';
import { collectFor, startSession } from './fixtures/journey';

/**
 * The reworked panel states, photographed (task 142).
 *
 * The third bullet of task 142 asks for «a screenshot set of the reworked panel states», and the
 * reason it asks for pictures rather than assertions is that the defect was a picture: three cards,
 * three loud buttons, and a wait block reading zero. The e2e in `bug-hunt-M13.spec.ts` proves the
 * rule; this proves the result, in the form the person who reported it can check.
 *
 * Each shot is the whole window rather than one card, deliberately — the pile was a property of the
 * surfaces *together*, and a crop of any one of them would have looked fine all along.
 *
 * Not part of any CI run — `SHOTS=1` switches it on:
 *   SHOTS=1 pnpm exec playwright test shots-M13 --project=chromium
 */

const OUT = process.env.SHOTS_OUT ?? 'artifacts/gate-M13/shots';

const IDEA = 'I want to build minecraft';

async function shoot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

/** How many loud controls are on screen — printed under each shot in the report. */
async function loudCount(page: Page): Promise<number> {
  return page.locator('[data-variant="primary"]:visible').count();
}

test.describe('M13п panel-state screenshots', () => {
  test.skip(process.env.SHOTS !== '1', 'set SHOTS=1 to write the screenshot set');
  test.describe.configure({ timeout: 240_000 });

  test('every state of the tail, and the two reworked cards', async ({ page, context }) => {
    mkdirSync(OUT, { recursive: true });

    await signIn(context, await createSignedInUser('shots-m13'));
    await page.setViewportSize({ width: 1440, height: 900 });

    const state = async (name: string) => {
      await shoot(page, name);
      console.log(`${name}: ${String(await loudCount(page))} loud control(s)`);
    };

    /*
     * The feed keeps itself at the end, which is right for a conversation and wrong for a photograph
     * of something that happened earlier. These two shots are about the *old* board, so they are
     * taken where the old board is.
     */
    const shootAt = async (testId: string, name: string) => {
      await page.getByTestId(testId).first().scrollIntoViewIfNeeded();
      await shoot(page, name);
      console.log(`${name}: ${String(await loudCount(page))} loud control(s)`);
    };

    await startSession(page, IDEA);

    // 1 — the interview, with nothing asked yet.
    await expect(page.getByTestId('interview-panel')).toBeVisible();
    await state('01-interview-open');

    // 2 — a round waiting for answers.
    await page.getByTestId('ask-round').click();
    await expect(page.getByTestId('mcq-card')).toBeVisible({ timeout: 40_000 });
    await state('02-pending-round');

    await page.getByTestId('mcq-option-q-audience-solo-devs').check();
    await page.getByTestId('mcq-option-q-problem-context').check();
    await page.getByTestId('mcq-submit').click();
    await expect(page.getByTestId('interview-panel')).toContainText('summary saved');

    // 3 — the interview answered: the door is the next step.
    await state('03-interview-answered');

    await page.getByTestId('proceed').click();
    await expect(page.locator('[data-state="current"][data-stage="constitution"]')).toBeVisible();
    await collectFor(page, 'constitution');

    // 4 — a stage that drafts, with nothing drafted yet.
    await state('04-ready-to-draft');

    await page.getByTestId('generate-spec').click();
    await expect(page.getByTestId('spec-card')).toBeVisible({ timeout: 40_000 });

    // 5 — a draft waiting for a decision.
    await state('05-pending-approval');

    await page.getByTestId('approve-spec').click();
    await expect(page.getByTestId('spec-card')).toContainText('approved');

    /*
     * 6 — THE ONE THE CUSTOMER PHOTOGRAPHED. An approved document at a position that still drafts,
     * with refinement offered and a door out. This is the pile, rebuilt.
     */
    await state('06-after-approval-the-report');

    // 7 — the same state with the refinement box opened by hand.
    await page.getByTestId('refine-toggle').click();
    await expect(page.getByTestId('refine-instruction')).toBeVisible();
    await state('07-after-approval-refine-open');
    await page.getByTestId('refine-toggle').click();

    await page.getByTestId('proceed').click();
    await expect(page.getByTestId('review-board')).toBeVisible({ timeout: 40_000 });

    // 8 — the live review board, with its ring, its checkboxes and its three decisions.
    await state('08-review-board-active');

    /*
     * 9 — two boards on one file: the first folded, dimmed and badged; the second in hand. The whole
     * of the «the checkboxes disappeared» report is in this one frame.
     */
    await page.getByTestId('review-request-changes').click();
    await expect(page.getByTestId('review-board')).toHaveCount(0);
    await page.getByTestId('generate-spec').click();
    await expect(page.getByTestId('spec-card').last()).toContainText('Rev 2', { timeout: 40_000 });
    await shootAt('review-superseded-badge', '09-superseded-board-folded');

    await page.getByTestId('approve-spec').last().click();
    await expect(page.getByTestId('proceed')).toBeEnabled();
    await page.getByTestId('proceed').click();
    await expect(page.getByTestId('review-board')).toBeVisible({ timeout: 40_000 });
    await shootAt('review-superseded-badge', '10-two-boards-old-and-live');

    // 11 — the Raw view, inside the window, at the width the report was filed from.
    await page.getByTestId('spec-card').last().getByTestId('open-viewer').click();
    await expect(page.getByTestId('viewer-pane')).toBeVisible();
    await page.getByTestId('viewer-pane-tab-raw').click();
    await expect(page.getByTestId('viewer-raw')).toBeVisible();
    await state('11-raw-inside-the-window');

    await page.getByTestId('viewer-raw').evaluate((node) => {
      node.textContent = `${'x'.repeat(4000)}\nshort\n${'y'.repeat(4000)}`;
    });
    await state('12-raw-with-a-line-wider-than-the-pane');
  });
});
