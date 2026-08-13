/**
 * Deliberate violation (task 39 AC-1): a third consumer of the section schema.
 *
 * The agent is the most tempting place to reach for the heading list — it is the code that asks a
 * model to produce them. It must go through `validateStructure` instead, or P3's "exactly two
 * consumers" degrades to "however many were convenient".
 *
 * Linted only by `pnpm test:boundaries`.
 */
import { requiredSections } from '@/modules/specs/section-schema';

export const sections = requiredSections('constitution');
