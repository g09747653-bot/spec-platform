/**
 * The vocabulary of optional stage capabilities (constitution A6; solution.md — `workflow`).
 *
 * A leaf module like `stages.ts`: it imports nothing, so both the snapshot (which records which
 * capabilities were registered) and the registry (which holds the registrations) can key off the
 * same names without a cycle.
 *
 * `quality` is the only optional stage the constitution defines. The type is a union rather than
 * `string` so a misspelled capability id is a compile error, not a silently-never-matching row.
 */
export const CAPABILITY_IDS = ['quality'] as const;

export type CapabilityId = (typeof CAPABILITY_IDS)[number];

export function isCapabilityId(value: string): value is CapabilityId {
  return (CAPABILITY_IDS as readonly string[]).includes(value);
}
