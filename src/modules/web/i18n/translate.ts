import { PHRASES, type PhraseKey } from './dictionary';
import { renderPhrase, type Locale, type PhraseParams } from './phrase';

/**
 * The one function every surface prints copy through (task 143).
 *
 * `Translate` is deliberately a plain function of a key rather than a component or a hook result
 * type: server components cannot use context, client components cannot use `cookies()`, and both
 * have to print the same words. Everything above this line differs between the two halves of the
 * application; everything below it is shared.
 *
 * The key set is the union of the dictionary's keys, so a typo is a type error and a phrase that no
 * longer exists cannot be referenced. That is the second half of «a new surface cannot ship
 * untranslated silently» — the first half is the lint rule that keeps literals out of components.
 */
export type Translate = (key: PhraseKey, params?: PhraseParams) => string;

/** Builds the translator for a locale. Pure — no request, no context, no storage. */
export function translator(locale: Locale): Translate {
  return (key, params) => renderPhrase(PHRASES[key], locale, params);
}
