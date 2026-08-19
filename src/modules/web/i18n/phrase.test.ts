import { describe, expect, it } from 'vitest';

import { PHRASES } from './dictionary';
import {
  definePhrases,
  formsOf,
  LOCALES,
  placeholdersOf,
  renderPhrase,
  type Phrase,
} from './phrase';

/**
 * The resolver, and the two properties the whole dictionary is checked against (task 143).
 *
 * The first half of this file tests `renderPhrase` on a table of three entries rather than on five
 * hundred — a resolver bug should read as a resolver failure, not as a paragraph of Russian.
 *
 * The second half is the part that earns its keep. Every phrase in the shipped dictionary is walked
 * and asked two questions a human translator gets wrong reliably: does the Russian half use the same
 * placeholders as the English one, and does a counted phrase supply every form its language needs.
 * A missing `{count}` in one form renders as literal text with no number in it, and a missing plural
 * form is a `undefined` in a sentence — both are the sort of defect that survives review because
 * neither language is the reviewer's first read.
 */

const SAMPLE = definePhrases({
  'test.flat': { en: 'Approve', ru: 'Одобрить' },
  'test.named': { en: 'Rev {number}', ru: 'Ревизия {number}' },
  'test.counted': {
    en: { one: '{count} file', other: '{count} files' },
    ru: { one: '{count} файл', few: '{count} файла', many: '{count} файлов' },
  },
});

describe('renderPhrase', () => {
  it('returns the half for the asked locale', () => {
    expect(renderPhrase(SAMPLE['test.flat'], 'en', undefined)).toBe('Approve');
    expect(renderPhrase(SAMPLE['test.flat'], 'ru', undefined)).toBe('Одобрить');
  });

  it('substitutes named placeholders', () => {
    expect(renderPhrase(SAMPLE['test.named'], 'ru', { number: 3 })).toBe('Ревизия 3');
  });

  /** A placeholder with nothing to put in it stays visible rather than becoming «Ревизия undefined». */
  it('leaves a placeholder alone when no value is given', () => {
    expect(renderPhrase(SAMPLE['test.named'], 'en', {})).toBe('Rev {number}');
  });

  it('counts in two forms in English', () => {
    const phrase = SAMPLE['test.counted'];

    expect(renderPhrase(phrase, 'en', { count: 1 })).toBe('1 file');
    expect(renderPhrase(phrase, 'en', { count: 0 })).toBe('0 files');
    expect(renderPhrase(phrase, 'en', { count: 5 })).toBe('5 files');
  });

  /** The reason this module exists: 1 файл, 2 файла, 5 файлов — and 21 файл, not 21 файлов. */
  it('counts in three forms in Russian', () => {
    const phrase = SAMPLE['test.counted'];

    expect(renderPhrase(phrase, 'ru', { count: 1 })).toBe('1 файл');
    expect(renderPhrase(phrase, 'ru', { count: 2 })).toBe('2 файла');
    expect(renderPhrase(phrase, 'ru', { count: 5 })).toBe('5 файлов');
    expect(renderPhrase(phrase, 'ru', { count: 21 })).toBe('21 файл');
    expect(renderPhrase(phrase, 'ru', { count: 0 })).toBe('0 файлов');
  });

  /**
   * `Intl.PluralRules('ru')` answers `other` only for fractions, which Russian writes in the same
   * form as `few` («1,5 файла»). No counter in this application produces one, but a resolver that
   * threw on the category would turn a rounding accident into a blank page.
   */
  it('renders the fractional category as the few form', () => {
    expect(renderPhrase(SAMPLE['test.counted'], 'ru', { count: 1.5 })).toBe('1.5 файла');
  });
});

describe('the shipped dictionary', () => {
  const entries = Object.entries(PHRASES) as [string, Phrase][];

  it('is not empty', () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  /**
   * Both halves must interpolate the same values.
   *
   * A translation that drops `{count}` reads as a sentence with the number missing, and one that
   * invents `{name}` renders the braces. Neither shows up in a type check, because both halves are
   * `string`.
   */
  it('uses the same placeholders in every language', () => {
    for (const [key, phrase] of entries) {
      const used = LOCALES.map((locale) => {
        const names = new Set<string>();
        for (const form of formsOf(phrase[locale])) {
          for (const name of placeholdersOf(form)) names.add(name);
        }

        return [...names].sort();
      });

      expect(used[1], `placeholders differ between locales in "${key}"`).toEqual(used[0]);
    }
  });

  /** A counted phrase in one language must be counted in the other; a flat one, flat. */
  it('keeps counted phrases counted in both languages', () => {
    for (const [key, phrase] of entries) {
      const shapes = LOCALES.map((locale) => typeof phrase[locale] === 'string');

      expect(shapes[1], `"${key}" is counted in one language and flat in the other`).toBe(
        shapes[0],
      );
    }
  });

  /** Nothing may render as an empty string — a blank label is a surface with a hole in it. */
  it('has no empty form', () => {
    for (const [key, phrase] of entries) {
      for (const locale of LOCALES) {
        for (const form of formsOf(phrase[locale])) {
          expect(form.trim(), `"${key}" has an empty ${locale} form`).not.toBe('');
        }
      }
    }
  });

  /**
   * A counted Russian phrase whose three forms are identical is a translation that gave up.
   *
   * Not every counted phrase must differ — «{count} с» is the same in all three — so this is a
   * warning-shaped assertion: it fires only when the English half *does* distinguish its forms,
   * which is the case where the Russian one certainly should too.
   */
  it('does not collapse the Russian forms where English distinguishes them', () => {
    for (const [key, phrase] of entries) {
      const english = phrase.en;
      const russian = phrase.ru;
      if (typeof english === 'string' || typeof russian === 'string') continue;
      if (english.one === english.other) continue;

      expect(
        new Set([russian.one, russian.few, russian.many]).size,
        `"${key}" counts in English but not in Russian`,
      ).toBeGreaterThan(1);
    }
  });
});
