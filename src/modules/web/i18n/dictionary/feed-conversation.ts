import { definePhrases } from '../phrase';

/**
 * What the conversation says about itself (task 143).
 *
 * The five blocks that talk rather than show a document: the opening bubble, the question round, the
 * review card, the proposed refinement and the offer to go back a step. Documents and their cards are
 * the neighbouring file's business; the line between the two is the line the feed already draws.
 *
 * Three conventions are worth stating once here rather than defending in thirty entries.
 *
 * **A phrase carries the spaces and punctuation it is rendered with.** Several of these lines sit
 * beside a value the dictionary must not touch — a project name, a file name, a finding the model
 * wrote — and the join between them is copy too: «Suggestion: » ends in a space, the bundle counter
 * opens with a dash. Trimming them here would move the decision into JSX, where the second language
 * cannot reach it, and a lost or doubled space is the one translation defect a reader notices
 * immediately. `common.separator` set the precedent.
 *
 * **The Russian half writes `\u00A0` before an em dash**, per §1.4 of the interface-voice
 * standard: Russian typography does not let a dash begin a line. It is spelled as an escape rather
 * than typed as a character so a reviewer can see it in the diff — an invisible byte nobody can see
 * is a byte that gets deleted by accident. Every file in this directory now spells it that way;
 * three of them used to write the character itself, which is two conventions for one invisible
 * thing and no way to tell from a diff which one a line is using.
 *
 * **Where English counts in two forms, Russian counts in three, and where English does not count at
 * all, Russian usually still must.** Every counter here — questions in a round, points on a board,
 * documents in an edit — is a counted phrase, because «3 вопрос» is not a rounding error, it is
 * wrong.
 */
