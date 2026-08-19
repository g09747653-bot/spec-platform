import { expect, test } from '@playwright/test';

import { createSignedInUser, signIn } from './fixtures/auth';
import { reachDrafting, startSession } from './fixtures/journey';

/**
 * The document viewer as a door on every card (task 138), as the overlay of task 147.
 *
 * The customer's words: their reference opens a generated file into a full reading surface, ours
 * opened «a small window». These tests assert the three states the acceptance criterion names —
 * being written, drafted, approved — plus the two things the header was asked for (line and word
 * counts that are true) and the invariant an open viewer must not cost (Stop stays reachable).
 *
 * Task 147 added the composition to that list: one width in every view, the outline dropped over a
 * document that stays visible, Copy and Download in the header naming the revision on screen, and
 * three ways out — the ✕, Escape and the scrim.
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
    // Which revision the pane is reading, from the header's own attribute rather than «Rev 1».
    await expect(page.getByTestId('viewer-metric-revision')).toHaveAttribute('data-revision', '1');

    /*
     * One width in every view (task 147 AC), measured rather than eyeballed: the overlay's width is
     * a decision — `max-w-4xl` — and no view may widen it by being wide. That is the property whose
     * absence made D-205 possible.
     */
    const widths = new Map<string, number>();

    for (const view of ['outline', 'preview', 'raw', 'diff'] as const) {
      await page.getByTestId(`viewer-pane-tab-${view}`).click();
      await expect(page.getByTestId('viewer-pane')).toHaveAttribute('data-view', view);
      // The control the reader pressed says it is the one showing, and the others say they are not.
      await expect(page.getByTestId(`viewer-pane-tab-${view}`)).toHaveAttribute(
        'data-state',
        'current',
      );

      const box = await page.getByTestId('viewer-pane').boundingBox();
      widths.set(view, Math.round(box?.width ?? 0));
    }

    expect(
      new Set(widths.values()).size,
      `the four views differ in width: ${JSON.stringify([...widths])}`,
    ).toBe(1);

    // Rev 1 has no predecessor, and the Diff view says so rather than erroring.
    await page.getByTestId('viewer-pane-tab-diff').click();
    await expect(page.getByTestId('viewer-pane-diff-empty')).toBeVisible();

    /*
     * Outline is a panel dropped from its own button, not a fourth pane (task 147; video §1): the
     * document stays on screen underneath it, which is the difference a reader notices.
     */
    await page.getByTestId('viewer-pane-tab-outline').click();
    await expect(page.getByTestId('viewer-pane-outline')).toBeVisible();
    await expect(page.getByTestId('viewer-pane-diff-empty')).toBeVisible();
    await page.getByTestId('viewer-pane-tab-outline').click();
    await expect(page.getByTestId('viewer-pane-outline')).toHaveCount(0);

    // Raw carries a number for every line of the document (task 138 AC).
    await page.getByTestId('viewer-pane-tab-raw').click();
    const raw = (await page.getByTestId('viewer-raw').textContent()) ?? '';
    const lines = raw.replace(/\n$/u, '').split('\n').length;

    /*
     * The numbers are a CSS counter over one span per logical line, not a parallel `<ol>` of `<li>`
     * (task 147): a line that wraps must not carry its number onto the second visual line, and a
     * column of numbered elements beside the text cannot do that — it aligns only while every
     * logical line occupies exactly one line box. So `data-lines` moved onto the `<pre>` and the
     * count is taken from the spans the counter increments.
     */
    await expect(page.getByTestId('viewer-raw')).toHaveAttribute('data-lines', String(lines));
    await expect(page.getByTestId('viewer-raw').locator('.raw-line')).toHaveCount(lines);

    // The whole document is on screen, not an excerpt: the panel is far wider than the card's well.
    const pane = await page.getByTestId('viewer-pane').boundingBox();
    expect(Math.round(pane?.width ?? 0)).toBeGreaterThan(400);

    // Closing returns the panels.
    await page.getByTestId('viewer-pane-close').click();
    await expect(page.getByTestId('viewer-pane')).toHaveCount(0);
    await expect(page.getByTestId('sidebar-panel')).toBeVisible();

    // 2 — approved: the same door, on a card that has been decided.
    await page.getByTestId('approve-spec').click();
    await expect(page.getByTestId('spec-card')).toHaveAttribute('data-approved', 'true');

    await page.getByTestId('spec-card').getByTestId('open-viewer').click();
    await expect(page.getByTestId('viewer-pane')).toBeVisible();
    // The decision travels with the document: the pane's own header knows it, not just the card.
    await expect(page.getByTestId('viewer-pane-metrics')).toHaveAttribute('data-approved', 'true');

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

    await expect(page.getByTestId('viewer-metric-lines')).toHaveAttribute(
      'data-lines',
      String(expectedLines),
    );
    await expect(page.getByTestId('viewer-metric-words')).toHaveAttribute(
      'data-words',
      String(expectedWords),
    );

    /*
     * Copy and Download live in the header now (task 147), which is why they are asked for here
     * rather than from inside Raw: they are about the document, not about one way of reading it.
     *
     * Both name the revision on screen. Download's `href` is the assertion that closes the defect —
     * without `?rev=` the endpoint answers «which bytes would be exported», which is the latest
     * *approved* revision and not necessarily the one being read. The `download` attribute is what
     * turns that same URL from a page into a save.
     */
    await page.getByTestId('viewer-pane-tab-preview').click();
    await expect(page.getByTestId('viewer-copy')).toBeVisible();

    const download = page.getByTestId('viewer-download');
    await expect(download).toHaveAttribute('href', `/api/specs/${specFileId}/content?rev=1`);
    await expect(download).toHaveAttribute('download', 'constitution.md');

    /*
     * And the bytes on screen are the bytes that leave. The Raw view's `textContent` is compared
     * with the endpoint's answer character for character — the property the CSS-counter gutter
     * exists to preserve, and the one an interleaved column of numbers would have destroyed.
     */
    await page.getByTestId('viewer-pane-tab-raw').click();
    expect(await page.getByTestId('viewer-raw').textContent()).toBe(exported);
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
    // No stored revision behind these words yet — the header reads the draft, not a numbered one.
    await expect(page.getByTestId('viewer-metric-revision')).toHaveAttribute(
      'data-revision',
      'draft',
    );

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

    /*
     * The third way out, which the overlay owes its reader (task 147): the page around it is
     * visible, so pressing it means «put this away» — the same behaviour the shortcuts dialog has.
     * Pressed at the very corner of the scrim, where nothing but the scrim can be.
     */
    await page.keyboard.press('v');
    await expect(page.getByTestId('viewer-pane')).toBeVisible();
    await page.getByTestId('viewer-overlay').click({ position: { x: 4, y: 4 } });
    await expect(page.getByTestId('viewer-pane')).toHaveCount(0);
  });
});
