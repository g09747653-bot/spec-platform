import type { CapabilityId } from '../model/capabilities';
import {
  ASKING_STAGES,
  SPEC_STAGES,
  type AskingStage,
  type SpecStage,
  type StagePosition,
} from '../model/stages';
import type { InformationNeedState, WorkflowSnapshot } from '../snapshot';

/**
 * Literal snapshots for the engine tests (task 25 AC: "constructible in a test from fixtures").
 *
 * Every snapshot built here is **deeply frozen**. The gates are required to be pure (NFR-012
 * AC-1), and freezing every input makes an accidental mutation a thrown `TypeError` in every test
 * rather than a silent state leak between cases — the cheapest possible purity instrument.
 */
export interface SnapshotOverrides {
  position?: StagePosition;
  /** The session's methodology; absent means the parity graph (task 116). */
  methodologyId?: string | null;
  groundingInputRecorded?: boolean;
  summaryPersisted?: boolean;
  roundBudget?: number;
  answeredRounds?: Partial<Record<AskingStage, number>>;
  informationNeeds?: readonly InformationNeedState[];
  specApproved?: Partial<Record<SpecStage, boolean>>;
  approvedRevisionExists?: Partial<Record<SpecStage, boolean>>;
  reviewDecided?: Partial<Record<SpecStage, boolean>>;
  qualityEnabled?: boolean;
  capabilities?: readonly CapabilityId[];
}

const zeroRounds = (): Record<AskingStage, number> =>
  Object.fromEntries(ASKING_STAGES.map((stage) => [stage, 0])) as Record<AskingStage, number>;

const flags = (value: boolean): Record<SpecStage, boolean> =>
  Object.fromEntries(SPEC_STAGES.map((stage) => [stage, value])) as Record<SpecStage, boolean>;

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }

  return value;
}

/** The minimal snapshot: nothing satisfied, nothing enabled, nothing registered. */
export function makeSnapshot(overrides: SnapshotOverrides = {}): WorkflowSnapshot {
  return deepFreeze({
    position: overrides.position ?? { stage: 'interview', substage: null },
    methodologyId: overrides.methodologyId ?? null,
    groundingInputRecorded: overrides.groundingInputRecorded ?? false,
    summaryPersisted: overrides.summaryPersisted ?? false,
    roundBudget: overrides.roundBudget ?? 3,
    answeredRounds: { ...zeroRounds(), ...overrides.answeredRounds },
    informationNeeds: overrides.informationNeeds ?? [],
    specApproved: { ...flags(false), ...overrides.specApproved },
    approvedRevisionExists: { ...flags(false), ...overrides.approvedRevisionExists },
    reviewDecided: { ...flags(false), ...overrides.reviewDecided },
    qualityEnabled: overrides.qualityEnabled ?? false,
    capabilities: overrides.capabilities ?? [],
  });
}

/**
 * The most permissive snapshot possible at a position: every gate input satisfied.
 *
 * The illegal-pair sweep of task 30 evaluates every untabled pair under this as well as under the
 * minimal snapshot: an illegal transition must be refused because it is illegal, and no amount of
 * satisfied state may unlock it.
 */
export function maximalSnapshotAt(
  position: StagePosition,
  quality: { enabled: boolean; registered: boolean },
  methodologyId: string | null = null,
): WorkflowSnapshot {
  return deepFreeze({
    position,
    methodologyId,
    groundingInputRecorded: true,
    summaryPersisted: true,
    roundBudget: 3,
    answeredRounds: Object.fromEntries(ASKING_STAGES.map((stage) => [stage, 1])) as Record<
      AskingStage,
      number
    >,
    informationNeeds: [],
    specApproved: flags(true),
    approvedRevisionExists: flags(true),
    reviewDecided: flags(true),
    qualityEnabled: quality.enabled,
    capabilities: quality.registered ? (['quality'] as const) : [],
  });
}
