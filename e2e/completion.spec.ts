import { expect, test, type Page } from '@playwright/test';

import {
  completeInterview,
  completeStage,
  createSignedInUser,
  downloadBundle,
  PARITY_STAGES,
  signIn,
  startSession,
} from './fixtures';

/**
 * The completion panel and the handoff (task 126; Эталон §1.1 «Session completed», §5.1).
 *
 * Four claims, one per acceptance criterion:
 *
 * - the panel exists **only** at Complete;
 * - the prompt it generates names *this* bundle — its file names and the revisions that were
 *   approved — rather than a plausible four;
 * - Download from the panel produces the same archive as the export panel beside it, because both
 *   call the one download helper against the one endpoint;
 * - the platform buttons are honest: the page says copy-and-open before anything is clicked, and
 *   clicking one opens the platform rather than claiming an import.
 */
async function walkToComplete(page: Page): Promise<void> {
  await completeInterview(page);
  for (const stage of PARITY_STAGES) await completeStage(page, stage);
}

test.describe('the completion panel', () => {
  test('appears only at Complete, and hands the bundle over honestly', async ({
    page,
    context,
  }) => {
    await signIn(context, await createSignedInUser('completion'));
    await startSession(page, 'A recipe app for busy cooks');

    // Not before: the panel belongs to the terminal position, not to a stage that is nearly there.
    await expect(page.getByTestId('session-complete')).toHaveCount(0);
    await expect(page.getByTestId('build-with')).toHaveCount(0);

    await walkToComplete(page);

    const panel = page.getByTestId('session-complete');
    await expect(panel).toBeVisible();
    await expect(page.getByTestId('completion-bundle')).toHaveText('a-recipe-app-for-busy-cooks');
    await expect(page.getByTestId('completion-file-count')).toHaveText('4');

    // The handoff panel is below it, and it says what the buttons do before they are pressed.
    const buildWith = page.getByTestId('build-with');
    await expect(buildWith).toBeVisible();
    await expect(buildWith).toContainText('copy that prompt and open the platform');
    await expect(buildWith).toContainText('we do not send your bundle anywhere');

    await page.getByTestId('generate-ai-prompt').click();

    const prompt = page.getByTestId('handoff-prompt');
    await expect(prompt).toBeVisible();

    const text = await prompt.inputValue();

    // This bundle: its name, its workflow, its files, at the revisions that were approved.
    expect(text).toContain('a-recipe-app-for-busy-cooks');
    expect(text).toContain('MySpec · Greenfield · V1');
    for (const fileName of ['constitution.md', 'requirements.md', 'solution.md', 'tasks.md']) {
      expect(text).toContain(`${fileName} — approved revision 1`);
    }
    expect(text).toContain('.specs/');
  });

  /*
   * FR-015: the archive is the export contract. Two buttons produce it, so the assertion is that
   * they produce the same thing — same file names, same bytes.
   */
  test('its Download equals the export panel’s, file for file', async ({ page, context }) => {
    await signIn(context, await createSignedInUser('completion-download'));
    await startSession(page, 'A tool whose two download buttons agree.');
    await walkToComplete(page);

    const fromPanel = await downloadBundle(page, 'completion-download');
    const fromExport = await downloadBundle(page, 'download-export');

    expect(fromPanel.names).toEqual(fromExport.names);
    for (const name of fromPanel.names) {
      expect(fromPanel.entries[name], `${name} differs between the two downloads`).toBe(
        fromExport.entries[name],
      );
    }
  });

  test('a platform button copies the prompt and opens the platform', async ({ page, context }) => {
    await signIn(context, await createSignedInUser('completion-platform'));
    await startSession(page, 'A tool that opens a tab and says so.');
    await walkToComplete(page);

    /*
     * The platform is stubbed at the network, not visited.
     *
     * The claim under test is that *we* open that host — not that lovable.dev is up. A suite that
     * reached a third party on every run would be making a real request to a real service for no
     * information (NFR-012 AC-2), and would go red the day that service did.
     */
    await context.route('https://lovable.dev/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<title>stub</title>' }),
    );

    const opened = context.waitForEvent('page');
    await page.getByTestId('build-with-lovable').click();

    const tab = await opened;
    expect(new URL(tab.url()).hostname).toContain('lovable');
    await tab.close();

    // The prompt is on screen to be copied by hand as well — a clipboard write can be refused by
    // the browser, and the text must not be the thing that gets lost when it is.
    await expect(page.getByTestId('handoff-prompt')).toBeVisible();
  });
});
