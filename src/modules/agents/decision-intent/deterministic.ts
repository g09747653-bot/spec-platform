import type { DecisionAction, PendingKind } from './pending-actions';
import { isChatResolvable, requiresEditPrompt } from './pending-actions';

/**
 * The deterministic layer (task 61; solution.md — Decision Intent Contract, step 1).
 *
 * A curated phrase set per action. A hit here is applied with **no model call at all**, which is
 * task 61's first acceptance criterion — and also the only part of this module whose behaviour is
 * fully predictable, so it is deliberately the part that carries the common cases.
 *
 * Every rule below is biased the same way: **towards abstaining.** A false negative costs the user
 * one click on a card that is already on screen. A false positive silently applies a decision they
 * did not make, which is a P2 violation that leaves no trace of having happened. Those are not
 * comparable costs, and nothing here is tuned as though they were.
 *
 * Four guards, in order, before a phrase is even looked up:
 *
 * 1. **Questions abstain.** A trailing `?`, or an opening interrogative, and we stop. "Should I
 *    approve this?" contains the word `approve` and means the opposite of a decision.
 * 2. **Hedges abstain.** `maybe`, `not sure`, `if`, `unless`, `but`, `wait`, and negations. A
 *    message with a hedge in it is a message still being thought about.
 * 3. **Whole-message match only.** The normalised message must *equal* a curated phrase, after
 *    politeness affixes are stripped. Substring matching is where false positives live: "I was
 *    going to say approve, but let me read it again" contains `approve` and must not resolve.
 * 4. **One action or none.** A message matching phrases of two different actions is ambiguous by
 *    definition, and ambiguity abstains.
 *
 * The tables are English only, and that is a stated limit rather than an oversight: the phrase set
 * is *data*, keyed by action, so another language is a table and not a code change. Nothing about
 * the guards above is language-specific except the word lists they read.
 */

/** Phrases that resolve to an action, as whole messages, already normalised. */
const PHRASES: Readonly<Record<DecisionAction, readonly string[]>> = Object.freeze({
  approve: [
    'approve',
    'approve it',
    'approve this',
    'approve the spec',
    'approve the file',
    'approve this file',
    'approved',
    'i approve',
    'i approve it',
    'looks good',
    'looks good to me',
    'lgtm',
    'ship it',
    'go ahead',
    'sign off',
    'sign it off',
  ],
  reject: [
    'reject',
    'reject it',
    'reject this',
    'reject the change',
    'reject the diff',
    'discard it',
    'discard this',
    'discard the change',
    'throw it away',
  ],
  accept: [
    'accept',
    'accept it',
    'accept this',
    'accept the review',
    'accept the diff',
    'accept the change',
    'apply it',
    'apply the change',
  ],
  ignore: [
    'ignore',
    'ignore it',
    'ignore this',
    'ignore the review',
    'ignore the feedback',
    'dismiss it',
    'dismiss the review',
    'skip it',
    'move on',
  ],
  /*
   * Empty on purpose. `update` is a review's request-changes, which carries a selection of feedback
   * items; see the note on `CHAT_RESOLVABLE`. There is no phrase that could supply that selection,
   * so there is no phrase here.
   */
  update: [],
});

/**
 * Wh-words. A message opening with one is a question whatever follows — there is no imperative
 * that begins "why" or "which".
 */
const WH_WORDS = new Set(['what', 'why', 'how', 'when', 'where', 'which', 'who', 'whom', 'whose']);

/**
 * Auxiliaries, which open a question *or* an imperative depending on what follows: "do you think…"
 * asks, "do the thing" instructs.
 */
const AUXILIARIES = new Set([
  'should',
  'shall',
  'can',
  'could',
  'would',
  'will',
  'do',
  'does',
  'did',
  'is',
  'are',
  'was',
  'were',
  'am',
  'may',
  'might',
  'must',
  'have',
  'has',
]);

