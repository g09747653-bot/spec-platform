import { definePhrases } from '../phrase';

/**
 * What the five workflows are called, in the chrome only (task 143; Эталон §1.4).
 *
 * **Why this surface has a dictionary of its own, and why it is keyed by a number.** A methodology's
 * step labels are the one field of `methodologies/configs/*.ts` with two audiences. The chrome
 * prints them on the step pills, on the stage chip, on every card caption and on the proceed button;
 * `/api/sessions/[id]/generate` puts the same string into the prompt that writes the document, and
 * `specs/handoff` puts the badge into text the user pastes into a coding agent. Translating the
 * configuration in place would therefore hand a Russian word to a model reasoning in the content
 * language of the session (У-1) — a corruption of two contracts to fix a third.
 *
 * So the configuration keeps its English and the chrome reads a second table. The address of a step
 * is the pair (`config.id`, step index), never the label: «Proposal» names a step in two
 * configurations, «Tasks» in four and «Review» in one that also has a `review` substage, so a table
 * keyed by the English word would give an OpenSpec session the brownfield wording. `stageStepIndexFor`
 * in `methodologies` answers with that index and no word at all, which is what keeps this module the
 * only place a methodology is named to a person.
 *
 * **The `session.stage.canonical.*` seven** are the fallback of `stage-display.ts` — the names used
 * where a configuration does not name a position at all, as in an Edit chat's document card. Their
 * wording is §2.3 of the interface-voice standard, and `solution` is «Архитектура» there rather than
 * «Решение» because «решение» is spoken by the product a dozen times a session in «ждёт вашего
 * решения».
 *
 * The badge — «MySpec · Greenfield · V1» — is deliberately absent. Its three parts are a vendor name,
 * a variant name and a version, all of them latin identity in the sense of §3 of the standard; and
 * the same three fields are joined by `methodologyLabel` into the handoff prompt, so a translated
 * badge would name the workflow one way on the screen and another way in the text the user pastes.
 * `config.name` («SpecKit generate-greenfield v1») is absent for the first of those reasons: it is
 * the workflow's proper name, the one Эталон §1.4 lists it under.
 */
