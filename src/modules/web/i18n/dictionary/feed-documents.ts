import { definePhrases } from '../phrase';

/**
 * The half of the conversation that moves the session (task 143).
 *
 * Everything a person reads on the surfaces that *do* something: the document card and its two
 * decisions, the drafting card, the bar that walks through the door, the composer, and the panel the
 * session ends on. The prose blocks — bubbles, rounds, review boards — are `feed-conversation.ts`;
 * the split follows the one a reader makes anyway, between what the session said and what it is
 * asking for.
 *
 * The Russian half obeys `.specs/research/ru-interface-voice.md` line by line. Three of its rules do
 * most of the work here and are worth naming, because a later edit that breaks one of them will look
 * harmless:
 *
 * - **A control is a perfective infinitive at rest and a verbal noun at work** — «Одобрить» becomes
 *   «Одобрение…», «Отправить» becomes «Отправка…». The change of part of speech is what reports the
 *   change of state, and it is also what keeps the button from growing by more than two characters.
 * - **Prose that tells you what to do is imperative on «вы»**, never on the button's infinitive:
 *   «переходите к следующему шагу» beside a button that says «Дальше».
 * - **A number stands next to its own noun.** English inserts the qualifier — `{count} spec files` —
 *   and Russian cannot, so the counted phrases here are re-framed rather than transliterated:
 *   «написано {count} документов», not «{count} файла спецификации».
 *
 * Every counter is a counted phrase, including the ones English spells with a bare plural or with no
 * plural at all. `Sealed {n} times` is the extreme case the type was designed for: its `one` and
 * `many` forms are the same word («раз») and only `few` differs («раза»), which no two-form table can
 * express.
 */
