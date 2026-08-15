import type { InterviewCondition, ReasonCode } from '@/modules/workflow/reason-codes';

/**
 * What a gate's refusal means, in words (round 5, Р-3 item 4).
 *
 * The reason codes are a closed machine-readable set (`workflow/reason-codes.ts`) and the page used
 * to translate three of them by hand, falling through to **the raw code** for the rest — so a
 * session whose question budget ran out told its owner `still needed: ROUND_LIMIT_REACHED`, and a
 * rejected transition said only "That step is not available yet", which names nothing and suggests
 * nothing.
 *
 * Both maps are keyed by the whole `ReasonCode` union, so adding a reason code without wording it is
 * a type error rather than a sentence a user has to decode. They are the only place this wording
 * exists: the page uses `STILL_NEEDED` for the "still needed: …" line, and the panels use
 * `REASON_EXPLANATION` for a rejection the server actually returned.
 */
export const CONDITION_COPY: Record<InterviewCondition, string> = {
  'grounding-input': 'the initial prompt',
  'answered-round': 'one answered question round',
  summary: 'a session summary',
};

/** Short fragments, read as "still needed: …". */
export const STILL_NEEDED: Record<ReasonCode, string> = {
  INTERVIEW_INCOMPLETE: 'the interview to be complete',
  NO_ANSWERED_ROUND: 'one answered question round for this stage',
  SPEC_NOT_APPROVED: 'your approval of the current draft',
  REVIEW_NOT_DECIDED: 'a decision on the review above',
  SPEC_MISSING: 'an approved revision of every file in the bundle',
  TRANSITION_NOT_IN_TABLE: 'a step that follows from where the session is',
  SESSION_SEALED: 'nothing — the session is sealed and does not reopen',
  ROUND_LIMIT_REACHED: 'nothing further from this stage — its question rounds are used up',
  CAPABILITY_NOT_REGISTERED: 'an optional stage that is not installed',
};

/** Full sentences: what was refused, and what to do about it. */
export const REASON_EXPLANATION: Record<ReasonCode, string> = {
  INTERVIEW_INCOMPLETE:
    'The interview is not complete yet. The page lists which of its three conditions is still open.',
  NO_ANSWERED_ROUND:
    'This stage has no answered question round yet. Ask a round and answer it, then try again.',
  SPEC_NOT_APPROVED:
    'The current draft has not been approved yet. Approve it, or ask for changes, and then move on.',
  REVIEW_NOT_DECIDED:
    'The review on this page is still undecided. Accept it, ignore it, or request changes first.',
  SPEC_MISSING:
    'Not every file in the bundle has an approved revision yet, so the session cannot be sealed.',
  TRANSITION_NOT_IN_TABLE:
    'That step does not follow from where the session is. Reload the page to see its actual position.',
  SESSION_SEALED: 'This session is sealed. It does not reopen, and no stage runs again.',
  ROUND_LIMIT_REACHED:
    'Every question round for this stage has been used, so nothing further will be asked here. ' +
    'Anything still open can be answered directly in the fields above; otherwise move on to the next step.',
  CAPABILITY_NOT_REGISTERED:
    'That stage is optional and is not installed on this deployment, so it cannot be entered.',
};

const isReasonCode = (value: string): value is ReasonCode => value in REASON_EXPLANATION;

/**
 * The message to show for a rejection: the server's own words, plus the reason's explanation when
 * the reason adds something the message does not.
 */
export function rejectionNotice(message: string | null, reason: string | null): string | null {
  const explained = reason !== null && isReasonCode(reason) ? REASON_EXPLANATION[reason] : null;

  if (explained !== null) return explained;

  return message;
}
