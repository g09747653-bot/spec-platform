import { definePhrases } from '../phrase';

/**
 * The session's own furniture (task 143).
 *
 * Four sidebar panels, the live wait, the connection band and the keyboard list — everything the
 * session surface says *about itself*, as opposed to what the conversation in the middle of it says.
 * The feed has its own dictionary for that, and the split is deliberate: these lines are read while
 * looking at something else, so they are short, they never explain, and a translation that grew a
 * clause would be wrong for the column it lives in even if it were right as a sentence.
 *
 * Russian follows `.specs/research/ru-interface-voice.md`: §1.2 for the mood of every control,
 * §1.5 for the busy forms, §2.1 for «комплект / документ / вложение / исходник», §4 for the three
 * plural forms and for the rule that a bare zero is a copy defect, and §5 items 17 and 18 verbatim —
 * the waiting line and the export mode line were written there and are not re-decided here.
 *
 * Where a Russian line carries a non-breaking space — between a number and its unit, and to the
 * left of an em dash — it is spelled `\u00A0` (§1.4). It is not decoration: «4,2 МБ» and the dash
 * opening «— без …» must not be broken across a line in a 300-pixel column, and this dictionary is
 * read in one. The escape rather than the character itself, because a byte nobody can see in a diff
 * is a byte that gets deleted by accident — and because half the dictionary spelled it one way and
 * half the other, which is two conventions for one invisible thing.
 */
