/**
 * Deliberate violation (task 39 AC-1): the same import from inside `specs` itself, spelled relatively.
 *
 * The restriction is about the consumption chain, not about module boundaries — a sibling file in
 * `specs` has no more right to the heading list than an agent does. This fixture exists because the
 * relative form is the one that would slip through a rule written only against the `@/` alias.
 *
 * Linted only by `pnpm test:boundaries`.
 */
import { requiredSections } from '../section-schema';

export const sections = requiredSections('tasks');
