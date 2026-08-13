import { expect, test, type Page } from '@playwright/test';

import { createSignedInUser, reachDrafting, signIn } from './fixtures';

/**
 * Conversational refinement, end to end (tasks 59 and 60; FR-011).
 *
 * The claims here are about what the user can see and what survives: a diff before anything is
 * saved, a rejection that changes nothing, an acceptance that adds exactly one revision, and a
 * second instruction that is refused while a decision is outstanding.
 *
 * Driven against the deterministic stub provider, whose refinement answers are keyed off the
 * instruction: an ordinary request appends a line, "remove the X section" actually removes it, and
 * a vague request comes back as a question.
 */
async function draftASpec(page: Page): Promise<void> {
  await page.goto('/projects');
  await expect(page.getByTestId('create-project')).toBeEnabled();
  await page.getByTestId('prompt-input').fill('A tool for refining specifications by conversation');
  await page.getByTestId('create-project').click();
  await expect(page.getByTestId('session')).toBeVisible();

  await reachDrafting(page);
  await page.getByTestId('generate-spec').click();
  await expect(page.getByTestId('spec-card')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('refine-card')).toBeVisible();
}

test.describe('conversational refinement', () => {
  test('an instruction shows a diff and saves nothing until accepted (AC-1..AC-4)', async ({
    page,
    context,
  }) => {
    await signIn(context, await createSignedInUser('refiner'));
    await draftASpec(page);

    await expect(page.getByTestId('spec-revision-number')).toHaveText('1');

    // --- The instruction produces a diff, and no revision (AC-1/AC-2) ---
    await page.getByTestId('refine-instruction').fill('Add a note about non-goals.');
    await page.getByTestId('submit-refinement').click();

    await expect(page.getByTestId('diff-card')).toBeVisible();
    await expect(page.getByTestId('diff-body')).toContainText('Add a note about non-goals.');
    await expect(page.getByTestId('diff-file-name')).toHaveText('constitution.md');
    // Still revision 1: the proposal is not spec content (DR-10).
    await expect(page.getByTestId('spec-revision-number')).toHaveText('1');

    // --- The pending diff survives a reload (FR-017 AC-4) ---
    await page.reload();
    await expect(page.getByTestId('diff-card')).toBeVisible();

    // --- While it is pending, the instruction box is gone (AC-6) ---
    await expect(page.getByTestId('refine-card')).toHaveCount(0);

    // --- Accepting persists exactly one new revision (AC-4) ---
    await expect(page.getByTestId('accept-diff')).toBeEnabled();
    await page.getByTestId('accept-diff').click();

    await expect(page.getByTestId('spec-revision-number')).toHaveText('2');
    await expect(page.getByTestId('spec-content')).toContainText('Add a note about non-goals.');
    await expect(page.getByTestId('diff-card')).toHaveCount(0);
    await expect(page.getByTestId('refine-card')).toBeVisible();
  });

  test('rejecting discards the proposal and leaves the file unchanged (AC-5)', async ({
    page,
    context,
  }) => {
    await signIn(context, await createSignedInUser('rejecter'));
    await draftASpec(page);

    const before = await page.getByTestId('spec-content').textContent();

    await page.getByTestId('refine-instruction').fill('Add a paragraph about scope.');
    await page.getByTestId('submit-refinement').click();
    await expect(page.getByTestId('diff-card')).toBeVisible();

    await page.getByTestId('reject-diff').click();

    // No revision, and the content is exactly what it was.
    await expect(page.getByTestId('spec-revision-number')).toHaveText('1');
    expect(await page.getByTestId('spec-content').textContent()).toBe(before);
    await expect(page.getByTestId('diff-card')).toHaveCount(0);

    // And the file is free again: rejecting is a decision, not a lock.
    await expect(page.getByTestId('refine-card')).toBeVisible();
  });

  test('an ambiguous instruction asks a question instead of guessing (AC-9)', async ({
    page,
    context,
  }) => {
    await signIn(context, await createSignedInUser('vague'));
    await draftASpec(page);

    await page.getByTestId('refine-instruction').fill('Make it better.');
    await page.getByTestId('submit-refinement').click();

    await expect(page.getByTestId('refine-question')).toBeVisible();
    // Nothing to accept: a question is not a proposal with an empty diff.
    await expect(page.getByTestId('diff-card')).toHaveCount(0);
    await expect(page.getByTestId('spec-revision-number')).toHaveText('1');
  });

  test('an instruction that would delete a required section is refused, naming it (AC-8)', async ({
    page,
    context,
  }) => {
    await signIn(context, await createSignedInUser('deleter'));
    await draftASpec(page);

    // The generated document's first required heading, read off the page rather than restated here
    // — the section schema is not something a test may name (constitution P3).
    const heading = (await page.getByTestId('spec-content').textContent())
      ?.split('\n')
      .map((line) => /^##\s+(.+?)\s*$/.exec(line)?.[1])
      .find((found): found is string => found !== undefined);

    expect(heading).toBeDefined();

    await page.getByTestId('refine-instruction').fill(`Remove the ${heading ?? ''} section.`);
    await page.getByTestId('submit-refinement').click();

    await expect(page.getByTestId('refine-error')).toContainText(heading ?? '');
    await expect(page.getByTestId('diff-card')).toHaveCount(0);
    await expect(page.getByTestId('spec-revision-number')).toHaveText('1');
  });
});