export const feedConversationPhrases = definePhrases({
  /* ---------------------------------------------------------------- the opening bubble (bubbles) */

  /**
   * The seed, said in the user's own voice.
   *
   * Two openings rather than one with an optional clause: the name is printed only when it is a
   * second fact, which is a decision the component makes and the sentence has to follow. The trailing
   * space is load-bearing — what the user actually typed is printed straight after it.
   *
   * «Создать», the verb `projects.new-project.prompt-label` asks the question with: this bubble is
   * that answer, read back, and an echo in a different verb from the question is not an echo.
   */
  'feed.seed.intro-named': {
    en: 'I want to build {name}. My project description is: ',
    ru: 'Хочу создать {name}. Описание проекта: ',
  },
  'feed.seed.intro': { en: 'I want to build: ', ru: 'Хочу создать: ' },

  /**
   * The line that marks the interview turning into a bundle.
   *
   * Split in two because the bundle name is set in mono between them and must stay that way. The
   * Russian counter says «впереди {count} документа» rather than «{count} файла спецификации»: the
   * English template puts a qualifier between the number and its noun, and Russian has nowhere to put
   * one (§4).
   */
  'feed.bundle.created': { en: 'Project bundle created: ', ru: 'Комплект проекта создан: ' },
  'feed.bundle.files': {
    en: { one: ' — {count} spec file to write', other: ' — {count} spec files to write' },
    ru: {
      one: '\u00A0— впереди {count} документ',
      few: '\u00A0— впереди {count} документа',
      many: '\u00A0— впереди {count} документов',
    },
  },

  /**
   * The word after the stage name in a card's caption.
   *
   * Four keys rather than four words passed as props: `BlockCaption` is rendered by four different
   * components, and a caption that takes a bare string is a caption that ships English from whichever
   * of them was written last.
   *
   * `drafting` is «генерация» because that is what the rail calls the substage this card belongs to
   * (§2.2), and a caption that named it differently would give one position two names. `edit` and
   * `refinement` are deliberately one root apart: both are «правка» (§2.4), and the plural marks the
   * edit batch, which is a set of them across several documents.
   */
  'feed.caption.drafting': { en: 'drafting', ru: 'генерация' },
  'feed.caption.review': { en: 'review', ru: 'рецензия' },
  'feed.caption.edit': { en: 'edit', ru: 'правки' },
  'feed.caption.refinement': { en: 'refinement', ru: 'правка' },

  /* -------------------------------------------------------------- the question round (round-block) */

  /**
   * The round's heading, counted.
   *
   * Both numbers are already published as `data-round` and `data-questions`, so a walk reads them
   * without parsing a plural rule in a language it was not written for.
   */
  'feed.round.heading': {
    en: { one: 'Round {round} — {count} question', other: 'Round {round} — {count} questions' },
    ru: {
      one: 'Раунд {round}\u00A0— {count} вопрос',
      few: 'Раунд {round}\u00A0— {count} вопроса',
      many: 'Раунд {round}\u00A0— {count} вопросов',
    },
  },

  /**
   * How many answers a question takes.
   *
   * Nouns, not instructions (§1.2): the hint classifies the question, and «Выберите один» would put
   * an order beside a question that is already compulsory — 40 % longer, and louder than the thing it
   * describes.
   */
  'feed.round.select-one': { en: 'Select one', ru: 'Один вариант' },
  'feed.round.select-many': { en: 'Select all that apply', ru: 'Несколько вариантов' },

  /** The model's own nudge, printed beside an option it likes. Lower case: it continues the label. */
  'feed.round.recommended': { en: '(Recommended)', ru: '(рекомендуется)' },

  /** The asterisk's meaning, for a reader who cannot see it. Announced, so clarity beats brevity. */
  'feed.round.required': { en: 'required', ru: 'обязательный вопрос' },

  /**
   * The ⓘ and the ↗ on an option that carries a справка (task 144; видео §5).
   *
   * All three name the option they belong to, because all three are repeated down a question — five
   * controls announced as «Показать справку» differ only by the order they are read in, which is not
   * a name. The visible mark is the icon; these are what a screen reader is given instead of it.
   *
   * Infinitives, per §1.2 rule 1: a control names the action, and the disclosure names it in both
   * directions — «Показать» while the note is folded, «Скрыть» while it is open — so the announced
   * word and `aria-expanded` say one thing. «Подсказка» is spent on tooltips (§6), which is why the
   * note is a «справка» here and everywhere the design writes about it.
   */
  'feed.round.note-show': { en: 'Show the note on {name}', ru: 'Показать справку: {name}' },
  'feed.round.note-hide': { en: 'Hide the note on {name}', ru: 'Скрыть справку: {name}' },
  /**
   * The link leaves for the vendor's own site, and says whose.
   *
   * «Открыть» would be the door's verb, and this is not a door in the product — it is an address
   * outside it. The English keeps the vendor's name attributive («the Neon site») where the Russian
   * puts it after a colon, because a Latin product name does not decline (§3).
   */
  'feed.round.site': { en: 'Go to the {name} site', ru: 'Перейти на сайт: {name}' },

  'feed.round.other-label': { en: 'Other — your own answer', ru: 'Другое\u00A0— свой ответ' },
  'feed.round.other-placeholder': {
    en: 'Type an answer not listed above',
    ru: 'Впишите ответ, которого нет выше',
  },

  'feed.round.submit': { en: 'Submit Answers', ru: 'Отправить ответы' },
  'feed.round.submit-busy': { en: 'Submitting…', ru: 'Отправка…' },

  'feed.round.reply-open': {
    en: 'Answer in your own words instead',
    ru: 'Ответить своими словами',
  },
  'feed.round.reply-cancel': { en: 'Use the options instead', ru: 'Вернуться к вариантам' },
  'feed.round.reply-label': { en: 'Your answer, in free text', ru: 'Ответ свободным текстом' },
  'feed.round.reply-placeholder': {
    en: 'Describe it the way you would to a colleague.',
    ru: 'Опишите так, как рассказали бы коллеге.',
  },
  'feed.round.reply-send': { en: 'Send reply', ru: 'Отправить ответ' },

  /**
   * What the live status line is waiting for.
   *
   * English phrases these to follow «Waiting for …» and Russian to follow «Ожидание: …», so the
   * Russian half is nominative where the English is infinitive (§5, sample 17). That is a property of
   * the frame, and the frame belongs to `WaitingOn`; these are only its fillers. The card's fallback
   * — the wait no busy state named — is `feed.waiting.server`, which all three waiting surfaces
   * share; a copy of it here was a second answer to «what is this page waiting for».
   *
   * `feed.round.waiting-submit` and `feed.actions.waiting-fallback` say the same words today and
   * stay two entries: two surfaces, not three, and they wait on two different endpoints — a whole
   * card of answers against one open need — so either sentence can one day name what it is saving
   * without dragging the other with it.
   */
  'feed.round.waiting-submit': { en: 'your answers to be recorded', ru: 'сохранение ответов' },
  'feed.round.waiting-reply': { en: 'your reply to be read', ru: 'чтение вашего ответа' },

  /* ------------------------------------------------------------- the review card (review-block) */

  /**
   * What the confidence number is, and what it is not.
   *
   * The second sentence is the point of the first: the product marks its own figure down as an
   * estimate, and a translation that dropped «а не измерение» would be the product claiming more than
   * it knows. «ИИ» is the one abbreviation this interface keeps in Cyrillic (§3).
   */
  'feed.review.confidence-tooltip': {
    en: 'How certain the AI reviewer is that this feedback is accurate. It is the reviewer’s own estimate, not a measurement.',
    ru: 'Насколько ИИ-рецензент уверен, что замечание верное. Это его собственная оценка, а не измерение.',
  },
  'feed.review.linter-tooltip': {
    en: 'Found by a deterministic check over the document itself — a cross-reference, an identifier, or a requirement’s form. No model was asked.',
    ru: 'Найдено детерминированной проверкой самого документа\u00A0— перекрёстная ссылка, идентификатор или форма требования. Модель не спрашивали.',
  },

  /** A badge with `whitespace-nowrap`: «Автопроверка» is narrower than the English it replaces. */
  'feed.review.source-linter': { en: 'Automated check', ru: 'Автопроверка' },
  'feed.review.confidence': {
    en: 'Confidence score {score}/10',
    ru: 'Уверенность {score}/10',
  },

  /** Opens the line under a finding. «Что изменить» is narrower and more exact than «Предложение». */
  'feed.review.suggestion-label': { en: 'Suggestion: ', ru: 'Что изменить: ' },

  /**
   * The two groups a board sorts its findings into.
   *
   * «Блокирующие» and «Рекомендации» are one grammatical number apart from each other and both take a
   * count without changing shape, so the two headings do not jump when the numbers do (§2.4).
   */
  'feed.review.group-must-fix': { en: 'Must Fix', ru: 'Блокирующие' },
  'feed.review.group-recommendations': { en: 'Recommendations', ru: 'Рекомендации' },

  /** The verdict badge. The token itself travels in `data-outcome`, where it cannot be translated. */
  'feed.review.outcome-pass': { en: 'Pass', ru: 'Пройдено' },
  'feed.review.outcome-needs-revision': { en: 'Needs Revision', ru: 'Нужна доработка' },

  /**
   * What was decided, in the past tense and on «вы».
   *
   * The one form that does not make the interface guess the reader's gender: «Вы приняли» works for
   * everybody, «Ты принял/приняла» works for half (§1.1).
   */
  'feed.review.decided-accept': {
    en: 'You accepted this feedback and moved on with the document as it stands.',
    ru: 'Вы приняли замечания и пошли дальше с документом как есть.',
  },
  'feed.review.decided-ignore': {
    en: 'You set this feedback aside.',
    ru: 'Вы отложили эти замечания.',
  },
  'feed.review.decided-request-changes': {
    en: 'You sent the document back with these points ticked.',
    ru: 'Вы отправили документ на доработку с отмеченными замечаниями.',
  },

  /** The undecided-but-not-in-front-of-you case. It must not read as history, because it is not. */
  'feed.review.still-open': {
    en: 'Something else is in front of you just now — this board is still open.',
    ru: 'Сейчас перед вами другое\u00A0— эта рецензия ещё открыта.',
  },

  /** «Заменена» agrees with «рецензия» and says what happened without claiming the board was wrong. */
  'feed.review.superseded': {
    en: 'Superseded — a newer review is below',
    ru: 'Заменена\u00A0— новая рецензия ниже',
  },

  /**
   * The fold's own summary: how many findings are inside it.
   *
   * A board that raised nothing says so in words. «Всего 0 замечаний» is a counter reporting an
   * absence as a measurement, which is the copy defect §4 separates from the plural rule: zero is
   * grammatically `many` and typographically a sentence.
   */
  'feed.review.points-total': {
    en: { one: '{count} point in all', other: '{count} points in all' },
    ru: {
      one: 'всего {count} замечание',
      few: 'всего {count} замечания',
      many: 'всего {count} замечаний',
    },
  },
  'feed.review.points-none': { en: 'No points at all', ru: 'Замечаний нет' },

  /**
   * What the checkboxes are for, and that nothing moves without a decision.
   *
   * «Ничего не двинется» is the fixed P2 formula and is written identically wherever it appears
   * (§1.1) — three surfaces say it, and a reader who met it once must meet the same words again.
   */
  'feed.review.hint-empty': {
    en: 'The reviewer found nothing to raise. Nothing advances until you decide.',
    ru: 'Рецензент не нашёл, о чём написать. Ничего не двинется, пока вы не примете решение.',
  },
  'feed.review.hint-ticked': {
    en: 'Ticked points are the ones a rewrite would apply. Nothing advances until you decide.',
    ru: 'Отмеченные замечания\u00A0— те, что учтёт переписывание. Ничего не двинется, пока вы не примете решение.',
  },

  'feed.review.decision-error': {
    en: 'That decision did not go through. Please try again.',
    ru: 'Решение не записано. Повторите попытку.',
  },

  /**
   * The three decisions, as controls.
   *
   * At rest each is a perfective infinitive and at work a verbal noun, so the change of state is
   * visible in the part of speech itself (§1.5). «Отложить» is the product's own word for what
   * ignoring does — it says «set aside» in its own copy — and it is kept apart from «Отклонить»,
   * which belongs to the proposal card and has a different consequence.
   *
   * The third of them is not here: sending a document back is `common.request-changes`, said by
   * this card, the document card and the proposal card, and its busy twin is `common.sending`.
   */
  'feed.review.accept': { en: 'Accept feedback', ru: 'Принять замечания' },
  'feed.review.accept-busy': { en: 'Accepting…', ru: 'Принятие…' },
  'feed.review.ignore': { en: 'Ignore', ru: 'Отложить' },
  'feed.review.ignore-busy': { en: 'Ignoring…', ru: 'Откладывание…' },

  /*
   * «Отправить документ», not a bare «отправить»: the clause opens the sentence, so nothing in front
   * of it can carry the object, and a reader left to supply one supplies «замечания» — the thing the
   * button does not send.
   */
  'feed.review.selection-hint': {
    en: 'Requesting changes needs at least one point ticked — only the ticked ones are applied.',
    ru: 'Чтобы отправить документ на доработку, отметьте хотя бы одно замечание\u00A0— учтутся только отмеченные.',
  },

  /* ------------------------------------------------------ the proposed change (proposal-block) */

  /**
   * Which way a decided proposal went.
   *
   * Impersonal rather than agreed with «правка»: the instruction is printed straight after the colon,
   * so the line reads «Применено: убрать раздел», and an edit batch would need a plural of the same
   * word half a line later.
   */
  'feed.proposal.applied': { en: 'Applied', ru: 'Применено' },
  'feed.proposal.discarded': { en: 'Discarded', ru: 'Отклонено' },

  /**
   * What is being proposed — one change, or one change across several documents.
   *
   * The Russian counter takes the prepositional case, where `few` and `many` genuinely coincide («в 2
   * документах», «в 5 документах») and only `one` differs. That is the language, not a translation
   * that gave up.
   */
  'feed.proposal.title': { en: 'Proposed change', ru: 'Предложена правка' },
  'feed.proposal.edit-title': {
    en: {
      one: 'Proposed edit across {count} document',
      other: 'Proposed edit across {count} documents',
    },
    ru: {
      one: 'Предложена правка в {count} документе',
      few: 'Предложена правка в {count} документах',
      many: 'Предложена правка в {count} документах',
    },
  },

  /**
   * The tail of the counts line. It opens with the full stop that ends the counts before it.
   *
   * English lets «accept» and «approve» stand without an object here; Russian does not — «пока вы не
   * примете» stops one word short and the reader waits for the noun. It is «правку» in both, singular
   * even on the batch card, because the card's own heading one line up says «Предложена правка в
   * {count} документах»: one edit, several documents.
   */
  'feed.proposal.pending-tail-accept': {
    en: '. Nothing is saved until you accept.',
    ru: '. Ничего не сохранится, пока вы не примете правку.',
  },
  'feed.proposal.pending-tail-approve': {
    en: '. Nothing is saved until you approve.',
    ru: '. Ничего не сохранится, пока вы не одобрите правку.',
  },

  /* The same sentence as `feed.review.decision-error`, and deliberately still two entries: two
     cards, not three, and they post two different decisions to two different endpoints. */
  'feed.proposal.decision-error': {
    en: 'That decision did not go through. Please try again.',
    ru: 'Решение не записано. Повторите попытку.',
  },

  'feed.proposal.accept': { en: 'Accept', ru: 'Принять' },
  'feed.proposal.accept-busy': { en: 'Applying…', ru: 'Применение…' },
  'feed.proposal.approve-apply': { en: 'Approve and apply', ru: 'Одобрить и применить' },
  /* «документам», not «файлам»: the heading one line above counts «в {count} документах», and §2.1
     keeps «файл» for the export list and the mono paths, which this is neither. */
  'feed.proposal.approve-apply-busy': {
    en: 'Applying every file…',
    ru: 'Применение ко всем документам…',
  },
  'feed.proposal.reject': { en: 'Reject', ru: 'Отклонить' },
  'feed.proposal.reject-busy': { en: 'Discarding…', ru: 'Отклонение…' },

  /* The edit chat returns a batch rather than rejecting it, and it does so with the review's own
     button: `common.request-changes`, which is why there is no fourth key for it here. */

  /* ------------------------------------------------------------- the instruction box (RefineBox) */

  'feed.refine.heading': {
    en: 'Refine a file — say what should change',
    ru: 'Правка документа\u00A0— скажите, что изменить',
  },
  /*
   * «после введения», not «под обзором». «Обзор» is banned by §6 — it is what an autotranslator calls
   * a review — and this box is printed in the same feed as cards captioned «РЕЦЕНЗИЯ», which is the
   * one place the wrong reading is free.
   *
   * The infinitive is deliberate and shared with `feed.document.instruction-placeholder`: a
   * placeholder is the ghost of what the reader would type, and both boxes are captioned with an
   * infinitive question — «Что нужно изменить?», «скажите, что изменить». «Добавьте…» would answer
   * that question in the wrong mood and read as the product giving an order it has no control for.
   */
  'feed.refine.placeholder': {
    en: 'Add a non-goals section under the overview.',
    ru: 'Добавить раздел «Чего не делаем» после введения.',
  },
  'feed.refine.submit': { en: 'Propose change', ru: 'Предложить правку' },

  /** «Working…» names nothing; the Russian says which of the product's several waits this one is. */
  'feed.refine.busy': { en: 'Working…', ru: 'Подготовка правки…' },

  'feed.refine.no-change': {
    en: 'That instruction would not change anything in this file.',
    ru: 'Эта инструкция ничего не меняет в документе.',
  },
  /* One register for a failure across the whole product: «не удалось», never the spoken «не
     получилось» — the argument is written out at `feed.document.decision-failed`, which says this
     sentence on the card this box opens under. */
  'feed.refine.failed': {
    en: 'That did not work. Please try again.',
    ru: 'Не удалось. Повторите попытку.',
  },

  /* ------------------------------------------------------------- going back a step (revert-card) */

  'feed.revert.open': { en: 'Go back to previous step', ru: 'Вернуться к предыдущему шагу' },

  /**
   * What going back would actually do.
   *
   * The sentence is the card's honesty: this is an append, not an unwind, and the copy names the
   * three revisions involved so the claim can be checked against the file's own history. «Откатить»
   * is refused for the same reason — it promises destroyed history the endpoint never destroys
   * (§2.6).
   */
  'feed.revert.explanation': {
    en: '{fileName} is at revision {current}. Going back writes revision {next} with the content of revision {previous} — nothing is deleted, and the history keeps every one of them.',
    ru: '{fileName} сейчас в ревизии {current}. Восстановление запишет ревизию {next} с содержимым ревизии {previous}\u00A0— ничего не удаляется, и история хранит их все.',
  },
  'feed.revert.apply': {
    en: 'Restore revision {revision}',
    ru: 'Восстановить ревизию {revision}',
  },
  'feed.revert.apply-busy': { en: 'Restoring…', ru: 'Восстановление…' },

  /** The file name is the subject, so «восстановлен» agrees with it and the number stays a number. */
  'feed.revert.toast-applied': {
    en: '{fileName} restored from revision {revision} — as a new revision.',
    ru: '{fileName} восстановлен из ревизии {revision}\u00A0— как новая ревизия.',
  },
  'feed.revert.toast-failed': {
    en: 'That step could not be reverted. Nothing changed.',
    ru: 'Вернуться к предыдущему шагу не удалось. Ничего не изменилось.',
  },

  /* ------------------------------------------------------------ the autonomous driver (task 145) */

  /**
   * The driver's own voice in the feed.
   *
   * These are **chrome**, not content, and the distinction is the one У-1 draws: the spec is written
   * in the session's language, but a line saying what the product just did on your behalf is the
   * product talking, and it belongs in the language the rest of the interface is in. Where a model
   * supplied a reason, that reason arrives as `{reason}` and stays in the content language — so one
   * sentence can carry both halves without either pretending to be the other.
   *
   * They are persisted, so each is frozen in the locale it was written in. That is true of every
   * message this product stores and is the honest behaviour: the note says what was said at the
   * moment it happened, and re-translating history would be inventing a record nobody wrote.
   */
  'feed.driver.started': {
    en: 'Autonomous mode is on. I will take this session from your description on my own, and record every answer and decision as I go — press Stop at any point to take it back.',
    ru: 'Автономный режим включён. Я проведу сессию от вашего описания сам и запишу каждый ответ и каждое решение\u00A0— нажмите «Стоп» в любой момент, чтобы взять управление.',
  },

  /** The answer note. `{reason}` is the model's own sentence and is never touched. */
  'feed.driver.answered': {
    en: 'Answered round {round} for you — {reason}',
    ru: 'Ответил за вас на раунд {round}\u00A0— {reason}',
  },

  /**
   * The clause that admits the seed did not decide everything.
   *
   * Separate from the note above rather than folded into it, because it is only true sometimes and a
   * sentence that says «for 0 questions» would be worse than silence. Counted in both halves: three
   * Russian forms for a number that is usually one or two.
   */
  'feed.driver.answered-fallback': {
    en: {
      one: ' Your description did not settle {count} question, so I took the recommended option.',
      other:
        ' Your description did not settle {count} questions, so I took the recommended options.',
    },
    ru: {
      one: ' Описание не решает {count} вопрос, поэтому я взял рекомендованный вариант.',
      few: ' Описание не решает {count} вопроса, поэтому я взял рекомендованные варианты.',
      many: ' Описание не решает {count} вопросов, поэтому я взял рекомендованные варианты.',
    },
  },

  'feed.driver.approved': {
    en: 'Approved {document}, revision {revision} — the review below is what judges it.',
    ru: 'Утвердил документ «{document}», ревизия {revision}\u00A0— судит его ревью ниже.',
  },

  /** Sent back. The count is the points going into the rewrite, blocking and kept advisory alike. */
  'feed.driver.review-changes': {
    en: {
      one: 'Sent {document} back with {count} point — {reason}',
      other: 'Sent {document} back with {count} points — {reason}',
    },
    ru: {
      one: 'Вернул документ «{document}» на доработку с {count} замечанием\u00A0— {reason}',
      few: 'Вернул документ «{document}» на доработку с {count} замечаниями\u00A0— {reason}',
      many: 'Вернул документ «{document}» на доработку с {count} замечаниями\u00A0— {reason}',
    },
  },

  'feed.driver.review-accepted': {
    en: 'Accepted the review of {document}: it found nothing blocking.',
    ru: 'Принял ревью документа «{document}»: блокирующих замечаний нет.',
  },

  /**
   * The other way a board is accepted, and it is not the same event.
   *
   * A board accepted because the rewrite budget is spent still says the document is wanting, and a
   * note that read «nothing blocking» over it would be the driver misreporting its own reason.
   */
  'feed.driver.review-accepted-budget': {
    en: 'Accepted the review of {document} because this file has used its {count} rewrites — the points it still raises stay on the board.',
    ru: 'Принял ревью документа «{document}»: файл израсходовал свои переписывания ({count})\u00A0— оставшиеся замечания сохранены на доске.',
  },

  /* ------------------------------------------------------- how a run ends, one sentence per reason */

  'feed.driver.stop.completed': {
    en: 'The bundle is finished. Autonomous mode is done here; the session is yours.',
    ru: 'Бандл готов. Автономный режим завершён, сессия снова ваша.',
  },
  'feed.driver.stop.stopped-by-user': {
    en: 'Stopped at your request. The session stays exactly where it is and continues by hand.',
    ru: 'Остановлен по вашей команде. Сессия осталась ровно на этом месте и продолжается вручную.',
  },
  'feed.driver.stop.seed-too-thin': {
    en: 'Stopped: the description is too short to answer an interview from. Add a few sentences about what you want built and start again, or answer the questions yourself.',
    ru: 'Остановился: описание слишком короткое, чтобы отвечать по нему на интервью. Допишите несколько предложений о том, что нужно построить, и запустите снова\u00A0— или ответьте на вопросы сами.',
  },
  'feed.driver.stop.needs-unanswered': {
    en: 'Stopped: the question rounds for this part are used up and something is still missing. That answer is yours to give.',
    ru: 'Остановился: раунды вопросов для этой части исчерпаны, а чего-то всё ещё не хватает. Этот ответ можете дать только вы.',
  },
  'feed.driver.stop.revision-budget': {
    en: 'Stopped: this document has used every rewrite it is allowed and the review still asks for changes.',
    ru: 'Остановился: документ израсходовал все допустимые переписывания, а ревью всё ещё просит правок.',
  },
  'feed.driver.stop.step-budget': {
    en: 'Stopped: the run reached its ceiling of {count} steps without finishing. Nothing is lost — the session continues by hand.',
    ru: 'Остановился: прогон упёрся в потолок в {count} шагов и не завершился. Ничего не потеряно\u00A0— сессия продолжается вручную.',
  },
  'feed.driver.stop.stalled': {
    en: 'Stopped: two steps in a row changed nothing, which means I was going in a circle.',
    ru: 'Остановился: два шага подряд ничего не изменили\u00A0— значит, я ходил по кругу.',
  },
  'feed.driver.stop.gate-refused': {
    en: 'Stopped: the next step was refused and I have no move that would change that.',
    ru: 'Остановился: следующий шаг отклонён, и у меня нет хода, который это изменит.',
  },
  'feed.driver.stop.provider-failed': {
    en: 'Stopped: the model could not produce what this step needed. Nothing is lost — try the step by hand.',
    ru: 'Остановился: модель не смогла выдать то, что нужно этому шагу. Ничего не потеряно\u00A0— сделайте шаг вручную.',
  },
  'feed.driver.stop.human-decision-pending': {
    en: 'Stopped: a change you proposed is waiting for your decision, and that decision is not mine to take.',
    ru: 'Остановился: предложенная вами правка ждёт вашего решения, а это решение не моё.',
  },

  /* --------------------------------------------------------------------- the driver panel controls */

  'feed.driver.badge': { en: 'Autonomous', ru: 'Автономно' },
  'feed.driver.running': {
    en: 'Driving the session — step {steps}.',
    ru: 'Веду сессию\u00A0— шаг {steps}.',
  },
  'feed.driver.stop-action': { en: 'Stop', ru: 'Стоп' },
  'feed.driver.stopping': { en: 'Stopping…', ru: 'Останавливаю…' },
  'feed.driver.start-action': { en: 'Run autonomously', ru: 'Вести автономно' },
  'feed.driver.starting': { en: 'Starting…', ru: 'Запускаю…' },
  'feed.driver.stopped': {
    en: 'Autonomous mode is off. The session continues by hand from here.',
    ru: 'Автономный режим выключен. Сессия продолжается вручную с этого места.',
  },
});
