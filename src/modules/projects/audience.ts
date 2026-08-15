/**
 * Who the interview is talking to (У-5; task 106).
 *
 * The reference product asks everyone the same questions in the same register, and its own
 * transcript shows the cost: a non-technical founder is asked about latency budgets in the same
 * breath as an engineer. The profile is one choice at project creation and it changes only *how* the
 * questions are worded — never which gates apply, never what the bundle contains.
 *
 * `projects` owns the vocabulary because the profile is a property of the session. `prompts` may not
 * import this module (constitution A1), so the prompt asset takes the value as a plain string and
 * falls back to the plain register on anything it does not recognise — the same shape `stage`
 * already has, and the safe direction to fail in.
 */
export const AUDIENCE_PROFILES = ['non-technical', 'technical'] as const;

export type AudienceProfile = (typeof AUDIENCE_PROFILES)[number];

/**
 * The default, and it is the plain one on purpose.
 *
 * A developer asked plain questions loses a little precision; a non-technical founder asked
 * technical ones cannot answer at all. The asymmetry decides the default.
 */
export const DEFAULT_AUDIENCE_PROFILE: AudienceProfile = 'non-technical';

export function isAudienceProfile(value: string): value is AudienceProfile {
  return (AUDIENCE_PROFILES as readonly string[]).includes(value);
}
