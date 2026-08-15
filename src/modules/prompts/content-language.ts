/**
 * The one place a model is told which language to answer in (У-1; task 108).
 *
 * The rule this file exists to keep: **the instruction is appended by `assemblePrompt` and appears
 * in no prompt asset.** Eight assets assemble prompts today and M8п–M10п add more; a sentence copied
 * into each of them is a sentence that will be updated in seven of them. `prompts-language.test.ts`
 * asserts the absence directly, so a second copy fails a test rather than surviving a review.
 *
 * The codes are ISO 639-1 strings and arrive from `projects`, which detects them. `prompts` may not
 * import that module (constitution A1), so the two agree on plain strings — and an unrecognised code
 * falls through to the mirror instruction, which is correct rather than merely safe: telling a model
 * to answer in the user's own language is what we mean in every case, and naming the language is an
 * optimisation on top of it.
 */

/** How each detected code is named to a model. A name it will recognise, not a code. */
const LANGUAGE_NAMES: Readonly<Record<string, string>> = {
  en: 'English',
  ru: 'Russian',
  uk: 'Ukrainian',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  pt: 'Portuguese',
  it: 'Italian',
  nl: 'Dutch',
  pl: 'Polish',
  tr: 'Turkish',
  el: 'Greek',
  he: 'Hebrew',
  ar: 'Arabic',
  hi: 'Hindi',
  th: 'Thai',
  ka: 'Georgian',
  hy: 'Armenian',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Chinese',
};

/**
 * The marker every assembled prompt carries, and the string the guard looks for.
 *
 * Exported so the test asserts on the same words the instruction is built from rather than on a
 * copy of them — a guard that quotes its subject is a guard that stops guarding when the subject is
 * reworded.
 */
export const CONTENT_LANGUAGE_MARKER = 'Write every piece of human-readable prose';

/**
 * The instruction, for a detected language or for none.
 *
 * The second sentence is load-bearing. Question ids, information-need names, JSON keys, section
 * headings and file names are contracts — the section schema asserts the headings, the answer rows
 * reference the option ids — and a model told "answer in Russian" will translate them unless told
 * not to. That would be a parity check failing on a document whose prose was perfectly correct.
 */
export function contentLanguageInstruction(language: string | null | undefined): string {
  const named = language === null || language === undefined ? undefined : LANGUAGE_NAMES[language];

  const target =
    named === undefined
      ? 'the same language the user wrote their own description in'
      : `${named}, whatever language this instruction is written in`;

  return [
    `${CONTENT_LANGUAGE_MARKER} — question text, option labels and descriptions, document body`,
    `text, review findings and replies — in ${target}.`,
    'Identifiers, JSON keys, field names, section headings and file names are contracts: reproduce',
    'them exactly as specified and never translate them.',
  ].join(' ');
}