/**
 * Tokens that make a message provisional, negated, comparative or conditional.
 *
 * Generous on purpose. Each entry costs at most a click; each omission risks a decision nobody made.
 */
const HEDGES = new Set([
  'not',
  'dont',
  'doesnt',
  'didnt',
  'cant',
  'cannot',
  'wont',
  'shouldnt',
  'wouldnt',
  'never',
  'no',
  'nope',
  'maybe',
  'perhaps',
  'possibly',
  'probably',
  'might',
  'could',
  'unsure',
  'unclear',
  /* Obligation and advice, not a decision taken: "you should approve", "we ought to accept". */
  'should',
  'ought',
  'need',
  'needs',
  'if',
  'unless',
  'until',
  'before',
  'after',
  'but',
  'however',
  'although',
  'though',
  'wait',
  'hold',
  'hang',
  'pause',
  'first',
  'instead',
  'rather',
  'almost',
  'nearly',
  'either',
  'or',
  'versus',
  'vs',
  'why',
  'whether',
  'suppose',
  'guess',
  'think',
  'feel',
  'seems',
  'kind',
  'sort',
  'later',
  'tomorrow',
  'eventually',
  'nevermind',
  'actually',
  'except',
  'besides',
  'anyway',
]);

/** Politeness that carries no decision, stripped from either end before matching. */
const AFFIXES = new Set([
  'please',
  'pls',
  'plz',
  'ok',
  'okay',
  'okey',
  'yes',
  'yeah',
  'yep',
  'yup',
  'sure',
  'thanks',
  'thank',
  'you',
  'lets',
  'let',
  'us',
  'just',
  'now',
  'then',
  'so',
  'well',
  'and',
]);

/**
 * Lowercases, removes punctuation, and collapses whitespace.
 *
 * Apostrophes are removed rather than replaced by a space, so `don't` becomes `dont` — which is why
 * the hedge list spells the contractions that way. Unicode apostrophes are handled alongside ASCII
 * because a message typed on a phone contains the curly one.
 */
