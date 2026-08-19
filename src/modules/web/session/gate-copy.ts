import type { InterviewCondition, ReasonCode } from '@/modules/workflow/reason-codes';

import type { ErrorCode } from '../api/responses';
import type { PhraseKey } from '../i18n/dictionary';
import type { Translate } from '../i18n/translate';

/**
 * What a gate's refusal means, in words (round 5, Р-3 item 4; translated in task 143).
 *
 * The reason codes are a closed machine-readable set (`workflow/reason-codes.ts`) and the page used
 * to translate three of them by hand, falling through to **the raw code** for the rest — so a
 * session whose question budget ran out told its owner `still needed: ROUND_LIMIT_REACHED`, and a
 * rejected transition said only "That step is not available yet", which names nothing and suggests
 * nothing.
 *
 * All four maps are keyed by a whole union, so adding a code without wording it is a type error
 * rather than a sentence a user has to decode. They hold **phrase keys, not sentences** (task 143):
 * the words themselves are in `i18n/dictionary/errors.ts`, in both languages, and a key is resolved
 * at the call site by whichever `t` that surface has. Keeping the tables here rather than inlining
 * the keys at the call sites is what preserves the exhaustiveness — the compiler can check a record
 * over `ReasonCode`, and it cannot check a `switch` somebody forgot to extend.
 *
 * **The three registers are separate on purpose.** `STILL_NEEDED` is a nominative noun group that
 * joins with commas into «ещё нужно: …»; `REASON_EXPLANATION` is whole sentences saying what to do;
 * `CONDITION_COPY` names one unmet interview condition (FR-006 AC-2). A single table serving all
 * three would force one shape onto three grammars, and Russian is where that breaks first.
 */
export const CONDITION_COPY: Record<InterviewCondition, PhraseKey> = {
  'grounding-input': 'errors.condition.grounding-input',
  'answered-round': 'errors.condition.answered-round',
  summary: 'errors.condition.summary',
};

/** Short fragments, read as "still needed: …". */
export const STILL_NEEDED: Record<ReasonCode, PhraseKey> = {
  INTERVIEW_INCOMPLETE: 'errors.needed.interview-incomplete',
  NO_ANSWERED_ROUND: 'errors.needed.no-answered-round',
  SPEC_NOT_APPROVED: 'errors.needed.spec-not-approved',
  REVIEW_NOT_DECIDED: 'errors.needed.review-not-decided',
  SPEC_MISSING: 'errors.needed.spec-missing',
  TRANSITION_NOT_IN_TABLE: 'errors.needed.transition-not-in-table',
  SESSION_SEALED: 'errors.needed.session-sealed',
  ROUND_LIMIT_REACHED: 'errors.needed.round-limit-reached',
  CAPABILITY_NOT_REGISTERED: 'errors.needed.capability-not-registered',
  REVISION_LIMIT_REACHED: 'errors.needed.revision-limit-reached',
};

/** Full sentences: what was refused, and what to do about it. */
export const REASON_EXPLANATION: Record<ReasonCode, PhraseKey> = {
  INTERVIEW_INCOMPLETE: 'errors.gate.interview-incomplete',
  NO_ANSWERED_ROUND: 'errors.gate.no-answered-round',
  SPEC_NOT_APPROVED: 'errors.gate.spec-not-approved',
  REVIEW_NOT_DECIDED: 'errors.gate.review-not-decided',
  SPEC_MISSING: 'errors.gate.spec-missing',
  TRANSITION_NOT_IN_TABLE: 'errors.gate.transition-not-in-table',
  SESSION_SEALED: 'errors.gate.session-sealed',
  ROUND_LIMIT_REACHED: 'errors.gate.round-limit-reached',
  CAPABILITY_NOT_REGISTERED: 'errors.gate.capability-not-registered',
  REVISION_LIMIT_REACHED: 'errors.gate.revision-limit-reached',
};

/**
 * The browser's own words for an API error code (task 143).
 *
 * `web/api/responses.ts` runs on the server and answers in English by design: its `message` is the
 * machine-readable fallback, read by tests and by any client that does not know the code. This map is
 * the other end of that seam — the browser matches `error.code` against it and prints a translated
 * sentence, and a code it has never heard of falls through to whatever the server wrote. So a handler
 * added in a later milestone degrades to English rather than to a blank notice, and translating it
 * later is one entry here rather than a change to the wire format.
 *
 * `null` is a deliberate answer, not a gap: it says the server's own message is *more* specific than
 * anything this table could hold. `UPLOAD_REJECTED` is the case — FR-004 AC-4 requires the rejection
 * to name the limit or the supported types, and only the guard that refused knows which. Typing the
 * value as `PhraseKey | null` keeps the record exhaustive, so a new error code still has to be
 * considered here rather than silently omitted.
 */
export const API_EXPLANATION: Record<ErrorCode, PhraseKey | null> = {
  UNAUTHENTICATED: 'errors.api.unauthenticated',
  NOT_FOUND: 'errors.api.not-found',
  VALIDATION_FAILED: 'errors.api.validation-failed',
  PENDING_DECISION: 'errors.api.pending-decision',
  GATE_REJECTED: 'errors.api.gate-rejected',
  ROUND_LIMIT_REACHED: 'errors.api.round-limit-reached',
  CAPABILITY_NOT_REGISTERED: 'errors.api.capability-not-registered',
  CONFLICT: 'errors.api.conflict',
  DRAFT_INVALID: 'errors.api.draft-invalid',
  EXPORT_STALE: 'errors.api.export-stale',
  GENERATION_FAILED: 'errors.api.generation-failed',
  UPLOAD_REJECTED: null,
};

const isReasonCode = (value: string): value is ReasonCode => value in REASON_EXPLANATION;

const isErrorCode = (value: string): value is ErrorCode => value in API_EXPLANATION;

/**
 * The message to show for a rejection, in the words of whichever layer knows most about it.
 *
 * Three sources in order of how much each one knows: the gate's reason code, which names the
 * condition that was not met; the API error code, which names the kind of refusal; and the server's
 * own message, which is English but is the only thing that ever knows a limit or a file type. The
 * order is what keeps the last of them a fallback rather than the answer — «That step is not
 * available yet» was the whole account the gate walk got back for an exhausted question budget.
 */
export function rejectionNotice(
  t: Translate,
  message: string | null,
  reason: string | null,
  code: string | null = null,
): string | null {
  if (reason !== null && isReasonCode(reason)) return t(REASON_EXPLANATION[reason]);

  const worded = code !== null && isErrorCode(code) ? API_EXPLANATION[code] : null;

  return worded === null ? message : t(worded);
}
