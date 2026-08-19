import { expect, test, type Locator, type Page } from '@playwright/test';

import { completeInterview, createSignedInUser, signIn, startSession, useLocale } from './fixtures';

/**
 * The interface speaks Russian (task 143).
 *
 * **Why the assertions look like this.** «Zero English chrome» cannot be proved by listing the
 * strings a surface should say — that test would pass against a dictionary translated into nonsense,
 * and it would have to be rewritten every time a word changed. What it *can* be proved by is the
 * shape of what is on screen: a curated list of surfaces, and for each one the claim that its own
 * copy is Cyrillic and that no Latin word is left in it except the ones that are deliberately Latin
 * (file names, formats, vendor names — see `ALLOWED_LATIN`).
 *
 * The list is curated rather than exhaustive on purpose. A sweep over every element would drag in
 * the model's own output, the user's prompt and the document bodies — all of which are governed by
 * У-1, the *content* language, which is a property of the session and not of this device. The seam
 * between the two is the whole point of the task and a test that blurred it would be asserting the
 * wrong thing.
 */

/**
 * Latin that is allowed to survive translation.
 *
 * Three kinds, and each is a contract rather than an oversight: the four output file names (task 122
 * byte-exactness and the parity baseline both depend on them), format and protocol names that are
 * spelled this way in Russian technical writing too, and the product's own name.
 */
const ALLOWED_LATIN = new Set([
  'constitution',
  'requirements',
  'solution',
  'tasks',
  'quality',
  'md',
  'zip',
  'json',
  'markdown',
  'pdf',
  'docx',
  'xlsx',
  'csv',
  'txt',
  'api',
  'llm',
  'mcp',
  'ai',
  'github',
  'google',
  'myspec',
  'openspec',
  'speckit',
  'spec',
  'platform',
  'rev',
  'auto',
  'stub',
  'greenfield',
  'brownfield',
  'edit',
  'v1',
  'esc',
  'ctrl',
  'shift',
  'enter',
  'tab',
]);

const CYRILLIC = /[А-Яа-яЁё]/u;
const LATIN_WORD = /[A-Za-z][A-Za-z'-]{1,}/gu;

/**
 * Every Latin word in a surface's own copy that is not on the allow-list.
 *
 * Elements marked `data-identity` are cut out first: a methodology is named by its vendor, flavour
 * and version, and those are the same three words in every language. The product says so on the
 * element rather than the test guessing from a word list — a list would also have to allow
 * «generate» and «workflow», and then it could no longer see a Generate button nobody translated.
 */
async function untranslatedWords(scope: Locator): Promise<string[]> {
  const text = (
    await scope.evaluate((node) => {
      const copy = node.cloneNode(true) as HTMLElement;
      for (const identity of copy.querySelectorAll('[data-identity]')) identity.remove();

      return copy.textContent;
    })
  ).replace(/\s+/gu, ' ');

  return [...text.matchAll(LATIN_WORD)]
    .map((match) => match[0])
    .filter((word) => !ALLOWED_LATIN.has(word.toLowerCase()));
}

async function expectRussian(page: Page, testId: string): Promise<void> {
  const scope = page.getByTestId(testId);
  await expect(scope, `${testId} is on screen`).toBeVisible();

  const text = await scope.innerText();
  expect(CYRILLIC.test(text), `${testId} says nothing in Russian: ${text.slice(0, 120)}`).toBe(
    true,
  );
  expect(await untranslatedWords(scope), `${testId} still has English in it`).toEqual([]);
}

test.describe('the chrome locale', () => {
  /**
   * The decisive test, and the reason the locale is a cookie rather than device storage.
   *
   * With JavaScript disabled nothing but the server can have produced this markup: no pre-paint
   * script ran, no hydration happened, no client store was read. If `<html lang>` and the copy are
   * Russian here, they were Russian in the first byte — which is exactly what stops the customer's
   * browser from offering to translate the page, the failure this whole task exists to end.
   */
  test('is served by the server, before any script runs', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const user = await createSignedInUser('locale');
    await signIn(context, user);
    await useLocale(context, 'ru');

    const page = await context.newPage();
    await page.goto('/projects');

    await expect(page.locator('html')).toHaveAttribute('lang', 'ru');
    await expectRussian(page, 'audience-profile');
    // Task 144's fieldset joins the walk the day it is added, which is the only way this list stays
    // an inventory of the surface rather than an inventory of what was translated once.
    await expectRussian(page, 'interview-style');
    await expectRussian(page, 'methodology-picker');

    await context.close();
  });

  test('follows the cookie back to English', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const user = await createSignedInUser('locale');
    await signIn(context, user);
    await useLocale(context, 'en');

    const page = await context.newPage();
    await page.goto('/projects');

    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByTestId('audience-profile')).toContainText('worded');

    await context.close();
  });

  /**
   * The walk the acceptance criterion actually asks for: the surfaces a person meets on the way from
   * a prompt to a first draft, each one checked for leftover English.
   */
  test('holds across the surfaces of the journey', async ({ page, context }) => {
    const user = await createSignedInUser('locale');
    await signIn(context, user);
    await useLocale(context, 'ru');

    await startSession(page, 'Приложение для планирования домашних дел');

    await expectRussian(page, 'stage-rail');
    await expectRussian(page, 'interview-panel');
    await expectRussian(page, 'sidebar-panel');

    await completeInterview(page);

    await expectRussian(page, 'interview-panel');
    await expectRussian(page, 'specs-panel');
  });
});
