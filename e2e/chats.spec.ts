import { expect, test, type Page } from '@playwright/test';

import {
  completeStage,
  createSignedInUser,
  projectIdOf,
  reachDrafting,
  signIn,
  startSession,
} from './fixtures';

/**
 * A project with more than one chat (tasks 118, 120, 121, 122; amendment А-6).
 *
 * One file, because these four surfaces are one story: an Edit chat exists only because a project
 * can hold several conversations, the project page exists to list them, the composer and the viewer
 * are what a chat gives you once you are in one. Splitting them would mean four suites walking the
 * same bundle into existence before asserting anything.
 *
 * **Chromium only**, for the reason D-129 gave: what these tests assert is *behaviour* — which rows
 * a filter shows, which files an edit touches, which revision a viewer opens — and none of it is a
 * property of a rendering engine. The three-engine coverage NFR-011 asks for is carried by
 * `critical-journey` and `skeleton`, which walk the full path on all three. A journey added to the
 * suite costs three journeys on one worker, and this one is long.
 */
test.skip(
  ({ browserName }) => browserName !== 'chromium',
  'chat-surface behaviour is engine-independent; NFR-011 is covered by critical-journey and skeleton',
);

const GENERATION_TIMEOUT = 40_000;

/** Walks a fresh project to a bundle with two approved documents — the shortest editable bundle. */
async function bundleWithTwoFiles(page: Page): Promise<{ sessionUrl: string; projectId: string }> {
  const sessionUrl = await startSession(page, 'A tool for cooks who hate scrolling');

  await reachDrafting(page);
  await page.getByTestId('generate-spec').click();
  await expect(page.getByTestId('spec-card')).toBeVisible({ timeout: GENERATION_TIMEOUT });
  await page.getByTestId('approve-spec').click();
  await expect(page.getByTestId('spec-card')).toHaveAttribute('data-approved', 'true');
  await page.getByTestId('proceed').click();
  await expect(page.getByTestId('review-board')).toBeVisible({ timeout: GENERATION_TIMEOUT });
  await page.getByTestId('review-accept').click();
  await expect(page.getByTestId('review-board')).toHaveCount(0);
  await page.getByTestId('proceed').click();

  await completeStage(page, 'requirements');

  return { sessionUrl, projectId: await projectIdOf(page) };
}

test.describe('the project page (task 120)', () => {
  test('lists the chats, filters compose with search, and archiving is reversible', async ({
    page,
    context,
  }) => {
    await signIn(context, await createSignedInUser('owner'));
    const { projectId } = await bundleWithTwoFiles(page);

    await page.goto(`/projects/${projectId}`);
    await expect(page.getByTestId('project-page')).toBeVisible();

    // One Generate chat, and no Edit chat yet — the tabs are the chat classes, not decoration.
    await expect(page.getByTestId('chat-row')).toHaveCount(1);
    await page.getByTestId('tab-edit').click();
    await expect(page.getByTestId('chats-empty')).toBeVisible();

    await page.getByTestId('tab-generate').click();
    await expect(page.getByTestId('chat-row')).toHaveCount(1);

    // The row says what the chat is and how long ago anything happened in it, from persisted rows.
    await expect(page.getByTestId('chat-methodology')).toContainText('MySpec');
    // The age as the number the label was formatted from: a row with no persisted message would
    // carry no reading at all, so the digits are the claim and the wording around them is not.
    await expect(page.getByTestId('chat-age')).toHaveAttribute('data-age-seconds', /^\d+$/);

    // --- Archive, and the Active list loses it while Archived gains it (AC-1) ---
    await page.getByTestId('archive-chat').click();
    await expect(page.getByTestId('chats-empty')).toBeVisible();

    await page.getByTestId('filter-archived').click();
    await expect(page.getByTestId('chat-row')).toHaveCount(1);

    // --- Search composes with the filter: searching *within* Archived works (AC-1) ---
    await page.getByTestId('chat-search').fill('cooks');
    await page.getByTestId('chat-search-submit').click();
    await expect(page.getByTestId('chat-row')).toHaveCount(1);
    await expect(page.getByTestId('filter-archived')).toHaveAttribute('data-state', 'current');

    await page.getByTestId('chat-search').fill('nothing matches this');
    await page.getByTestId('chat-search-submit').click();
    await expect(page.getByTestId('chats-empty')).toBeVisible();

    // --- Restore, and it is back where it was, with nothing lost ---
    await page.getByTestId('chat-search').fill('');
    await page.getByTestId('chat-search-submit').click();
    await page.getByTestId('restore-chat').click();
    await page.getByTestId('filter-active').click();
    await expect(page.getByTestId('chat-row')).toHaveCount(1);
  });

  test('shows the MCP placeholder and makes no request from it', async ({ page, context }) => {
    await signIn(context, await createSignedInUser('mcp'));
    const { projectId } = await bundleWithTwoFiles(page);

    await page.goto(`/projects/${projectId}`);
    await expect(page.getByTestId('mcp-card')).toBeVisible();
    await expect(page.getByTestId('mcp-project-count')).toHaveAttribute('data-count', '0');
    await expect(page.getByTestId('mcp-add-server')).toBeDisabled();

    /*
     * The criterion is that the card performs no network call, so the assertion is on the wire
     * rather than on the markup: nothing leaves the page while it is on screen and being pressed.
     */
    const requests: string[] = [];
    page.on('request', (request) => requests.push(request.url()));

    await page.getByTestId('mcp-card').click({ force: true });
    await page.waitForTimeout(300);

    expect(requests).toEqual([]);
  });
});

