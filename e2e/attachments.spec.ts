import { expect, test, type Page } from '@playwright/test';

import { createSignedInUser, reachDrafting, signIn } from './fixtures';

/**
 * Documents as grounding context, end to end (task 68; FR-004 AC-1/AC-2/AC-4/AC-5/AC-6/AC-7).
 *
 * The claims here are about what the user can see and what survives a reload: a document listed with
 * its type, size and the stage it arrived at; a rejection that names the limit or the supported types
 * and leaves nothing behind; a parse failure reported without ending the session; and a removal that
 * empties the list.
 *
 * Uploads go through the real route, the real guard and the real registry. Storage is the in-memory
 * store, selected — as in every other deployment — by the absence of a Blob token: no test-only branch
 * exists in the application (the same rule the sign-in fixture follows).
 */
async function startSession(page: Page): Promise<void> {
  await page.goto('/projects');
  await expect(page.getByTestId('create-project')).toBeEnabled();
  await page.getByTestId('prompt-input').fill('A tool that turns prompts into specifications');
  await page.getByTestId('create-project').click();
  await expect(page.getByTestId('session')).toBeVisible();
}

test.describe('document attachments', () => {
  test('a document is attached, listed, and survives a reload (AC-1/AC-6)', async ({
    page,
    context,
  }) => {
    await signIn(context, await createSignedInUser('attacher'));
    await startSession(page);

    await expect(page.getByTestId('attachments-panel')).toBeVisible();
    await expect(page.getByTestId('attachments-empty')).toBeVisible();

    await page.getByTestId('attachment-input').setInputFiles({
      name: 'constraints.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from('# Constraints\n\nMust run on Postgres. Must export a ZIP.\n'),
    });

    await expect(page.getByTestId('attachment-item')).toHaveCount(1);
    await expect(page.getByTestId('attachment-name')).toHaveText('constraints.md');
    // The type the registry settled on, which is what the line's label is a rendering of.
    const meta = page.getByTestId('attachment-meta');
    await expect(meta).toHaveAttribute('data-mime', 'text/markdown');
    // AC-6: the stage it arrived at is listed, not inferred.
    await expect(meta).toHaveAttribute('data-stage', 'interview');
    await expect(page.getByTestId('attachment-status-ok')).toBeVisible();

    await page.reload();
    await expect(page.getByTestId('attachment-name')).toHaveText('constraints.md');
  });

  test('an unsupported type is refused, naming the supported ones, and nothing is listed (AC-4)', async ({
    page,
    context,
  }) => {
    await signIn(context, await createSignedInUser('rejected'));
    await startSession(page);

    await page.getByTestId('attachment-input').setInputFiles({
      name: 'bundle.zip',
      mimeType: 'application/zip',
      buffer: Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x01]),
    });

    await expect(page.getByTestId('attachment-error')).toBeVisible();
    await expect(page.getByTestId('attachment-error')).toContainText('PDF');
    await expect(page.getByTestId('attachments-empty')).toBeVisible();

    // The session is untouched by a refused upload.
    await expect(page.getByTestId('interview-panel')).toBeVisible();
  });

  test('a document that cannot be read is reported without blocking the session (AC-5)', async ({
    page,
    context,
  }) => {
    await signIn(context, await createSignedInUser('unreadable'));
    await startSession(page);

    // A file that passes the type guard — the PDF signature is real — and defeats the parser.
    await page.getByTestId('attachment-input').setInputFiles({
      name: 'broken.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.7\nnot actually a document body'),
    });

    /*
     * The row that failed is the row for the file that failed (task 143). The status is already a
     * token — the test id is `attachment-status-<parseStatus>` — so the sentence beside it was only
     * ever proving that the copy promises to carry on, which is the part of this row that changes
     * language. What the criterion is about is that the *named* document is the one reported.
     */
    await expect(page.getByTestId('attachment-item')).toHaveCount(1);
    const failed = page
      .getByTestId('attachment-item')
      .filter({ has: page.getByTestId('attachment-status-failed') });
    await expect(failed.getByTestId('attachment-name')).toHaveText('broken.pdf');

    // The interview is still usable: a parse failure is not a session failure.
    await page.getByTestId('ask-round').click();
    await expect(page.getByTestId('mcq-card')).toBeVisible({ timeout: 20_000 });
  });

  /**
   * Task 69 — a document attached after a file was approved (FR-004 AC-9/AC-10).
   *
   * Two claims, and the second is the one that matters: the notice names the approved file, and
   * nothing about the file changes because of it. The revision number is checked before and after,
   * because "no approved file changes as a side effect" is a statement about state, not about intent.
   */
  test('a late document names the approved files and changes none of them (AC-9/AC-10)', async ({
    page,
    context,
  }) => {
    await signIn(context, await createSignedInUser('late'));
    await startSession(page);

    await reachDrafting(page);
    await page.getByTestId('generate-spec').click();
    await expect(page.getByTestId('spec-card')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('approve-spec').click();
    await expect(page.getByTestId('spec-card')).toHaveAttribute('data-approved', 'true');
    await expect(page.getByTestId('spec-revision-number')).toHaveText('1');

    await page.getByTestId('attachment-input').setInputFiles({
      name: 'late-brief.md',
      mimeType: 'text/markdown',
      buffer: Buffer.from('# Late brief\n\nThe budget halved.\n'),
    });

    await expect(page.getByTestId('late-attachment-notice')).toBeVisible();
    await expect(page.getByTestId('late-attachment-file')).toHaveText('constitution.md');

    // AC-10: the approved file is untouched — still revision 1, still approved.
    await expect(page.getByTestId('spec-revision-number')).toHaveText('1');
    await expect(page.getByTestId('spec-card')).toHaveAttribute('data-approved', 'true');

    // The direct action offers a change; it does not make one.
    await page.getByTestId('late-attachment-refine').click();
    await expect(page.getByTestId('diff-card')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('spec-revision-number')).toHaveText('1');
  });

  test('removing a document empties the list (AC-7)', async ({ page, context }) => {
    await signIn(context, await createSignedInUser('remover'));
    await startSession(page);

    await page.getByTestId('attachment-input').setInputFiles({
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Some grounding notes.'),
    });

    await expect(page.getByTestId('attachment-item')).toHaveCount(1);

    await page.getByTestId('attachment-remove').click();

    await expect(page.getByTestId('attachments-empty')).toBeVisible();
    await page.reload();
    await expect(page.getByTestId('attachments-empty')).toBeVisible();
  });
});
