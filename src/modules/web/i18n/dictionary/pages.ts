import { definePhrases } from '../phrase';

/**
 * The application frame, and every route that is a page rather than a conversation (task 143).
 *
 * These surfaces share the property that decided the whole task: they are what a visitor meets
 * *before* anything has been generated, so they are the ones a browser offers to translate, and the
 * «врата» screenshot the customer sent was taken on one of them. The wording below answers to
 * `.specs/research/ru-interface-voice.md` line by line; where the standard and instinct disagreed,
 * the standard won.
 *
 * Two prefixes, and the split is not cosmetic. `shell.` is the frame — the header, the account
 * controls, the theme switch, the toast region — words said once each by one component; they are
 * deliberately not in `common.ts`, whose docblock reserves that file for a phrase three surfaces
 * mean the same thing by. `page.` is a route, named after the route rather than after the component
 * that renders it today, because a page keeps its identity when its markup is rearranged and a key
 * named after a component is orphaned by the first refactor.
 */
export const pagesPhrases = definePhrases({
  /**
   * The product's own name — the one entry whose two halves are identical, on purpose.
   *
   * A name is not copy. `<title>` says «Spec Platform» from `app/layout.tsx`, where the metadata is
   * built before any cookie can be read, so a Russian rendering here would leave the header and the
   * browser tab disagreeing about what this application is called. It is a dictionary entry all the
   * same rather than a literal, because the dictionary is where that decision is written down — and
   * because lint cannot tell a name it should keep from a button somebody forgot.
   */
  'shell.brand.name': { en: 'Spec Platform', ru: 'Spec Platform' },

  /**
   * The document's description, in `<head>` (task 143).
   *
   * The title is `shell.brand.name` — a product name is the same word in both languages, and a tab
   * that disagreed with the header about what this application is called would be the defect, not
   * the translation. The sentence beside it is ordinary copy and is translated like any other.
   *
   * **One English sentence, one Russian one.** `page.signin.tagline` carries the identical English
   * string, and the two had drifted apart in three ways at once — «описание словами» against
   * «промпт», «кодового агента» against «агента», third person against an imperative — on the two
   * surfaces a browser is likeliest to offer to translate, one of which is the screenshot this task
   * came from. Three decisions, taken once:
   *
   * - «промпт», because §2.2 chose it over «запрос» and «подсказка» and the product teaches it out
   *   loud two screens later («интервью начнётся с этого промпта»). «Описание словами» is the vaguer
   *   of the two renderings and drops the term;
   * - «агента», because §2.1 already named the recipient in exactly this position — «промпт для
   *   агента», «называет получателя, единственное, что пользователю нужно». «Кодовый агент» is a
   *   coinage on top of a decision already taken, and «кодовый» in Russian modifies a cipher
   *   (кодовый замок, кодовое слово), not a programmer;
   * - third person, because a `<meta name="description">` read out of a search result addresses
   *   nobody, so it is the one form both slots can hold. The imperative also read as an order to do
   *   a thing a visitor at the sign-in screen cannot do until they are through it.
   */
  'page.meta.description': {
    en: 'Turn a plain-language prompt into an agent-ready specification bundle.',
    ru: 'Превращает промпт на обычном языке в комплект документов, готовый для агента.',
  },

  'shell.account.nav': { en: 'Account', ru: 'Учётная запись' },

  /**
   * What the account slot shows when the provider returned neither an email nor a name.
   *
   * Impersonal, because the slot's other two values are an address and a person's name: «вы вошли»
   * in that position reads as a sentence where an identity was expected, and the standard removes
   * the pronoun wherever it is only grammar (§1.1).
   */
  'shell.account.signed-in': { en: 'Signed in', ru: 'Вход выполнен' },
  'shell.account.sign-out': { en: 'Sign out', ru: 'Выйти' },

  /**
   * The account slot of a local single-user deployment (task 148).
   *
   * A noun phrase where the address would be, because that is what the slot answers — who this
   * platform belongs to. There is no sign-out beside it: the mode has no session to end.
   */
  'shell.account.local-owner': { en: 'Local owner', ru: 'Локальный владелец' },

  /**
   * Two phrases where the component built one sentence around a machine token.
   *
   * `Switch to ${next} theme` printed `dark` and `light` — the values the attribute and the storage
   * key carry. English gets away with it because the token happens to be the word; Russian does not,
   * and a template would either announce «Switch to dark тему» or need a second table to turn the
   * token into a word first. Naming the two directions costs one extra entry and takes the token out
   * of the sentence entirely, which is what §3 of the standard asks for.
   */
  'shell.theme.to-dark': { en: 'Switch to dark theme', ru: 'Включить тёмную тему' },
  'shell.theme.to-light': { en: 'Switch to light theme', ru: 'Включить светлую тему' },

  /**
   * The language switch, labelled by what pressing it would do.
   *
   * Each label is written in the language it switches TO — a person who cannot read the current
   * interface has to be able to read the way out of it, which is the one place in this dictionary
   * where the two halves are deliberately not translations of each other.
   */
  'shell.locale.to-russian': { en: 'Switch to Russian', ru: 'Переключить на русский' },
  'shell.locale.to-english': { en: 'Switch to English', ru: 'Switch to English' },

  'shell.toast.dismiss': { en: 'Dismiss notification', ru: 'Закрыть уведомление' },

  /**
   * The placeholder route at `/`.
   *
   * «Milestone 1» stays in Latin: it names a row of the plan in `.specs/tasks.md`, the same way
   * `REPORT-M13.md` does, and a reader who went looking for «майлстоун 1» would not find it. The
   * rest is ordinary prose and follows §1.5 — no invented «мы», no exclamation.
   */
  'page.home.placeholder': {
    en: 'Foundation placeholder route. The guided specification workflow arrives in Milestone 1.',
    ru: 'Заглушка базового маршрута. Пошаговый процесс написания спецификации появится в Milestone 1.',
  },

  /**
   * The not-found page, which must stay as uninformative as it is today (AR-2).
   *
   * The Russian keeps the English hedging exactly — «возможно», not a claim about which of the two
   * happened — because the page's whole job is that a deleted project and someone else's project
   * read identically. «We could not» loses its «we»: §1.5 forbids the corporate first person, and
   * an impersonal «найти не удалось» says the same thing without inventing a speaker.
   */
  'page.not-found.title': { en: 'Not found', ru: 'Не найдено' },
  'page.not-found.body': {
    en: 'We could not find that page. It may have been deleted, or the link may be wrong.',
    ru: 'Такую страницу найти не удалось. Возможно, она удалена или ссылка неверна.',
  },
  'page.not-found.back': { en: 'Back to your projects', ru: 'К вашим проектам' },

  'page.signin.title': { en: 'Sign in to Spec Platform', ru: 'Вход в Spec Platform' },
  /* Word for word `page.meta.description`, and see its docblock for why all three of the differences
     that used to stand between them were losses rather than choices. */
  'page.signin.tagline': {
    en: 'Turn a plain-language prompt into an agent-ready specification bundle.',
    ru: 'Превращает промпт на обычном языке в комплект документов, готовый для агента.',
  },

  /**
   * The two providers.
   *
   * «Продолжить» is the obvious calque and is unavailable: §2.6 spends it on `resume`, and a product
   * with a Continue button on the sign-in screen and a Continue button on a half-finished session
   * has one word for two mechanisms. «Войти через …» is what a Russian sign-in screen says anyway,
   * and it names the thing the button actually does.
   */
  'page.signin.google': { en: 'Continue with Google', ru: 'Войти через Google' },
  'page.signin.github': { en: 'Continue with GitHub', ru: 'Войти через GitHub' },

  /**
   * Auth.js failures, phrased for the person reading them.
   *
   * Each keeps the reassurance its English half carries — that no account was created — because that
   * is the sentence a person needs after a flow they did not finish. `Please try again` becomes
   * «Повторите попытку»: §1.4 strikes «пожалуйста» out of every string, the apology being an
   * intonation this product does not have.
   */
  /**
   * «Сервис входа», not «провайдер».
   *
   * §2.5 spends «провайдер» on the model provider, and the product prints it in that sense on the
   * generation surface. Borrowing the LLM word for OAuth would put one Russian noun on two
   * mechanisms — and on a screen whose two buttons say «Войти через Google» and «Войти через
   * GitHub», the word a reader needs is the one that names those two. The animate «через того» went
   * with it: a service is a thing, so «через тот».
   */
  'page.signin.error-account-not-linked': {
    en: 'That email address is already registered through the other provider. Sign in with the provider you used first.',
    ru: 'Этот адрес почты уже зарегистрирован через другой сервис входа. Войдите через тот, с которого начали.',
  },
  /* Same English clause as `errors.request.abandoned` («You can try again»), so the same Russian
     word order: there was nothing here for the fronted object to front for. */
  'page.signin.error-access-denied': {
    en: 'The sign-in was cancelled, so no account was created. You can try again.',
    ru: 'Вход отменён, учётная запись не создана. Можно повторить попытку.',
  },
  'page.signin.error-configuration': {
    en: 'Sign-in is misconfigured on the server. The problem has been logged.',
    ru: 'Вход на сервере настроен неверно. Проблема записана в журнал.',
  },
  'page.signin.error-verification': {
    en: 'That sign-in link has expired. Start again to get a new one.',
    ru: 'Срок действия ссылки для входа истёк. Начните заново, чтобы получить новую.',
  },
  'page.signin.error-default': {
    en: 'The sign-in did not complete, so no account was created. Please try again.',
    ru: 'Вход не завершился, учётная запись не создана. Повторите попытку.',
  },

  'page.projects.title': { en: 'Projects', ru: 'Проекты' },
  'page.projects.subtitle': {
    en: 'Each project holds one specification bundle and the chats that write it.',
    ru: 'В каждом проекте\u00A0— один комплект документов и чаты, которые его пишут.',
  },

  /**
   * The heading above the new-project form.
   *
   * A noun, not the English imperative: §1.2 keeps the infinitive for controls and gives a label
   * that merely classifies a noun phrase. «Начните новый проект» over a form that is already there
   * to be filled in is the product telling its user to do the thing they came to do.
   */
  'page.projects.new-project': { en: 'Start a new project', ru: 'Новый проект' },

  'page.project.about': {
    en: 'Every conversation about this bundle. Archiving hides a chat from Active and changes nothing else.',
    ru: 'Все чаты об этом комплекте. Архивация убирает чат из активных и больше ничего не меняет.',
  },
  'page.project.chat-class': { en: 'Chat class', ru: 'Тип чатов' },

  /**
   * The two chat classes, and the three archive filters.
   *
   * The tabs take the vocabulary the rest of the product already uses for the same two things —
   * «Генерация» is the `generate` substage (§2.3) and «Правки» is the «чат правок» of §2.2 — so a
   * reader meets one word per mechanism rather than one per surface. The filters are adjectives
   * agreeing with «чаты», which is what they are filtering.
   */
  'page.project.tab-generate': { en: 'Generate', ru: 'Генерация' },
  'page.project.tab-edit': { en: 'Edit', ru: 'Правки' },
  'page.project.filter-active': { en: 'Active', ru: 'Активные' },
  'page.project.filter-archived': { en: 'Archived', ru: 'Архивные' },
  'page.project.filter-all': { en: 'All', ru: 'Все' },

  'page.project.search-label': { en: 'Search chats', ru: 'Поиск по чатам' },
  'page.project.search-placeholder': { en: 'Search by name', ru: 'Поиск по названию' },
  'page.project.search-submit': { en: 'Search', ru: 'Найти' },

  /**
   * How much of the bundle is approved, on a chat row.
   *
   * Flat rather than counted, because neither half has a noun to inflect: the badge counts approvals
   * of nothing named. The Russian puts the impersonal verb in front of the number, which §4 requires
   * of any sentence that would otherwise open with a numeral.
   *
   * **Capitalised, because it is a label and not a tail.** `chat-list.tsx` sets it in a row of three
   * micro-labels — «MySpec · Greenfield · V1», this one, then `projects.chat-list.status-completed`
   * or the methodology's own stage name — and the other two open with a capital. §1.3 asks for
   * sentence case on a label; the licensed lower case belongs to a fragment that continues a
   * sentence printed beside it, which is what `feed.actions.still-needed` is and this is not.
   */
  'page.project.bundle-approved': {
    en: '{approved}/{planned} approved',
    ru: 'Одобрено {approved} из {planned}',
  },

  /**
   * The route-level loading screen.
   *
   * A verbal noun with an ellipsis, per §1.5: in repose a control is a verb, at work it is a noun,
   * and the change of part of speech is itself the signal. «Открываем…» would invent a «мы» and
   * «Открываю…» would give the loader the interviewer's voice.
   */
  'page.session.loading': { en: 'Opening the session…', ru: 'Открытие сессии…' },
  'page.session.all-chats': { en: 'All chats', ru: 'Все чаты' },
  'page.session.stage-rail': { en: 'Workflow stages', ru: 'Этапы процесса' },

  /**
   * The forward doors of the session header.
   *
   * «Дальше» rather than «Продолжить» (§2.6), and it is the one licensed adverb among infinitives —
   * §1.2 names the transition door as the exception. The two substage doors print the labels the
   * step pill beside them prints, because a door and the pill it leads to naming the same position
   * differently is the two-vocabulary defect task 132 already had to fix once.
   *
   * `door-stage` carries the methodology's own name for the target, so the placeholder sits after a
   * colon — a position that asks nothing of the label's case. §5 п. 11 makes that general: never put
   * a substitution where Russian would decline it.
   */
  'page.session.door-complete': {
    en: 'Finish and seal the session',
    ru: 'Завершить и закрыть сессию',
  },
  'page.session.door-generate': { en: 'Proceed to drafting', ru: 'Дальше: Генерация' },
  'page.session.door-review': { en: 'Proceed to review', ru: 'Дальше: Рецензия' },
  /*
   * The colon shape, like the three doors above it.
   *
   * «Открыть заново для этапа качества» was the widest control in the product (32 characters) and
   * the only door in the family that did not put its target after a colon — and it lower-cased a
   * stage name the rail prints as «Качество» one column away. Eight characters shorter, in the shape
   * the reader has already met three times.
   */
  'page.session.door-quality': {
    en: 'Re-open for the Quality stage',
    ru: 'Открыть заново: Качество',
  },
  'page.session.door-stage': { en: 'Proceed to {stage}', ru: 'Дальше: {stage}' },

  /**
   * What the revert card calls the file when neither the revision row nor the bundle plan named one.
   *
   * A word, not a file name: file names never translate (§3), and this is what stands in when there
   * is no file name to print.
   *
   * **Capitalised, where the English is not.** Both slots it reaches put it first — «{fileName}
   * сейчас в ревизии 3» on the card and «{fileName} восстановлен из ревизии 2» in the toast — so the
   * lower-case word opened a sentence with a small letter. English gets there through an article it
   * cannot capitalise mid-thought; copying that is importing a defect rather than translating one.
   * Safe, because the two real candidates for this slot are file names, which are never capitalised
   * in either language and never land anywhere but here.
   */
  'page.session.revert-unnamed-file': { en: 'the document', ru: 'Документ' },
});
