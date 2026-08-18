import { expect, test, type Page } from '@playwright/test';

import { createSignedInUser, signIn } from './fixtures/auth';
import { collectFor, draftAndApprove, reachDrafting, startSession } from './fixtures/journey';

/**
 * The customer's second hands-on pass, turned into failing tests first (task 142).
 *
 * Three reports, three repros. Each one measures the thing the customer could see rather than the
 * implementation that produces it, because that is the only form in which «fixed» is checkable by
 * the person who complained.
 */

/** The widths the customer's monitor and the two common laptop sizes land on. */
const WIDTHS = [1280, 1600, 1920] as const;

/**
 * Nothing anywhere on the page may stick out past the window.
 *
 * Two measurements, because they fail for different reasons and one without the other is a test
 * that passes while the defect is on screen:
 *
 * - `scrollWidth` of the document catches a page that has grown a horizontal scrollbar, which is
 *   what «part of the window is eaten» looks like when the frame lets the overflow through;
 * - the pane's own right edge catches the frame *clipping* the overflow instead — the app frame is
 *   `overflow-hidden`, so an over-wide row does not scroll the page, it pushes the pane's right-hand
 *   side under the edge of the window where the close button and the tabs used to be.
 */
async function expectNothingOffScreen(page: Page, where: string) {
  const measured = await page.evaluate(() => {
    const pane = document.querySelector('[data-testid="viewer-pane"]');
    const box = pane?.getBoundingClientRect() ?? null;

    return {
      viewport: window.innerWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      paneRight: box === null ? null : Math.round(box.right),
      paneLeft: box === null ? null : Math.round(box.left),
    };
  });

  expect(measured.paneRight, `${where}: the viewer pane is not on screen at all`).not.toBeNull();

  expect(
    measured.documentScrollWidth,
    `${where}: the page scrolls sideways (${String(measured.documentScrollWidth)} > ${String(measured.viewport)})`,
  ).toBeLessThanOrEqual(measured.viewport);

  expect(
    measured.paneRight ?? 0,
    `${where}: the pane's right edge (${String(measured.paneRight)}) is past the window (${String(measured.viewport)})`,
  ).toBeLessThanOrEqual(measured.viewport);

  expect(measured.paneLeft ?? 0, `${where}: the pane starts off-screen`).toBeGreaterThanOrEqual(0);
}

