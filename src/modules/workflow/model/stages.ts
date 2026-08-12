/**
 * The canonical stage/substage vocabulary (constitution A2).
 *
 * `workflow` owns the stage model, so this leaf module is the single place the names exist. It
 * imports nothing — the database schema derives its CHECK constraints from these tuples and the
 * transition table (task 24) is built over the same names, so a stage cannot be spelled two ways.
 */

/** Every workflow state, in forward order. `quality` is the only optional one. */
export const STAGES = [
  'interview',
  'constitution',
  'requirements',
  'solution',
  'tasks',
  'quality',
  'complete',
] as const;

export type Stage = (typeof STAGES)[number];

/**
 * Stages that produce a spec file and therefore run `collect → generate → review`.
 *
 * `interview` is excluded deliberately: it produces no spec file and so has no substages
 * (constitution A2, "Interview stage and its exit gate"). `complete` is terminal.
 */
export const SPEC_STAGES = [
  'constitution',
  'requirements',
  'solution',
  'tasks',
  'quality',
] as const;

export type SpecStage = (typeof SPEC_STAGES)[number];

/** Stages that carry no substage. The complement of `SPEC_STAGES` within `STAGES`. */
export const SUBSTAGELESS_STAGES = ['interview', 'complete'] as const;

export type SubstagelessStage = (typeof SUBSTAGELESS_STAGES)[number];

export const SUBSTAGES = ['collect', 'generate', 'review'] as const;

export type Substage = (typeof SUBSTAGES)[number];

/** The position of a session in the workflow: a stage plus, for spec stages, a substage. */
export type StagePosition =
  { stage: SubstagelessStage; substage: null } | { stage: SpecStage; substage: Substage };

export function isStage(value: string): value is Stage {
  return (STAGES as readonly string[]).includes(value);
}

export function isSpecStage(value: string): value is SpecStage {
  return (SPEC_STAGES as readonly string[]).includes(value);
}

export function isSubstage(value: string): value is Substage {
  return (SUBSTAGES as readonly string[]).includes(value);
}
