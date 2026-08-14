import { expect, test } from '@playwright/test';

import { createSignedInUser, downloadBundle, reachDrafting, signIn } from './fixtures';

/**
 * The walking skeleton, end to end (task 23; SC-16; constitution — Testing Approaches item 2).
 *
 * Sign in → prompt → interview → generate a spec → approve → download the ZIP, driven through the real
 * application against a real database and the deterministic stub provider. No model is contacted, so the
 * run is repeatable and a failure means something is broken rather than that a model varied.
 *
 * The journey grew an interview in the middle at task 45, and that is the point rather than an
 * inconvenience: generation now checks the `collect → generate` gate before it calls a model, so
 * reaching a draft *requires* answering the questions. A skeleton that could still skip the gate would
 * be evidence the gate was not wired.
 *
 * This is the journey the milestone gate is walked by hand; the test exists so it cannot silently rot as
 * the later milestones deepen it.
 */
test.describe('walking skeleton', () => {
  test('prompt to downloaded ZIP, with a decision in between', async ({ page, context }) => {
    const owner = await createSignedInUser('owner');
    await signIn(context, owner);

    // --- The list starts empty, and the prompt form is the way in (FR-002 AC-1; FR-003) ---
    await page.goto('/projects');
    await expect(page.getByTestId('projects-empty')).toBeVisible();
    await expect(page.getByTestId('account-email')).toHaveText(owner.email);
    // The submit control is disabled until the form is hydrated, so this is the point from which an
    // interaction is real rather than a click into a page that cannot yet respond.
    await expect(page.getByTestId('create-project')).toBeEnabled();

    // --- A whitespace-only prompt is refused before anything is created (FR-003 AC-2) ---
    await page.getByTestId('prompt-input').fill('   ');
    await page.getByTestId('create-project').click();
    await expect(page.getByTestId('prompt-error')).toBeVisible();
    await expect(page).toHaveURL(/\/projects$/);

    // --- A described idea starts a session (FR-003 AC-1) ---
    const prompt = 'A recipe app for cooks who hate scrolling past life stories';
    await page.getByTestId('prompt-input').fill(prompt);
    await page.getByTestId('create-project').click();

    await expect(page.getByTestId('session')).toBeVisible();
    await expect(page.getByTestId('session-prompt')).toHaveText(prompt);
    await expect(page.getByTestId('stage-current')).toHaveText(/Interview/);
    const projectUrl = page.url();

    // --- Nothing is approved yet, so the export would omit all four files (FR-015 AC-7) ---
    await expect(page.getByTestId('export-omitted')).toContainText('constitution.md');

    // --- Drafting is gated: the interview and the stage's own collection come first (P1) ---
    await reachDrafting(page);

    // --- Generation streams, then persists one unapproved revision (FR-008 AC-2/AC-3; FR-009 AC-1) ---
    await page.getByTestId('generate-spec').click();
    await expect(page.getByTestId('spec-card')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('spec-file-name')).toHaveText('constitution.md');
    await expect(page.getByTestId('spec-revision-number')).toHaveText('1');
    // The stub writes the sections the assembled prompt asked for, so the document's headings come
    // from the section schema rather than from anything spelled out here (constitution P3).
    await expect(page.getByTestId('spec-content')).toContainText('Specification');
    await expect(page.getByTestId('approve-spec')).toBeVisible();

    // --- The decision survives a reload: the same card comes back (FR-017 AC-4) ---
    await page.reload();
    await expect(page.getByTestId('spec-revision-number')).toHaveText('1');
    await expect(page.getByTestId('approve-spec')).toBeVisible();

    // --- Requesting changes appends a new unapproved revision (FR-009 AC-4/AC-5) ---
    await page.getByTestId('request-changes').click();
    await page.getByTestId('change-instruction').fill('Add a non-goals section.');
    await page.getByTestId('submit-changes').click();

    await expect(page.getByTestId('spec-revision-number')).toHaveText('2');
    await expect(page.getByTestId('spec-content')).toContainText('Add a non-goals section.');
    await expect(page.getByTestId('approve-spec')).toBeVisible();

    // --- Approving marks that revision approved (FR-009 AC-3) ---
    await page.getByTestId('approve-spec').click();
    await expect(page.getByTestId('spec-card')).toContainText('approved');
    await expect(page.getByTestId('approve-spec')).toHaveCount(0);
    await expect(page.getByTestId('export-included')).toContainText('constitution.md');

    // --- The ZIP contains exactly the approved file, named exactly (FR-015 AC-1/AC-5/AC-10) ---
    const archive = await downloadBundle(page);

    expect(archive.names).toEqual(['constitution.md']);
    const exported = archive.entries['constitution.md'] ?? '';

    expect(exported).toContain('Specification');
    // The revision that was approved is the one exported — the second, not the first.
    expect(exported).toContain('Add a non-goals section.');

    // --- The project now appears in the list with its stage and name (FR-002 AC-1) ---
    await page.goto('/projects');
    // The name is derived from the prompt (D-20); this one is short enough to be used whole.
    await expect(page.getByTestId('project-name')).toHaveText(prompt);
    await expect(page.getByTestId('project-stage')).toHaveText('Constitution');

    // --- Another user cannot see or open it: 404, not 403 (NFR-005 AC-2; AR-2) ---
    const intruder = await createSignedInUser('intruder');
    const intruderContext = await page.context().browser()?.newContext();
    if (intruderContext === undefined) throw new Error('could not open a second browser context');

    try {
      await signIn(intruderContext, intruder);
      const intruderPage = await intruderContext.newPage();

      await intruderPage.goto('/projects');
      await expect(intruderPage.getByTestId('projects-empty')).toBeVisible();

      const response = await intruderPage.goto(projectUrl);
      expect(response?.status()).toBe(404);
      await expect(intruderPage.getByText('Not found')).toBeVisible();
      await expect(intruderPage.getByText('recipe app')).toHaveCount(0);

      const exportResponse = await intruderPage.request.get(
        `${new URL(projectUrl).pathname.replace('/projects/', '/api/projects/')}/export`,
      );
      expect(exportResponse.status()).toBe(404);
    } finally {
      await intruderContext.close();
    }

    // --- Signing out invalidates the session itself, not just the browser's copy (FR-001 AC-6) ---
    await page.goto('/projects');
    await page.getByTestId('sign-out').click();
    await expect(page).toHaveURL(/\/signin/);

    // The claim of AC-6 is about the *prior credential*: put the same token back and it must be
    // worthless, because the row behind it is gone. Clearing the cookie alone would prove nothing.
    await signIn(context, owner);
    const withRevokedToken = await page.goto(projectUrl);
    expect(withRevokedToken?.url()).toContain('/signin');
  });

  test('an anonymous visitor is sent to sign-in and learns nothing about what exists (FR-001 AC-5)', async ({
    page,
  }) => {
    const real = await createSignedInUser('quiet');
    const context = page.context();
    await signIn(context, real);
    await page.goto('/projects');
    await expect(page.getByTestId('create-project')).toBeEnabled();
    await page.getByTestId('prompt-input').fill('A private idea nobody else may see');
    await page.getByTestId('create-project').click();
    await expect(page.getByTestId('session')).toBeVisible();
    const projectUrl = page.url();

    await context.clearCookies();

    const existing = await page.goto(projectUrl);
    expect(existing?.url()).toContain('/signin');

    const imaginary = await page.goto('/projects/11111111-2222-3333-4444-555555555555');
    expect(imaginary?.url()).toContain('/signin');

    // Both answers are the same page, so the redirect discloses nothing about existence.
    await expect(page.getByTestId('signin-google')).toBeVisible();
  });
});
