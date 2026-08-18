import { expect, type Page } from '@playwright/test';

/**
 * Driving a session, one stage at a time (task 79).
 *
 * The acceptance criterion is that a test can drive a full stage in **three helper calls or fewer**,
 * and the three below are exactly the three decisions a stage asks of a person: answer its questions,
 * approve its draft, decide its review. Nothing here shortcuts a gate — every call clicks the same
 * controls a user would, so a journey that stops working is a journey that stopped working, not a
 * fixture that fell behind (constitution P1: the gates are enforced in code, and the harness is
 * subject to them like everyone else).
 *
 * **Determinism.** The stub provider answers the prompt it is given, and the prompt is derived from
 * the section schema and the stage, so the questions, the documents and the review findings are the
 * same on every run and in every browser (IR-001-AC-5; NFR-012 AC-5). The option ids below are the
 * stub's fixed curriculum, which is why they can be named here without making the harness brittle:
 * they change only when the stub does.
 */

/** The four parity stages, in the order the workflow visits them. */
export const PARITY_STAGES = ['constitution', 'requirements', 'solution', 'tasks'] as const;

export type ParityStage = (typeof PARITY_STAGES)[number];

/**
 * How long a stub generation may take before the test gives up. Streaming, not instant.
 *
 * Raised from 20s in M9п round 1: the CI run walks 180 tests on one worker, and a generation that
 * takes four seconds on an idle machine took longer than twenty on a runner that had been going for
 * twenty minutes. A wait that fails a correct product because the machine is busy is a wait that is
 * too short — the test timeout (60s, `playwright.config.ts`) is the real bound.
 */
const GENERATION_TIMEOUT = 40_000;

/**
 * Creates a project from a prompt and lands on its session page. Returns the session URL.
 *
 * `methodology` picks a workflow explicitly (task 117). Omitted, the form's own default — `Auto` —
 * is left alone, which is what an ordinary user gets and what every test written before M9п meant.
 */
export async function startSession(
  page: Page,
  prompt: string,
  methodology?: string,
): Promise<string> {
  await page.goto('/projects');
  // The submit control is disabled until hydration, so this is the point from which a click is real.
  await expect(page.getByTestId('create-project')).toBeEnabled();

  await page.getByTestId('prompt-input').fill(prompt);
  if (methodology !== undefined) await page.getByTestId(`methodology-${methodology}`).check();
  await page.getByTestId('create-project').click();

  await expect(page.getByTestId('session')).toBeVisible();

  return page.url();
}

/**
 * The project a session page belongs to (А-6).
 *
 * Read from the page's own «All chats» link rather than parsed out of the URL: since M9п the URL
 * names the *session*, and a test that derived a project id from it would be inventing one.
 */
export async function projectIdOf(page: Page): Promise<string> {
  const href = await page.getByTestId('back-to-project').getAttribute('href');

  return href?.split('/').at(-1) ?? '';
}

/**
 * Answers the grounding interview and leaves it for the constitution.
 *
 * One answered round plus the persisted summary is the whole of the interview exit gate (A2), so this
 * is the shortest *legal* path out of `interview` — not a shortcut around it.
 */
export async function completeInterview(page: Page): Promise<void> {
  await expect(page.getByTestId('interview-panel')).toBeVisible();

  await page.getByTestId('ask-round').click();
  await expect(page.getByTestId('mcq-card')).toBeVisible();
  await page.getByTestId('mcq-option-q-audience-solo-devs').check();
  await page.getByTestId('mcq-option-q-problem-context').check();
  await page.getByTestId('mcq-submit').click();

  await expect(page.getByTestId('interview-panel')).toContainText('summary saved');
  await page.getByTestId('proceed').click();

  /*
   * Asserted on the **canonical** stage, not on the label (task 117).
   *
   * The pill after the interview reads «Constitution» in MySpec greenfield, «Proposal» in brownfield
   * and «Proposal» again in OpenSpec — the label belongs to the methodology, while the position the
   * session moved into is the machine's, and the position is what this helper is claiming.
   */
  await expect(page.locator('[data-state="current"][data-stage="constitution"]')).toBeVisible();
}