export function normalise(message: string): string {
  return message
    .toLowerCase()
    .replace(/['‘’]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Pronouns and determiners that turn a leading auxiliary into a question rather than an order. */
const QUESTION_SUBJECTS = new Set([
  'i',
  'you',
  'we',
  'it',
  'he',
  'she',
  'they',
  'this',
  'that',
  'these',
  'those',
  'there',
  'anyone',
  'someone',
]);

/**
 * Whether the message reads as a question (solution.md: a question always abstains).
 *
 * A question mark settles it. Without one, a leading interrogative is only a question when a subject
 * follows it — "do you think…" asks, "do the thing" instructs. The distinction is worth drawing:
 * treating every leading `do`, `is` or `can` as a question would abstain on ordinary imperatives,
 * and a guard that fires on everything teaches its readers to route around it.
 */
export function readsAsQuestion(message: string): boolean {
  if (message.includes('?')) return true;

  const [first, second] = normalise(message).split(' ');

  if (WH_WORDS.has(first ?? '')) return true;

  return AUXILIARIES.has(first ?? '') && QUESTION_SUBJECTS.has(second ?? '');
}

/** Whether the message hedges, negates, or postpones. */
export function isHedged(message: string): boolean {
  return normalise(message)
    .split(' ')
    .some((token) => HEDGES.has(token));
}

/** Removes leading and trailing politeness, so "please approve it, thanks" reduces to "approve it". */
function stripAffixes(normalised: string): string {
  const tokens = normalised.split(' ').filter((token) => token !== '');

  let start = 0;
  let end = tokens.length;

  while (start < end && AFFIXES.has(tokens[start] ?? '')) start += 1;
  while (end > start && AFFIXES.has(tokens[end - 1] ?? '')) end -= 1;

  return tokens.slice(start, end).join(' ');
}

/**
 * What this layer concluded — and, when it concluded nothing, *why*, because the two reasons lead
 * to different places.
 *
 * - `match` — resolve, no model call (AC-1).
 * - `not-offered` — the message named an action plainly, and this card does not offer it. **Stop.**
 *   The model does not get a turn: a user who typed "ignore it" at a card with no ignore button has
 *   said something clear that this card cannot honour, and handing it to a classifier invites it to
 *   pick the nearest available action instead. That is how "ignore" becomes "approve", and a test
 *   below drives exactly that case with a model eager to do it.
 * - `needs-edit-prompt` — the action is offered but cannot be dispatched from a bare phrase. The
 *   model may still resolve it, because it can lift the instruction out of a longer sentence.
 * - `none` — nothing matched; the model may try.
 */
export type DeterministicOutcome =
  | { kind: 'match'; action: DecisionAction }
  | { kind: 'not-offered'; action: DecisionAction }
  | { kind: 'needs-edit-prompt'; action: DecisionAction }
  | { kind: 'none' };

export function matchDeterministic(message: string, pending: PendingKind): DeterministicOutcome {
  const phrase = stripAffixes(normalise(message));
  if (phrase === '') return { kind: 'none' };

  const matched = (Object.keys(PHRASES) as DecisionAction[]).filter((action) =>
    PHRASES[action].includes(phrase),
  );

  // Two actions matching one phrase is ambiguity, not a tie to be broken.
  if (matched.length !== 1) return { kind: 'none' };

  const action = matched[0];
  if (action === undefined) return { kind: 'none' };

  if (!isChatResolvable(pending, action)) return { kind: 'not-offered', action };

  if (requiresEditPrompt(pending, action)) return { kind: 'needs-edit-prompt', action };

  return { kind: 'match', action };
}

/**
 * The verb a decision opens with, per action.
 *
 * A decision is an **imperative**: the user tells the system to do the thing. Commentary, sarcasm
 * and near-decisions mention the same words in some other grammatical position — "the approve
 * button is greyed out", "I was going to approve this", "rename approve to publish". The leading
 * verb is what separates them, and it separates them without any judgement about meaning.
 */
const ACTION_VERBS: Readonly<Record<DecisionAction, readonly string[]>> = Object.freeze({
  approve: ['approve', 'approved', 'lgtm', 'ship', 'sign'],
  reject: ['reject', 'discard', 'revise', 'redo', 'rework', 'send', 'change'],
  accept: ['accept', 'apply'],
  ignore: ['ignore', 'dismiss', 'skip'],
  update: [],
});

/** First-person openers that precede the verb without changing the mood: "I approve it". */
const SELF_REFERENCE = new Set(['i', 'we', 'ill', 'well', 'im', 'ive', 'weve']);

/**
 * The offered action this message *opens by naming*, or `null` if it does not open with one.
 *
 * This is the gate in front of the model layer, and it exists because the guards above cannot
 * protect against a classifier that is wrong. Everything that reaches the model is imperative and
 * names something the card can actually do; everything else abstains before a model is asked, so a
 * badly-behaved model has nothing to be badly behaved about.
 *
 * The cost is real and accepted: a genuine approval phrased as an observation — "that reads fine to
 * me" — does not resolve, and the user clicks the button that is already on screen. That is the
 * asymmetry this whole module is built on, applied one more time.
 */
export function leadingActionVerb(message: string, pending: PendingKind): DecisionAction | null {
  const tokens = stripAffixes(normalise(message))
    .split(' ')
    .filter((token) => token !== '');

  const head = SELF_REFERENCE.has(tokens[0] ?? '') ? tokens[1] : tokens[0];
  if (head === undefined) return null;

  const named = (Object.keys(ACTION_VERBS) as DecisionAction[]).filter((action) =>
    ACTION_VERBS[action].includes(head),
  );

  if (named.length !== 1) return null;

  const action = named[0];

  return action !== undefined && isChatResolvable(pending, action) ? action : null;
}

/** Exposed for the corpus tests: the phrase table is data, and data deserves assertions. */
export const DETERMINISTIC_PHRASES = PHRASES;
