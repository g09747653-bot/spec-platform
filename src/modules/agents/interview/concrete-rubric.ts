import {
  HomePageUrl,
  LOGO_HOSTS,
  OPTION_LOGO_SLUGS,
  type OptionLogoSlug,
  type QuestionSet,
} from '../schemas/question-set';

/**
 * The scripted rubric of the concrete register (task 144; §4 of `.specs/research/concrete-interviewer.md`).
 *
 * The doctrine is `specs/lint/lint-spec.ts`, applied to a round instead of a document: **anything
 * decidable by reading the text is decided in code, not by asking a model.** The measurement is
 * always available, gives the same answer twice, costs nothing, and survives an exhausted provider
 * chain — which is exactly the moment a live walk needs to know whether the round it just received is
 * in the register it asked for.
 *
 * Four checks, and the acceptance criterion of task 144 reads off them: a round is green when it
 * carries no `blocking` finding. An `advisory` finding is read rather than obeyed and goes into the
 * gate report as a list (§4.7), because each advisory is a proxy for something the words only hint at
 * — a false positive there should cost a line of reading, never a round.
 *
 * **The subject is the raw draft, not the repaired set.** The schema (§3) drops a hallucinated link,
 * an unknown slug and an oversized note silently, field by field, so that a guess costs its own chip
 * rather than a whole round of a live walk (D-188, D-221). That silence is right for the product and
 * wrong for a measurement: the model still wrote the thing, and a rubric reading the validated set
 * would report a clean round every time. So the draft is what is measured, and the validated set is
 * only the fallback for a caller that no longer holds the draft.
 *
 * Where the rubric cannot decide something it says so — `CONCRETE_UNDECIDED` for the questions no
 * reading of the text settles, and a finding of its own when the round's language has no lexicon
 * here. A rubric that stays silent is read as a rubric that found nothing.
 */

export const CONCRETE_CHECKS = [
  'second-person',
  'forbidden-vocabulary',
  'question-shape',
  'spravka-asymmetry',
] as const;

export type ConcreteCheck = (typeof CONCRETE_CHECKS)[number];

export interface ConcreteFinding {
  check: ConcreteCheck;
  /** Stable across runs over the same draft: the rule plus the place. */
  id: string;
  severity: 'blocking' | 'advisory';
  questionId: string;
  optionId?: string;
  message: string;
  /** The fragment that was found, so a gate report reads without the draft beside it. */
  evidence: string;
}

export interface ConcreteRubricInput {
  /** The model's raw draft, **before** the schema: what it dropped silently is still a defect. */
  draft: unknown;
  /** The same round after `validateQuestionSetDraft`, when it was valid; the fallback subject. */
  set: QuestionSet | null;
  /** The session's content language (У-1), ISO 639-1, or `null`. */
  language: string | null;
  /** The session seed — read by `seed-borrowed-href` and by nothing else. */
  initialPrompt: string;
}

/**
 * What the rubric refuses to guess at, named so a green board is not misread (§4.5).
 *
 * The first entry is the design's own: it names the thing a reader would most easily assume a green
 * rubric had checked. The second is its twin on the reference-note side — the trigger for a note is
 * "the label names a technology with a home page of its own", and no list of words decides that. What
 * *is* decidable around it is caught instead, and named here so the gap is visible rather than
 * inferred from an empty board.
 */
export const CONCRETE_UNDECIDED = [
  {
    id: 'option-cardinality',
    subject: 'whether a question should be `single` or `multiple`',
    reason:
      'Semantics rather than text: «retry · quarantine · log · exit non-zero» add up, «in a terminal · on a schedule» exclude each other, and no reading of the words separates the two. It stays with the judge pass of gate 146.',
  },
  {
    id: 'option-names-a-technology',
    subject: 'whether an option carrying a note actually names a technology',
    reason:
      'A label names a technology when it has a home page of its own, which is a fact about the world. The decidable neighbours are checked: an escape option carrying a note (`decorated-escape`), a question where every option carries one (`uniform-decoration`), a slug outside the closed set, and a link off the vendor’s own host.',
  },
] as const;

/** The place a round-level finding points at; a question id is never this by construction. */
const ROUND = '(round)';

/* ------------------------------------------------------------------ text */

