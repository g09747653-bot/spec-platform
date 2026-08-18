import { UI_STATE_KEYS } from '../state/ui-state';

import { isLocale, type Locale } from './phrase';

/**
 * Where the chrome language is kept, and why it is the one preference that is not `localStorage`
 * (task 143; D-28 revisited).
 *
 * Theme and sidebar width are **CSS**: the server can render either one and a script in `<head>`
 * corrects it before the first paint, so the markup the server sent and the markup the client
 * hydrates are identical. Locale is not CSS — the difference is the text itself. A locale read from
 * `localStorage` after hydration would ship the whole interface in the fallback language and swap
 * every string at once after the first paint; a locale applied by a pre-paint script would have to
 * rewrite the text nodes of a document that has already been sent. Neither is a flash of one
 * attribute, which is what those two scripts exist to prevent — both are the wrong page, briefly.
 *
 * A cookie is the one device store the **server** can read while it renders, so the first byte of
 * HTML is already in the right language. That is also what makes `<html lang>` honest, and
 * `<html lang>` is the point of the whole task: the customer's browser auto-translated our English
 * chrome into the «врата» comedy precisely because the document claimed to be English.
 *
 * The key is still declared in `UI_STATE_KEYS` — the device-state inventory is «one module knows
 * every preference», not «one module knows every `localStorage` key», and its docblock already
 * anticipates a wrapper substituting the store.
 */

export const LOCALE_COOKIE = UI_STATE_KEYS.locale;

/**
 * The language this deployment speaks when nobody has said otherwise.
 *
 * Russian, per task 143: this deployment's users are Russian-speaking, and an English default is
 * what invited the browser to translate the interface in the first place.
 */
export const DEFAULT_LOCALE: Locale = 'ru';

/** A year. A chrome language is not a session preference; re-choosing it every week is friction. */
export const LOCALE_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

/**
 * Reads the locale out of a raw `Cookie:` header value.
 *
 * Pure, so it can be unit-tested without a request — and so the server and any future client reader
 * answer through one parser rather than two subtly different ones.
 */
export function localeFromCookieHeader(header: string | null | undefined): Locale {
  if (header === null || header === undefined || header === '') return DEFAULT_LOCALE;

  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;

    const name = part.slice(0, index).trim();
    if (name !== LOCALE_COOKIE) continue;

    const value = decodeURIComponent(part.slice(index + 1).trim());

    return isLocale(value) ? value : DEFAULT_LOCALE;
  }

  return DEFAULT_LOCALE;
}
