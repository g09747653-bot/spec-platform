import { commonPhrases } from './common';
import { errorsPhrases } from './errors';
import { feedConversationPhrases } from './feed-conversation';
import { feedDocumentsPhrases } from './feed-documents';
import { pagesPhrases } from './pages';
import { projectsPhrases } from './projects';
import { sessionPhrases } from './session';
import { viewerPhrases } from './viewer';

/**
 * Every word this interface says, in both languages (task 143).
 *
 * **Split by surface, joined here.** One file of five hundred entries is a file nobody reads; eight
 * files named after the surfaces they dress are eight files a person can hold in their head while
 * translating one of them. The join is a spread rather than a nested namespace so a key is a flat
 * string — `t('feed.review.pass')` — which is what makes the union of keys usable as a type and a
 * missing entry a compile error rather than an `undefined` in a sentence.
 *
 * Keys are `<surface>.<component>.<what-it-says>`, in English, describing the *role* of the line and
 * never its wording: `feed.review.outcome-pass`, not `feed.review.needs-revision-text`. A key named
 * after the words has to be renamed the first time the words change, and a rename is exactly the
 * moment a translation gets orphaned.
 */
export const PHRASES = {
  ...commonPhrases,
  ...errorsPhrases,
  ...feedConversationPhrases,
  ...feedDocumentsPhrases,
  ...pagesPhrases,
  ...projectsPhrases,
  ...sessionPhrases,
  ...viewerPhrases,
} as const;

/** Every key the dictionary answers. A typo here is a type error, not a blank label. */
export type PhraseKey = keyof typeof PHRASES;
