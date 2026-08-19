/**
 * What a translatable phrase is, and the two locales it exists in (task 143).
 *
 * **Both languages live in one entry, not in two files.** The usual shape — `en.ts` beside `ru.ts`,
 * keyed the same — has one failure mode and it is the only one that matters here: a key added to one
 * file and forgotten in the other ships an English button inside a Russian interface, which is
 * precisely the class of defect this task exists to close. Keeping `en` and `ru` in the same object
 * literal makes that unrepresentable: there is no way to write the English half without the Russian
 * one, because they are two properties of one value the type system requires whole.
 *
 * It also puts the translator's eye where it belongs. A person writing the Russian copy reads the
 * English original on the line above rather than in another file at the same line number, and a
 * reviewer sees both halves in one diff.
 *
 * **Plural is a shape, not a convention.** Russian counts in three forms and English in two, so the
 * plural entry declares them as different types — `RussianPlural` demands `one/few/many`, and a
 * translation that supplies only `one/other` does not compile. This is the half of the job a string
 * table cannot do, and the reason `Sealed {N} times` was listed in the inventory as *wrong by
 * construction* rather than as untranslated.
 */

/** The chrome languages this deployment ships. Content language is a different axis (У-1). */
export const LOCALES = ['ru', 'en'] as const;

export type Locale = (typeof LOCALES)[number];

export function isLocale(value: string | null | undefined): value is Locale {
  return LOCALES.some((locale) => locale === value);
}

/** English counts twice: one, and everything else. */
export interface EnglishPlural {
  readonly one: string;
  readonly other: string;
}

/**
 * Russian counts three times: 1 файл, 2 файла, 5 файлов.
 *
 * `other` is deliberately absent. `Intl.PluralRules('ru')` uses it only for fractions — «1,5 файла»
 * — and this interface describes counters over whole things (files, points, questions, rounds), so
 * demanding a fourth form would be asking the translator to write copy no counter can produce. The
 * resolver maps that category onto `few`, which is the form Russian uses for 1,5.
 */
export interface RussianPlural {
  readonly one: string;
  readonly few: string;
  readonly many: string;
}

/**
 * One line of copy in both languages, either flat or counted.
 *
 * The union is on the *pair*, not on each half: an entry cannot be flat in English and counted in
 * Russian, because a counter that loses its forms in translation is the defect again.
 */
export type Phrase =
  | { readonly en: string; readonly ru: string }
  | { readonly en: EnglishPlural; readonly ru: RussianPlural };

export type PhraseTable = Readonly<Record<string, Phrase>>;

/**
 * Declares a table of phrases and keeps its literal keys.
 *
 * `satisfies` rather than a type annotation: an annotation would widen every key to `string` and the
 * union of keys — which is what makes `t` typed and exhaustive — would be lost.
 */
export function definePhrases<T extends PhraseTable>(table: T): T {
  return table;
}

/** Values a placeholder may take. Everything else has to be turned into one by the caller. */
export type PhraseParams = Readonly<Record<string, string | number>>;

const PLACEHOLDER = /\{(\w+)\}/g;

/** The placeholder names a phrase half uses, in source order. Used by the parity test. */
export function placeholdersOf(text: string): string[] {
  return [...text.matchAll(PLACEHOLDER)].map((match) => match[1] ?? '');
}

/** Every string a phrase half can render — one for flat copy, all forms for a counted one. */
export function formsOf(half: string | EnglishPlural | RussianPlural): string[] {
  if (typeof half === 'string') return [half];

  /*
   * Spelled out rather than `Object.values`, which types as `any[]` here and would need a cast to
   * satisfy the no-unsafe-return rule — and a cast is exactly what this project does not allow at a
   * boundary. Naming the forms also keeps this honest if a third plural shape is ever added: the
   * compiler will point at this function rather than silently returning fewer strings than exist.
   */
  return 'other' in half ? [half.one, half.other] : [half.one, half.few, half.many];
}

/**
 * The count a plural phrase selects on.
 *
 * Named `count` rather than `n` because it is also the placeholder the copy writes — `{count}` reads
 * as itself in both languages, and a translator never has to remember which letter this project
 * chose.
 */
const COUNT = 'count';

function pluralForm(locale: Locale, forms: EnglishPlural | RussianPlural, count: number): string {
  const category = new Intl.PluralRules(locale).select(count);

  if ('other' in forms) return category === 'one' ? forms.one : forms.other;

  /*
   * `other` in Russian is the fractional category («1,5 файла»), which takes the same form as `few`.
   * Falling back through `few` rather than throwing keeps a counter honest on a value no counter is
   * expected to produce — the alternative is copy that is correct for integers and crashes on 1.5.
   */
  if (category === 'one') return forms.one;
  if (category === 'many') return forms.many;

  return forms.few;
}

function interpolate(template: string, params: PhraseParams | undefined): string {
  if (params === undefined) return template;

  return template.replace(PLACEHOLDER, (whole, name: string) => {
    const value = params[name];

    return value === undefined ? whole : String(value);
  });
}

/**
 * Renders one phrase in one locale.
 *
 * Kept separate from the dictionary so the resolver can be unit-tested against a table of two
 * entries instead of five hundred, and so the dictionary files stay data.
 */
export function renderPhrase(
  phrase: Phrase,
  locale: Locale,
  params: PhraseParams | undefined,
): string {
  const half = phrase[locale];

  if (typeof half === 'string') return interpolate(half, params);

  const raw = params?.[COUNT];
  const count = typeof raw === 'number' ? raw : Number(raw ?? 0);

  return interpolate(pluralForm(locale, half, count), params);
}