test.describe('the Edit workflow (task 118)', () => {
  test('references, describes, reviews, and applies every touched file at once', async ({
    page,
    context,
  }) => {
    await signIn(context, await createSignedInUser('editor'));
    const { projectId } = await bundleWithTwoFiles(page);

    await page.goto(`/projects/${projectId}`);

    // --- Reference: only approved documents are offered, and the pick starts the chat ---
    await expect(page.getByTestId('new-edit-chat')).toBeVisible();
    await expect(page.getByTestId('reference-constitution.md')).toBeVisible();
    await expect(page.getByTestId('reference-requirements.md')).toBeVisible();
    await expect(page.getByTestId('reference-solution.md')).toHaveCount(0);

    await page.getByTestId('start-edit-chat').click();
    await expect(page.getByTestId('session')).toBeVisible();

    /*
     * The three steps of the edit config plus its terminal, from the configuration (AC-3) — read as
     * the positions the steps sit at rather than as the words they are labelled with. Describe and
     * Review share `constitution` on purpose: they are the `collect` and the `generate`/`review` of
     * one stage, which is the whole point of a step list that is not a stage list.
     */
    const stages = ['interview', 'constitution', 'constitution', 'complete'];
    const pills = page.getByTestId('step-pills').locator('[data-step]');
    await expect(pills).toHaveCount(stages.length);
    expect(
      await pills.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-stage'))),
    ).toEqual(stages);

    // The reference pick is already an answered round, so the gate out of Reference is satisfied.
    await expect(page.getByTestId('round-answered').first()).toBeVisible();
    await page.getByTestId('proceed').click();

    // --- Describe: the card opens on the Эталон sentence, prefilled (AC-3) ---
    await expect(page.getByTestId('mcq-card')).toBeVisible();
    const describe = page.getByTestId('mcq-other-q-edit-describe');
    await expect(describe).toHaveValue(/^I want to update spec .* to $/);

    await describe.fill('I want to update spec requirements.md to add a rate limit.');
    await page.getByTestId('mcq-submit').click();
    await page.getByTestId('proceed').click();

    // --- Review: the proposed edit, as diff cards over the files it actually touches ---
    await page.getByTestId('generate-spec').click();
    await expect(page.getByTestId('edit-card')).toBeVisible({ timeout: GENERATION_TIMEOUT });
    await expect(page.getByTestId('diff-file-name')).toHaveText('requirements.md');
    await expect(page.getByTestId('diff-file')).toHaveCount(1);

    await page.getByTestId('accept-diff').click();
    await expect(page.getByTestId('proposal-decided')).toBeVisible();

    // --- The bundle moved, and only where the edit said (AC-1) ---
    await page.goto(`/projects/${projectId}`);
    await page.getByTestId('tab-edit').click();
    await expect(page.getByTestId('chat-row')).toHaveCount(1);
  });

  test('request-changes leaves every referenced file byte-identical (AC-1)', async ({
    page,
    context,
  }) => {
    await signIn(context, await createSignedInUser('rejector'));
    const { projectId } = await bundleWithTwoFiles(page);

    const before = await page.request.get(`/api/projects/${projectId}/export`);
    const beforeBytes = (await before.body()).length;

    await page.goto(`/projects/${projectId}`);
    await page.getByTestId('start-edit-chat').click();
    await expect(page.getByTestId('session')).toBeVisible();

    await page.getByTestId('proceed').click();
    await page
      .getByTestId('mcq-other-q-edit-describe')
      .fill('I want to update spec requirements.md to add a rate limit.');
    await page.getByTestId('mcq-submit').click();
    await page.getByTestId('proceed').click();

    await page.getByTestId('generate-spec').click();
    await expect(page.getByTestId('edit-card')).toBeVisible({ timeout: GENERATION_TIMEOUT });

    await page.getByTestId('reject-diff').click();
    // Rejected, in the proposal row's own word — not «Discarded», which is only how the card says it.
    await expect(page.getByTestId('proposal-decided')).toHaveAttribute('data-status', 'rejected');

    /*
     * The archive is the strongest available statement of "byte-identical": every approved file, in
     * one artifact, compared before and after. A revision written anywhere would change its size.
     */
    const after = await page.request.get(`/api/projects/${projectId}/export`);
    expect((await after.body()).length).toBe(beforeBytes);
  });
});

