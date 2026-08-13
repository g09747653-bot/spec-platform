import { expect, test, type Page } from '@playwright/test';

import { createSignedInUser, signIn } from './fixtures';

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
    await expect(page.getByTestId('attachment-meta')).toContainText('Markdown');
    // AC-6: the stage it arrived at is listed, not inferred.
    await expect(page.getByTestId('attachment-meta')).toContainText('attached at interview');
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

    await expect(page.getByTestId('attachment-item')).toHaveCount(1);
    await expect(page.getByTestId('attachment-status-failed')).toBeVisible();
    await expect(page.getByTestId('attachment-status-failed')).toContainText(
      'continues without it',
    );

    // The interview is still usable: a parse failure is not a session failure.
    await page.getByTestId('ask-round').click();
    await expect(page.getByTestId('mcq-card')).toBeVisible({ timeout: 20_000 });
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
