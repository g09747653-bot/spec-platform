'use client';

import { createContext, useContext, type ReactNode } from 'react';

import { DEFAULT_LOCALE } from './locale';
import { type Locale } from './phrase';
import { translator, type Translate } from './translate';

/**
 * How the chrome language reaches a client component (task 143).
 *
 * **A context, and deliberately not an external store.** `ui-state.ts` models the theme and the
 * sidebar width with `useSyncExternalStore` because those values live on the device and change
 * without the server knowing. The locale is different in exactly the way that matters: the server
 * read it from the cookie *before it rendered*, so the value a client component needs is already in
 * the payload, and the only thing that changes it is a request that re-renders the whole page. A
 * store here would add a second source of truth for a value that has one — and, worse, one whose
 * client snapshot could disagree with the markup being hydrated on every string in the document.
 *
 * The same argument decides the shape of the switcher: it is a form posting a server action, not a
 * button writing `document.cookie`. One round trip sets the cookie and returns the whole page in the
 * new language; a client-side write would have to be followed by a refresh, and between the two the
 * document would be half translated.
 *
 * The precedent for the context itself is `MethodologyNaming` — same problem (a value five levels of
 * feed below the surface that knows it), same answer, and its docblock carries the argument for why
 * a prop through five components that do not use it is worse.
 */

const Context = createContext<Locale | null>(null);

export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <Context.Provider value={locale}>{children}</Context.Provider>;
}

/**
 * The active chrome language.
 *
 * Outside a provider — a component mounted by a test harness, or a surface not yet wrapped — the
 * deployment default answers rather than a crash: a missing provider should read as copy in the
 * default language, not as a blank page.
 */
export function useLocale(): Locale {
  return useContext(Context) ?? DEFAULT_LOCALE;
}

/** The translator for the active language. The client half of {@link Translate}. */
export function useT(): Translate {
  return translator(useLocale());
}
