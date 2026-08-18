import { expect, test } from '@playwright/test';

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
 * The critical journey (task 80; SC-16; constitution — Testing Approaches item 2).
 *
 * `prompt → interview → four stages with approvals and reviews → ZIP download`, walked once, without
 * intervention, against the deterministic stub. This is the test the constitution names as mandatory
 * and the one the release gate rests on: everything else in the suite proves a part works, and this
 * proves the parts compose into a product.
 *
 * **No dead end** is the claim, and it is asserted the only way it can be: by never touching the
 * database, never calling an endpoint directly, and never skipping a gate. Every step below is a
 * control a person clicks. If a gate stops opening — or if a door the interface should offer goes
 * missing, as the door out of `review` did before task 78 — this test stops at that step and says
 * where.
 *
 * It is deliberately long rather than split into four. The claim is about the *whole* path: four
 * shorter tests, each starting from a seeded position, would prove that each stage works from a state
 * a fixture invented, which is a different and weaker thing.
 */
test.describe('critical journey', () => {
  test('prompt to a four-file bundle, with every approval and review taken by hand', async ({
    page,
    context,
  }) => {
    /*
     * The default 30 s is a budget for one interaction, and this is a journey: four generations,
     * four approvals, four reviews and an export, each a real round trip through the real handlers.
     * It fits comfortably on a developer machine and does not always fit on a loaded CI runner —
     * which is a fact about the runner, so it is stated as one rather than left to chance.
     */
    test.slow();

    const owner = await createSignedInUser('journey');
    await signIn(context, owner);

    // --- prompt → session (FR-003 AC-1) ---
    const prompt = 'A tool that turns a rough idea into a specification an agent can build from';
    const sessionUrl = await startSession(page, prompt);

    await expect(page.getByTestId('session-prompt')).toHaveText(prompt);
    /*
     * The position, not the pill's word for it (task 143). The current step carries the canonical
     * stage id beside its label, and the id is what this journey is claiming at every checkpoint
     * below: the label is the methodology's to choose and the interface's to translate.
     */
    await expect(page.getByTestId('stage-current')).toHaveAttribute('data-stage', 'interview');
    // Nothing is approved, so every file of the bundle is currently missing (FR-015 AC-7).
    await expect(page.getByTestId('export-omitted')).toContainText('constitution.md');
    await expect(page.getByTestId('export-omitted')).toContainText('tasks.md');

    // --- the grounding interview, through its three-condition gate (constitution A2) ---
    await completeInterview(page);

    // --- the four stages: collect, draft, approve, review, decide (FR-007; FR-009; FR-010) ---
    for (const stage of PARITY_STAGES) {
      await expect(page.getByTestId('stage-current')).toHaveAttribute('data-stage', stage);

      await completeStage(page, stage);

      // The file this stage produced is now in the bundle, and it was not before.
      await expect(page.getByTestId('export-included')).toContainText(`${stage}.md`);
    }

    // --- the final accepted review sealed the session (FR-020 AC-1) ---
    await expect(page.getByTestId('stage-current')).toHaveAttribute('data-stage', 'complete');
    await expect(page.getByTestId('session-complete')).toBeVisible();
    // FR-020 AC-3: a completed session presents the export actions.
    await expect(page.getByTestId('export-panel')).toBeVisible();
    await expect(page.getByTestId('export-omitted')).toHaveCount(0);

    // --- the ZIP: exactly four files, named exactly (FR-015 AC-2/AC-5/AC-10) ---
    const archive = await downloadBundle(page);

    expect(archive.names).toEqual([
      'constitution.md',
      'requirements.md',
      'solution.md',
      'tasks.md',
    ]);

    for (const stage of PARITY_STAGES) {
      const content = archive.entries[`${stage}.md`] ?? '';

      // Not empty, not a placeholder, and structured — the stub wrote the sections it was asked for.
      expect(content.trim(), `${stage}.md is empty`).not.toBe('');
      expect(content, `${stage}.md has no headings`).toMatch(/^#/m);
    }

    // The manifest is beside the archive, never inside it (FR-015 AC-8).
    expect(archive.names).not.toContain('manifest.md');
    expect(archive.names).not.toContain('quality.md');

    // The mode the manifest recorded for the archive that was just saved, as the manifest spells it.
    await expect(page.getByTestId('export-downloaded')).toHaveAttribute('data-mode', 'default');

    // --- the seal survives a reload: the journey ends where it ended (FR-017 AC-1; FR-020 AC-9) ---
    await page.goto(sessionUrl);
    await expect(page.getByTestId('stage-current')).toHaveAttribute('data-stage', 'complete');
    await expect(page.getByTestId('session-complete')).toBeVisible();
    // Nothing offers a way onward — with no Quality module installed there is no door out (AC-9).
    await expect(page.getByTestId('proceed')).toHaveCount(0);

    // --- but refinement is still alive on a completed session (FR-020 AC-4) ---
    await expect(page.getByTestId('refine-card')).toBeVisible();
  });
});
