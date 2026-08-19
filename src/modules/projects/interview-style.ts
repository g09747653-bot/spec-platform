/**
 * How the interview asks, beside who it asks (task 144; директива заказчика 2026-08-18).
 *
 * The audience profile chooses a *vocabulary*; this chooses a *subject*. «Concrete» asks only what to
 * build, how it should be built and how the person will use it once it runs — and the customer named
 * it as a choice made at chat creation **next to** the profile, not instead of it, which is why it is
 * a second axis rather than a third `AudienceProfile`. The two do not compose: «they are not
 * technical» plus «name the actual technology» is a round that hedges every option into a category,
 * which is the defect the style exists to remove, so the style displaces the profile's register
 * (`audienceRules`).
 *
 * `projects` owns the vocabulary for the same reason it owns `AudienceProfile`: the style is a
 * property of the session. `prompts` may not import this module (constitution A1), so the value
 * crosses as a plain string and an unrecognised one falls back to the profile's register — today's
 * behaviour, and the safe direction to fail in.
 */
export const INTERVIEW_STYLES = ['default', 'concrete'] as const;

export type InterviewStyle = (typeof INTERVIEW_STYLES)[number];

/**
 * The default, and it is the one that changes nothing.
 *
 * Every session written before this existed was interviewed in the profile's own register, and
 * `default` is the name of that register. A row that never chose reads as one that chose to keep
 * what it had.
 */
export const DEFAULT_INTERVIEW_STYLE: InterviewStyle = 'default';

export function isInterviewStyle(value: string): value is InterviewStyle {
  return (INTERVIEW_STYLES as readonly string[]).includes(value);
}
