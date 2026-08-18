import { cookies } from 'next/headers';
import { cache } from 'react';

import { DEFAULT_LOCALE, LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE_SECONDS } from './locale';
import { isLocale, type Locale } from './phrase';
import { translator, type Translate } from './translate';

/**
 * The chrome language, on the server (task 143).
 *
 * **Server-only.** `next/headers` throws in a client component, so this file is imported by layouts,
 * pages, route handlers and server actions and by nothing carrying `'use client'`. The client half is
 * `locale-context.tsx`; both end at the same `translator`, which is where the words are.
 *
 * `cookies()` is asynchronous in this version of Next (see
 * `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md`), and reading it opts a
 * route into dynamic rendering. That costs nothing on any page that prints chrome: they all read the
 * session and the database on every request already.
 *
 * `cache()` makes the read request-scoped, so the layout, the page and a component three levels down
 * each ask for the locale and the cookie jar is opened once. It is the same shape Next's own
 * `next/root-params` would give us — which is not available here, because that API requires the
 * locale to be a URL segment and it cannot be reached from a client component, a server action or a
 * route handler, which is three of the four places this application needs it.
 */

export const currentLocale = cache(async (): Promise<Locale> => {
  const store = await cookies();
  const value = store.get(LOCALE_COOKIE)?.value;

  return isLocale(value) ? value : DEFAULT_LOCALE;
});

/** The translator for this request. `const t = await serverT();` — then `t('some.key')`. */
export async function serverT(): Promise<Translate> {
  return translator(await currentLocale());
}

/**
 * Stores the chosen language and re-renders the page in it.
 *
 * A server action rather than a client-side `document.cookie` write: HTTP cannot set a cookie once a
 * response has begun streaming, so a render can read the preference but never record it, and the one
 * legal write that also returns the re-rendered page in the new language is this. `httpOnly` is off
 * on purpose — this is a display preference, not a credential (S1 untouched), and the end-to-end
 * suite seeds it as an ordinary cookie on the browser context.
 */
export async function storeLocale(locale: Locale): Promise<void> {
  const store = await cookies();

  store.set(LOCALE_COOKIE, locale, {
    path: '/',
    maxAge: LOCALE_COOKIE_MAX_AGE_SECONDS,
    sameSite: 'lax',
    httpOnly: false,
  });
}