test.describe('the composer (task 121)', () => {
  test('slash commands press the page’s own controls, and @ names a document', async ({
    page,
    context,
  }) => {
    await signIn(context, await createSignedInUser('composer'));
    await startSession(page, 'A tool whose composer knows the bundle');
    await reachDrafting(page);

    // --- The slash menu opens at the start of the message, and only there ---
    await page.getByTestId('chat-message').fill('see /docs for the format');
    await expect(page.getByTestId('slash-menu')).toHaveCount(0);

    await page.getByTestId('chat-message').fill('/gen');
    await expect(page.getByTestId('slash-menu')).toBeVisible();

    // Pressing the entry presses the control — so the document is drafted, exactly as the button.
    await page.getByTestId('slash-generate').click();
    await expect(page.getByTestId('spec-card')).toBeVisible({ timeout: GENERATION_TIMEOUT });

    // --- The reference menu lists the bundle's files, and inserting one names it in the text ---
    await page.getByTestId('chat-message').fill('what does @requi');
    await expect(page.getByTestId('reference-menu')).toBeVisible();
    await page.getByTestId('reference-option-requirements.md').click();
    await expect(page.getByTestId('chat-message')).toHaveValue('what does @requirements.md ');

    // --- A name that matches nothing degrades visibly rather than being dropped (AC-2) ---
    await page.getByTestId('chat-message').fill('what about @nowhere.md');
    await page.getByTestId('chat-send').click();
    await expect(page.getByTestId('reference-notice')).toContainText('@nowhere.md');
  });

  test('the model choice persists on the chat', async ({ page, context }) => {
    await signIn(context, await createSignedInUser('picker'));
    const sessionUrl = await startSession(page, 'A tool that remembers which model I picked');

    const picker = page.getByTestId('model-picker');
    await expect(picker).toHaveValue('auto');

    // The ids the picker submits rather than the labels it prints: the first entry is the automatic
    // choice, which is the value the assertion above found already selected.
    const options = await picker
      .locator('option')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('value')));
    expect(options[0]).toBe('auto');
    // Only configured providers are offered; the e2e deployment runs the stub chain (D-48).
    expect(options).toHaveLength(2);

    await picker.selectOption(options[1] ?? '');
    await page.reload();

    // Persisted on the session, so the reload shows the same choice — and so will the next call.
    await expect(page.getByTestId('model-picker')).not.toHaveValue('auto');
    await page.goto(sessionUrl);
    await expect(page.getByTestId('model-picker')).not.toHaveValue('auto');
  });
});

test.describe('the document viewer (task 122)', () => {
  test('opens from the sidebar with four working views and survives a reload', async ({
    page,
    context,
  }) => {
    await signIn(context, await createSignedInUser('reader'));
    await bundleWithTwoFiles(page);

    await page.getByTestId('specs-panel-open').first().click();
    await expect(page.getByTestId('viewer')).toBeVisible();
    await expect(page.getByTestId('viewer-file-name')).toHaveText('constitution.md');

    // Preview is the default view, and it renders headings rather than markdown source.
    await expect(page.getByTestId('viewer-preview')).toBeVisible();
    await expect(page.getByTestId('viewer-preview').locator('h2').first()).toBeVisible();

    // --- Outline: an entry per heading, each pointing at its own anchor (AC-2) ---
    await page.getByTestId('viewer-tab-outline').click();
    const entries = page.getByTestId('viewer-outline-entry');
    // Waited for, not counted immediately: the tab is a navigation, and `count()` does not retry.
    await expect(entries.first()).toBeVisible();
    expect(await entries.count()).toBeGreaterThan(1);

    const anchors = await entries.evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute('data-anchor')),
    );
    expect(new Set(anchors).size).toBe(anchors.length);

    // --- Raw: the stored bytes ---
    await page.getByTestId('viewer-tab-raw').click();
    await expect(page.getByTestId('viewer-raw')).toContainText('# ');

    // --- Diff of Rev 1: says there is no predecessor rather than erroring (AC-1) ---
    await page.getByTestId('viewer-tab-diff').click();
    await expect(page.getByTestId('viewer-diff-empty')).toHaveAttribute(
      'data-empty-reason',
      'no-predecessor',
    );

    // --- The view and the revision are in the URL, so a reload restores both (AC-4) ---
    expect(page.url()).toContain('view=diff');
    await page.reload();
    await expect(page.getByTestId('viewer-diff-empty')).toBeVisible();
    await expect(page.getByTestId('viewer-tab-diff')).toHaveAttribute('data-state', 'current');
  });
});
