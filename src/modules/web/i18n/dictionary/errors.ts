import { definePhrases } from '../phrase';

/**
 * What the product says when something is refused, fails, or has no name of its own (task 143).
 *
 * **Not a screen — a register.** The other dictionaries are named after surfaces, because a surface
 * is what a translator can hold in their head while dressing it. This one is named after the moment:
 * a gate that will not open, a POST that never came back, a stream that lost its connection, a code
 * the API answered with. Those lines are written by six modules that have no markup of their own —
 * `session/gate-copy.ts`, `session/session-request.ts`, `session/useChatDecision.ts`,
 * `session/resumable-stream.ts`, `web/api/responses.ts` — and they reach a dozen different surfaces.
 * Splitting them by the component that happens to print them would scatter one voice across eight
 * files, and this is the voice the customer meets on their worst visit; it has to be revised as one
 * thing.
 *
 * **The refusals were the original complaint.** Round 5's Р-3 item 4 found the page telling its owner
 * `still needed: ROUND_LIMIT_REACHED` — a machine identifier printed as a sentence. `gate-copy.ts`
 * closed that in English by keying both registers on the whole `ReasonCode` union; keeping the keys
 * here keeps it closed in both languages, because a reason code added without wording is still a type
 * error and now it is a type error twice.
 *
 * Russian follows `.specs/research/ru-interface-voice.md` — §2.2 for the gate («условие перехода»,
 * never «врата», never «гейт»), §2.6 for «устарело» and its obligatory tail, and §5 items 1–4, which
 * fix four of these sentences verbatim.
 */
