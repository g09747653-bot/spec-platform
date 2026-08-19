/**
 * `i18n` — the words this interface says, and the language it says them in (task 143).
 *
 * Three entry points, because the application has three kinds of caller and they cannot share one:
 *
 * - **`useT()`** — client components. Reads the locale the server put in context.
 * - **`serverT()`** — layouts, pages, route handlers and server actions. Reads the cookie.
 * - **`translator(locale)`** — pure, for anything holding a locale already (a test, a shared helper
 *   that takes the translator as an argument rather than guessing which half of the app it is in).
 *
 * `server-locale.ts` is deliberately absent from this barrel: it imports `next/headers`, which throws
 * in a client component, and a barrel that re-exported it would let one careless import pull that
 * into the browser bundle. Server callers import it by path, which is the friction that keeps the
 * boundary visible.
 */
export const MODULE_ID = 'i18n';

export { PHRASES, type PhraseKey } from './dictionary';
export { DEFAULT_LOCALE, LOCALE_COOKIE, localeFromCookieHeader } from './locale';
export { LocaleProvider, useLocale, useT } from './locale-context';
export {
  definePhrases,
  isLocale,
  LOCALES,
  renderPhrase,
  type EnglishPlural,
  type Locale,
  type Phrase,
  type PhraseParams,
  type RussianPlural,
} from './phrase';
export { translator, type Translate } from './translate';
