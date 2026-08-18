import { definePhrases } from '../phrase';

/**
 * Words that belong to no single surface (task 143).
 *
 * A phrase lands here only when three or more surfaces say it and mean the same thing by it — a
 * shared «Close» is one decision about how this product closes things, and a shared «Copy» is one
 * decision about what copying is called. Anything narrower stays with its surface, because a
 * dictionary of «general» entries is how two buttons end up sharing a key and then needing different
 * words in the second language.
 */
export const commonPhrases = definePhrases({
  'common.open': { en: 'Open', ru: 'Открыть' },
  'common.close': { en: 'Close', ru: 'Закрыть' },
  'common.copy': { en: 'Copy', ru: 'Копировать' },
  'common.download': { en: 'Download', ru: 'Скачать' },
  'common.cancel': { en: 'Cancel', ru: 'Отмена' },
  'common.retry': { en: 'Try again', ru: 'Повторить' },
  'common.stop': { en: 'Stop', ru: 'Остановить' },
  'common.loading': { en: 'Loading', ru: 'Загрузка' },

  /**
   * The separator between a stage name and whatever qualifies it.
   *
   * A phrase rather than a literal because it is punctuation with a job: captions read
   * «Constitution · drafting», and a language that spaced or shaped it differently would change it
   * here rather than in six components.
   */
  'common.separator': { en: ' · ', ru: ' · ' },
});