const APOSTROPHES = /[‘’ʼ′`´]/g;
const DASHES = /[‐‑‒–—―−]/g;

/** NFC, lower case, `ё`→`е`, typographic punctuation to ASCII, whitespace collapsed (§4.1). */
function normalise(text: string): string {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(APOSTROPHES, "'")
    .replace(DASHES, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Words, as tokens (§4.1).
 *
 * **`\b` is unusable here.** JavaScript defines it through `\w` = `[A-Za-z0-9_]`, so for Cyrillic it
 * sits between every pair of letters and a lexicon written with it matches almost anything. Every
 * lexicon comparison in this file therefore runs over tokens, which also kills a whole class of false
 * positives for free: the token `персональные` is not the token `персона` and does not start with it.
 */
function tokenise(text: string): string[] {
  return normalise(text)
    .split(/[^\p{L}\p{N}']+/u)
    .filter((token) => token !== '' && token !== "'");
}

interface LexiconPart {
  value: string;
  prefix: boolean;
}

interface LexiconTerm {
  parts: readonly LexiconPart[];
}

/** An entry is an exact token (`вы`), a prefix (`чувств*`), or a sequence of either (`as a user`). */
function term(entry: string): LexiconTerm {
  const parts = normalise(entry)
    .split(' ')
    .filter((word) => word !== '')
    .map((word) =>
      word.endsWith('*')
        ? { value: word.slice(0, -1), prefix: true }
        : { value: word, prefix: false },
    );

  return { parts };
}

const lexicon = (entries: readonly string[]): LexiconTerm[] => entries.map(term);

function matchesAt(tokens: readonly string[], at: number, subject: LexiconTerm): boolean {
  if (subject.parts.length === 0 || at + subject.parts.length > tokens.length) return false;

  return subject.parts.every((part, offset) => {
    const token = tokens[at + offset];
    if (token === undefined) return false;

    return part.prefix ? token.startsWith(part.value) : token === part.value;
  });
}

/** The first lexicon hit in a text, as the fragment that matched; `null` when there is none. */
function firstHit(text: string, terms: readonly LexiconTerm[]): string | null {
  const tokens = tokenise(text);

  for (let at = 0; at < tokens.length; at += 1) {
    for (const subject of terms) {
      if (matchesAt(tokens, at, subject))
        return tokens.slice(at, at + subject.parts.length).join(' ');
    }
  }

  return null;
}

/** Whether the whole text is one of the terms — punctuation and spacing are not part of the test. */
function isExactly(text: string, terms: readonly LexiconTerm[]): boolean {
  const tokens = tokenise(text);

  return terms.some(
    (subject) => subject.parts.length === tokens.length && matchesAt(tokens, 0, subject),
  );
}

/** Whether the text opens with one of the terms, token by token (`^other` never matches `otherwise`). */
function opensWith(text: string, terms: readonly LexiconTerm[]): boolean {
  const tokens = tokenise(text);

  return terms.some((subject) => matchesAt(tokens, 0, subject));
}

/* -------------------------------------------------------------- lexicons */

const RU_PREPOSITIONS = new Set(['в', 'во', 'на', 'о', 'об', 'обо', 'при', 'по']);

/** `ёте` is already `ете` after normalisation; it is kept so the rule survives a change upstream. */
const RU_SECOND_PERSON_ENDING = /(ете|ёте|ите)$/u;

/**
 * Nouns that end like a second-person verb (§4.3.1).
 *
 * The preposition guard removes the prepositional case where it is governed directly («в отчёте»,
 * «на сайте»); this list removes the same nouns when a word stands between them and their
 * preposition («в этом отчёте»). The design names the stop list without enumerating it, so what is
 * here are the prepositional-case nouns that actually reach a round about software. A miss costs a
 * question its verb-shaped credit for second person, which the pronoun arm grants anyway — the verb
 * arm is secondary and exists to lower false positives, not to replace `вы`.
 */
const RU_NOT_A_VERB = new Set([
  'авторитете',
  'аппетите',
  'билете',
  'бюджете',
  'визите',
  'дефиците',
  'интернете',
  'кабинете',
  'комитете',
  'кредите',
  'лете',
  'лимите',
  'макете',
  'пакете',
  'паритете',
  'предмете',
  'приоритете',
  'свете',
  'совете',
  'сюжете',
  'ответе',
  'отчете',
  'цвете',
]);

interface Lexicon {
  secondPerson: readonly LexiconTerm[];
  /** The Russian verb arm of §4.3.1 runs only where the language has one. */
  russianVerbs: boolean;
  firstPerson: readonly LexiconTerm[];
  persona: readonly LexiconTerm[];
  artifacts: readonly LexiconTerm[];
  hedges: readonly LexiconTerm[];
  escapes: readonly LexiconTerm[];
  /** `how many` / `сколько` — the opening half of `measured-number`. */
  quantities: readonly LexiconTerm[];
  /** The sanctioned question frames of `decision-opener`. */
  openers: readonly LexiconTerm[];
}

const EN: Lexicon = {
  secondPerson: lexicon(['you', 'your', 'yours', 'yourself', 'yourselves']),
  russianVerbs: false,
  firstPerson: lexicon([
    'i',
    "i'm",
    "i'll",
    "i've",
    'my',
    'me',
    'mine',
    'we',
    "we're",
    'our',
    'ours',
    'us',
    "let's",
  ]),
  persona: lexicon([
    'feel',
    'feels',
    'feeling*',
    'imagine',
    'envision',
    'persona*',
    'delight*',
    'emotion*',
    'mood',
    'vibe',
    'magical',
    'metaphor',
    'as a user',
    'user journey',
    'user story',
    'picture a',
    'think of it as',
  ]),
  artifacts: lexicon([
    'constitution',
    'specification*',
    'spec',
    'specs',
    'milestone*',
    'artifact*',
    'roadmap',
    'acceptance criteria',
    'the plan',
    'this plan',
    'the document',
    'this document',
    'spec file',
  ]),
  hedges: lexicon([
    'both',
    'either',
    'it depends',
    'a mix of both',
    'a balance of both',
    'a combination of the two',
    'somewhere in between',
    'all of the above',
    'none of the above',
  ]),
  escapes: lexicon(['other', 'something else', 'other please specify']),
  quantities: lexicon(['how many', 'how much']),
  openers: lexicon([
    'which',
    'what should',
    'what happens',
    'how should',
    'how will you',
    'how do you want',
    'where should',
    'who will',
    'who runs',
    'in what order',
    'when',
  ]),
};

const RU: Lexicon = {
  secondPerson: lexicon(['вы', 'вас', 'вам', 'вами', 'ваш*']),
  russianVerbs: true,
  firstPerson: lexicon([
    'я',
    'мне',
    'меня',
    'мной',
    'мой*',
    'моя',
    'моё',
    'мои*',
    'мы',
    'нам',
    'нас',
    'нами',
    'наш*',
    'давайте',
  ]),
  persona: lexicon([
    'чувств*',
    'ощущ*',
    'представьте',
    'вообразите',
    'персонаж*',
    'персона',
    'настроени*',
    'атмосфер*',
    'эмоци*',
    'волшебн*',
    'каково',
    'путь пользователя',
  ]),
  artifacts: lexicon([
    'конституци*',
    'спецификаци*',
    'артефакт*',
    'веха',
    'вехи',
    'критерии приёмки',
    'этот документ',
    'раздел документа',
  ]),
  hedges: lexicon([
    'оба',
    'и то и другое',
    'зависит от ситуации',
    'что-то среднее',
    'всё перечисленное',
  ]),
  escapes: lexicon(['другое', 'иное']),
  quantities: lexicon(['сколько']),
  openers: lexicon([
    'какой',
    'какая',
    'какие',
    'каким',
    'что должно',
    'что произойдёт',
    'как должно',
    'как вы',
    'где должно',
    'кто будет',
    'в каком порядке',
  ]),
};

const LEXICONS: Readonly<Record<string, Lexicon>> = { en: EN, ru: RU };

/** The refusal a concrete question is required to offer — never a hedge and never decorated. */
const SANCTIONED_REFUSAL = lexicon(['no preference', 'без предпочтений']);

/**
 * Escape labels that must stay bare (§4.6), in both languages at once.
 *
 * Unlike the vocabulary lexicons this list is not language-scoped in the design, and it should not
 * be: a Russian round that borrows the English `Other` is exactly the case the rule is for.
 */
const BARE_LABELS = lexicon([
  'no preference',
  'bring your own',
  'whichever you recommend',
  'other',
  'без предпочтений',
  'свой ключ',
  'другое',
]);

/** Function words, dropped before the note/description similarity of §4.6 is computed. */
const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'been',
  'but',
  'by',
  'can',
  'for',
  'from',
  'has',
  'have',
  'in',
  'into',
  'is',
  'it',
  'its',
  'no',
  'not',
  'of',
  'on',
  'once',
  'one',
  'or',
  'own',
  'so',
  'than',
  'that',
  'the',
  'their',
  'them',
  'then',
  'they',
  'this',
  'to',
  'up',
  'was',
  'what',
  'when',
  'which',
  'will',
  'with',
  'you',
  'your',
  'а',
  'без',
  'бы',
  'был',
  'была',
  'быть',
  'в',
  'во',
  'вы',
  'все',
  'да',
  'для',
  'до',
  'его',
  'если',
  'есть',
  'же',
  'за',
  'и',
  'из',
  'или',
  'их',
  'к',
  'как',
  'ко',
  'на',
  'не',
  'ни',
  'но',
  'о',
  'об',
  'от',
  'по',
  'при',
  'с',
  'со',
  'та',
  'так',
  'то',
  'тот',
  'у',
  'что',
  'чтобы',
  'эта',
  'эти',
  'это',
  'этот',
]);

/* ------------------------------------------------------------ the round */

const EXTRA_FIELDS = ['note', 'href', 'logo'] as const;
type ExtraField = (typeof EXTRA_FIELDS)[number];

type TextField = 'text' | 'label' | 'description' | 'note';

interface RawOption {
  id: string;
  label: string;
  description: string;
  recommended: boolean;
  raw: Readonly<Record<string, unknown>>;
}

interface RawQuestion {
  id: string;
  text: string;
  options: readonly RawOption[];
  needs: readonly string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asText = (value: unknown): string => (typeof value === 'string' ? value : '');

function readOption(value: unknown, index: number): RawOption {
  const raw = isRecord(value) ? value : {};
  const id = asText(raw.id).trim();

  return {
    id: id === '' ? `option-${String(index + 1)}` : id,
    label: asText(raw.label),
    description: asText(raw.description),
    recommended: raw.recommended === true,
    raw,
  };
}

function readQuestion(value: unknown, index: number): RawQuestion {
  const raw = isRecord(value) ? value : {};
  const id = asText(raw.id).trim();
  const options = Array.isArray(raw.options) ? raw.options : [];
  const needs = Array.isArray(raw.informationNeeds) ? raw.informationNeeds : [];

  return {
    id: id === '' ? `question-${String(index + 1)}` : id,
    text: asText(raw.text),
    options: options.map(readOption),
    needs: needs.filter((need): need is string => typeof need === 'string'),
  };
}

/**
 * The round to measure: the raw draft when it is shaped like one, the validated set otherwise.
 *
 * The order matters and is the point of the module — see the file docblock. The set is a fallback
 * rather than a second opinion: by the time it exists the values §4.6 exists to report are gone.
 */
function readRound(input: ConcreteRubricInput): readonly RawQuestion[] | null {
  if (isRecord(input.draft) && Array.isArray(input.draft.questions)) {
    const questions = input.draft.questions.map(readQuestion);
    if (questions.length > 0) return questions;
  }

  if (input.set === null) return null;

  return input.set.questions.map((question, index) => readQuestion(question, index));
}

/* ---------------------------------------------------------------- output */

interface Place {
  questionId: string;
  optionId?: string;
  field?: TextField | ExtraField;
  /** What tells two findings of the same rule in the same question apart — a need, an index. */
  suffix?: string;
}

function slug(value: string): string {
  const cleaned = normalise(value).replace(/[^\p{L}\p{N}]+/gu, '-');
  const trimmed = cleaned.replace(/^-+|-+$/g, '');

  return trimmed === '' ? 'x' : trimmed;
}

/**
 * One finding, with the id the gate report and the unit tests both compare on.
 *
 * `rubric-<rule>-<place>`, the shape §4.2 fixes with the one id it names outright
 * (`rubric-language-unsupported`): a round-level rule that can fire only once carries no place at
 * all, and everything else names the question, then the option, then the field it read.
 */
function report(
  check: ConcreteCheck,
  rule: string,
  severity: 'blocking' | 'advisory',
  place: Place,
  message: string,
  evidence: string,
): ConcreteFinding {
  const parts = [`rubric-${rule}`];
  if (place.questionId !== ROUND) parts.push(slug(place.questionId));
  if (place.optionId !== undefined) parts.push(slug(place.optionId));
  if (place.field !== undefined) parts.push(place.field);
  if (place.suffix !== undefined) parts.push(slug(place.suffix));

  return {
    check,
    id: parts.join('-'),
    severity,
    questionId: place.questionId,
    ...(place.optionId === undefined ? {} : { optionId: place.optionId }),
    message,
    evidence,
  };
}

/** Every text a lexicon check reads: the question, then each option's label, description and note. */
function textFields(question: RawQuestion): { place: Place; text: string }[] {
  const fields: { place: Place; text: string }[] = [
    { place: { questionId: question.id, field: 'text' }, text: question.text },
  ];

  for (const option of question.options) {
    const place = { questionId: question.id, optionId: option.id };
    fields.push({ place: { ...place, field: 'label' }, text: option.label });
    fields.push({ place: { ...place, field: 'description' }, text: option.description });

    const note = option.raw.note;
    if (typeof note === 'string') fields.push({ place: { ...place, field: 'note' }, text: note });
  }

  return fields.filter((field) => field.text.trim() !== '');
}

/* ------------------------------------------------------------ the checks */

/** §4.3 — the round is spoken to the person, and never by them. */
function secondPersonFindings(
  round: readonly RawQuestion[],
  words: Lexicon | null,
): ConcreteFinding[] {
  if (words === null) return [];

  const findings: ConcreteFinding[] = [];

  for (const question of round) {
    const tokens = tokenise(question.text);
    const pronoun = firstHit(question.text, words.secondPerson);
    const verb = words.russianVerbs ? russianSecondPersonVerb(tokens) : null;

    if (pronoun === null && verb === null) {
      findings.push(
        report(
          'second-person',
          'second-person-question',
          'blocking',
          { questionId: question.id, field: 'text' },
          'The question never addresses the person it is asking. A concrete round asks what they want built and how they will use it, so every question names them directly.',
          question.text,
        ),
      );
    }

    for (const field of textFields(question)) {
      const hit = firstHit(field.text, words.firstPerson);
      if (hit === null) continue;

      findings.push(
        report(
          'second-person',
          'first-person-voice',
          'blocking',
          field.place,
          `“${hit}” speaks in the first person. Every option is something the interviewer says to the person, never something the person says back, so no label, description or note is written as theirs.`,
          field.text,
        ),
      );
    }
  }

  const descriptions = round
    .flatMap((question) => question.options)
    .map((option) => option.description)
    .filter((description) => description.trim() !== '');

  const covered = descriptions.filter(
    (description) =>
      firstHit(description, words.secondPerson) !== null ||
      (words.russianVerbs && russianSecondPersonVerb(tokenise(description)) !== null),
  );

  if (descriptions.length > 0 && covered.length * 2 < descriptions.length) {
    findings.push(
      report(
        'second-person',
        'second-person-coverage',
        'advisory',
        { questionId: ROUND },
        'Fewer than half the option descriptions address the person. The voice is holding in the questions and falling away in the options, which is where it usually goes first.',
        `${String(covered.length)} of ${String(descriptions.length)} descriptions`,
      ),
    );
  }

  return findings;
}

/**
 * A second-person verb, or `null` (§4.3.1).
 *
 * A token in `-ете`/`-ите` whose previous token is not one of the prepositions that governs the
 * prepositional case, and which is not a noun of that shape. Secondary to the pronouns by design: it
 * exists so a question that says «выберите» rather than «вы» still reads as addressed.
 */
function russianSecondPersonVerb(tokens: readonly string[]): string | null {
  for (let at = 0; at < tokens.length; at += 1) {
    const token = tokens[at];
    if (token === undefined || !RU_SECOND_PERSON_ENDING.test(token)) continue;
    if (RU_NOT_A_VERB.has(token)) continue;

    const before = at === 0 ? undefined : tokens[at - 1];
    if (before !== undefined && RU_PREPOSITIONS.has(before)) continue;

    return token;
  }

  return null;
}

/** §4.4 — the words this register may not use, and the two labels it may not author. */
function vocabularyFindings(
  round: readonly RawQuestion[],
  words: Lexicon | null,
): ConcreteFinding[] {
  if (words === null) return [];

  const findings: ConcreteFinding[] = [];

  for (const question of round) {
    for (const field of textFields(question)) {
      const persona = firstHit(field.text, words.persona);
      if (persona !== null) {
        findings.push(
          report(
            'forbidden-vocabulary',
            'persona-and-feeling',
            'blocking',
            field.place,
            `“${persona}” asks about a feeling or invents someone to ask through. Ask about use as observable behaviour instead — what they run first, how often they come back, what they do the day it breaks.`,
            field.text,
          ),
        );
      }

      const artifact = firstHit(field.text, words.artifacts);
      if (artifact !== null) {
        findings.push(
          report(
            'forbidden-vocabulary',
            'our-artifacts',
            'blocking',
            field.place,
            `“${artifact}” asks about our own documents and process rather than about their product. The prohibition sits above the register and holds for every style.`,
            field.text,
          ),
        );
      }
    }

    for (const option of question.options) {
      const place = { questionId: question.id, optionId: option.id, field: 'label' as const };

      if (!opensWith(option.label, SANCTIONED_REFUSAL) && isExactly(option.label, words.hedges)) {
        findings.push(
          report(
            'forbidden-vocabulary',
            'hedge-option',
            'blocking',
            place,
            'The option declines to be a choice. Every option must be something that can be chosen and then done — a named technology, a mechanism, a limit, an order of work.',
            option.label,
          ),
        );
      }

      if (isExactly(option.label, words.escapes)) {
        findings.push(
          report(
            'forbidden-vocabulary',
            'duplicate-escape',
            'blocking',
            place,
            'The free-text escape is drawn from `allowOther`, exactly one per question, so an authored option of the same name competes with it.',
            option.label,
          ),
        );
      }
    }
  }

  return findings;
}

const NEED_SHAPE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MEASURED_LABEL = /^\D{0,3}\d/;

/** §4.5 — the shape of a question that settles something. */
function questionShapeFindings(
  round: readonly RawQuestion[],
  words: Lexicon | null,
): ConcreteFinding[] {
  const findings: ConcreteFinding[] = [];
  const seenNeeds = new Map<string, string>();

  for (const question of round) {
    const text = question.text.trim();

    if (!text.endsWith('?') && !text.endsWith('？')) {
      findings.push(
        report(
          'question-shape',
          'question-mark',
          'blocking',
          { questionId: question.id, field: 'text' },
          'The question is not written as one. A round asks; it does not narrate.',
          text === '' ? '(no text)' : text,
        ),
      );
    }

    if (text.length > 160) {
      findings.push(
        report(
          'question-shape',
          'question-length',
          'advisory',
          { questionId: question.id, field: 'text' },
          'The question runs long enough that the decision inside it is hard to find. One question settles one thing.',
          `${String(text.length)} characters`,
        ),
      );
    }

    if (words !== null && !opensWith(text, words.openers)) {
      findings.push(
        report(
          'question-shape',
          'decision-opener',
          'advisory',
          { questionId: question.id, field: 'text' },
          'The question does not open with one of the frames that names a decision. A legitimate rewording lands here too, so read it rather than act on it.',
          text,
        ),
      );
    }

    if (
      words !== null &&
      firstHit(text, words.quantities) !== null &&
      question.options.length > 0 &&
      question.options.every((option) => MEASURED_LABEL.test(option.label.trim()))
    ) {
      findings.push(
        report(
          'question-shape',
          'measured-number',
          'blocking',
          { questionId: question.id, field: 'text' },
          'The question asks for a number the person would have to go and measure. Ask for the behaviour the number would decide instead.',
          text,
        ),
      );
    }

    for (const option of question.options) {
      if (option.description.trim() !== '') continue;

      findings.push(
        report(
          'question-shape',
          'option-description',
          'blocking',
          { questionId: question.id, optionId: option.id, field: 'description' },
          'The option has no description. A coding agent receives the id and the description, so an option without one is an answer nobody can read afterwards.',
          option.label === '' ? '(no label)' : option.label,
        ),
      );
    }

    for (const [index, need] of question.needs.entries()) {
      const key = need.trim().toLowerCase();
      const owner = seenNeeds.get(key);

      if (owner === undefined) {
        seenNeeds.set(key, question.id);
      } else if (owner !== question.id) {
        findings.push(
          report(
            'question-shape',
            'duplicate-decision',
            'blocking',
            { questionId: question.id, suffix: key },
            `The need “${need}” is already settled by question ${owner}. No two questions in a round settle the same thing.`,
            need,
          ),
        );
      }

      if (!NEED_SHAPE.test(need)) {
        findings.push(
          report(
            'question-shape',
            'need-shape',
            'advisory',
            { questionId: question.id, suffix: String(index + 1) },
            'An information need is prose rather than a key. Needs are how the round is accounted for across stages, so they read as slugs.',
            need,
          ),
        );
      }
    }
  }

  const recommends = round.filter((question) =>
    question.options.some((option) => option.recommended),
  );

  if (round.length > 0 && recommends.length === round.length) {
    findings.push(
      report(
        'question-shape',
        'recommended-everywhere',
        'advisory',
        { questionId: ROUND },
        'Every question in the round carries a recommendation, which is the interviewer answering the whole round on the person’s behalf.',
        `${String(recommends.length)} of ${String(round.length)} questions`,
      ),
    );
  }

  return findings;
}

const isLogoSlug = (value: unknown): value is OptionLogoSlug =>
  typeof value === 'string' && (OPTION_LOGO_SLUGS as readonly string[]).includes(value);

/** The host of an address, without `www.`; `null` when it is not an address at all. */
function hostOf(value: string): string | null {
  try {
    return new URL(value).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function contentTokens(text: string): Set<string> {
  return new Set(tokenise(text).filter((token) => !STOP_WORDS.has(token) && token.length > 2));
}

function jaccard(left: ReadonlySet<string>, right: ReadonlySet<string>): number {
  if (left.size === 0 || right.size === 0) return 0;

  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;

  return shared / (left.size + right.size - shared);
}

/**
 * §4.6 — the reference note belongs to the option, and only to some of them.
 *
 * A round carrying no note at all is **not** a finding and never becomes one: the asymmetry is a
 * property of an option, and a question about a refusal policy, where no option names a technology,
 * is required to be bare all the way through. The rules below fire on decoration that is wrong, never
 * on decoration that is absent.
 */
function spravkaFindings(round: readonly RawQuestion[], seed: string): ConcreteFinding[] {
  const findings: ConcreteFinding[] = [];
  const seedText = normalise(seed);

  for (const question of round) {
    for (const option of question.options) {
      const place = { questionId: question.id, optionId: option.id };
      const raw = option.raw;
      const carries = EXTRA_FIELDS.filter((field) => Object.hasOwn(raw, field));

      for (const field of carries) {
        const value = raw[field];
        const empty = value === null || (typeof value === 'string' && value.trim() === '');
        if (!empty) continue;

        findings.push(
          report(
            'spravka-asymmetry',
            'empty-extras',
            'blocking',
            { ...place, field },
            `“${field}” is present but empty. Absent means the key is not there — an empty string draws an empty ⓘ.`,
            value === null ? 'null' : '""',
          ),
        );
      }

      const note = typeof raw.note === 'string' ? raw.note.trim() : '';
      const href = typeof raw.href === 'string' ? raw.href.trim() : '';

      if (note === '' && (Object.hasOwn(raw, 'href') || Object.hasOwn(raw, 'logo'))) {
        findings.push(
          report(
            'spravka-asymmetry',
            'note-required-for-link',
            'blocking',
            { ...place, field: 'note' },
            'The option carries a link or a logo and no note. The note is the thing those two hang from; without it they are decoration.',
            option.label === '' ? '(no label)' : option.label,
          ),
        );
      }

      if (
        Object.hasOwn(raw, 'logo') &&
        !isLogoSlug(raw.logo) &&
        raw.logo !== null &&
        raw.logo !== ''
      ) {
        findings.push(
          report(
            'spravka-asymmetry',
            'unknown-logo',
            'blocking',
            { ...place, field: 'logo' },
            `The logo is not one of the slugs the renderer vendors (${OPTION_LOGO_SLUGS.join(', ')}). A technology outside that set keeps its note and its link and simply has no logo.`,
            typeof raw.logo === 'string' ? raw.logo : typeof raw.logo,
          ),
        );
      }

      if (href !== '' && !HomePageUrl.safeParse(href).success) {
        findings.push(
          report(
            'spravka-asymmetry',
            'href-shape',
            'blocking',
            { ...place, field: 'href' },
            'The link is not a vendor home page over https: an account, a port, a query, a fragment or a path deeper than one segment. An option with no link is correct; an invented one is a defect.',
            href,
          ),
        );
      }

      const host = href === '' ? null : hostOf(href);

      if (host !== null && isLogoSlug(raw.logo) && !LOGO_HOSTS[raw.logo].includes(host)) {
        findings.push(
          report(
            'spravka-asymmetry',
            'foreign-host',
            'blocking',
            { ...place, field: 'href' },
            `The logo says ${raw.logo} and the link goes to ${host}. A slug is its own allow-list, so an address on another host is a guess rather than an address.`,
            href,
          ),
        );
      }

      if (host !== null && seedText.includes(host)) {
        findings.push(
          report(
            'spravka-asymmetry',
            'seed-borrowed-href',
            'blocking',
            { ...place, field: 'href' },
            'The link’s host appears in what the person wrote. The seed is untrusted text, and an address lifted out of it is not the vendor’s own page.',
            host,
          ),
        );
      }

      if (carries.length > 0 && opensWith(option.label, BARE_LABELS)) {
        findings.push(
          report(
            'spravka-asymmetry',
            'decorated-escape',
            'blocking',
            place,
            'An option that names no technology carries a note, a link or a logo. The refusal and the bring-your-own answers stay bare — they are the guaranteed plain case in an otherwise technological question.',
            option.label,
          ),
        );
      }

      if (note !== '') {
        if (note.includes('<') || note.includes('](') || note.includes('http')) {
          findings.push(
            report(
              'spravka-asymmetry',
              'note-markup',
              'blocking',
              { ...place, field: 'note' },
              'The note carries markup or an address. It is one or two factual sentences; the address has a field of its own.',
              note,
            ),
          );
        }

        if (note.length < 40) {
          findings.push(
            report(
              'spravka-asymmetry',
              'note-too-short',
              'advisory',
              { ...place, field: 'note' },
              'The note is too short to say anything the label did not. It should say what the technology is and what choosing it would commit the product to.',
              note,
            ),
          );
        }

        const description = option.description.trim();
        const overlaps =
          description !== '' &&
          (jaccard(contentTokens(note), contentTokens(description)) >= 0.6 ||
            normalise(note).includes(normalise(description)) ||
            normalise(description).includes(normalise(note)));

        if (overlaps) {
          findings.push(
            report(
              'spravka-asymmetry',
              'note-repeats-description',
              'advisory',
              { ...place, field: 'note' },
              'The note repeats the description. The description says what choosing this option means here; the note says what the technology is in the world.',
              note,
            ),
          );
        }
      }
    }

    const decorated = question.options.filter((option) => Object.hasOwn(option.raw, 'note'));

    if (question.options.length >= 3 && decorated.length === question.options.length) {
      findings.push(
        report(
          'spravka-asymmetry',
          'uniform-decoration',
          'blocking',
          { questionId: question.id },
          'Every option in the question carries a note, so either the option that declines is missing or it has been decorated too. A question whose first option names a tool and whose other three do not shows exactly one note, and that is correct.',
          `${String(decorated.length)} of ${String(question.options.length)} options`,
        ),
      );
    }
  }

  return findings;
}

/* ----------------------------------------------------------------- entry */

/**
 * Every deterministic finding for one drafted round, in a stable order.
 *
 * Ordered by check and then by id, so two runs over the same bytes produce the same board — the same
 * property `lintSpecDocument` holds and for the same reason: a list that reshuffled between runs
 * would make a diff of two gate reports unreadable.
 */
export function checkConcreteRound(input: ConcreteRubricInput): ConcreteFinding[] {
  const language = (input.language ?? 'en').toLowerCase();
  const words = LEXICONS[language] ?? null;
  const findings: ConcreteFinding[] = [];

  if (words === null) {
    findings.push(
      report(
        'second-person',
        'language-unsupported',
        'advisory',
        { questionId: ROUND },
        `No lexicon is written for “${language}”, so voice and vocabulary went unmeasured; the shape and the reference-note rules still ran. Silence here is not a pass.`,
        language,
      ),
    );
  }

  const round = readRound(input);

  if (round === null) {
    findings.push(
      report(
        'question-shape',
        'round-unreadable',
        'advisory',
        { questionId: ROUND },
        'Neither the draft nor the validated set holds a question, so there was nothing to measure. Silence here is not a pass either.',
        'no questions',
      ),
    );

    return findings;
  }

  findings.push(
    ...secondPersonFindings(round, words),
    ...vocabularyFindings(round, words),
    ...questionShapeFindings(round, words),
    ...spravkaFindings(round, input.initialPrompt),
  );

  return findings.sort(
    (a, b) =>
      CONCRETE_CHECKS.indexOf(a.check) - CONCRETE_CHECKS.indexOf(b.check) ||
      a.id.localeCompare(b.id),
  );
}
