import { expect, test } from '@playwright/test';

import {
  completeInterview,
  collectFor,
  createSignedInUser,
  draftAndApprove,
  decideReviewAndAdvance,
  signIn,
  startSession,
} from './fixtures';

/**
 * The conversation itself (tasks 105, 107; Эталон §1.1).
 *
 * The suites this sits beside all assert that a *step* works. This one asserts that the steps leave
 * a readable record: a chip wherever the session moved, a card per document with the path, badge and
 * revision the reference product prints, and every earlier document still there — folded away, but
 * there. A session that works and forgets what it did is not the product being copied.
 */
test.describe('the conversation feed', () => {
  test('records every position change, and keeps every document (tasks 105, 107)', async ({
    page,
    context,
  }) => {
    test.slow();

    await signIn(context, await createSignedInUser('feed'));
    await startSession(page, 'A tool that remembers the whole conversation');

    // Before anything moves, there is nothing to have moved through.
    await expect(page.getByTestId('stage-chip')).toHaveCount(0);

    await completeInterview(page);
    await collectFor(page, 'constitution');
    await draftAndApprove(page);

    /*
     * Every chip the walk has produced, in order. They are derived from the blocks rather than
     * logged, so this is also the check that the derivation matches the state machine: interview →
     * collect → generate → review, one chip per edge, no chip for standing still.
     */
    const chips = page.getByTestId('stage-chip');
    const edges = await chips.evaluateAll((nodes) =>
      nodes.map(
        (node) => `${node.getAttribute('data-from') ?? ''}->${node.getAttribute('data-to') ?? ''}`,
      ),
    );

    expect(edges).toEqual([
      'interview->constitution.collect',
      'constitution.collect->constitution.generate',
      'constitution.generate->constitution.review',
    ]);

    // The document card carries what Эталон prints on one: stage, mono path, badge, Rev N.
    const card = page.getByTestId('spec-card');
    await expect(card.getByTestId('document-path')).toHaveText(
      /^specs\/[a-z0-9-]+\/constitution\.md$/,
    );
    await expect(card.getByTestId('document-approved')).toHaveText('Approved');
    await expect(card.getByTestId('spec-revision-number')).toHaveText('1');

    await decideReviewAndAdvance(page);
    await expect(page.getByTestId('stage-current')).toHaveText(/Requirements/i);

    /*
     * Moving on does not erase the document. It is no longer the card the session is working on, so
     * its text is folded behind Preview — and Preview is offered because the file is approved and
     * therefore has content the endpoint can serve.
     */
    const earlier = page.getByTestId('document-card');
    await expect(earlier).toHaveCount(1);
    await expect(earlier.getByTestId('document-approved')).toHaveText('Approved');
    await expect(earlier.getByTestId('document-content')).toHaveCount(0);

    await earlier.getByTestId('document-preview-toggle').click();
    await expect(earlier.getByTestId('document-content')).toContainText('#', { timeout: 20_000 });

    // And a fifth chip, into the stage the session has entered but not yet been asked anything in.
    await expect(chips.last()).toHaveAttribute('data-to', 'requirements.collect');
  });

  test('a revision joins the conversation without replacing the one before it (task 107)', async ({
    page,
    context,
  }) => {
    test.slow();

    await signIn(context, await createSignedInUser('revisions'));
    await startSession(page, 'A tool whose drafts are all still readable');

    await completeInterview(page);
    await collectFor(page, 'constitution');

    await page.getByTestId('generate-spec').click();
    await expect(page.getByTestId('spec-card')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('spec-revision-number')).toHaveText('1');

    await page.getByTestId('request-changes').click();
    await page.getByTestId('change-instruction').fill('Add a non-goals section.');
    await page.getByTestId('submit-changes').click();

    // Rev 2 is the card the session is working on; Rev 1 is still in the feed above it.
    await expect(page.getByTestId('spec-revision-number')).toHaveText('2', { timeout: 20_000 });
    await expect(page.getByTestId('document-card')).toHaveCount(1);
    await expect(page.getByTestId('document-card').getByTestId('document-revision')).toHaveText(
      'Rev 1',
    );

    // The superseded revision keeps no decision of its own — there is one Approve on screen, and it
    // belongs to the revision the session is actually waiting on.
    await expect(page.getByTestId('approve-spec')).toHaveCount(1);
    await expect(page.getByTestId('document-card').getByTestId('approve-spec')).toHaveCount(0);
  });
});
