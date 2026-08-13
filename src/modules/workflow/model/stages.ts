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

/**
 * Stages in which question rounds may be asked (FR-005): the initial grounding interview plus the
 * `collect` substage of every spec stage. `complete` asks nothing. The round budget of FR-005 AC-10
 * is counted per asking stage, which is why the answered-rounds map is keyed by this union.
 */
export const ASKING_STAGES = ['interview', ...SPEC_STAGES] as const;

export type AskingStage = (typeof ASKING_STAGES)[number];

/** The position of a session in the workflow: a stage plus, for spec stages, a substage. */
export type StagePosition =
  { stage: SubstagelessStage; substage: null } | { stage: SpecStage; substage: Substage };

/**
 * Every position the workflow can occupy, in canonical forward order: `interview`, then
 * `collect → generate → review` for each spec stage, then `complete` — 17 in total.
 *
 * The exhaustive matrix test (task 30, NFR-012 AC-3) enumerates the cross product of this list
 * against itself, so "every illegal transition is refused" is a loop over data rather than a set of
 * hand-picked examples.
 */
export const ALL_POSITIONS: readonly StagePosition[] = [
  { stage: 'interview', substage: null },
  ...SPEC_STAGES.flatMap((stage) =>
    SUBSTAGES.map((substage): StagePosition => ({ stage, substage })),
  ),
  { stage: 'complete', substage: null },
];

/** Position equality. Positions are value objects; nothing compares them by reference. */
export function samePosition(a: StagePosition, b: StagePosition): boolean {
  return a.stage === b.stage && a.substage === b.substage;
}

/** Renders a position as `stage` or `stage.substage` — row identifiers and log lines use this. */
export function positionKey(position: StagePosition): string {
  return position.substage === null ? position.stage : `${position.stage}.${position.substage}`;
}

export function isStage(value: string): value is Stage {
  return (STAGES as readonly string[]).includes(value);
}

export function isAskingStage(value: string): value is AskingStage {
  return (ASKING_STAGES as readonly string[]).includes(value);
}

export function isSpecStage(value: string): value is SpecStage {
  return (SPEC_STAGES as readonly string[]).includes(value);
}

export function isSubstage(value: string): value is Substage {
  return (SUBSTAGES as readonly string[]).includes(value);
}
