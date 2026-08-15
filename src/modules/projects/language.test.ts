import { describe, expect, it } from 'vitest';

import { detectContentLanguage } from './language';

/**
 * У-1 — the seed decides the language (task 108).
 *
 * The cases below are product descriptions rather than sentences from a corpus, because that is the
 * only input this function ever sees: a paragraph or two, full of nouns that travel between
 * languages. A detector that scores on vocabulary rather than on script and function words would
 * pass a language benchmark and classify every one of these as English.
 */
describe('detectContentLanguage (task 108)', () => {
  it('reads a script when there is one', () => {
    expect(detectContentLanguage('Приложение для учёта расходов небольшой семьи')).toBe('ru');
    expect(detectContentLanguage('Застосунок для обліку витрат невеликої родини')).toBe('uk');
    expect(detectContentLanguage('家族の支出を記録するアプリ')).toBe('ja');
    expect(detectContentLanguage('가족 지출을 기록하는 앱')).toBe('ko');
    expect(detectContentLanguage('记录家庭开支的应用')).toBe('zh');
    expect(detectContentLanguage('Μια εφαρμογή για τα έξοδα της οικογένειας')).toBe('el');
  });

  it('is not fooled by the English product nouns a description is full of', () => {
    expect(
      detectContentLanguage(
        'Мобильное приложение — dashboard и API для команды, чтобы отслеживать расходы',
      ),
    ).toBe('ru');
  });

  it('separates the Latin languages by their function words', () => {
    expect(
      detectContentLanguage('A tool that turns a rough idea into a specification for an agent'),
    ).toBe('en');
    expect(detectContentLanguage('Eine Anwendung für das Team, die nicht nur eine Liste ist')).toBe(
      'de',
    );
    expect(
      detectContentLanguage(
        'Un outil pour les équipes qui veulent une spécification dans le dépôt',
      ),
    ).toBe('fr');
    expect(detectContentLanguage('Een hulpmiddel voor het team dat niet alleen een lijst is')).toBe(
      'nl',
    );
  });

  it('says it does not know rather than guessing', () => {
    // No function words at all: a product name and two nouns.
    expect(detectContentLanguage('Kanban')).toBeNull();
    expect(detectContentLanguage('')).toBeNull();
    expect(detectContentLanguage('   ')).toBeNull();
  });

  it('refuses a tie between languages that share the words that matched', () => {
    // `que` is Spanish, French and Portuguese at once, and nothing else in the text separates them.
    expect(detectContentLanguage('que')).toBeNull();
  });

  it('resolves in favour of the language that matched more of them', () => {
    // `que`, `con` and `para` are all Spanish; Portuguese has two of the three, French one.
    expect(detectContentLanguage('que con para')).toBe('es');
  });

  it('is deterministic — the same text always yields the same answer', () => {
    const text = 'Приложение для учёта расходов';

    expect(detectContentLanguage(text)).toBe(detectContentLanguage(text));
  });
});