export const sessionPhrases = definePhrases({
  /*
   * The panel is named after what it lists, and what it lists are documents (§2.1).
   *
   * «Спецификации» would promise four different specifications where there is one specification in
   * four documents, which is the same mistake the English plural «Specs» is one keystroke away from
   * making. The heading is set in caps by the panel, and «ДОКУМЕНТЫ» is nine characters — well under
   * the ~24 the standard allows Cyrillic capitals before a word loses its silhouette (§1.3).
   */
  'session.specs.title': { en: 'Specs', ru: 'Документы' },

  /*
   * Agreement is with the document, not with the row (§2.6): «Одобрен», never «Одобрено». The
   * reader can see what is being described — the file name is printed one span to the left — and an
   * impersonal form chosen to save a dictionary key is exactly what reads as machine translation.
   *
   * The third status a row can carry is `common.revision-badge`, and the link into the newest
   * comparison is `common.view-diff`: both are words this product has already decided once, and a
   * panel spelling either of them again is how «Сравнение» and «Diff» end up on the same screen.
   */
  'session.specs.status-not-started': { en: 'Not started', ru: 'Не начат' },
  'session.specs.status-approved': { en: 'Approved', ru: 'Одобрен' },

  /*
   * Local Workspace. «Локальная папка» rather than a translation of «workspace»: the panel offers
   * exactly one thing, a folder on this machine, and the honest short name is the one that says so.
   * The stub keeps both of its sentences — the second is the promise that nothing on the disk is
   * touched, and a stub that drops its guarantee in the second language is a stub that lies there.
   */
  'session.workspace.title': { en: 'Local Workspace', ru: 'Локальная папка' },
  'session.workspace.mount': { en: 'Mount folder', ru: 'Подключить папку' },
  'session.workspace.stub': {
    en:
      'Mounting a folder from this machine is not built yet. Nothing here reads or writes your ' +
      'files.',
    ru:
      'Подключение папки с этого компьютера пока не сделано. Ничего здесь не читает и не ' +
      'записывает ваши файлы.',
  },

  /*
   * The pane's own chrome. Only a screen reader and a tooltip ever meet these, which is precisely
   * why they are spelled out rather than abbreviated: «сайдбар» would be read aloud (§2.5), and
   * length costs nothing in a label nobody has to fit into a column.
   *
   * The letter in the tooltip is not translated and not transliterated — it is the engraving on the
   * key (§3), and the dispatcher now matches the physical key rather than the character it produces,
   * so the promise holds on a Russian layout too (§7.2).
   */
  'session.sidebar.resize': { en: 'Resize the sidebar', ru: 'Изменить ширину боковой панели' },
  'session.sidebar.panels': { en: 'Session panels', ru: 'Панели сессии' },
  'session.sidebar.show': { en: 'Show the sidebar', ru: 'Показать боковую панель' },
  'session.sidebar.hide': { en: 'Hide the sidebar', ru: 'Скрыть боковую панель' },
  'session.sidebar.show-title': { en: 'Show the sidebar (B)', ru: 'Показать боковую панель (B)' },
  'session.sidebar.hide-title': { en: 'Hide the sidebar (B)', ru: 'Скрыть боковую панель (B)' },

  'session.attachments.title': { en: 'Attachments', ru: 'Вложения' },

  /* Verb at rest, verbal noun at work — the change of part of speech is the state change (§1.5). */
  'session.attachments.add': { en: 'Add', ru: 'Добавить' },
  'session.attachments.adding': { en: 'Adding…', ru: 'Добавление…' },

  /* §4: an empty list is a sentence, never «0 вложений». */
  'session.attachments.empty': {
    en: 'Nothing attached. Anything you add here grounds every later stage.',
    ru: 'Ничего не прикреплено. Всё, что вы добавите, ложится в основу каждого следующего этапа.',
  },

  /*
   * The meta line, as one phrase rather than as three JSX fragments with two separators between
   * them. Russian puts the stage in a prepositional frame the English «attached at {stage}» does
   * not have, and a sentence assembled in markup cannot be given one.
   *
   * The stage arrives as a word (`session.stage.canonical.*`), not as the identifier the database
   * stores: a token printed as a word is a defect of presentation, and the token itself stays in
   * `data-stage` where a test can still read it (§3).
   */
  'session.attachments.meta': {
    en: '{type} · {size} · attached at {stage}',
    ru: '{type} · {size} · прикреплён на этапе {stage}',
  },

  /*
   * What kind of document this is. Format names are Latin in both languages and do not decline
   * (§3), so most of these halves are identical and that is the correct translation, not a
   * forgotten one. Only «text» is a word, and only the last entry is new: an unrecognised MIME type
   * used to be printed raw — `application/x-brochure` announced to a reader as though it were the
   * name of a thing — and it now says what it is while the type stays in `data-mime`.
   */
  'session.attachments.type-pdf': { en: 'PDF', ru: 'PDF' },
  'session.attachments.type-docx': { en: 'DOCX', ru: 'DOCX' },
  'session.attachments.type-xlsx': { en: 'XLSX', ru: 'XLSX' },
  'session.attachments.type-text': { en: 'text', ru: 'текст' },
  'session.attachments.type-markdown': { en: 'Markdown', ru: 'Markdown' },
  'session.attachments.type-png': { en: 'PNG', ru: 'PNG' },
  'session.attachments.type-jpeg': { en: 'JPEG', ru: 'JPEG' },
  'session.attachments.type-other': { en: 'File', ru: 'Файл' },

  /*
   * Size units are language too (§1.4): the unit is written in Cyrillic, the space before it is
   * non-breaking so «4,2» and «МБ» cannot be split across a line in a 300-pixel column, and the
   * fractional comma comes from `Intl.NumberFormat`, which the panel asks for the reader's locale.
   */
  'session.attachments.size-bytes': { en: '{size} B', ru: '{size}\u00A0Б' },
  'session.attachments.size-kilobytes': { en: '{size} KB', ru: '{size}\u00A0КБ' },
  'session.attachments.size-megabytes': { en: '{size} MB', ru: '{size}\u00A0МБ' },

  /*
   * The four parse outcomes (FR-004 AC-5). Agreement is with «документ», hence the masculine
   * «Прочитан» and «Сохранён»; `{reason}` is the parser's own message and stays in whatever language
   * the parser answered in — it is data about a file, not copy of ours (S3).
   */
  'session.attachments.parse-ok': {
    en: 'Read — its text grounds every later stage.',
    ru: 'Прочитан\u00A0— его текст ложится в основу каждого следующего этапа.',
  },
  'session.attachments.parse-passthrough': {
    en: 'Image — offered to vision-capable models as it is.',
    ru: 'Изображение\u00A0— передаётся как есть моделям, которые умеют читать картинки.',
  },
  'session.attachments.parse-pending': {
    en: 'Stored; still being read.',
    ru: 'Сохранён; ещё читается.',
  },
  'session.attachments.parse-failed': {
    en: 'Could not be read: {reason}. The session continues without it.',
    ru: 'Не удалось прочитать: {reason}. Сессия продолжается без него.',
  },
  'session.attachments.parse-reason-unknown': { en: 'unknown reason', ru: 'причина неизвестна' },

  'session.attachments.remove': { en: 'Remove', ru: 'Убрать' },

  'session.attachments.upload-failed': {
    en: 'The upload did not complete.',
    ru: 'Загрузка не завершилась.',
  },
  'session.attachments.refine-conflict': {
    en: 'That file already has a change awaiting your decision.',
    ru: 'У этого документа уже есть правка, которая ждёт вашего решения.',
  },
  'session.attachments.refine-failed': {
    en: 'The refinement could not be started.',
    ru: 'Правку не удалось начать.',
  },
  'session.attachments.remove-failed': {
    en: 'The document could not be removed.',
    ru: 'Документ не удалось убрать.',
  },

  /*
   * The late-attachment notice (FR-004 AC-9), counted because Russian cannot say «эти документы»
   * about one of them and neither language should. English gained a singular form here, which it
   * never had: the list is «files were written» even when it holds exactly one, and that is the
   * defect the plural type exists to make impossible in the second language.
   */
  'session.attachments.late-notice': {
    en: {
      one: 'This approved file was written before {fileName} was attached, so it was generated without it:',
      other:
        'These approved files were written before {fileName} was attached, so they were generated without it:',
    },
    ru: {
      one: 'Этот одобренный документ написан до того, как прикрепили {fileName},\u00A0— он создан без него:',
      few: 'Эти одобренные документы написаны до того, как прикрепили {fileName},\u00A0— они созданы без него:',
      many: 'Эти одобренные документы написаны до того, как прикрепили {fileName},\u00A0— они созданы без него:',
    },
  },

  /*
   * «Правка», the mechanism of `RefineBox` — deliberately a different root from the review's
   * «доработка» (§2.4), because the two do different things to a document and a reader who learns
   * one word for both learns the wrong thing about the product.
   */
  'session.attachments.late-refine': {
    en: 'Refine {fileName}',
    ru: 'Внести правку в {fileName}',
  },
  'session.attachments.late-note': {
    en: 'Nothing has been changed. Refining proposes an update you can review and accept.',
    ru: 'Ничего не изменено. Правка предлагает изменение, которое можно рассмотреть и принять.',
  },

  /* §6: sentence case, so «Экспорт комплекта» and never «Экспорт Комплекта». */
  'session.export.title': { en: 'Export the bundle', ru: 'Экспорт комплекта' },

  /*
   * The export mode, said in words while the token travels in `data-mode` (§2.1, §3).
   *
   * Both mode words are written to stand in the nominative after a colon — «Режим: обычный» — and
   * every sentence below that mentions a mode uses that frame rather than putting the word into a
   * case Russian would have to inflect. That is why the panel's own line reads «Режим: …» and the
   * toasts read «… — ревизия режима: …»: one grammatical shape, two surfaces, no declension.
   */
  'session.export.mode-label': { en: 'Mode:', ru: 'Режим:' },
  'session.export.mode-default': { en: 'default', ru: 'обычный' },
  'session.export.mode-quality': { en: 'quality', ru: 'с обогащением' },

  /*
   * What a default-mode archive is, counted from the methodology's plan (task 133) rather than from
   * a constant. The Russian singular drops «каждый», which is nonsense about one document, and the
   * count stands against its noun with nothing between them (§4).
   */
  'session.export.plan-default': {
    en: {
      one: " — this workflow's {count} spec file, each at its most recent pre-enrichment revision.",
      other:
        " — this workflow's {count} spec files, each at its most recent pre-enrichment revision.",
    },
    ru: {
      one: '\u00A0— {count} документ этого комплекта, в последней ревизии до обогащения.',
      few: '\u00A0— {count} документа этого комплекта, каждый в последней ревизии до обогащения.',
      many: '\u00A0— {count} документов этого комплекта, каждый в последней ревизии до обогащения.',
    },
  },
  'session.export.plan-quality': {
    en: ' — the enriched files plus quality.md.',
    ru: '\u00A0— обогащённые документы плюс quality.md.',
  },

  'session.export.included': { en: 'Included: {files}', ru: 'Войдут: {files}' },

  /* §4 again, and §5 item 18: the empty archive is a sentence, not «0 документов одобрено». */
  'session.export.empty': {
    en: 'Nothing is approved yet, so the archive would be empty.',
    ru: 'Пока не одобрен ни один документ\u00A0— архив получится пустым.',
  },
  'session.export.omitted': {
    en: 'Omitted for want of an approved revision: {files}',
    ru: 'Не войдут\u00A0— у них нет одобренной ревизии: {files}',
  },

  'session.export.copying': { en: 'Copying…', ru: 'Копирование…' },
  'session.export.copied': { en: 'Copied ✓', ru: 'Скопировано ✓' },
  'session.export.copy-error': {
    en: 'That file could not be read. Try again.',
    ru: 'Файл не удалось прочитать. Повторите попытку.',
  },
  'session.export.copy-failed-toast': {
    en: '{fileName} could not be copied.',
    ru: '{fileName} не удалось скопировать.',
  },
  'session.export.copied-toast': {
    en: '{fileName} copied — the {mode}-mode revision.',
    ru: 'Скопирован {fileName}\u00A0— ревизия режима: {mode}.',
  },
  'session.export.copy-manual': {
    en: 'The clipboard was not available. Here is {fileName} — select and copy it.',
    ru: 'Буфер обмена недоступен. Вот {fileName}\u00A0— выделите и скопируйте.',
  },

  /*
   * What the archive turned out to hold, restated after the download (FR-015 AC-7).
   *
   * One sentence with three holes in it, and a second one for the empty archive, because the
   * English original was built out of four JSX fragments whose order Russian does not keep: the
   * mode has to move to the front of its own clause, and a fragment cannot be moved. `{omitted}` is
   * either empty or the clause below — the one place this dictionary hands a phrase to a phrase,
   * and it is a whole clause rather than a word for exactly that reason.
   */
  'session.export.downloaded': {
    en: 'Downloaded in {mode} mode: {files}{omitted}.',
    ru: 'Режим: {mode}. Скачано: {files}{omitted}.',
  },
  'session.export.downloaded-empty': {
    en: 'Downloaded in {mode} mode: an empty archive{omitted}.',
    ru: 'Режим: {mode}. Скачан пустой архив{omitted}.',
  },
  'session.export.downloaded-without': {
    en: ' — without {files}',
    ru: '\u00A0— без {files}',
  },

  /* «Скачано» before the number, impersonal, which also settles the gender question (§4). */
  'session.export.downloaded-toast': {
    en: {
      one: 'Downloaded {count} file in {mode} mode.',
      other: 'Downloaded {count} files in {mode} mode.',
    },
    ru: {
      one: 'Режим: {mode}. Скачан {count} файл.',
      few: 'Режим: {mode}. Скачано {count} файла.',
      many: 'Режим: {mode}. Скачано {count} файлов.',
    },
  },

  'session.export.preparing': { en: 'Preparing…', ru: 'Подготовка…' },
  'session.export.download-zip': { en: 'Download ZIP', ru: 'Скачать ZIP' },

  /*
   * The two failures the download can report on its own. Anything the server said about a refusal
   * is printed as the server said it — these two are for the cases where nobody answered at all.
   */
  'session.export.download-failed': {
    en: 'The export could not be produced.',
    ru: 'Экспорт не удалось собрать.',
  },
  'session.export.download-unreachable': {
    en: 'The download did not start. Check your connection and try again.',
    ru: 'Скачивание не началось. Проверьте соединение и повторите попытку.',
  },

  /*
   * The live wait (§5 item 17). «Не ждать» rather than «Прервать ожидание»: a control that exists
   * to be quick cannot be 69 % wider than the English one, and what is being abandoned is named by
   * the sentence beside it.
   *
   * The frame changed from a preposition to a colon, which obliges every value passed as `{what}`
   * to be a nominative noun group — the callers own those words and the standard rewrites all six.
   * Between the number and «с» stands a non-breaking space (§1.4).
   */
  'session.waiting.stop': { en: 'Stop waiting', ru: 'Не ждать' },
  'session.waiting.status': {
    en:
      'Waiting for {what} — {seconds} s. Stopping loses nothing: the page re-reads the session ' +
      'from the server either way.',
    ru:
      'Ожидание: {what}\u00A0— {seconds}\u00A0с. Прервать можно без потерь: страница в любом случае ' +
      'перечитает сессию с сервера.',
  },

  /*
   * The connection band (task 125). The subject of the Russian sentence is the page, not an
   * invented «мы» (§1.5): it is the page that keeps trying, and the product does not speak in the
   * first person outside the interviewer's own replies.
   */
  'session.connection.checking': {
    en:
      'Still trying to reach the server. Nothing you have done is lost — it is all on the server ' +
      'or on its way there.',
    ru:
      'Страница всё ещё пытается связаться с сервером. Ничего из сделанного не потеряно\u00A0— всё ' +
      'либо на сервере, либо на пути к нему.',
  },
  'session.connection.offline': {
    en:
      'The server stopped answering. Nothing is lost: a generation already running carries on, ' +
      'and everything approved is saved.',
    ru:
      'Сервер перестал отвечать. Ничего не потеряно: уже запущенная генерация продолжается, ' +
      'а всё одобренное сохранено.',
  },
  'session.connection.reconnect': { en: 'Reconnect', ru: 'Переподключиться' },

  /*
   * The keyboard list (task 141). The three scopes are grouping tokens in `shortcuts.ts` and their
   * words live here; «Окно документа» is the same name the viewer, the card and the close button
   * use for the same object (§2.5), because one thing with three names is three things to a reader.
   */
  'session.shortcuts.title': { en: 'Keyboard shortcuts', ru: 'Горячие клавиши' },
  'session.shortcuts.scope-anywhere': { en: 'Anywhere', ru: 'Везде' },
  'session.shortcuts.scope-session': { en: 'Session', ru: 'Сессия' },
  'session.shortcuts.scope-viewer': { en: 'Document viewer', ru: 'Окно документа' },
  'session.shortcuts.note': {
    en: 'Single letters apply when the caret is not in a text box.',
    ru: 'Одиночные буквы работают, когда курсор не в текстовом поле.',
  },

  /*
   * What each key does. Infinitives, because a shortcut list is a list of actions the reader
   * performs (§1.2). The four rows for `1`–`4` are absent on purpose: they print `common.view-*`,
   * the same entries the tabs themselves print, so pressing a key and reading the tab it opens
   * cannot drift into two words for one view.
   */
  'session.shortcuts.show-list': { en: 'Show this list', ru: 'Показать этот список' },
  'session.shortcuts.toggle-sidebar': {
    en: 'Collapse or expand the sidebar',
    ru: 'Свернуть или развернуть боковую панель',
  },
  'session.shortcuts.focus-composer': {
    en: 'Jump to the message box',
    ru: 'Перейти к полю сообщения',
  },
  'session.shortcuts.slash': { en: 'Open the command menu', ru: 'Открыть меню команд' },
  'session.shortcuts.open-viewer': {
    en: 'Open the newest document',
    ru: 'Открыть последний документ',
  },
  'session.shortcuts.close': {
    en: 'Close the viewer or this list',
    ru: 'Закрыть окно документа или этот список',
  },
  'session.shortcuts.send': { en: 'Send the message', ru: 'Отправить сообщение' },
});
