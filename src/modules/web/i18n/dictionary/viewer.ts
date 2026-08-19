import { definePhrases } from '../phrase';

/**
 * The words the document viewer says (task 143).
 *
 * **Two surfaces, one vocabulary.** The overlay over the conversation and the full page at
 * `/specs/:id` show the same four views over the same revisions, so the tab names, the revision
 * badge and the diff caption are one entry each, printed from both. Where the two surfaces mean
 * different things they keep their own key: the pane's outline is empty because nothing has been
 * written *yet*, the page's because that stored revision has no headings, and a single phrase
 * covering both would have to be vague about which.
 *
 * **Two agreements of «approved», deliberately** (Эталон §2.6). The metric line is signed by the
 * document — «одобрен» — and the revision chip by the revision — «одобрена». Collapsing them into
 * one neuter key to save an entry is precisely what makes a translation read as machine output.
 *
 * **The em dashes in the Russian copy carry a non-breaking space on their left** (Эталон §1.4),
 * spelled `\u00A0` so a reviewer can see it. It is not a typo: an ordinary space lets a narrow
 * pane wrap a line onto a dash, which Russian typesetting does not do.
 */
export const viewerPhrases = definePhrases({
  /*
   * The name of the tab strip itself. The four views it holds are `common.view-*`: they are printed
   * here, in the keyboard list and in the specs panel, and the words a key promises and the tab it
   * opens have to be one decision rather than three (Эталон §7.1 for why they stopped being the
   * union members printed under a CSS `capitalize`).
   */
  'viewer.tabs.label': { en: 'View', ru: 'Вид' },

  /* What became of each revision. The chip's «Рев. N» itself is `common.revision-badge`. */
  'viewer.revision.approved': { en: 'approved', ru: 'одобрена' },
  'viewer.revision.draft': { en: 'draft', ru: 'черновик' },

  /*
   * The three review decisions, which the chip used to print as the stored token — `request_changes`,
   * underscore and all. That token is not copy in either language. It says what became of the
   * *review* of this revision, so the Russian names its subject rather than leaving «принята» to be
   * read as a verdict on the revision itself.
   */
  'viewer.revision.verdict-accept': { en: 'review accepted', ru: 'рецензия принята' },
  'viewer.revision.verdict-ignore': { en: 'review set aside', ru: 'рецензия отложена' },
  'viewer.revision.verdict-request-changes': { en: 'changes requested', ru: 'на доработку' },

  /*
   * The header of the overlay. Counted phrases, because a viewer over a one-line document is
   * ordinary and «1 строки» is the defect this dictionary shape exists to prevent (Эталон §4).
   */
  'viewer.metrics.draft': { en: 'Draft in progress', ru: 'Черновик пишется' },
  'viewer.metrics.lines': {
    en: { one: '{count} line', other: '{count} lines' },
    ru: { one: '{count} строка', few: '{count} строки', many: '{count} строк' },
  },
  'viewer.metrics.words': {
    en: { one: '{count} word', other: '{count} words' },
    ru: { one: '{count} слово', few: '{count} слова', many: '{count} слов' },
  },
  'viewer.metrics.approved': { en: 'approved', ru: 'одобрен' },

  /*
   * «Окно документа» is the same name the card and the shortcut list use for this surface, and it
   * outlived the docked pane the overlay of task 147 replaced (Эталон §2.5, §5.12).
   */
  'viewer.pane.label': {
    en: '{fileName} — document viewer',
    ru: '{fileName}\u00A0— окно документа',
  },
  'viewer.pane.close': { en: 'Close the document viewer', ru: 'Закрыть окно документа' },
  'viewer.pane.close-hint': {
    en: 'Close the document viewer (Esc)',
    ru: 'Закрыть окно документа (Esc)',
  },
  'viewer.pane.full-page': { en: 'Full page', ru: 'Отдельная страница' },
  /*
   * Download's tooltip names the file, because the control itself cannot: the header's right-hand
   * line is one line (task 147), so the label is the bare verb and the sentence that says what will
   * land in the downloads folder lives in the `title`. The file name is a placeholder rather than
   * part of the phrase — it is a machine identifier and neither language declines it (§3).
   */
  'viewer.pane.download-hint': {
    en: 'Download {fileName} as it is on screen',
    ru: 'Скачать {fileName}\u00A0— ту ревизию, что на экране',
  },
  'viewer.pane.read-failed': {
    en: 'That revision could not be read just now.',
    ru: 'Эту ревизию сейчас не удалось прочитать.',
  },
  /* Busy states are verbal nouns, never «Читаем…» and never «Читаю…» (Эталон §1.5). */
  'viewer.pane.reading': { en: 'Reading the document…', ru: 'Чтение документа…' },
  'viewer.pane.waiting': {
    en: 'Nothing written yet. The words appear here as the model writes them.',
    ru: 'Пока ничего не написано. Слова появляются здесь по мере того, как их пишет модель.',
  },
  'viewer.pane.outline-empty': { en: 'No headings yet.', ru: 'Заголовков пока нет.' },

  'viewer.page.outline-empty': {
    en: 'This revision has no headings.',
    ru: 'В этой ревизии нет заголовков.',
  },
  'viewer.page.back': { en: 'Back to the chat', ru: 'Назад в чат' },

  /*
   * Two emptinesses the Diff view has to tell apart: a document still being written has no stored
   * predecessor yet, a first revision never will.
   */
  'viewer.diff.caption': { en: 'Rev {from} → Rev {to}', ru: 'Рев. {from} → Рев. {to}' },
  'viewer.diff.first-revision': {
    en: 'This is the first revision of {fileName} — there is no earlier one to compare it with.',
    ru: 'Это первая ревизия {fileName}\u00A0— сравнить её не с чем.',
  },
  'viewer.diff.still-writing': {
    en: 'This document is still being written — there is nothing to compare yet.',
    ru: 'Документ ещё пишется\u00A0— сравнивать пока не с чем.',
  },

  /*
   * Markdown keeps its Latin spelling and takes no Russian case ending (Эталон §3).
   *
   * Perfective, in step with `common.copy` — the two copy controls a reader meets in one header
   * cannot be one verb in two aspects (§1.2 rule 1).
   */
  'viewer.raw.copy': { en: 'Copy markdown', ru: 'Скопировать Markdown' },

  /*
   * What a copy says, from either surface — the overlay's header control and the standalone page's
   * Raw pane are one behaviour (`viewer/content.ts`), so they are one sentence. Hence `viewer.copy`
   * rather than `viewer.raw`: the control stopped belonging to the Raw view when the overlay's
   * header took it over (task 147).
   *
   * **It no longer says «the approved revision»,** because that had stopped being true and had been
   * untrue in a worse way before: the copy now asks for the revision on screen by number, so a
   * reader looking at Rev 1 gets Rev 1. The sentence names what was copied without claiming a
   * verdict it cannot see from here.
   */
  'viewer.copy.done': {
    en: 'Copied that revision to the clipboard.',
    ru: 'Ревизия скопирована в буфер обмена.',
  },
  'viewer.copy.failed': {
    en: 'That copy did not go through.',
    ru: 'Скопировать не удалось.',
  },
});
