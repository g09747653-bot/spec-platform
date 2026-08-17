/* eslint-disable no-restricted-properties -- a hand-run evidence walk, not application code: it
   is switched on from the environment because it writes artifacts and is not part of any CI run. */
import { mkdirSync } from 'node:fs';

import { expect, test, type Page } from '@playwright/test';

import { createSignedInUser, signIn } from './fixtures/auth';
import { collectFor, completeStage, startSession } from './fixtures/journey';

/**
 * The screenshot set for M12п (tasks 137, 139).
 *
 * Both tasks ask for evidence rather than an assurance: task 137 for the three journey moments the
 * customer's reference archive captured, side by side with ours, and task 139 for a full-journey set
 * in both themes. This produces ours; the reference's three pages are in
 * `.specs/research/etalon-design.zip`, and the report puts them beside each other.
 *
 * Driven by the deterministic stub, so the same prompt produces the same conversation on every run
 * and two shots taken a week apart are comparable. Not part of any CI run — `SHOTS=1` switches it on:
 *   SHOTS=1 pnpm exec playwright test shots-M12 --project=chromium
 */

const OUT = process.env.SHOTS_OUT ?? 'artifacts/gate-M12/shots';

/** The customer's own test prompt, so our pages and their pages are about the same product. */
const IDEA = 'I want to build minecraft';

async function shoot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

/** Applies a theme the way the toggle does, and waits for the attribute to land. */
async function setTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  const current = await page.locator('html').getAttribute('data-theme');
  if (current !== theme) await page.getByTestId('theme-toggle').click();

  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

test.describe('M12п screenshots', () => {
  test.skip(process.env.SHOTS !== '1', 'set SHOTS=1 to write the screenshot set');
  test.describe.configure({ timeout: 180_000 });

  test('the journey, in both themes', async ({ page, context }) => {
    mkdirSync(OUT, { recursive: true });

    await signIn(context, await createSignedInUser('shots'));
    await page.setViewportSize({ width: 1440, height: 900 });

    for (const theme of ['light', 'dark'] as const) {
      await page.goto('/projects');
      await setTheme(page, theme);

      // 1 — the new chat, which is the reference's first saved page.
      await expect(page.getByTestId('create-project')).toBeEnabled();
      await shoot(page, `01-new-chat-${theme}`);

      await startSession(page, IDEA);

      // 2 — mid-journey: a round on screen, which is the reference's third page.
      await expect(page.getByTestId('interview-panel')).toBeVisible();
      await page.getByTestId('ask-round').click();
      await expect(page.getByTestId('mcq-card')).toBeVisible();
      await shoot(page, `02-interview-round-${theme}`);

      await page.getByTestId('mcq-option-q-audience-solo-devs').check();
      await page.getByTestId('mcq-option-q-problem-context').check();
      await page.getByTestId('mcq-submit').click();
      await expect(page.getByTestId('interview-panel')).toContainText('summary saved');
      await page.getByTestId('proceed').click();
      await expect(page.locator('[data-state="current"][data-stage="constitution"]')).toBeVisible();

      // 3 — a document, drafted and awaiting a decision.
      await collectFor(page, 'constitution');
      await page.getByTestId('generate-spec').click();
      await expect(page.getByTestId('spec-card')).toBeVisible({ timeout: 40_000 });
      await shoot(page, `03-document-card-${theme}`);

      // 4 — the viewer pane, which is the customer's «three views» complaint.
      await page.getByTestId('spec-card').getByTestId('open-viewer').click();
      await expect(page.getByTestId('viewer-pane')).toBeVisible();
      // The pane remembers the view it was left in, so each shot names the one it wants.
      await page.getByTestId('viewer-pane-tab-preview').click();
      await expect(page.getByTestId('viewer-metric-lines')).toBeVisible();
      await shoot(page, `04-viewer-preview-${theme}`);

      await page.getByTestId('viewer-pane-tab-raw').click();
      await expect(page.getByTestId('viewer-raw')).toBeVisible();
      await shoot(page, `05-viewer-raw-${theme}`);

      await page.getByTestId('viewer-pane-tab-outline').click();
      await expect(page.getByTestId('viewer-pane-outline')).toBeVisible();
      await shoot(page, `06-viewer-outline-${theme}`);
      await page.getByTestId('viewer-pane-close').click();

      // 5 — the review board.
      await page.getByTestId('approve-spec').click();
      await expect(page.getByTestId('spec-card')).toContainText('approved');
      await page.getByTestId('proceed').click();
      await expect(page.getByTestId('review-board')).toBeVisible({ timeout: 40_000 });
      await shoot(page, `07-review-board-${theme}`);

      await page.getByTestId('review-accept').click();
      await expect(page.getByTestId('review-board')).toHaveCount(0);
      await page.getByTestId('proceed').click();

      // 6 — the rest of the bundle, and the completion panel.
      for (const stage of ['requirements', 'solution', 'tasks'] as const) {
        await completeStage(page, stage);
      }

      await expect(page.getByTestId('session-complete')).toBeVisible({ timeout: 40_000 });
      await shoot(page, `08-completion-${theme}`);

      // 7 — the sidebar collapsed, and the keyboard list.
      await page.getByTestId('sidebar-toggle').click();
      await expect(page.getByTestId('session-sidebar')).toHaveAttribute('data-collapsed', 'true');
      await shoot(page, `09-collapsed-${theme}`);
      await page.getByTestId('sidebar-toggle').click();

      await page.getByTestId('shortcuts-open').click();
      await expect(page.getByTestId('shortcuts-dialog')).toBeVisible();
      await shoot(page, `10-shortcuts-${theme}`);
      await page.keyboard.press('Escape');

      // 8 — the small window this shell has to survive (task 141).
      await page.setViewportSize({ width: 1000, height: 700 });
      await shoot(page, `11-small-window-${theme}`);
      await page.setViewportSize({ width: 1440, height: 900 });

      // 9 — the project page, which the sidebar's «All chats» leads to.
      await page.getByTestId('back-to-project').click();
      await expect(page.getByTestId('project-page')).toBeVisible();
      await shoot(page, `12-project-page-${theme}`);
    }
  });
});
