/**
 * What language the session speaks (У-1; task 108).
 *
 * The reference product's own transcript shows the defect this exists to remove: a Russian-speaking
 * user typed their idea in Russian and was interviewed in English for the rest of the session. The
 * fix is not a setting — it is reading what the user already told us and answering in kind.
 *
 * **Detected once, at session creation, and stored.** Re-detecting per call would be a per-request
 * cost for an answer that cannot change, and worse, it could change: a round whose answers were
 * mostly product names would look like a different language from the one before it, and the
 * interview would drift between two voices.
 *
 * The detection is deliberately **deterministic and cheap** — script first, then stopwords for the
 * Latin scripts — so creating a project stays a database write rather than a model call. Where it
 * cannot decide, it says so by returning `null`, and the prompt layer falls back to instructing the
 * model to mirror the user's own words. That is the model fallback: it costs no extra call, and it
 * is strictly better than guessing English at a user who wrote in Catalan.
 */

/** ISO 639-1 codes this module can produce. Plain strings; `prompts` words them (task 108). */
export type ContentLanguage = string;

/** One contiguous block per script we can recognise from characters alone. */
const SCRIPTS: readonly { code: ContentLanguage; pattern: RegExp }[] = [
  { code: 'ja', pattern: /[぀-ヿ]/g },
  { code: 'ko', pattern: /[가-힯ᄀ-ᇿ]/g },
  { code: 'zh', pattern: /[一-鿿]/g },
  { code: 'ru', pattern: /[Ѐ-ӿ]/g },
  { code: 'el', pattern: /[Ͱ-Ͽ]/g },
  { code: 'he', pattern: /[֐-׿]/g },
  { code: 'ar', pattern: /[؀-ۿ]/g },
  { code: 'hi', pattern: /[ऀ-ॿ]/g },
  { code: 'th', pattern: /[฀-๿]/g },
  { code: 'ka', pattern: /[Ⴀ-ჿ]/g },
  { code: 'hy', pattern: /[԰-֏]/g },
  { code: 'la', pattern: /[a-zà-öø-ÿąćęłńóśźżğışçıœ]/gi },
];

/**
 * Letters only Ukrainian uses among the Cyrillic languages we are likely to see.
 *
 * Not a full Cyrillic classifier and not pretending to be one: it separates the two cases a user of
 * this product plausibly writes in, and anything else that is Cyrillic is answered in Russian, which
 * is a far smaller error than answering it in English.
 */
const UKRAINIAN = /[іїєґ]/i;

/**
 * Stopwords, for the languages that share the Latin alphabet.
 *
 * Function words rather than vocabulary: a product description is full of nouns that travel between
 * languages ("dashboard", "app", "API"), and scoring on those would classify every idea as English.
 * Whole-word matching, so `is` does not fire inside `this`.
 */
const STOPWORDS: Readonly<Record<ContentLanguage, readonly string[]>> = {
  en: ['the', 'and', 'that', 'with', 'for', 'this', 'from', 'want', 'which', 'their', 'about'],
  es: ['que', 'los', 'las', 'para', 'con', 'una', 'del', 'por', 'como', 'pero'],
  fr: ['que', 'les', 'des', 'pour', 'avec', 'une', 'dans', 'sur', 'est', 'mais'],
  de: ['und', 'der', 'die', 'das', 'für', 'mit', 'ist', 'nicht', 'eine', 'auch'],
  pt: ['que', 'para', 'com', 'uma', 'dos', 'não', 'mais', 'como', 'pelo', 'seu'],
  it: ['che', 'per', 'con', 'una', 'del', 'non', 'come', 'sono', 'alla', 'più'],
  nl: ['het', 'een', 'van', 'voor', 'met', 'niet', 'dat', 'zijn', 'maar', 'ook'],
  pl: ['nie', 'jest', 'oraz', 'dla', 'przez', 'jako', 'aby', 'tego', 'który', 'jeszcze'],
  tr: ['için', 'bir', 'daha', 'gibi', 'olarak', 'ancak', 'çok', 'kadar', 'sonra'],
};

/** How many characters of a script the text holds. */
function scriptCount(text: string, pattern: RegExp): number {
  return (text.match(pattern) ?? []).length;
}

/** The Latin language whose function words appear most, or `null` when none stands out. */
function latinLanguage(text: string): ContentLanguage | null {
  const words = text.toLowerCase().match(/[\p{Letter}']+/gu) ?? [];
  if (words.length === 0) return null;

  const counts = new Map<ContentLanguage, number>();

  for (const word of words) {
    for (const [code, stopwords] of Object.entries(STOPWORDS)) {
      if (stopwords.includes(word)) counts.set(code, (counts.get(code) ?? 0) + 1);
    }
  }

  let best: { code: ContentLanguage; score: number } | null = null;
  let runnerUp = 0;

  for (const [code, score] of counts) {
    if (best === null || score > best.score) {
      runnerUp = best?.score ?? 0;
      best = { code, score };
    } else if (score > runnerUp) {
      runnerUp = score;
    }
  }

  /*
   * A tie is not an answer. Two languages scoring the same means the words that matched are shared
   * between them ("que" is Spanish, French, Portuguese and Italian), and picking the first would be
   * picking whichever happens to be earliest in the table.
   */
  if (best === null || best.score === runnerUp) return null;

  return best.code;
}

/**
 * The language of a piece of text a user wrote, or `null` when it cannot be told.
 *
 * `null` is a real answer and the callers treat it as one: a two-word prompt in a language with no
 * script of its own genuinely carries no signal, and inventing a language for it would put every
 * later document in the wrong one.
 */
export function detectContentLanguage(text: string): ContentLanguage | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;

  let dominant: { code: ContentLanguage; count: number } | null = null;

  for (const { code, pattern } of SCRIPTS) {
    const count = scriptCount(trimmed, pattern);
    if (count > 0 && (dominant === null || count > dominant.count)) dominant = { code, count };
  }

  if (dominant === null) return null;
  if (dominant.code === 'ru') return UKRAINIAN.test(trimmed) ? 'uk' : 'ru';
  if (dominant.code !== 'la') return dominant.code;

  return latinLanguage(trimmed);
}
