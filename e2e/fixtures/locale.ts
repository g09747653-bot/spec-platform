import type { BrowserContext } from '@playwright/test';

/**
 * Choosing the interface language before the first request (task 143).
 *
 * The chrome locale is a cookie precisely so the **server** can read it while it renders — see
 * `src/modules/web/i18n/locale.ts`. A cookie added to the browser context is attached to the very
 * first navigation, so a test that calls this before `page.goto` gets HTML that was in the right
 * language from its first byte. That is a stronger claim than any client-side seeding could make,
 * and it is the one the suite checks with JavaScript disabled.
 *
 * `domain: '127.0.0.1'` rather than `localhost`, matching `signIn` and `playwright.config.ts`'s
 * `baseURL`: a cookie scoped to the other spelling is simply never sent.
 */

/** Must match `UI_STATE_KEYS.locale` in `src/modules/web/state/ui-state.ts`. */
const LOCALE_COOKIE = 'spec-platform-locale';

export type UiLocale = 'ru' | 'en';

export async function useLocale(context: BrowserContext, locale: UiLocale): Promise<void> {
  await context.addCookies([
    {
      name: LOCALE_COOKIE,
      value: locale,
      domain: '127.0.0.1',
      path: '/',
      httpOnly: false,
      sameSite: 'Lax',
      expires: Math.floor(Date.now() / 1000) + 60 * 60,
    },
  ]);
}
