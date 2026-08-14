import { expect, test, type Page } from '@playwright/test';

import { createSignedInUser, reachDrafting, signIn } from './fixtures';

/**
 * Rename, duplicate and delete, from the list (tasks 76, 77; FR-002 AC-3..AC-7).
 *
 * Deletion is the one that has to be walked rather than asserted from a route test: AC-4 is about a
 * *person* being told the action is permanent, and the only place that claim can be checked is the
 * dialog they read.
 */
async function startSession(page: Page, prompt: string): Promise<string> {
  await page.goto('/projects');
  await expect(page.getByTestId('create-project')).toBeEnabled();
  await page.getByTestId('prompt-input').fill(prompt);
  await page.getByTestId('create-project').click();
  await expect(page.getByTestId('session')).toBeVisible();

  return page.url();
}

test.describe('project lifecycle', () => {
  test('a rename changes the name and nothing else (AC-3)', async ({ page, context }) => {
    await signIn(context, await createSignedInUser('owner'));
    const projectUrl = await startSession(page, 'A project that will be renamed');

    await reachDrafting(page);
    await page.getByTestId('generate-spec').click();
    await expect(page.getByTestId('spec-card')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('approve-spec').click();
    await expect(page.getByTestId('spec-card')).toContainText('approved');

    await page.goto('/projects');
    await page.getByTestId('rename-project').click();
    await page.getByTestId('rename-input').fill('Renamed, same work');
    await page.getByTestId('rename-save').click();

    await expect(page.getByTestId('project-name')).toHaveText('Renamed, same work');

    // The session is untouched: same stage, same approved revision, same prompt.
    await page.goto(projectUrl);
    await expect(page.getByTestId('session-project-name')).toHaveText('Renamed, same work');
    await expect(page.getByTestId('session-prompt')).toHaveText('A project that will be renamed');
    await expect(page.getByTestId('spec-revision-number')).toHaveText('1');
    await expect(page.getByTestId('spec-card')).toContainText('approved');
    await expect(page.getByTestId('export-included')).toContainText('constitution.md');
  });

  test('deletion asks first, says it is permanent, and can be declined (AC-4)', async ({
    page,
    context,
  }) => {
    await signIn(context, await createSignedInUser('owner'));
    await startSession(page, 'A project that survives a change of mind');

    await page.goto('/projects');
    await page.getByTestId('delete-project').click();

    const dialog = page.getByTestId('delete-confirm-text');
    await expect(dialog).toBeVisible();
    // AC-4: the confirmation states that deletion is permanent (DR-7).
    await expect(dialog).toContainText('permanently');
    await expect(dialog).toContainText('cannot be undone');

    await page.getByTestId('delete-cancel').click();
    await expect(page.getByTestId('projects-list')).toBeVisible();
    await expect(page.getByTestId('project-name')).toHaveText(
      'A project that survives a change of mind',
    );
  });

  test('a confirmed deletion removes the project from every listing (AC-5)', async ({
    page,
    context,
  }) => {
    await signIn(context, await createSignedInUser('owner'));
    const projectUrl = await startSession(page, 'A project that will be deleted');

    await page.goto('/projects');
    await page.getByTestId('delete-project').click();
    await page.getByTestId('delete-confirm').click();

    await expect(page.getByTestId('projects-empty')).toBeVisible();

    // Gone, not hidden: the session URL is a 404 like any other project that never existed.
    const response = await page.goto(projectUrl);
    expect(response?.status()).toBe(404);
  });

  test('a duplicate resumes mid-session, and the two are independent (AC-6/AC-7)', async ({
    page,
    context,
  }) => {
    await signIn(context, await createSignedInUser('owner'));
    const sourceUrl = await startSession(page, 'A project worth forking');

    await reachDrafting(page);
    await page.getByTestId('generate-spec').click();
    await expect(page.getByTestId('spec-card')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('approve-spec').click();
    await expect(page.getByTestId('spec-card')).toContainText('approved');

    await page.goto('/projects');
    await page.getByTestId('duplicate-project').click();

    await expect(page.getByTestId('project-row')).toHaveCount(2);
    const names = await page.getByTestId('project-name').allTextContents();
    expect(names).toContain('A project worth forking (copy)');

    // The copy opens straight into the position the source was in, with its work intact.
    await page.getByText('A project worth forking (copy)').click();
    await expect(page.getByTestId('session')).toBeVisible();
    await expect(page.getByTestId('session-prompt')).toHaveText('A project worth forking');
    await expect(page.getByTestId('spec-revision-number')).toHaveText('1');
    await expect(page.getByTestId('spec-card')).toContainText('approved');
    // AC-6: the gates pass on the first attempt — the door out of drafting is open, not blocked.
    await expect(page.getByTestId('answer-history')).toBeVisible();
    await expect(page.getByTestId('export-included')).toContainText('constitution.md');

    const copyUrl = page.url();
    expect(copyUrl).not.toBe(sourceUrl);

    // AC-7: refining the copy leaves the source at revision 1.
    await page.getByTestId('refine-instruction').fill('Add a non-goals section.');
    await page.getByTestId('submit-refinement').click();
    await expect(page.getByTestId('diff-card')).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('accept-diff').click();
    await expect(page.getByTestId('spec-revision-number')).toHaveText('2');

    await page.goto(sourceUrl);
    await expect(page.getByTestId('spec-revision-number')).toHaveText('1');
    await expect(page.getByTestId('diff-card')).toHaveCount(0);
  });
});
