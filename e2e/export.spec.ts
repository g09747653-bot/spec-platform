import { unzipSync, strFromU8 } from 'fflate';
import { expect, test, type Page } from '@playwright/test';

import { createSignedInUser, reachDrafting, signIn } from './fixtures';

/**
 * The export surface: the manifest at download, and copying one file (tasks 73, 74; FR-015, FR-016).
 *
 * **Why the clipboard is stubbed.** The three engines disagree about what a page may do with the
 * system clipboard, and only Chromium exposes a permission Playwright can grant — so a test of the
 * real clipboard would assert the browser's policy on one engine and skip the other two. What the
 * application is responsible for is *what it hands over* and *what it does when the hand-over is
 * refused*, and both of those are observable with a recording double. The double is installed before
 * the page loads and is the only thing about the run that is not the shipping code path.
 */

/** Replaces `navigator.clipboard.writeText` with a recorder. Returns nothing; read via `clipboardText`. */
async function stubClipboard(page: Page, behaviour: 'accept' | 'refuse'): Promise<void> {
  await page.addInitScript((mode: string) => {
    const record: { text: string | null } = { text: null };
    Object.defineProperty(window, '__clipboard', { value: record, writable: false });

    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (text: string) => {
          if (mode === 'refuse') return Promise.reject(new Error('clipboard unavailable'));
          record.text = text;
          return Promise.resolve();
        },
      },
    });
  }, behaviour);
}

const clipboardText = (page: Page): Promise<string | null> =>
  page.evaluate(
    () => (window as unknown as { __clipboard: { text: string | null } }).__clipboard.text,
  );

/**
 * Prompt → interview → generate → approve, leaving exactly `constitution.md` in the bundle.
 *
 * The navigation happens **here**, not in `beforeEach`, because `addInitScript` applies to documents
 * loaded after it is registered. Stubbing the clipboard on an already-loaded page installs nothing,
 * the real one answers, and the test then asserts the browser's permission policy by accident — which
 * is precisely how the first draft of these two cases failed.
 */
async function approveConstitution(page: Page): Promise<void> {
  await page.goto('/projects');
  await expect(page.getByTestId('create-project')).toBeEnabled();

  await page.getByTestId('prompt-input').fill('A bundle worth exporting before it is finished');
  await page.getByTestId('create-project').click();
  await expect(page.getByTestId('session')).toBeVisible();

  await reachDrafting(page);

  await page.getByTestId('generate-spec').click();
  await expect(page.getByTestId('spec-card')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('approve-spec').click();
  await expect(page.getByTestId('spec-card')).toHaveAttribute('data-approved', 'true');
}

test.describe('bundle export and single-file copy', () => {
  test.beforeEach(async ({ context }) => {
    const owner = await createSignedInUser('exporter');
    await signIn(context, owner);
  });

  test('an incomplete bundle downloads, and the manifest names what was left out (FR-015 AC-6/AC-7/AC-8)', async ({
    page,
  }) => {
    await approveConstitution(page);

    // Before the download the panel states an estimate from persisted state.
    await expect(page.getByTestId('export-included')).toContainText('constitution.md');
    await expect(page.getByTestId('export-omitted')).toContainText('requirements.md');

    const download = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('download-export').click(),
    ]).then(([event]) => event);

    /*
     * AC-7: the manifest shown after the download describes the archive that was produced, in the
     * past tense — not the estimate the page was rendered with.
     */
    const produced = page.getByTestId('export-downloaded');
    await expect(produced).toHaveAttribute('data-mode', 'default');
    await expect(produced).toContainText('constitution.md');
    /*
     * The three files the archive went without, read from the manifest's own list rather than from
     * the sentence built around it — the attribute is `manifest.omitted` joined by commas, so an
     * archive that quietly included one of them fails here as loudly as before.
     */
    await expect(produced).toHaveAttribute('data-omitted', 'requirements.md,solution.md,tasks.md');

    const path = await download.path();
    expect(path).not.toBeNull();

    const { readFile } = await import('node:fs/promises');
    const archive = unzipSync(new Uint8Array(await readFile(path)));

    // AC-8: the manifest is nowhere inside the archive, and AC-9: nothing empty was emitted.
    expect(Object.keys(archive)).toEqual(['constitution.md']);
    expect(strFromU8(archive['constitution.md'] ?? new Uint8Array()).trim()).not.toBe('');
  });

  test('a single file is copied as raw markdown, and the copy is confirmed (FR-016 AC-1..AC-3/AC-5)', async ({
    page,
  }) => {
    await stubClipboard(page, 'accept');
    await approveConstitution(page);

    const shown = (await page.getByTestId('spec-content').textContent()) ?? '';

    await page.getByTestId('copy-constitution.md').click();
    // AC-3: the confirmation is on the control that was pressed, and it is that control's state.
    await expect(page.getByTestId('copy-constitution.md')).toHaveAttribute(
      'data-copy-state',
      'copied',
    );

    const copied = await clipboardText(page);

    expect(copied).not.toBeNull();
    // AC-2: exactly the stored markdown — the same bytes the card renders, with nothing added.
    expect(copied).toBe(shown);
    expect(copied?.startsWith('```')).toBe(false);
    expect(copied?.endsWith('```')).toBe(false);
  });

  test('a refused clipboard offers the raw content for manual selection (FR-016 AC-4)', async ({
    page,
  }) => {
    await stubClipboard(page, 'refuse');
    await approveConstitution(page);

    const shown = (await page.getByTestId('spec-content').textContent()) ?? '';

    await page.getByTestId('copy-constitution.md').click();

    const manual = page.getByTestId('copy-manual-text');
    await expect(manual).toBeVisible();
    await expect(manual).toHaveValue(shown);
    await expect(page.getByTestId('copy-manual')).toContainText('constitution.md');
  });

  test('the copied bytes are the same bytes the archive holds', async ({ page }) => {
    await stubClipboard(page, 'accept');
    await approveConstitution(page);

    await page.getByTestId('copy-constitution.md').click();
    await expect(page.getByTestId('copy-constitution.md')).toHaveAttribute(
      'data-copy-state',
      'copied',
    );
    const copied = await clipboardText(page);

    const download = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('download-export').click(),
    ]).then(([event]) => event);

    const { readFile } = await import('node:fs/promises');
    const archive = unzipSync(new Uint8Array(await readFile(await download.path())));

    // FR-016 AC-5, stated as the property that actually matters: one file, two routes, one answer.
    expect(strFromU8(archive['constitution.md'] ?? new Uint8Array())).toBe(copied);
  });
});