test.describe('the customer’s 2026-08-18 reports', () => {
  test('Raw keeps the pane inside the window at every width, and scrolls its own long lines', async ({
    page,
    context,
  }) => {
    await signIn(context, await createSignedInUser('m13-raw'));
    await page.setViewportSize({ width: 1440, height: 900 });

    await startSession(page, 'A tool whose Raw view stays inside the window');
    await reachDrafting(page);

    await page.getByTestId('generate-spec').click();
    await expect(page.getByTestId('spec-card')).toBeVisible({ timeout: 40_000 });

    await page.getByTestId('spec-card').getByTestId('open-viewer').click();
    await expect(page.getByTestId('viewer-pane')).toBeVisible();

    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });

      for (const view of ['preview', 'raw', 'diff', 'outline'] as const) {
        await page.getByTestId(`viewer-pane-tab-${view}`).click();
        await expect(page.getByTestId('viewer-pane')).toHaveAttribute('data-view', view);
        await expectNothingOffScreen(page, `${view} at ${String(width)}px`);
      }
    }

    /*
     * And now the condition that actually produced the report.
     *
     * The stub provider writes short lines, so the walk above cannot reach the defect: it is a
     * property of a document with a line wider than the pane, which is what a real `_Touches:_` line
     * is. The line is put into the `<pre>` from here rather than generated, and the comment says so
     * plainly — this half of the test measures **the stylesheet**, not the product. That is the
     * honest description of what it does, and it is worth doing: before the fix this measurement
     * put the pane's right edge at 28 516 px in a 1 280 px window.
     */
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByTestId('viewer-pane-tab-raw').click();
    await expect(page.getByTestId('viewer-raw')).toBeVisible();

    await page.getByTestId('viewer-raw').evaluate((node) => {
      node.textContent = `${'x'.repeat(4000)}\nshort\n${'y'.repeat(4000)}`;
    });

    await expectNothingOffScreen(page, 'raw with a 4 000-character line');

    const well = page.getByTestId('viewer-raw-well');
    await expect(well).toBeVisible();

    const scrollable = await well.evaluate((node) => ({
      scrollWidth: node.scrollWidth,
      clientWidth: node.clientWidth,
      overflowX: getComputedStyle(node).overflowX,
    }));

    // The line is reachable — inside the well, which is where a long line belongs.
    expect(scrollable.overflowX, 'the code well must own the sideways scroll').toBe('auto');
    expect(
      scrollable.scrollWidth,
      'the long line must be scrollable inside the well',
    ).toBeGreaterThan(scrollable.clientWidth);
    expect(
      scrollable.clientWidth,
      'the well must be no wider than the pane that contains it',
    ).toBeLessThanOrEqual((await page.getByTestId('viewer-pane').boundingBox())?.width ?? 0);
  });

  test('a superseded review board is labelled and folded; the live one is not', async ({
    page,
    context,
  }) => {
    await signIn(context, await createSignedInUser('m13-boards'));
    await page.setViewportSize({ width: 1440, height: 900 });

    await startSession(page, 'A tool whose older review boards say that they are older');
    await reachDrafting(page);
    await draftAndApprove(page);

    // The live board: checkboxes and all three decisions on screen together (constitution P2).
    const live = page.getByTestId('review-board');
    await expect(live).toHaveAttribute('data-board', 'active');
    await expect(live.getByTestId('review-accept')).toBeVisible();
    await expect(live.getByTestId('review-request-changes')).toBeVisible();
    await expect(live.getByTestId('review-ignore')).toBeVisible();
    await expect(live.locator('input[type="checkbox"]').first()).toBeVisible();

    /*
     * Send it back, then write the rewrite it asked for. The second revision is what makes the first
     * board history — a board that read Rev 1 is not a report on the document any more (FR-010
     * AC-8), which is the same rule the projection computes `supersededBy` from.
     */
    await page.getByTestId('review-request-changes').click();
    await expect(page.getByTestId('review-board')).toHaveCount(0);
    await expect(page.getByTestId('stage-substage')).toHaveText(/Generating/);

    await page.getByTestId('generate-spec').click();
    await expect(page.getByTestId('spec-card').last()).toContainText('Rev 2', { timeout: 40_000 });

    /*
     * The decided board is still in the conversation — it happened — but it now says what it is,
     * and it is folded, so a reader scrolling up cannot mistake it for the one asking for a
     * decision. That mistake is exactly the defect report: «the checkboxes disappeared».
     */
    const superseded = page.getByTestId('review-board-decided').first();
    await expect(superseded).toHaveAttribute('data-superseded', 'true');
    await expect(superseded.getByTestId('review-superseded-badge')).toBeVisible();
    await expect(superseded.getByTestId('review-superseded-badge')).toContainText('Superseded');
    await expect(superseded.getByTestId('review-accept')).toHaveCount(0);

    // Folded on arrival — the `open` attribute is the browser's own record of a `<details>` state.
    const folded = await superseded
      .getByTestId('review-board-details')
      .evaluate((node) => node.hasAttribute('open'));
    expect(folded, 'a superseded board arrives collapsed').toBe(false);

    // Dimmed, and the badge is legible while it is.
    const dim = await superseded.evaluate((node) => Number(getComputedStyle(node).opacity));
    expect(dim, 'a superseded board is dimmed').toBeLessThan(1);

    /*
     * …and once the rewrite is approved and reviewed again, the live board is unmistakably the live
     * one: exactly one card with the ring, its checkboxes and its three decisions on screen at once,
     * with the old card folded and dimmed above it. That is the whole of the report.
     */
    await page.getByTestId('approve-spec').last().click();
    await expect(page.getByTestId('proceed')).toBeEnabled();
    await page.getByTestId('proceed').click();
    await expect(page.getByTestId('review-board')).toBeVisible({ timeout: 40_000 });

    await expect(page.getByTestId('review-board')).toHaveCount(1);
    await expect(page.getByTestId('review-board')).toHaveAttribute('data-board', 'active');
    await expect(page.getByTestId('review-board')).toHaveCSS('opacity', '1');
    await expect(page.getByTestId('review-board').getByTestId('review-accept')).toBeVisible();
    await expect(page.getByTestId('review-superseded-badge').first()).toBeVisible();
  });

  test('every state of the stage panel offers exactly one primary action', async ({
    page,
    context,
  }) => {
    await signIn(context, await createSignedInUser('m13-panel'));
    await page.setViewportSize({ width: 1440, height: 900 });

    await startSession(page, 'A tool whose stage panel says what to do next');

    /*
     * Counted across the whole conversation, not inside one card: the customer's screenshot has the
     * pile in it precisely because three *different* surfaces each rendered their own headline
     * control, and each of them was defensible on its own.
     *
     * The composer's Send is excluded by construction rather than by an exception list — it is the
     * `brand` variant, the one gradient control the reference paints that way (task 133), and it is
     * docked outside the conversation for the whole session.
     */
    const loud = page.locator('[data-variant="primary"]:visible');

    const countLoud = async (where: string) => {
      await expect(loud, `${where}: exactly one loud control`).toHaveCount(1);
    };

    await expect(page.getByTestId('interview-panel')).toBeVisible();
    await countLoud('the interview, before a round is asked');

    await page.getByTestId('ask-round').click();
    await expect(page.getByTestId('mcq-card')).toBeVisible({ timeout: 40_000 });
    await countLoud('a question card waiting for answers');

    // The interview's own round, answered — walked by hand because the helper asks for a round and
    // this test has already asked for one.
    await page.getByTestId('mcq-option-q-audience-solo-devs').check();
    await page.getByTestId('mcq-option-q-problem-context').check();
    await page.getByTestId('mcq-submit').click();
    await expect(page.getByTestId('interview-panel')).toContainText('summary saved');
    await countLoud('the interview, answered and ready to leave');

    await page.getByTestId('proceed').click();
    await expect(page.locator('[data-state="current"][data-stage="constitution"]')).toBeVisible();
    await collectFor(page, 'constitution');
    await countLoud('the constitution, ready to draft');

    await page.getByTestId('generate-spec').click();
    await expect(page.getByTestId('spec-card')).toBeVisible({ timeout: 40_000 });
    await countLoud('a draft waiting for approval');

    await page.getByTestId('approve-spec').click();
    await expect(page.getByTestId('spec-card')).toContainText('approved');

    /*
     * THE SCREENSHOT. An approved document, a position that still drafts, refinement offered and a
     * door out — three cards that used to carry three primary buttons between them. The door is the
     * next step, so the door is the loud one.
     */
    await countLoud('after approval — the state the customer photographed');
    await expect(page.getByTestId('proceed')).toHaveAttribute('data-variant', 'primary');
    await expect(page.getByTestId('generate-spec')).toHaveAttribute('data-variant', 'secondary');

    /*
     * The wait block is a wait, not a decoration: with nothing in flight it is not on the page at
     * all, so it can never sit there reading «0 seconds».
     */
    await expect(page.getByTestId('waiting-on')).toHaveCount(0);

    // Refinement is offered, and folded behind its own heading rather than stacked open beside it.
    await expect(page.getByTestId('refine-card')).toBeVisible();
    const refineOpen = await page
      .getByTestId('refine-card')
      .evaluate((node) => node.hasAttribute('open'));
    expect(refineOpen, 'refinement arrives folded').toBe(false);

    // …and opening it does not create a second loud control.
    await page.getByTestId('refine-toggle').click();
    await expect(page.getByTestId('refine-instruction')).toBeVisible();
    await countLoud('with the refinement box open');

    await page.getByTestId('proceed').click();
    await expect(page.getByTestId('review-board')).toBeVisible({ timeout: 40_000 });
    await countLoud('a review board waiting for a decision');
  });
});