export const feedDocumentsPhrases = definePhrases({
  /*
   * What `WaitingOn` is told it is waiting for.
   *
   * The frame around these differs between the languages — English says «Waiting for {what}», Russian
   * «Ожидание: {что}» — and the Russian frame demands the nominative, so all of them are noun
   * phrases rather than the infinitives English uses. Translating them one by one against the English
   * shape would have produced «Ожидание: одобрение, которое будет записано».
   */
  'feed.waiting.server': { en: 'the server', ru: 'ответ сервера' },
  'feed.document.waiting-approve': {
    en: 'the approval to be recorded',
    ru: 'запись одобрения',
  },
  'feed.document.waiting-changes': {
    en: 'the revision to be written',
    ru: 'переписывание документа',
  },

  /*
   * The door out of the card, named the same way it is named in the pane it opens and in the pane's
   * own close button: one object, one name on three surfaces. The placeholder sits where Russian
   * needs no case ending — a file name is a contract and must never be declined.
   */
  'feed.document.open-viewer-aria': {
    en: 'Open {fileName} in the viewer',
    ru: 'Открыть {fileName} в окне документа',
  },
  'feed.document.open-viewer-title': {
    en: 'Open in the viewer (V)',
    ru: 'Открыть в окне документа (V)',
  },

  /**
   * Masculine, because what is signed is «документ» and the file name is printed beside it.
   *
   * `session.specs.status-approved` says the same word about the same file. Two surfaces, so the
   * two stay apart: the badge is a fact about the card in front of you and the panel's is one cell
   * of a status column, and the day the column needs «Одобрен · Рев. 4» the badge must not follow
   * it. The agreement is the thing that may not drift, and §2.6 fixes that for both.
   *
   * `Rev` is a prefix here rather than `common.revision-badge`, because the number after it lives
   * in its own span: the walk reads `spec-revision-number`, and a phrase holding both would take
   * the element away.
   */
  'feed.document.approved-badge': { en: 'Approved', ru: 'Одобрен' },
  'feed.document.revision-prefix': { en: 'Rev', ru: 'Рев.' },

  'feed.document.status-approved': {
    en: ' · approved — included in the export.',
    ru: ' · одобрен\u00A0— войдёт в экспорт.',
  },
  'feed.document.status-pending': {
    en: ' · awaiting your decision — nothing advances until you approve or ask for changes.',
    ru: ' · ждёт вашего решения\u00A0— ничего не двинется, пока вы не одобрите документ или не отправите его на доработку.',
  },

  /*
   * The fold is a verb in Russian, not a mode: «Просмотр» is the viewer's own tab, and a card control
   * reading the same word would promise the pane and open an excerpt.
   */
  'feed.document.preview-show': { en: 'Preview', ru: 'Показать текст' },
  'feed.document.preview-hide': { en: 'Hide preview', ru: 'Скрыть текст' },
  /*
   * «документ», not «файл»: every other line on this card says «документ» — « · одобрен — войдёт в
   * экспорт», «пока вы не одобрите документ» — and §2.1 keeps «файл» for the export list and the
   * mono paths.
   *
   * Object first, then «не удалось», then the infinitive — which is how the other fifteen failures
   * in this dictionary are built («Проект не удалось создать», «Файл не удалось прочитать»,
   * «Экспорт не удалось собрать»). `viewer.pane.read-failed` is this sentence about a revision
   * instead of a document and was already in that shape, so the fronted infinitive left the same
   * failure told two ways on two surfaces a reader opens one from the other.
   */
  'feed.document.preview-failed': {
    en: 'That file could not be read just now.',
    ru: 'Документ сейчас не удалось прочитать.',
  },
  /*
   * `feed.refine.failed` is the same sentence in both languages. Two surfaces, not three, so it
   * stays two entries — and they are two different failures: a decision the server refused, and an
   * instruction that produced nothing. Either could one day say which, and neither should have to
   * ask the other's permission.
   *
   * **«Не удалось», not «Не получилось».** `errors.ts` struck the spoken register out of its own
   * file by name — «Не отправилось» went, because «every other failure is «не удалось …» or a
   * passive participle, and one line out of thirty in the wrong register is the line a reader
   * notices» — and the register is the product's, not that file's. This card posts to the same
   * endpoint family whose own refusal says «Не удалось. Повторите попытку.»
   * (`errors.request.failed`), so the two registers met on one card. Russian marks nothing between
   * «не получилось» and «не удалось» except how casually the product is speaking, which is the one
   * thing here that had to stop varying by file.
   */
  'feed.document.decision-failed': {
    en: 'That did not work. Please try again.',
    ru: 'Не удалось. Повторите попытку.',
  },

  /* Sending it back is `common.request-changes` — the review card and the proposal card offer the
     same move, and §2.6 gave the product one word for it rather than one word per card. */
  'feed.document.approve': { en: 'Approve', ru: 'Одобрить' },
  'feed.document.approving': { en: 'Approving…', ru: 'Одобрение…' },
  /*
   * «Что нужно изменить?», one word away from `feed.review.suggestion-label` («Что изменить: »).
   * §2.4 fixed the reviewer's line word for word, so it is this one that moves: two roles — what the
   * model proposes and what you are instructing — printed identically on two cards that share a
   * scroll is the drift a split-by-surface dictionary exists to catch.
   *
   * The placeholder keeps its infinitive, which is the answer form its caption asks for, and says
   * «раздел о рамках»: «раздел рамок» is a bare genitive that does not read as the name of a section.
   */
  'feed.document.instruction-label': { en: 'What should change?', ru: 'Что нужно изменить?' },
  'feed.document.instruction-placeholder': {
    en: 'Tighten the scope section and add a non-goal.',
    ru: 'Сузить раздел о рамках и добавить, чего продукт делать не будет.',
  },
  /*
   * «Переписывание…», not «Правка…».
   *
   * This button posts `decision: 'request_changes'` — a доработка — and «правка» is the word §2.4
   * spends on the other mechanism entirely, the one `RefineBox` and `proposal-block` run. A busy
   * caption naming the neighbouring mechanism is the one collision the two roots were separated to
   * prevent. English says «Revising…» rather than «Sending…», so the caption names what the server
   * does, and the product already has that noun: `feed.document.waiting-changes` calls it
   * «переписывание документа» and `feed.review.hint-ticked` «те, что учтёт переписывание».
   */
  'feed.document.revising': { en: 'Revising…', ru: 'Переписывание…' },
  'feed.document.send-instruction': { en: 'Send instruction', ru: 'Отправить' },

  /*
   * The panel's Download says nothing of its own.
   *
   * `download-bundle.ts` exists because «the completion panel's Download and the export panel's
   * Download must produce the same archive byte for byte», and the same argument reaches the
   * sentence that reports it: the mode word and the toast are `session.export.mode-*` and
   * `session.export.downloaded-toast`, printed from both buttons. They used to be two entries with
   * one English sentence between them and two different Russian ones — «Скачан 1 файл, режим: …»
   * against «Режим: … Скачан 1 файл.» — which is the same button telling two stories about the
   * same ZIP.
   */
  /* Word for word what `projects.edit-chat.failed` says of the same refusal from the same
     endpoint — «не открылся» here against «не удалось открыть» there was one English sentence
     translated twice. Two surfaces keep two entries; they may not disagree. */
  'feed.completion.edit-failed': {
    en: 'That edit could not be started. Please try again.',
    ru: 'Чат правок не удалось открыть. Повторите попытку.',
  },

  'feed.completion.title': { en: 'Session completed', ru: 'Сессия завершена' },

  /*
   * The final paragraph, in three pieces because two of its numbers are addressable elements: the
   * bundle name and the file count each sit in a span an end-to-end suite reads by test id, so the
   * sentence cannot become one phrase without taking those away. The slots line up in both
   * languages — text, name, text, count, text — which is what makes the split safe rather than a
   * word order baked into JSX.
   *
   * The middle piece counts even though its English forms are identical: Russian agrees its verb with
   * the number that follows it, so «написан 1 документ» and «написано 4 документа» differ before the
   * count is printed. Putting the agreement in the type is the only place it cannot be forgotten.
   */
  'feed.completion.bundle-lead': { en: 'Bundle: ', ru: 'Комплект: ' },
  'feed.completion.bundle-mid': {
    en: { one: ' — ', other: ' — ' },
    ru: { one: '\u00A0— написан ', few: '\u00A0— написано ', many: '\u00A0— написано ' },
  },
  /* The `one` form was inflected rather than rewritten: «написан 1 документ. У каждого есть
     одобренная ревизия» distributes over a set of one, and «Дорабатывать документы» counts a
     document that is not there. Both are singular now; `few` and `many` are §5 sample 19 verbatim
     and are left alone. */
  'feed.completion.bundle-tail': {
    en: {
      one: ' spec file generated. Every file has an approved revision, and the session is sealed: no stage goes back. You can still refine any file — a refinement adds a new revision and leaves the session where it is.',
      other:
        ' spec files generated. Every file has an approved revision, and the session is sealed: no stage goes back. You can still refine any file — a refinement adds a new revision and leaves the session where it is.',
    },
    ru: {
      one: ' документ. У него есть одобренная ревизия, сессия закрыта: ни один этап не откатывается. Дорабатывать документ по-прежнему можно\u00A0— правка добавляет новую ревизию и не сдвигает сессию с места.',
      few: ' документа. У каждого есть одобренная ревизия, сессия закрыта: ни один этап не откатывается. Дорабатывать документы по-прежнему можно\u00A0— правка добавляет новую ревизию и не сдвигает сессию с места.',
      many: ' документов. У каждого есть одобренная ревизия, сессия закрыта: ни один этап не откатывается. Дорабатывать документы по-прежнему можно\u00A0— правка добавляет новую ревизию и не сдвигает сессию с места.',
    },
  },

  /** «раз ¦ раза ¦ раз» — the counter whose English pair of forms cannot express it. */
  'feed.completion.sealed-count': {
    en: {
      one: 'Sealed {count} time — the session has been re-opened and completed again.',
      other: 'Sealed {count} times — the session has been re-opened and completed again.',
    },
    ru: {
      one: 'Закрыта {count} раз\u00A0— сессию открывали заново и завершали снова.',
      few: 'Закрыта {count} раза\u00A0— сессию открывали заново и завершали снова.',
      many: 'Закрыта {count} раз\u00A0— сессию открывали заново и завершали снова.',
    },
  },

  /* Two busy words this panel shares with a panel elsewhere — `projects.edit-chat.starting` opens
     the same chat, `session.export.preparing` builds the same archive. Two surfaces each, so each
     keeps its own entry: a busy caption belongs to the control it replaces, and these two controls
     live on screens that are redesigned separately. */
  'feed.completion.edit': { en: 'Edit', ru: 'Внести правки' },
  'feed.completion.editing': { en: 'Opening…', ru: 'Открытие…' },
  'feed.completion.preparing': { en: 'Preparing…', ru: 'Подготовка…' },

  'feed.completion.build-with-title': {
    en: 'Build with your favourite tool',
    ru: 'Разработка в любимом инструменте',
  },
  /*
   * The honesty of the panel, in five pieces for the same reason as the paragraph above: the promise
   * and the disclaimer are each their own element so a walk can assert that they are present without
   * asserting how they are worded.
   *
   * The recipient is «ИИ-агент», not «кодовый агент»: «кодовый» in Russian modifies a cipher —
   * кодовый замок, кодовое слово — never a programmer, so the coinage named the wrong thing on one
   * of the two panels a browser is most likely to offer to translate. §3 licenses exactly one
   * Cyrillic abbreviation for this and spends it on «ИИ-рецензент»; this is its twin.
   */
  'feed.completion.build-with-lead': {
    en: 'Generate a prompt that hands this bundle to a coding agent. The platform buttons ',
    ru: 'Сгенерируйте промпт, который передаёт этот комплект ИИ-агенту. Кнопки платформ ',
  },
  'feed.completion.build-with-buttons': {
    en: 'copy that prompt and open the platform',
    ru: 'копируют промпт и открывают платформу',
  },
  'feed.completion.build-with-dash': { en: ' — ', ru: '\u00A0— ' },
  'feed.completion.build-with-no-upload': {
    en: 'we do not send your bundle anywhere',
    ru: 'комплект никуда не отправляется',
  },
  'feed.completion.build-with-unpack': {
    en: ', and there is no import to click through. Download the ZIP, unpack it into ',
    ru: ', и ничего импортировать не нужно. Скачайте ZIP-архив, распакуйте его в ',
  },
  'feed.completion.build-with-paste': {
    en: ', and paste the prompt.',
    ru: ' и вставьте промпт.',
  },

  'feed.completion.generate-prompt': {
    en: 'Generate AI Prompt',
    ru: 'Сгенерировать промпт',
  },
  'feed.completion.copy-open': {
    en: 'Copy & open {platform}',
    ru: 'Скопировать и открыть {platform}',
  },
  'feed.completion.prompt-copied-open': {
    en: 'Prompt copied. Paste it into {platform} — the tab is open.',
    ru: 'Промпт скопирован. Вставьте его в {platform}\u00A0— вкладка уже открыта.',
  },
  'feed.completion.prompt-copy-failed-open': {
    en: 'Could not reach the clipboard. Copy the prompt below, then paste it into {platform}.',
    ru: 'Буфер обмена недоступен. Скопируйте промпт ниже и вставьте его в {platform}.',
  },
  'feed.completion.prompt-copied': {
    en: 'Prompt copied to the clipboard.',
    ru: 'Промпт скопирован в буфер обмена.',
  },
  'feed.completion.prompt-copy-failed': {
    en: 'Could not reach the clipboard.',
    ru: 'Буфер обмена недоступен.',
  },
  'feed.completion.copy-prompt': { en: 'Copy prompt', ru: 'Скопировать промпт' },

  /*
   * The drafting card's caption is `feed.caption.drafting`, and it lives in `feed-conversation.ts`
   * with the other three words `BlockCaption` can trail — one component, one family of keys, so the
   * four cannot drift into four registers.
   */
  'feed.generation.open-viewer-aria': {
    en: 'Open this document in the viewer',
    ru: 'Открыть черновик в окне документа',
  },
  'feed.generation.open-viewer-title': {
    en: 'Open in the viewer',
    ru: 'Открыть в окне документа',
  },
  'feed.generation.researching': {
    en: 'Reading current sources on the web…',
    ru: 'Чтение свежих источников в интернете…',
  },
  /*
   * Two sentences here used to make a noun do a verb's work — «остановка ничего не теряет»,
   * «Остановка вернёт вам страницу». Russian has no such predication: an «остановка» loses nothing
   * and hands nothing back. §5 sample 17 supplies the product's own idiom for the first claim, and
   * `session.waiting.status` already prints it — «Прервать можно без потерь». The second is prose
   * telling you what to do, which §1.2 rule 2 puts in the imperative on «вы», beside a button that
   * keeps its infinitive.
   */
  'feed.generation.waiting-first-words': {
    en: 'Waiting for the first words. A local model can think for a minute or two before it starts writing — nothing is stuck, and nothing is lost if you stop.',
    ru: 'Ожидание первых слов. Локальная модель может думать минуту-другую, прежде чем начнёт писать,\u00A0— ничего не зависло, и остановиться можно без потерь.',
  },
  'feed.generation.reconnecting': {
    en: 'The connection dropped. Reconnecting — nothing written so far is lost.',
    ru: 'Соединение оборвалось. Переподключение\u00A0— из написанного ничего не потеряно.',
  },
  'feed.generation.in-flight': {
    en: 'Generating… you can stop and start again; nothing written so far is lost.',
    ru: 'Генерация… можно остановить и начать заново; из написанного ничего не потеряно.',
  },
  'feed.generation.reattaching': {
    en: 'A generation for this step is already running — this page is picking it up. Stop to take the page back; the run itself carries on either way.',
    ru: 'Генерация для этого шага уже идёт\u00A0— страница её подхватывает. Остановите, чтобы вернуть себе страницу; сама генерация в любом случае продолжится.',
  },
  'feed.generation.blocked': {
    en: 'A question card is waiting for your answers above — nothing generates until it is submitted.',
    ru: 'Выше карточка вопросов ждёт ваших ответов\u00A0— пока она не отправлена, ничего не генерируется.',
  },
  'feed.generation.unavailable': {
    en: 'This step does not draft a document. Use the controls below to move the session on.',
    ru: 'Этот шаг не пишет документ. Двигайте сессию дальше кнопками ниже.',
  },
  /*
   * Re-framed rather than translated: «с {count} отмеченными замечаниями» is the same string for two
   * and for five, so the instrumental would have thrown the plural away. The impersonal «отмечено»
   * puts the verb before the number, which is where Russian wants it, and gives all three forms.
   */
  'feed.generation.revision-owed': {
    en: {
      one: 'The review sent this document back with {count} point ticked. Rewriting applies exactly those and leaves the rest as it stands.',
      other:
        'The review sent this document back with {count} points ticked. Rewriting applies exactly those and leaves the rest as it stands.',
    },
    ru: {
      one: 'Рецензия вернула документ на доработку: отмечено {count} замечание. Переписывание учтёт ровно отмеченное и не тронет остальное.',
      few: 'Рецензия вернула документ на доработку: отмечено {count} замечания. Переписывание учтёт ровно отмеченное и не тронет остальное.',
      many: 'Рецензия вернула документ на доработку: отмечено {count} замечаний. Переписывание учтёт ровно отмеченное и не тронет остальное.',
    },
  },
  'feed.generation.apply-review': { en: 'Apply the review points', ru: 'Учесть замечания' },
  'feed.generation.generate': { en: 'Generate', ru: 'Сгенерировать' },
  'feed.generation.regenerate': { en: 'Write it again', ru: 'Написать заново' },

  'feed.actions.waiting-ask': {
    en: 'the next round of questions',
    ru: 'следующий раунд вопросов',
  },
  'feed.actions.waiting-proceed': {
    en: 'the gate to answer',
    ru: 'проверка условий перехода',
  },
  /* Word for word `feed.round.waiting-submit`, and kept apart from it: two surfaces, and two
     endpoints behind them — a whole card of answers there, one open need here. The third filler
     both cards fall back on, `feed.waiting.server`, is one entry precisely because three of them
     print it. */
  'feed.actions.waiting-fallback': {
    en: 'your answers to be recorded',
    ru: 'сохранение ответов',
  },

  'feed.actions.awaiting-round': {
    en: 'The questions above are waiting for your answers — nothing else moves until they are submitted.',
    ru: 'Вопросы выше ждут ваших ответов\u00A0— пока они не отправлены, ничего больше не движется.',
  },

  /*
   * The budget line, in three pieces because the middle one is an element a walk reads: «{k} left» is
   * the half a person acts on, and it carries the methodology's own number rather than a default.
   *
   * The Russian frame is «отвечено раундов: {n} из {m}», which fixes the noun in the genitive plural
   * and needs no forms — the same trick the standard uses to keep «X из Y» honest when the two
   * numbers disagree about which noun governs.
   */
  'feed.actions.rounds-answered': {
    en: '{answered} of {budget} question rounds answered',
    ru: 'отвечено раундов: {answered} из {budget}',
  },
  'feed.actions.rounds-left': { en: ' · {left} left', ru: ' · осталось {left}' },
  'feed.actions.summary-saved': { en: ' · summary saved', ru: ' · сводка сохранена' },
  'feed.actions.summary-none': { en: ' · no summary yet', ru: ' · сводки пока нет' },

  'feed.actions.rounds-exhausted': {
    en: {
      one: 'All {count} question round for this stage has been used, so nothing further will be asked here. ',
      other:
        'All {count} question rounds for this stage have been used, so nothing further will be asked here. ',
    },
    ru: {
      one: 'Израсходован {count} раунд вопросов этого этапа\u00A0— новых вопросов здесь не будет. ',
      few: 'Израсходовано {count} раунда вопросов этого этапа\u00A0— новых вопросов здесь не будет. ',
      many: 'Израсходовано {count} раундов вопросов этого этапа\u00A0— новых вопросов здесь не будет. ',
    },
  },
  'feed.actions.rounds-exhausted-open': {
    en: 'Answer what is still open below, then move on to the next step.',
    ru: 'Ответьте ниже на то, что осталось невыясненным, и переходите к следующему шагу.',
  },
  'feed.actions.rounds-exhausted-done': {
    en: 'Everything this stage needed to ask has been answered — move on to the next step.',
    ru: 'Всё, что этот этап должен был спросить, отвечено\u00A0— переходите к следующему шагу.',
  },

  'feed.actions.fallback-lead': {
    en: 'The question budget for this stage is used up, and this is still open — answer directly:',
    ru: 'Лимит вопросов на этом этапе исчерпан, а это осталось невыясненным\u00A0— ответьте прямо здесь:',
  },
  /**
   * The frame around an information need's own name.
   *
   * The name is the agent's — `target_users`, `deployment_target` — and stays exactly as written; what
   * this adds is the thing the English surface never said out loud, which is what the reader is
   * looking at. «Информационная потребность» is the phrase the standard bans by name; the field
   * caption it prescribes is «что нужно выяснить».
   */
  'feed.actions.need-label': { en: 'Still open: {need}', ru: 'Что нужно выяснить: {need}' },
  'feed.actions.fallback-placeholder': {
    en: 'Answer in a sentence',
    ru: 'Ответьте одним предложением',
  },
  /** «Сохранение…», not «Запись…»: a «запись» is also a row in a log. */
  'feed.actions.recording': { en: 'Recording…', ru: 'Сохранение…' },
  'feed.actions.record-answers': { en: 'Record answers', ru: 'Сохранить ответы' },
  'feed.actions.preparing-questions': {
    en: 'Preparing questions…',
    ru: 'Подготовка вопросов…',
  },
  'feed.actions.ask-questions': { en: 'Ask questions', ru: 'Задать вопросы' },
  /**
   * The busy caption on the door.
   *
   * The word «гейт» is not printed — what is printed is what is being checked. 17 Russian characters
   * against 18 English ones, so the button does not move as it changes state.
   */
  'feed.actions.checking-gate': { en: 'Checking the gate…', ru: 'Проверка условий…' },
  /** Lower case on purpose: this is the tail of a sentence beside the button, not a label. */
  'feed.actions.still-needed': { en: 'still needed: {list}', ru: 'ещё нужно: {list}' },

  /*
   * `{names}` is a list: `composer.tsx:115` joins every reference that matched nothing with a comma,
   * so «Нет документа с именем @a.md, @b.md» nails a singular frame to a plural value. English is
   * number-blind here and degrades quietly; a case-marked Russian frame does not. The phrase must
   * stay flat — the component does not count — so both halves are written so that neither can be
   * wrong: «ни один документ так не называется» holds one name and five, and «прикреплять нечего»
   * replaces the singular «ссылка не прикреплена» with the same fact told without a number.
   *
   * The command notice names the noun its own ending agrees with. Without it the reader sees
   * `/proceed` in mono followed by «недоступна» and has to reconstruct «команда» to parse the
   * feminine — four characters buy the agreement outright.
   */
  'feed.composer.unknown-reference': {
    en: 'No document called {names} — that reference was not attached.',
    ru: 'Ни один документ так не называется: {names}\u00A0— прикреплять нечего.',
  },
  'feed.composer.command-unavailable': {
    en: '{command} is not available at this point in the session.',
    ru: 'Команда {command} на этом шаге сессии недоступна.',
  },
  'feed.composer.reference-empty': { en: 'not written yet', ru: 'ещё не написан' },
  /*
   * The `@` menu's right-hand column printed the union member itself — `spec`, `attachment` — which is
   * a machine value doing the work of a word. The token still decides which entry this is; only the
   * column is copy now.
   */
  'feed.composer.kind-spec': { en: 'spec', ru: 'документ' },
  'feed.composer.kind-attachment': { en: 'attachment', ru: 'вложение' },
  'feed.composer.message-aria': { en: 'Message', ru: 'Сообщение' },
  'feed.composer.placeholder-decision': {
    en: 'Ask a question, or type your decision — “approve it” works as well as the button. / for commands, @ for a document.',
    ru: 'Задайте вопрос или напишите решение\u00A0— «одобрить» работает не хуже кнопки. /\u00A0— команды, @\u00A0— документ.',
  },
  'feed.composer.placeholder-plain': {
    en: 'Ask anything about this session. / for commands, @ for a document.',
    ru: 'Спросите что угодно об этой сессии. /\u00A0— команды, @\u00A0— документ.',
  },
  'feed.composer.attach': { en: 'Attach a document', ru: 'Прикрепить документ' },
  'feed.composer.model-label': { en: 'Model', ru: 'Модель' },
  /* In flight it says `common.sending`, the same word the round's reply and the review's send-back
     say — one decision about what «on its way to the server» is called. */
  'feed.composer.send': { en: 'Send', ru: 'Отправить' },

  /*
   * The slash commands' descriptions. The commands themselves — `/ask`, `/proceed` — are typed
   * identifiers and are never translated; only what they promise is.
   */
  /* «Запросить», because по-русски задают вопрос, а не раунд. §6 bans «запросить» where it would
     mean handing a document back; asking for information is what it governs, and
     `errors.gate.no-answered-round` already says «Запросите раунд». */
  'feed.command.ask': {
    en: 'Ask another round of questions',
    ru: 'Запросить ещё раунд вопросов',
  },
  'feed.command.proceed': { en: 'Move to the next step', ru: 'Перейти к следующему шагу' },
  'feed.command.generate': {
    en: 'Draft the document for this step',
    ru: 'Написать черновик документа этого шага',
  },
  'feed.command.approve': { en: 'Approve the draft', ru: 'Одобрить черновик' },
  'feed.command.request-changes': {
    en: 'Send the document back with the points you ticked',
    ru: 'Отправить документ на доработку с отмеченными замечаниями',
  },
  'feed.command.accept': {
    en: 'Accept the review and move on',
    ru: 'Принять рецензию и двигаться дальше',
  },
  /** «Восстановить», not «вернуться»: the mechanism appends a revision, it does not undo one. */
  'feed.command.go-back': {
    en: 'Go back to the previous revision of this document',
    ru: 'Восстановить предыдущую ревизию этого документа',
  },
  'feed.command.export': { en: 'Download the bundle', ru: 'Скачать комплект' },

  'feed.surface.jump-to-end': {
    en: 'Jump to the end of the conversation',
    ru: 'Перейти в конец ленты',
  },
  'feed.surface.generation-failed': {
    en: 'That generation did not complete. Nothing was lost.',
    ru: 'Генерация не завершилась. Ничего не потеряно.',
  },
  /*
   * Russian counts attempts with an ordinal — «с попытки 2» is the numeral left sitting in the
   * English slot. The frame is «на {attempt}-й попытке» rather than the more idiomatic «с {attempt}-й
   * попытки» for one reason the dictionary cannot escape: that preposition is «со» before «второй»
   * and «с» before «третьей», and the phrase has no way to know which numeral it is holding. «На»
   * has no such pair. The «-й» suffix is right for every ordinal this slot can take.
   */
  'feed.surface.generation-failover': {
    en: 'Drafted on attempt {attempt} — an earlier provider did not answer.',
    ru: 'Написано на {attempt}-й попытке\u00A0— предыдущий провайдер не ответил.',
  },

  /*
   * The substages, printed by the stage chip and by the header pill. Three verbal nouns, all of them
   * agentless: «Собираем» and «Генерируем» would invent a «we» the product does not have, and
   * «Рецензия» is deliberately the same word as the card, because the substage is that card.
   */
  'feed.substage.collect': { en: 'Collecting', ru: 'Сбор' },
  'feed.substage.generate': { en: 'Generating', ru: 'Генерация' },
  'feed.substage.review': { en: 'Reviewing', ru: 'Рецензия' },
});