export const errorsPhrases = definePhrases({
  /*
   * The three persisted conditions of the interview exit gate (FR-006 AC-2), joined with commas into
   * «ещё нужно: …». Nominative noun groups, so any subset reads in any order — the frame is §5 item 4
   * and it is the reason «одно интервью» is not written as a verb here.
   */
  'errors.condition.grounding-input': { en: 'the initial prompt', ru: 'исходный промпт' },
  'errors.condition.answered-round': {
    en: 'one answered question round',
    ru: 'один раунд вопросов с ответами',
  },
  'errors.condition.summary': { en: 'a session summary', ru: 'сводка сессии' },

  /*
   * Short fragments for the same «ещё нужно: …» line, one per reason code — read where the gate
   * refused without naming an interview condition. Same nominative frame as above.
   */
  'errors.needed.interview-incomplete': {
    en: 'the interview to be complete',
    ru: 'завершённое интервью',
  },
  'errors.needed.no-answered-round': {
    en: 'one answered question round for this stage',
    ru: 'один раунд вопросов с ответами на этом этапе',
  },
  'errors.needed.spec-not-approved': {
    en: 'your approval of the current draft',
    ru: 'ваше одобрение текущего черновика',
  },
  'errors.needed.review-not-decided': {
    en: 'a decision on the review above',
    ru: 'решение по рецензии выше',
  },
  'errors.needed.spec-missing': {
    en: 'an approved revision of every file in the bundle',
    ru: 'одобренная ревизия у каждого документа комплекта',
  },
  'errors.needed.transition-not-in-table': {
    en: 'a step that follows from where the session is',
    ru: 'шаг, который следует из текущего положения сессии',
  },
  'errors.needed.session-sealed': {
    en: 'nothing — the session is sealed and does not reopen',
    ru: 'ничего\u00A0— сессия закрыта и больше не открывается',
  },
  /*
   * Rewritten under the frame rather than translated through it (§5 item 4). «ничего дальше от этого
   * этапа» is not a Russian noun group; «ничего — …» is the same answer in the shape the line needs.
   */
  'errors.needed.round-limit-reached': {
    en: 'nothing further from this stage — its question rounds are used up',
    ru: 'ничего\u00A0— раунды вопросов этого этапа исчерпаны',
  },
  'errors.needed.capability-not-registered': {
    en: 'an optional stage that is not installed',
    ru: 'необязательный этап, который не установлен',
  },
  'errors.needed.revision-limit-reached': {
    en: 'a decision on this review — its revision cycles are used up',
    ru: 'решение по этой рецензии\u00A0— её циклы доработки исчерпаны',
  },

  /*
   * The same ten reasons as whole sentences: what was refused, and what to do about it. Prose that
   * tells the reader what to do, so the mood is the imperative on «вы» (§1.2 rule 2) — «переходите»,
   * «примите», «одобрите» — while the controls those verbs name stay infinitives on their buttons.
   */
  'errors.gate.interview-incomplete': {
    en: 'The interview is not complete yet. The page lists which of its three conditions is still open.',
    ru: 'Интервью ещё не завершено. На странице указано, какое из трёх его условий пока не выполнено.',
  },
  'errors.gate.no-answered-round': {
    en: 'This stage has no answered question round yet. Ask a round and answer it, then try again.',
    ru: 'На этом этапе ещё нет ни одного раунда вопросов с ответами. Запросите раунд, ответьте на него и повторите попытку.',
  },
  'errors.gate.spec-not-approved': {
    en: 'The current draft has not been approved yet. Approve it, or ask for changes, and then move on.',
    ru: 'Текущий черновик ещё не одобрен. Одобрите его или отправьте на доработку, а потом переходите дальше.',
  },
  'errors.gate.review-not-decided': {
    en: 'The review on this page is still undecided. Accept it, ignore it, or request changes first.',
    ru: 'По рецензии на этой странице ещё нет решения. Сначала примите её, отложите или отправьте документ на доработку.',
  },
  'errors.gate.spec-missing': {
    en: 'Not every file in the bundle has an approved revision yet, so the session cannot be sealed.',
    ru: 'Не у каждого документа комплекта есть одобренная ревизия\u00A0— закрыть сессию пока нельзя.',
  },
  'errors.gate.transition-not-in-table': {
    en: 'That step does not follow from where the session is. Reload the page to see its actual position.',
    ru: 'Этот шаг не следует из текущего положения сессии. Перезагрузите страницу, чтобы увидеть, где она на самом деле.',
  },
  /** §5 item 1: two facts, two sentences, present tense — a property of the session, not a forecast. */
  'errors.gate.session-sealed': {
    en: 'This session is sealed. It does not reopen, and no stage runs again.',
    ru: 'Сессия закрыта. Она больше не открывается, и ни один этап не запускается заново.',
  },
  /** §5 item 2. The author's semicolon divides the two ways out and is kept. */
  'errors.gate.round-limit-reached': {
    en:
      'Every question round for this stage has been used, so nothing further will be asked here. ' +
      'Anything still open can be answered directly in the fields above; otherwise move on to the next step.',
    ru:
      'Все раунды вопросов этого этапа израсходованы\u00A0— новых вопросов здесь не будет. ' +
      'На то, что осталось невыясненным, можно ответить прямо в полях выше; иначе переходите к следующему шагу.',
  },
  'errors.gate.capability-not-registered': {
    en: 'That stage is optional and is not installed on this deployment, so it cannot be entered.',
    ru: 'Этот этап необязательный и в этой установке не подключён\u00A0— войти в него нельзя.',
  },
  /** §5 item 3: the dead end becomes a fork in the same breath, and half the glossary meets here. */
  'errors.gate.revision-limit-reached': {
    en:
      'This document has been sent back for changes as many times as the session allows, so it will ' +
      'not be rewritten again automatically. Accept the review or ignore it to move on — the ' +
      'remaining points are still listed above, and you can edit the document by asking for a change ' +
      'in the chat.',
    ru:
      'Документ отправляли на доработку столько раз, сколько допускает сессия,\u00A0— автоматически он ' +
      'больше не переписывается. Чтобы двигаться дальше, примите рецензию или отложите её: ' +
      'оставшиеся замечания по-прежнему перечислены выше, а изменить документ можно, попросив ' +
      'правку в чате.',
  },

  /*
   * How a session-moving POST ended (`session-request.ts`). Each says the same two things in the same
   * order — what happened, and that nothing was lost — because the one question a person has at this
   * moment is whether their work survived.
   */
  'errors.request.abandoned': {
    en:
      'You stopped waiting. Nothing you have entered is lost — the page has been re-read from the ' +
      'server, so it now shows where the session actually is. You can try again.',
    ru:
      'Вы перестали ждать. Ничего из введённого не потеряно\u00A0— страница перечитана с сервера и ' +
      'показывает, где сессия на самом деле. Можно повторить попытку.',
  },
  'errors.request.unreachable': {
    en: 'That request did not reach the server. Check the connection and try again — nothing was lost.',
    ru: 'Запрос не дошёл до сервера. Проверьте соединение и повторите попытку\u00A0— ничего не потеряно.',
  },
  'errors.request.failed': {
    en: 'That did not go through. Please try again.',
    ru: 'Не удалось. Повторите попытку.',
  },
  /*
   * The deadline firing, not the user leaving. `{seconds}` carries the server's own worst case, so the
   * sentence names a number the reader can check against how long they waited. «с» is the unit, glued
   * to the number with a non-breaking space (§1.4) — written as an escape because an invisible
   * character in a string literal is a defect nobody can see in review.
   */
  'errors.request.expired': {
    en:
      'The server did not answer within {seconds} s, which is longer than this step can ' +
      'legitimately take, so waiting was stopped. The page has been re-read from the server and ' +
      'shows where the session actually is — if it did not move, try again.',
    ru:
      'Сервер не ответил за {seconds}\u00A0с\u00A0— дольше, чем этот шаг может занимать по существу, ' +
      'поэтому ожидание прервано. Страница перечитана с сервера и показывает, где сессия на самом ' +
      'деле; если она не сдвинулась, повторите попытку.',
  },

  /** A chat message that never landed (`useChatDecision.ts`). The card it might have decided is untouched. */
  'errors.chat.send-failed': {
    en: 'That message did not go through. Please try again.',
    ru: 'Сообщение не отправилось. Повторите попытку.',
  },

  /**
   * The reader running out of reconnects (`resumable-stream.ts`).
   *
   * «Ничего не потеряно» is load-bearing and not politeness: since D-95 the run genuinely carries on
   * server-side and persists its revision, so the sentence is a fact about the mechanism. A copy that
   * softened it would be lying in the safer direction, which A4 forbids as firmly as the other one.
   */
  'errors.stream.disconnected': {
    en: 'The connection to the generation was lost. Nothing has been lost — retry.',
    ru: 'Соединение с генерацией потеряно. Ничего не потеряно\u00A0— повторите попытку.',
  },

  /*
   * One sentence per API error code, for the browser to print instead of the server's English
   * (`session/gate-copy.ts` holds the code→key map; `web/api/responses.ts` explains the seam). The
   * English halves are the server's own defaults moved across unchanged, so a reader in English sees
   * exactly what they saw before the dictionary existed.
   */
  'errors.api.unauthenticated': { en: 'Sign in to continue.', ru: 'Войдите, чтобы продолжить.' },
  'errors.api.not-found': { en: 'Not found.', ru: 'Не найдено.' },
  'errors.api.validation-failed': {
    en: 'The request was not valid.',
    ru: 'Запрос не прошёл проверку.',
  },
  'errors.api.pending-decision': {
    en: 'A decision is already pending for this file.',
    ru: 'Этот документ уже ждёт вашего решения.',
  },
  'errors.api.gate-rejected': {
    en: 'That step is not available yet — the page lists what is still needed for it.',
    ru: 'Этот шаг пока недоступен\u00A0— на странице перечислено, чего для него ещё не хватает.',
  },
  /*
   * The sibling of `errors.gate.round-limit-reached`, and deliberately not the same entry: the gate's
   * copy is read beside the answer fields and points at them, this one is read wherever a rejection
   * surfaced and can only point at the page.
   */
  'errors.api.round-limit-reached': {
    en:
      'Every question round for this stage has been used, so nothing further will be asked here. ' +
      'Anything still open can be answered directly on the page; otherwise move on to the next step.',
    ru:
      'Все раунды вопросов этого этапа израсходованы\u00A0— новых вопросов здесь не будет. ' +
      'На то, что осталось невыясненным, можно ответить прямо на странице; иначе переходите к следующему шагу.',
  },
  'errors.api.capability-not-registered': {
    en: 'That option is not available.',
    ru: 'Эта возможность недоступна.',
  },
  'errors.api.conflict': {
    en: 'The session moved on; refresh and try again.',
    ru: 'Сессия ушла вперёд; обновите страницу и повторите попытку.',
  },
  'errors.api.draft-invalid': {
    en: 'The drafted questions were not usable. Try asking again.',
    ru: 'Черновик вопросов оказался непригоден. Запросите вопросы ещё раз.',
  },
  /*
   * «Устарели» with the obligatory tail naming *what* they no longer match (§2.6): A6 makes a stale
   * enrichment a correctness defect rather than a cosmetic one, and a sentence that dropped the tail
   * would demote it back.
   */
  'errors.api.export-stale': {
    en:
      'The enriched files are out of date with the specs they were built from. Re-run the Quality ' +
      'pass, or export the default bundle.',
    ru:
      'Обогащённые документы устарели относительно документов, из которых они собраны. Запустите ' +
      'этап качества заново или экспортируйте обычный комплект.',
  },
  'errors.api.generation-failed': {
    en: 'Generation did not complete. Your answers and approved specs are safe.',
    ru: 'Генерация не завершилась. Ваши ответы и одобренные документы в сохранности.',
  },
});
