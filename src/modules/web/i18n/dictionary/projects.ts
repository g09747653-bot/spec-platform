import { definePhrases } from '../phrase';

/**
 * The words on the way in: the new-project form, the project list and one project's page
 * (task 143).
 *
 * This surface is the first one a person meets and the only one they meet before the product has
 * explained itself, so it carries a disproportionate share of the vocabulary decisions — комплект,
 * методология, чат правок, ревизия — with nothing on screen yet to make them guessable. The Russian
 * half follows `.specs/research/ru-interface-voice.md` to the letter for exactly that reason: a term
 * introduced loosely here is a term the reader carries wrongly into the feed.
 *
 * Two of the entries below are counted where the English is not. That is not embellishment — see
 * `projects.list.chat-count` and the relative-time trio, both of which English gets away with and
 * Russian cannot.
 */
export const projectsPhrases = definePhrases({
  /* ── The form that starts a session ─────────────────────────────────────────────────────── */

  /**
   * The question the seed bubble answers, so both use one verb.
   *
   * «Построить» is the calque §6 exists to catch: Russian builds a bridge and *creates* a product,
   * and the bubble that echoes this answer says «Хочу создать …» one screen later. Two verbs for
   * one English *build*, on two surfaces a reader meets in sequence, is how a translation stops
   * sounding like one voice.
   */
  'projects.new-project.prompt-label': {
    en: 'What do you want to build?',
    ru: 'Что вы хотите создать?',
  },
  'projects.new-project.prompt-placeholder': {
    en: 'A recipe app for cooks who hate scrolling past life stories.',
    ru: 'Приложение с рецептами для тех, кто ненавидит пролистывать истории из жизни.',
  },
  'projects.new-project.prompt-empty': {
    en: 'Describe your idea in a sentence or two before starting.',
    ru: 'Опишите идею в одном-двух предложениях, прежде чем начинать.',
  },
  'projects.new-project.failed': {
    en: 'The project could not be created. Please try again.',
    ru: 'Проект не удалось создать. Повторите попытку.',
  },

  'projects.new-project.audience-legend': {
    en: 'How should the questions be worded?',
    ru: 'Как формулировать вопросы?',
  },

  /**
   * The two registers, by profile id (У-5).
   *
   * Kept as four separate flat entries rather than one table keyed by profile, because the component
   * still owns the `Record<AudienceProfile, …>` and the exhaustiveness that comes with it: a profile
   * added without copy should be a compile error pointing at the map and at this file, not a blank
   * label nobody notices.
   *
   * Task 144 turned out **not** to add a third profile — it added a second axis beside this one, and
   * its four entries are below. The note that predicted otherwise is corrected rather than deleted,
   * because the shape it was defending is the reason the entries are still flat.
   */
  'projects.new-project.audience-plain': { en: 'In plain language', ru: 'Простыми словами' },
  'projects.new-project.audience-plain-hint': {
    en: 'Questions in everyday words, with no engineering vocabulary.',
    ru: 'Вопросы обычными словами, без инженерной терминологии.',
  },
  'projects.new-project.audience-technical': {
    en: 'In technical terms',
    ru: 'В технических терминах',
  },
  /**
   * The word this hint may not spend: «решение».
   *
   * §2.3 refused «Решение» as the name of the `solution` stage because the product says «ждёт
   * вашего решения» a dozen times a session, and one noun cannot carry both the user's decision and
   * the engineering it is about. The same collision was sitting here — on the first screen, before
   * the reader has learned either sense — so the same ruling applies. «Технические варианты» was
   * the other candidate and loses to the label printed directly above it, «В технических терминах»:
   * a hint that repeats its own label's adjective explains nothing.
   *
   * «Компромиссы» goes with it. *Trade-off* is not a compromise in Russian, and «их компромиссы»
   * reads as concessions the choices themselves made; «его цену» is the idiom that says what a
   * trade-off costs.
   */
  'projects.new-project.audience-technical-hint': {
    en: 'Questions that name the engineering choices directly, with the trade-offs stated.',
    ru: 'Вопросы прямо называют инженерный выбор и его цену.',
  },

  /**
   * The second axis of the same choice (task 144): not *how* the questions are worded but *what*
   * they are about.
   *
   * The legend has to make that difference audible one line under «Как формулировать вопросы?», or
   * the reader meets two fieldsets that look like one question asked twice. «О чём спрашивать?» is
   * the shortest sentence that does it — the same length as the one above it, and the only word
   * that changes carries the whole distinction.
   */
  'projects.new-project.style-legend': {
    en: 'What should the questions be about?',
    ru: 'О чём спрашивать?',
  },

  /**
   * The default style, named by what it does rather than by being the default.
   *
   * «Обычный» and «По умолчанию» were the two obvious labels and both are refusals to say anything:
   * a reader choosing between two options learns nothing from being told that one of them is the
   * one they would have got anyway. This is a real register — it opens on the idea and lets the
   * engineering follow — so the label says that instead.
   *
   * The hint may not spend «решение», for the reason spelled out over the technical hint above: the
   * product says «ждёт вашего решения» all session, and one noun cannot also mean the engineering
   * being chosen. «Технический выбор» is the same word that hint settled on.
   */
  'projects.new-project.style-default': {
    en: 'The idea and its goals',
    ru: 'Об идее и её целях',
  },
  'projects.new-project.style-default-hint': {
    en: 'Goals, users and boundaries first; the technical choices follow from them.',
    ru: 'Сначала цели, люди и границы; технический выбор следует из них.',
  },
  /**
   * «Что строить и как этим пользоваться» — the customer's own sentence, in the customer's order.
   *
   * The directive of 2026-08-18 asks for questions about *what to build, how to build it and how it
   * will be used*, against an interview that had been asking what an ant ought to feel. Three verbs
   * would not fit a radio label, and «как строить» is what the options themselves answer, so the
   * label keeps the two ends and lets the hint carry the rest.
   */
  'projects.new-project.style-concrete': {
    en: 'What to build, and how you will use it',
    ru: 'Что строить и как этим пользоваться',
  },
  /**
   * «Справка» is the word the whole feature is named by, and it is not «подсказка» (§6: a подсказка
   * in an interface is a tooltip). The sentence promises the thing the video shows — an option that
   * names a technology and explains itself — and hedges with «может», because the note belongs to
   * the option and half the options in a round will not carry one.
   */
  'projects.new-project.style-concrete-hint': {
    en: 'Questions name the actual technology, and an answer can carry a note about it.',
    ru: 'Вопросы прямо называют технологию, а к ответу может прилагаться справка.',
  },

  /**
   * «Какая методология?», where the English asks about a workflow.
   *
   * The English legend sits over `name="methodology"` and has always named one thing twice; the
   * glossary (§2.2) settles it for Russian rather than importing the confusion — `workflow` and
   * `methodologies` are two modules in this codebase, and the picker chooses the second.
   */
  'projects.new-project.methodology-legend': { en: 'Which workflow?', ru: 'Какая методология?' },
  'projects.new-project.methodology-auto': { en: 'Auto', ru: 'Автовыбор' },
  /**
   * Declarative, because it classifies rather than commands (§1.2 rule 3).
   *
   * The infinitive read as a button caption that had slipped under a radio — and the two hints in
   * the fieldset above it are plain statements («Вопросы обычными словами, без инженерной
   * терминологии»), so this one was the only microlabel on the form telling the reader to do
   * something they had already done by selecting the option it sits under.
   */
  'projects.new-project.methodology-auto-hint': {
    en: 'Pick the workflow that fits the description.',
    ru: 'Методология подбирается по описанию.',
  },

  'projects.new-project.submit': { en: 'Start a session', ru: 'Начать сессию' },
  /** Verb at rest, verbal noun at work (§1.5). «Начало…» reads as the noun for a beginning. */
  'projects.new-project.submitting': { en: 'Starting…', ru: 'Запуск…' },

  /* ── The chats of one project ───────────────────────────────────────────────────────────── */

  /**
   * «3d ago», counted.
   *
   * English gets away with `3d ago` because the abbreviation never inflects; Russian has no such
   * abbreviation that reads at a glance, so the unit is spelled and therefore has to agree — «1 день
   * назад», «2 дня назад», «5 дней назад». The English halves declare `one` and `other` identical,
   * which is the truth about English rather than a translation that gave up.
   */
  'projects.chat-list.last-message-now': {
    en: 'Last message just now',
    ru: 'Последнее сообщение только что',
  },
  'projects.chat-list.last-message-minutes': {
    en: { one: 'Last message {count}m ago', other: 'Last message {count}m ago' },
    ru: {
      one: 'Последнее сообщение {count} минуту назад',
      few: 'Последнее сообщение {count} минуты назад',
      many: 'Последнее сообщение {count} минут назад',
    },
  },
  'projects.chat-list.last-message-hours': {
    en: { one: 'Last message {count}h ago', other: 'Last message {count}h ago' },
    ru: {
      one: 'Последнее сообщение {count} час назад',
      few: 'Последнее сообщение {count} часа назад',
      many: 'Последнее сообщение {count} часов назад',
    },
  },
  'projects.chat-list.last-message-days': {
    en: { one: 'Last message {count}d ago', other: 'Last message {count}d ago' },
    ru: {
      one: 'Последнее сообщение {count} день назад',
      few: 'Последнее сообщение {count} дня назад',
      many: 'Последнее сообщение {count} дней назад',
    },
  },

  /**
   * Masculine, because the row is signed «чат».
   *
   * §2.6 asks status words to agree with the object they label rather than retreat into the neuter
   * for the convenience of one dictionary key. The same state on the session panel reads «Сессия
   * завершена»; here the noun above it is a chat, so «Завершён».
   */
  'projects.chat-list.status-completed': { en: 'Completed', ru: 'Завершён' },

  'projects.chat-list.archive': { en: 'Archive', ru: 'Архивировать' },
  'projects.chat-list.restore': { en: 'Restore', ru: 'Восстановить' },
  /** The flag is being written, and saying so is more honest than a generic «работа» (§1.5). */
  'projects.chat-list.busy': { en: 'Working…', ru: 'Сохранение…' },
  /*
   * The same English sentence `errors.request.failed` says, and now the same Russian one.
   * «Не получилось» here against «Не удалось» there was one line of copy translated twice; the
   * two entries stay apart because two surfaces are not three, but they may not disagree.
   */
  'projects.chat-list.failed': {
    en: 'That did not go through. Please try again.',
    ru: 'Не удалось. Повторите попытку.',
  },
  'projects.chat-list.archive-failed': {
    en: 'That chat could not be archived. Nothing changed.',
    ru: 'Чат не удалось архивировать. Ничего не изменилось.',
  },
  /**
   * Lower case and unquoted on purpose: the filter this points at is a control on the project page
   * with its own phrase, and copy that quotes another surface's label breaks the moment that label
   * is reworded.
   *
   * **But not «из архива».** §2.1 spends «архив» on the ZIP the export builds, and there is no place
   * called that on this screen — the filter beside the tabs reads «Архивные», and the empty state
   * two entries down already says «архивные чаты». The toast was sending the reader to a room that
   * does not exist, in a word that means something else in the session they just left.
   */
  'projects.chat-list.archived': {
    en: 'Chat archived. Restore it from Archived.',
    ru: 'Чат архивирован. Восстановить его можно среди архивных чатов.',
  },
  'projects.chat-list.restored': { en: 'Chat restored.', ru: 'Чат восстановлен.' },
  'projects.chat-list.empty-title': { en: 'No chats here', ru: 'Здесь нет чатов' },
  'projects.chat-list.empty-body': {
    en: 'Nothing matches this tab, filter and search together. Archived chats are still here — switch the filter to see them.',
    ru: 'Ничего не подходит под вкладку, фильтр и поиск одновременно. Архивные чаты никуда не делись\u00A0— переключите фильтр, чтобы их увидеть.',
  },

  /* ── Rename, duplicate, delete ──────────────────────────────────────────────────────────── */

  'projects.actions.name-label': { en: 'Project name', ru: 'Имя проекта' },
  'projects.actions.save': { en: 'Save', ru: 'Сохранить' },
  'projects.actions.rename': { en: 'Rename', ru: 'Переименовать' },
  'projects.actions.duplicate': { en: 'Duplicate', ru: 'Дублировать' },
  'projects.actions.delete': { en: 'Delete', ru: 'Удалить' },
  /**
   * Generic, because the slot is generic: the busy label appears where Duplicate stands, whichever
   * of the three requests is in flight. A truthful narrower word would be a lie two thirds of the
   * time.
   */
  'projects.actions.busy': { en: 'Working…', ru: 'Выполнение…' },

  /**
   * The sentence FR-002 AC-4 is actually about (DR-7).
   *
   * The criterion is that the confirmation *states deletion is permanent*, so «навсегда» and «Это
   * нельзя отменить» are the load-bearing words and neither may soften in translation. The verb
   * leads the enumeration rather than trailing it, because a Russian subject chain this long
   * postpones the only word that matters to the end of the line (§4).
   *
   * «Добавленные вами вложения», not «прикреплённые»: a вложение is by definition the thing that was
   * attached, so the participle restated its own noun — the tell of a word-by-word pass over «every
   * document you attached». Dropping the person entirely was the other option and costs the sentence
   * something DR-7 wants kept: these are the reader's own uploads, and that is the item on this list
   * they will feel. «Добавили» is also the verb the attachments panel prints on its own control.
   */
  'projects.actions.delete-confirm': {
    en: 'Delete “{name}” permanently? Its session, questions, answers, every spec file and every revision, and every document you attached will be removed. This cannot be undone.',
    ru: 'Удалить «{name}» навсегда? Будут удалены его сессия, вопросы, ответы, все документы и все ревизии, а также все добавленные вами вложения. Это нельзя отменить.',
  },
  'projects.actions.delete-confirmed': { en: 'Delete permanently', ru: 'Удалить навсегда' },
  'projects.actions.delete-cancel': { en: 'Keep it', ru: 'Оставить' },

  'projects.actions.rename-failed': {
    en: 'That name could not be saved.',
    ru: 'Имя не удалось сохранить.',
  },
  'projects.actions.duplicate-failed': {
    en: 'That project could not be duplicated.',
    ru: 'Проект не удалось дублировать.',
  },
  'projects.actions.delete-failed': {
    en: 'That project could not be deleted.',
    ru: 'Проект не удалось удалить.',
  },

  /* ── The list of projects ───────────────────────────────────────────────────────────────── */

  'projects.list.empty-title': { en: 'No projects yet', ru: 'Пока нет проектов' },
  'projects.list.empty-body': {
    en: 'Describe an idea above and the interview starts from that prompt.',
    ru: 'Опишите идею выше\u00A0— интервью начнётся с этого промпта.',
  },
  /**
   * Counted, although the row only renders above one.
   *
   * The badge is printed when `sessionCount > 1`, so English never needs its singular and the
   * literal said «chats» unconditionally. Russian distinguishes 2 from 5 inside that same range, so
   * the counter has to be a counter — and the English `one` form is written out anyway, because the
   * condition that hides it lives in a component and conditions move.
   */
  'projects.list.chat-count': {
    en: { one: '{count} chat', other: '{count} chats' },
    ru: { one: '{count} чат', few: '{count} чата', many: '{count} чатов' },
  },

  /* ── Starting an edit chat ──────────────────────────────────────────────────────────────── */

  'projects.edit-chat.title': { en: 'Edit this bundle', ru: 'Правка комплекта' },
  'projects.edit-chat.nothing-approved': {
    en: 'Nothing in this bundle has been approved yet, so there is nothing to edit. Approve a document first.',
    ru: 'В этом комплекте пока ничего не одобрено, поэтому править нечего. Сначала одобрите документ.',
  },
  /**
   * «Откроется с незаконченной фразой», where the English opens *on* one.
   *
   * The instrumental without a preposition — «открывается фразой» — says the chat is opened *by
   * means of* a phrase, which is a claim about the mechanism rather than about what will be on
   * screen. The English is a promise about the next second, so the Russian is perfective and future:
   * the composer will already hold half a sentence, and finishing it is the reader's move.
   */
  'projects.edit-chat.pick': {
    en: 'Pick the documents this edit may touch. The chat opens on a sentence you finish.',
    ru: 'Отметьте документы, которых может коснуться правка. Чат откроется с незаконченной фразой, которую вы допишете.',
  },
  /* The badge beside each file name is `common.revision-badge` — the viewer's chip and the specs
     panel's status print the same one, and «Рев. 3» is one decision about the word, not three. */
  'projects.edit-chat.start': { en: 'Start edit chat', ru: 'Начать чат правок' },
  'projects.edit-chat.starting': { en: 'Opening…', ru: 'Открытие…' },
  'projects.edit-chat.failed': {
    en: 'That edit could not be started. Please try again.',
    ru: 'Чат правок не удалось открыть. Повторите попытку.',
  },

  /* ── The MCP frame ──────────────────────────────────────────────────────────────────────── */

  'projects.mcp.title': { en: 'MCP Servers', ru: 'MCP-серверы' },
  'projects.mcp.description': {
    en: 'Tools an agent could reach while it works on this bundle. Not yet available — this is the shape it will take, not a feature waiting to be switched on.',
    ru: 'Инструменты, до которых агент мог бы дотянуться, работая над этим комплектом. Пока недоступно\u00A0— это набросок будущей формы, а не функция, которую осталось включить.',
  },
  'projects.mcp.scope-project': { en: 'This project', ru: 'Этот проект' },
  'projects.mcp.scope-profile': { en: 'User profile', ru: 'Профиль пользователя' },
  /**
   * A sentence, not a counter, because the number is zero and nothing can change it yet.
   *
   * §4 draws the line at «a live counter reading» versus «a state»: this card has no runtime behind
   * it, so «0 серверов» would be a measurement of nothing dressed as a measurement. The English half
   * is unchanged — the count travels in `data-count` for the test either way.
   */
  'projects.mcp.count-none': { en: '0 servers', ru: 'Серверов нет' },
  'projects.mcp.add': { en: 'Add server', ru: 'Добавить сервер' },
});
