import { expect, test } from '@playwright/test';

import { createSignedInUser, signIn } from './fixtures/auth';
import { reachDrafting, startSession } from './fixtures/journey';

/**
 * The document viewer as a door on every card (task 138).
 *
 * The customer's words: their reference opens a generated file into a full reading surface, ours
 * opened «a small window». These tests assert the three states the acceptance criterion names —
 * being written, drafted, approved — plus the two things the header was asked for (line and word
 * counts that are true) and the invariant an open viewer must not cost (Stop stays reachable).
 */
test.describe('the document viewer pane', () => {
  test('opens from a drafted card and from an approved one, in all four views', async ({
    page,
    context,
  }) => {
    await signIn(context, await createSignedInUser('viewer'));
    await page.setViewportSize({ width: 1440, height: 900 });

    await startSession(page, 'A tool whose documents can be read properly');
    await reachDrafting(page);

    await page.getByTestId('generate-spec').click();
    await expect(page.getByTestId('spec-card')).toBeVisible({ timeout: 40_000 });

    // 1 — drafted: the document exists, nobody has approved it, and it can be read.
    await expect(page.getByTestId('document-approved')).toHaveCount(0);
    await page.getByTestId('spec-card').getByTestId('open-viewer').click();

    await expect(page.getByTestId('viewer-pane')).toBeVisible();
    await expect(page.getByTestId('viewer-pane-name')).toHaveText('constitution.md');
    await expect(page.getByTestId('viewer-metric-revision')).toHaveText('Rev 1');

    for (const view of ['outline', 'preview', 'raw', 'diff'] as const) {
      await page.getByTestId(`viewer-pane-tab-${view}`).click();
      await expect(page.getByTestId('viewer-pane')).toHaveAttribute('data-view', view);
    }

    // Rev 1 has no predecessor, and the Diff view says so rather than erroring.
    await expect(page.getByTestId('viewer-pane-diff-empty')).toBeVisible();

    // Raw carries a number for every line of the document (task 138 AC).
    await page.getByTestId('viewer-pane-tab-raw').click();
    const raw = (await page.getByTestId('viewer-raw').textContent()) ?? '';
    const lines = raw.replace(/\n$/u, '').split('\n').length;
    await expect(page.getByTestId('viewer-raw-gutter')).toHaveAttribute(
      'data-lines',
      String(lines),
    );
    /*
     * Located by element rather than by role: the gutter is `aria-hidden`, so its items are not in
     * the accessibility tree at all — which is the intended behaviour (a screen reader should not
     * read a column of digits before the document) and would make a role query find nothing.
     */
    await expect(page.getByTestId('viewer-raw-gutter').locator('li')).toHaveCount(lines);
    await expect(page.getByTestId('viewer-raw-gutter').locator('li').first()).toHaveText('1');
    await expect(page.getByTestId('viewer-raw-gutter').locator('li').last()).toHaveText(
      String(lines),
    );

    // The whole document is on screen, not an excerpt: the pane is far wider than the card's well.
    const pane = await page.getByTestId('viewer-pane').boundingBox();
    expect(Math.round(pane?.width ?? 0)).toBeGreaterThan(400);

    // Closing returns the panels.
    await page.getByTestId('viewer-pane-close').click();
    await expect(page.getByTestId('viewer-pane')).toHaveCount(0);
    await expect(page.getByTestId('sidebar-panel')).toBeVisible();

    // 2 — approved: the same door, on a card that has been decided.
    await page.getByTestId('approve-spec').click();
    await expect(page.getByTestId('spec-card')).toContainText('approved');

    await page.getByTestId('spec-card').getByTestId('open-viewer').click();
    await expect(page.getByTestId('viewer-pane')).toBeVisible();
    await expect(page.getByTestId('viewer-pane-metrics')).toContainText('approved');

    /*
     * The counts are the exported bytes' own counts (task 138 AC). Fetched from the endpoint the
     * archive and the clipboard resolve through, so «lines» and «words» in the header are the same
     * numbers `wc` would print about the file the user downloads.
     */
    const href = await page.getByTestId('viewer-pane-full').getAttribute('href');
    const specFileId = (href ?? '').split('/').at(-1)?.split('?')[0] ?? '';
    const exported = await page.evaluate(
      async (id) => (await fetch(`/api/specs/${id}/content`)).text(),
      specFileId,
    );

    const expectedLines = exported.replace(/\n$/u, '').split('\n').length;
    const expectedWords = exported.trim().split(/\s+/u).length;

    await expect(page.getByTestId('viewer-metric-lines')).toHaveText(`${String(expectedLines)} lines`);
    await expect(page.getByTestId('viewer-metric-words')).toHaveText(`${String(expectedWords)} words`);
  });

  test('opens on a document still being written, and Stop stays reachable', async ({
    page,
    context,
  }) => {
    await signIn(context, await createSignedInUser('viewer'));
    await page.setViewportSize({ width: 1440, height: 900 });

    await startSession(page, 'A tool whose viewer follows a live generation');
    await reachDrafting(page);

    /*
     * A generation that opens, writes a little, and then holds the socket — the state a slow
     * provider actually produces, and the only one in which «generating» is observable for longer
     * than an instant. Same technique as `liveness.spec.ts`.
     */
    await page.route('**/api/sessions/*/generate', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/x-ndjson',
        body:
          `${JSON.stringify({
            type: 'run',
            runId: '11111111-2222-4333-8444-666666666666',
            stage: 'constitution',
            attempt: 1,
          })}\n` +
          `${JSON.stringify({ type: 'delta', sequence: 0, text: '# Constitution\n\nOne line.\n' })}\n`,
      }),
    );
    await page.route('**/api/generations/*/stream*', (route) =>
      route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: '' }),
    );

    await page.getByTestId('generate-spec').click();
    await expect(page.getByTestId('stop-generation')).toBeVisible();

    // 3 — generating: the eye is on the drafting surface, and it opens the same words.
    await page.getByTestId('open-viewer-live').click();
    await expect(page.getByTestId('viewer-pane')).toHaveAttribute('data-viewer-kind', 'live');

    await page.getByTestId('viewer-pane-tab-raw').click();
    await expect(page.getByTestId('viewer-raw')).toContainText('# Constitution');
    await expect(page.getByTestId('viewer-metric-revision')).toHaveText('Draft in progress');

    /*
     * Д-1 with the viewer open: the control that ends the wait is on the surface being looked at.
     * There is one reader behind both — stopping in the pane stops the card too, which is what
     * «no second data path» means when it is observable.
     */
    await expect(page.getByTestId('viewer-stop-generation')).toBeVisible();
    await page.getByTestId('viewer-stop-generation').click();

    await expect(page.getByTestId('generate-spec')).toBeEnabled();
    await expect(page.getByTestId('viewer-stop-generation')).toHaveCount(0);
  });

  test('the V key opens the newest document and Escape closes it', async ({ page, context }) => {
    await signIn(context, await createSignedInUser('viewer'));
    await page.setViewportSize({ width: 1440, height: 900 });

    await startSession(page, 'A tool whose viewer answers the keyboard');
    await reachDrafting(page);

    await page.getByTestId('generate-spec').click();
    await expect(page.getByTestId('spec-card')).toBeVisible({ timeout: 40_000 });

    await page.getByTestId('feed').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('v');
    await expect(page.getByTestId('viewer-pane')).toBeVisible();

    for (const [key, view] of [
      ['1', 'outline'],
      ['3', 'raw'],
      ['2', 'preview'],
    ] as const) {
      await page.keyboard.press(key);
      await expect(page.getByTestId('viewer-pane')).toHaveAttribute('data-view', view);
    }

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('viewer-pane')).toHaveCount(0);
  });
});