export const methodologyPhrases = definePhrases({
  /*
   * `myspec-greenfield-v1` — the parity workflow, and the only one whose steps are the canonical
   * seven word for word.
   */
  'session.stage.myspec-greenfield-v1.0': { en: 'Interview', ru: 'Интервью' },
  'session.stage.myspec-greenfield-v1.1': { en: 'Constitution', ru: 'Конституция' },
  'session.stage.myspec-greenfield-v1.2': { en: 'Requirements', ru: 'Требования' },
  'session.stage.myspec-greenfield-v1.3': { en: 'Solution', ru: 'Архитектура' },
  'session.stage.myspec-greenfield-v1.4': { en: 'Tasks', ru: 'Задачи' },
  'session.stage.myspec-greenfield-v1.5': { en: 'Quality', ru: 'Качество' },
  'session.stage.myspec-greenfield-v1.6': { en: 'Complete', ru: 'Готово' },

  /*
   * `myspec-brownfield-v1`. «Предложение» rather than the «предложенная правка» of §2.4: that phrase
   * names the object a `proposal-block` asks the user to accept or reject, and this is the first
   * document of a graph — the one that frames the change everything after it describes.
   */
  'session.stage.myspec-brownfield-v1.0': { en: 'Interview', ru: 'Интервью' },
  'session.stage.myspec-brownfield-v1.1': { en: 'Proposal', ru: 'Предложение' },
  'session.stage.myspec-brownfield-v1.2': { en: 'Requirements', ru: 'Требования' },
  'session.stage.myspec-brownfield-v1.3': { en: 'Tasks', ru: 'Задачи' },
  'session.stage.myspec-brownfield-v1.4': { en: 'Complete', ru: 'Готово' },

  /*
   * `speckit-greenfield-v1`. «Спецификация» names the document the step writes — spec.md — and the
   * countability §2.1 guards against never arises in a step label, which counts nothing. «План»
   * lands on `plan.md`, so the pill and the file agree.
   */
  'session.stage.speckit-greenfield-v1.0': { en: 'Interview', ru: 'Интервью' },
  'session.stage.speckit-greenfield-v1.1': { en: 'Constitution', ru: 'Конституция' },
  'session.stage.speckit-greenfield-v1.2': { en: 'Specify', ru: 'Спецификация' },
  'session.stage.speckit-greenfield-v1.3': { en: 'Plan', ru: 'План' },
  'session.stage.speckit-greenfield-v1.4': { en: 'Tasks', ru: 'Задачи' },
  'session.stage.speckit-greenfield-v1.5': { en: 'Complete', ru: 'Готово' },

  /*
   * `openspec-brownfield-v1`. «Изучение» for `Explore`: the step occupies the interview position and
   * what it does there is read a system that already exists. Its `Solution` step takes the canonical
   * «Архитектура», because that is what `design.md` is.
   */
  'session.stage.openspec-brownfield-v1.0': { en: 'Explore', ru: 'Изучение' },
  'session.stage.openspec-brownfield-v1.1': { en: 'Proposal', ru: 'Предложение' },
  'session.stage.openspec-brownfield-v1.2': { en: 'Specs', ru: 'Спецификации' },
  'session.stage.openspec-brownfield-v1.3': { en: 'Solution', ru: 'Архитектура' },
  'session.stage.openspec-brownfield-v1.4': { en: 'Tasks', ru: 'Задачи' },
  'session.stage.openspec-brownfield-v1.5': { en: 'Complete', ru: 'Готово' },

  /*
   * `myspec-edit-v1`. Its third step is «Правки» and not «Рецензия», although §2.4 gives *review*
   * that word: this step covers the `generate` and `review` substages of its stage, so the stage
   * chip composes the two halves and «Рецензия · Рецензия» is what a literal translation would
   * print. «Правки» names what the step actually decides — the suggested edits — and keeps the chip
   * legible.
   */
  'session.stage.myspec-edit-v1.0': { en: 'Reference', ru: 'Выбор документов' },
  'session.stage.myspec-edit-v1.1': { en: 'Describe', ru: 'Описание' },
  'session.stage.myspec-edit-v1.2': { en: 'Review', ru: 'Правки' },
  'session.stage.myspec-edit-v1.3': { en: 'Complete', ru: 'Готово' },

  /**
   * The canonical seven, and the name of a stage that is none of them.
   *
   * The fallback rather than the answer (task 132): a configuration names its own positions, and
   * these are read only where it names none — a document card in an Edit chat is about the bundle's
   * `constitution.md`, and the Edit graph has no step that wrote it.
   */
  'session.stage.canonical.interview': { en: 'Interview', ru: 'Интервью' },
  'session.stage.canonical.constitution': { en: 'Constitution', ru: 'Конституция' },
  'session.stage.canonical.requirements': { en: 'Requirements', ru: 'Требования' },
  'session.stage.canonical.solution': { en: 'Solution', ru: 'Архитектура' },
  'session.stage.canonical.tasks': { en: 'Tasks', ru: 'Задачи' },
  'session.stage.canonical.quality': { en: 'Quality', ru: 'Качество' },
  'session.stage.canonical.complete': { en: 'Complete', ru: 'Готово' },
  'session.stage.canonical.unknown': { en: 'Unknown stage', ru: 'Неизвестный этап' },

  /**
   * The one-line description under each option in the picker.
   *
   * Translated, unlike the name and the badge, because it is prose rather than identity — and
   * because the same field is rendered into the classifier's prompt, which is the reason it is
   * copied here instead of being replaced in the configuration.
   */
  'session.methodology.myspec-greenfield-v1.summary': {
    en: 'The full bundle for something new: constitution, requirements, solution, tasks.',
    ru: 'Полный комплект для нового продукта: конституция, требования, архитектура, задачи.',
  },
  'session.methodology.myspec-brownfield-v1.summary': {
    en: 'A fast loop for changing a system that already exists: proposal, then requirements.',
    ru: 'Быстрый цикл для изменений в уже существующей системе: предложение, затем требования.',
  },
  'session.methodology.speckit-greenfield-v1.summary': {
    en: "GitHub's spec-driven toolkit: constitution, feature spec, implementation plan, tasks.",
    ru: 'Подход GitHub «от спецификации»: конституция, спецификация функции, план реализации, задачи.',
  },
  'session.methodology.openspec-brownfield-v1.summary': {
    en: 'A change-first pipeline for existing systems: proposal, capability specs, design, tasks.',
    ru: 'Процесс для существующих систем, где всё начинается с изменения: предложение, спецификации возможностей, архитектура, задачи.',
  },
  'session.methodology.myspec-edit-v1.summary': {
    en: 'Reference spec files, describe changes, review and apply suggested edits.',
    ru: 'Выбор документов, описание изменений, разбор и применение предложенных правок.',
  },
});

/** Every key this table answers. A subset of `PhraseKey`, so `t()` accepts one unwidened. */
export type MethodologyPhraseKey = keyof typeof methodologyPhrases;

/**
 * Whether a computed key is one this table holds.
 *
 * The keys of a phrase table are literals, and the two lookups below build theirs from a
 * configuration id at runtime — so the narrowing has to happen once, here, guarded by the table
 * itself. Same shape as `isLocale` in `phrase.ts`, and for the same reason: a predicate over a
 * closed set is not a cast, it is the check the cast would have skipped.
 */
function holds(key: string): key is MethodologyPhraseKey {
  return Object.hasOwn(methodologyPhrases, key);
}

/**
 * What a configuration's step is called, or `null` where this build ships no translation for it.
 *
 * `null` rather than a thrown error or an empty string: a configuration added without a dictionary
 * entry should read as its own English label — which is at least true — and not as a blank pill.
 * The caller does that fallback, because the caller is the one holding the configuration.
 */
export function stagePhraseKey(configId: string, index: number): MethodologyPhraseKey | null {
  const key = `session.stage.${configId}.${String(index)}`;

  return holds(key) ? key : null;
}

/** The picker's one-line description of a methodology, or `null` for one this build cannot name. */
export function methodologySummaryKey(configId: string): MethodologyPhraseKey | null {
  const key = `session.methodology.${configId}.summary`;

  return holds(key) ? key : null;
}
