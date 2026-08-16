/**
 * Deliberate violation (task 124): a Tailwind palette utility instead of a token utility.
 *
 * The subtler half of the gate. `text-red-700` compiles, renders, and looks right in the light
 * theme — and paints the same red in the dark one, where it does not belong. Linted only by
 * `pnpm test:boundaries`.
 */
export const errorTextClass = 'text-sm text-red-700';
