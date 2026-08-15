import { expect, test, type Page } from '@playwright/test';

import {
  collectFor,
  completeInterview,
  completeStage,
  createSignedInUser,
  downloadBundle,
  draftAndApprove,
  signIn,
  startSession,
  type ParityStage,
} from './fixtures';

/**
 * Every generate methodology, walked to its own terminal (task 117 AC-1/AC-4).
 *
 * The point of the milestone is that a methodology is *data*, so the strongest possible test is one
 * that changes nothing but the radio button and asserts four different journeys. The helpers are the
 * same ones the parity journey uses, clicking the same controls through the same gates — nothing
 * here reaches past the interface, so a walk that stops working is a workflow that stopped working.
 *
 * Two facts are asserted per methodology, and they are the two the user actually meets:
 *
 * - the **header** shows that workflow's numbered steps and its badge, from the configuration;
 * - the **archive** contains that workflow's file set, under that workflow's names.
 *
 * The stub provider's curriculum is keyed by canonical stage, not by methodology, which is why the
 * same three helper calls drive a SpecKit stage and a MySpec one: the graph names differ, the
 * machine's alphabet does not (D-119).
 */

interface Walk {
  /** The picker's value. */
  id: string;
  /** The step labels the header must show, in order (Эталон §1.4). */
  steps: string[];
  /** The canonical stages to walk, in order. */
  stages: ParityStage[];
  /** The archive's entry names, in bundle order. */
  files: string[];
  badge: [string, string, string];
}

const WALKS: Walk[] = [
  {
    id: 'myspec-greenfield-v1',
    steps: ['Interview', 'Constitution', 'Requirements', 'Solution', 'Tasks', 'Complete'],
    stages: ['constitution', 'requirements', 'solution', 'tasks'],
    files: ['constitution.md', 'requirements.md', 'solution.md', 'tasks.md'],
    badge: ['MySpec', 'Greenfield', 'V1'],
  },
  {
    id: 'speckit-greenfield-v1',
    steps: ['Interview', 'Constitution', 'Specify', 'Plan', 'Tasks', 'Complete'],
    stages: ['constitution', 'requirements', 'solution', 'tasks'],
    files: ['constitution.md', 'spec.md', 'plan.md', 'tasks.md'],
    badge: ['SpecKit', 'Greenfield', 'V1'],
  },
  {
    id: 'openspec-brownfield-v1',
    steps: ['Explore', 'Proposal', 'Specs', 'Solution', 'Tasks', 'Complete'],
    stages: ['constitution', 'requirements', 'solution', 'tasks'],
    files: ['proposal.md', 'spec.md', 'design.md', 'tasks.md'],
    badge: ['OpenSpec', 'Brownfield', 'V1'],
  },
  {
    id: 'myspec-brownfield-v1',
    steps: ['Interview', 'Proposal', 'Requirements', 'Tasks', 'Complete'],
    stages: ['constitution', 'requirements', 'tasks'],
    files: ['proposal.md', 'requirements.md', 'tasks.md'],
    badge: ['MySpec', 'Brownfield', 'V1'],
  },
];

/** The header's step labels, read in order. */
async function stepLabels(page: Page): Promise<string[]> {
  return page.getByTestId('step-pills').locator('li > span > span:nth-child(2)').allInnerTexts();
}

/**
 * One engine, deliberately.
 *
 * What these five tests assert is *configuration* — which graph a session walks, what its steps are
 * called, which files come out — and none of it is a property of a rendering engine. Browser
 * coverage (NFR-011) is carried by the journeys that exist to carry it: `critical-journey` and
 * `skeleton` walk the whole path on all three engines, and every control these tests click is one of
 * those journeys' controls.
 *
 * The cost of the alternative is not theoretical. Run on three engines, these five became fifteen
 * full journeys on a single worker, and the CI job passed its 30-minute budget mid-WebKit — not
 * because anything was broken, but because a stub generation on a runner twenty minutes into a
 * serial suite took longer than the wait allowed. The timeouts were raised for that; running the
 * same configuration assertions three times over was the part that should not have been there.
 *
 * They **were** verified on WebKit locally (5/5, M9п round 1), which is the evidence that they are
 * not Chromium-specific.
 */
test.skip(
  ({ browserName }) => browserName !== 'chromium',
  'workflow configuration is engine-independent; NFR-011 coverage lives in the parity journeys',
);

for (const walk of WALKS) {
  test.describe(`methodology ${walk.id}`, () => {
    test('walks its own graph and exports its own file set', async ({ page, context }) => {
      const user = await createSignedInUser(`methodology-${walk.id}`);
      await signIn(context, user);

      await startSession(page, `A tool for writing specifications (${walk.id}).`, walk.id);

      /*
       * The badge is read part by part. Asserting the joined string would pass against a component
       * that held it as a literal, which is exactly what AC-4 forbids.
       */
      const badge = page.getByTestId('methodology-badge');
      await expect(badge).toHaveAttribute('data-methodology', walk.id);
      await expect(page.getByTestId('methodology-vendor')).toHaveText(walk.badge[0]);
      await expect(page.getByTestId('methodology-flavour')).toHaveText(walk.badge[1]);
      await expect(page.getByTestId('methodology-version')).toHaveText(walk.badge[2]);

      expect(await stepLabels(page)).toEqual(walk.steps);

      await completeInterview(page);
      for (const stage of walk.stages) await completeStage(page, stage);

      await expect(page.getByTestId('session-complete')).toBeVisible();

      const archive = await downloadBundle(page);
      expect(archive.names).toEqual(walk.files);
    });
  });
}

/**
 * The optional stage is a choice, not a decoration (task 116 D-120; task 117).
 *
 * `myspec-brownfield-v1` declares Tasks optional, which in the graph means its Requirements review
 * carries two rows: on to Tasks, and straight to the terminal. If only one of them were offered the
 * word "optional" would be true of the table and false of the product, so the second door is
 * asserted here — and taking it must produce a bundle of exactly the two required documents.
 */
test('an optional stage can be skipped, and the bundle is honest about it', async ({
  page,
  context,
}) => {
  const user = await createSignedInUser('methodology-optional-skip');
  await signIn(context, user);

  await startSession(page, 'A change to an existing billing system.', 'myspec-brownfield-v1');

  await completeInterview(page);
  await completeStage(page, 'constitution');

  // Requirements, decided but not advanced — the fork is at its review, and `completeStage` would
  // walk through the primary door before the alternate could be seen.
  await collectFor(page, 'requirements');
  await draftAndApprove(page);
  await page.getByTestId('review-accept').click();
  await expect(page.getByTestId('review-board')).toHaveCount(0);

  // At requirements.review after the decision: both doors on screen.
  await expect(page.getByTestId('proceed')).toBeVisible();
  await expect(page.getByTestId('proceed-alternate-complete')).toBeVisible();

  await page.getByTestId('proceed-alternate-complete').click();
  await expect(page.getByTestId('session-complete')).toBeVisible();

  const archive = await downloadBundle(page);
  expect(archive.names).toEqual(['proposal.md', 'requirements.md']);
});
