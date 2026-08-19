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
  /*
   * Perfective, like every other control in this file (§1.2 rule 1).
   *
   * «Копировать» was the one imperfective verb among «Открыть · Закрыть · Скачать · Остановить», and
   * the imperfective names an occupation rather than an act: a button that says it promises copying
   * as an activity, not a copy that will exist when the press is over. The product already writes it
   * the other way on its two other copy controls — «Скопировать промпт», «Скопировать и открыть» —
   * so this was drift, not a decision. Costs one character in a ghost `sm` button.
   */
  'common.copy': { en: 'Copy', ru: 'Скопировать' },
  'common.download': { en: 'Download', ru: 'Скачать' },
  /*
   * A verb, because it is a button (§1.2 rule 1, and §6 names the noun-on-a-control by row).
   *
   * «Отмена» is what an OS dialog says, and it arrived here from that habit rather than from the
   * standard. Both call sites stand it beside an infinitive — «Сохранить» in `project-actions.tsx`
   * and «Восстановить ревизию 3» in `revert-card.tsx` — so the pair visibly mixed a noun with a
   * verb in one row. The two licensed exceptions to rule 1 are «На доработку» and «Дальше»; this is
   * neither, and a third exception would be a line in `decisions.md` rather than a silence.
   */
  'common.cancel': { en: 'Cancel', ru: 'Отменить' },
  'common.retry': { en: 'Try again', ru: 'Повторить' },
  'common.stop': { en: 'Stop', ru: 'Остановить' },
  'common.loading': { en: 'Loading', ru: 'Загрузка' },

  /**
   * Sending, in flight.
   *
   * The busy twin of three different controls — the free-text reply on a question round, the
   * request-changes button on a review card, and the composer's own Send — which is what earns it a
   * place here: it is one decision about what this product calls «a thing on its way to the
   * server», not a word that happens to be short. A verbal noun, because §1.5 makes the change of
   * part of speech the report of the change of state.
   *
   * The round's `Submitting…` stays with the round: it is a different English word, and a file that
   * quietly gave two English strings one key would be shipping a translation decision as a merge.
   */
  'common.sending': { en: 'Sending…', ru: 'Отправка…' },

  /**
   * Sending a document back for another pass.
   *
   * The review card, the document card and the proposed-edit card all offer it, and §2.6 of the
   * voice standard settles it once for the product rather than once per card — «На доработку» is
   * the ready-made Russian for this move, and three surfaces wording it separately is how a reader
   * ends up believing they are three different mechanisms. The proposal card's own docblock already
   * said as much in English: «same button, the review's own words».
   */
  'common.request-changes': { en: 'Request changes', ru: 'На доработку' },

  /**
   * A revision, as a badge.
   *
   * The chip in the viewer's revision switcher, the row in the specs panel and the file list of the
   * edit-chat picker each print «Рев. 3» beside a file name in mono; §2.1 chose that form — with
   * the full stop, against «версия», which the methodology badge has taken — as one decision about
   * how this product refers to a revision.
   *
   * The placeholder is named `revision` rather than `n` because that is the word the callers already
   * hold, and a caller passing `{ n: … }` to a phrase about revisions has to translate its own
   * variable name on the way in.
   *
   * The document card in the feed keeps a `Rev` of its own: it prints the number into an addressable
   * span of its own — the walk reads `spec-revision-number` — so its word and its number cannot be
   * one string.
   */
  'common.revision-badge': { en: 'Rev {revision}', ru: 'Рев. {revision}' },

  /**
   * The four ways of looking at a document.
   *
   * Three surfaces name them: the viewer's tab strip, the keyboard list that teaches `1`–`4`, and
   * the specs panel's link straight into the newest comparison. Pressing a key, reading the row that
   * promised it and landing on the tab it opens have to say one word each — the same argument task
   * 132 had to settle once already for stage names, and the reason `session.specs.diff` is not a
   * fourth spelling of «Сравнение».
   *
   * Nouns in both languages: a tab names a thing to look at, not an action to take (§1.2). Latin
   * `Diff` among «Оглавление · Просмотр · Исходник» would be the visible seam of an unfinished
   * translation, which §6 forbids by name.
   */
  'common.view-outline': { en: 'Outline', ru: 'Оглавление' },
  'common.view-preview': { en: 'Preview', ru: 'Просмотр' },
  'common.view-raw': { en: 'Raw', ru: 'Исходник' },
  'common.view-diff': { en: 'Diff', ru: 'Сравнение' },

  /**
   * The separator between a stage name and whatever qualifies it.
   *
   * A phrase rather than a literal because it is punctuation with a job: captions read
   * «Constitution · drafting», and a language that spaced or shaped it differently would change it
   * here rather than in six components.
   */
  'common.separator': { en: ' · ', ru: ' · ' },
});
