'use server';

import { LOCALES, type Locale } from './phrase';
import { storeLocale } from './server-locale';

/**
 * Choosing the interface language, as a server function (task 143).
 *
 * A form action rather than a click handler, and that is the whole design: HTTP cannot set a cookie
 * once a response has started streaming, so a render can read the preference but never record it.
 * One round trip through here both stores the choice and returns the page already re-rendered in the
 * new language — no second request, no half-translated frame in between, and it works with
 * JavaScript disabled, which is also how the end-to-end suite proves the server did the rendering.
 *
 * The value is validated against the union rather than trusted: a form field is user input, and the
 * cookie it writes is read on every subsequent render.
 */
export async function chooseLocale(formData: FormData): Promise<void> {
  const value = formData.get('locale');
  const locale = LOCALES.find((candidate): candidate is Locale => candidate === value);

  if (locale === undefined) return;

  await storeLocale(locale);
}