/**
 * Call 1 of 3 — answers the stage's own round and opens drafting.
 *
 * FR-007 AC-2: a stage collects for itself before it drafts, and the generation endpoint checks that
 * gate before it calls a model (task 45). So this is not preparation the test could skip.
 */
export async function collectFor(page: Page, stage: ParityStage): Promise<void> {
  await expect(page.getByTestId('interview-panel')).toBeVisible();

  await page.getByTestId('ask-round').click();
  await expect(page.getByTestId('mcq-card')).toBeVisible();
  await page.getByTestId(`mcq-option-q-${stage}-scope-strict`).check();
  await page.getByTestId('mcq-submit').click();

  await expect(page.getByTestId('interview-panel')).toBeVisible();
  await page.getByTestId('proceed').click();
  await expect(page.getByTestId('stage-substage')).toHaveText(/Generating/);
}

/**
 * Call 2 of 3 — generates the document, approves it, and enters review.
 *
 * Approval *permits* `generate → review` (FR-009 AC-3) and **entering** review is what produces the
 * board (FR-010 AC-1). Doing both here keeps that order visible: a helper that conjured a board at
 * approval time would be showing a review from a position the state machine says the session is not in.
 */
export async function draftAndApprove(page: Page): Promise<void> {
  await page.getByTestId('generate-spec').click();
  await expect(page.getByTestId('spec-card')).toBeVisible({ timeout: GENERATION_TIMEOUT });
  await expect(page.getByTestId('approve-spec')).toBeVisible();

  await page.getByTestId('approve-spec').click();
  await expect(page.getByTestId('spec-card')).toContainText('approved');

  await expect(page.getByTestId('proceed')).toBeEnabled();
  await page.getByTestId('proceed').click();
  await expect(page.getByTestId('review-board')).toBeVisible({ timeout: GENERATION_TIMEOUT });
}

/**
 * Call 3 of 3 — decides the review and walks through the door it opens.
 *
 * `accept` and `ignore` are both decisions and both satisfy the gate (FR-010 AC-5); the difference is
 * what the user meant, which is why the harness takes it as an argument rather than picking one.
 */
export async function decideReviewAndAdvance(
  page: Page,
  decision: 'accept' | 'ignore' = 'accept',
): Promise<void> {
  await expect(page.getByTestId('review-board')).toBeVisible();
  await page.getByTestId(`review-${decision}`).click();

  /*
   * Wait for the **fact**, not for a button.
   *
   * The door is clickable whether or not the gate holds (task 105), so `toBeEnabled()` no longer
   * says anything about whether the decision has landed — and a proceed sent before the decision
   * commits is refused by `reviewGate`, which is a race the harness would report as a stuck stage.
   * A decided board is the decision, observed.
   */
  await expect(page.getByTestId('review-board')).toHaveCount(0);
  await page.getByTestId('proceed').click();
}

/** A whole stage, in the three calls above. */
export async function completeStage(page: Page, stage: ParityStage): Promise<void> {
  await collectFor(page, stage);
  await draftAndApprove(page);
  await decideReviewAndAdvance(page);
}

/**
 * Reaches `constitution/generate` — the position most single-purpose tests want to start from.
 *
 * Kept as a named helper because it is the *shortest interesting* position, not because the walk is
 * incidental: reaching a draft requires answering the interview and the stage's own round, and a
 * skeleton that could skip either would be evidence the gates were not wired.
 */
export async function reachDrafting(page: Page): Promise<void> {
  await completeInterview(page);
  await collectFor(page, 'constitution');
}

/**
 * Opens the refinement box (task 142).
 *
 * It is folded behind its own heading now — it is always available, and a surface that is always
 * available should not be as loud as the one thing the session is waiting for. A test that types
 * into it has to open it first, exactly as a person does. `refine-card` is the `<details>` itself,
 * so it stays visible while closed and the assertions that only check for its presence are
 * unaffected.
 */
export async function openRefine(page: Page): Promise<void> {
  const card = page.getByTestId('refine-card');
  await expect(card).toBeVisible();

  if (!(await card.evaluate((node) => node.hasAttribute('open')))) {
    await page.getByTestId('refine-toggle').click();
  }

  await expect(page.getByTestId('refine-instruction')).toBeVisible();
}
