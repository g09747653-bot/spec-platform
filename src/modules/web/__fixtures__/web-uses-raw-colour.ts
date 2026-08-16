/**
 * Deliberate violation (task 124): a colour literal outside the brand file.
 *
 * Linted only by `pnpm test:boundaries`. If this file ever stops producing a
 * `design-tokens/no-raw-colours` error, the token gate has lost its teeth and the check fails.
 */
export const errorBadgeStyle = { borderColor: '#e11d48', background: 'rgba(225, 29, 72, 0.1)' };
