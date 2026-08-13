import type { CapabilityId } from './model/capabilities';
import type { AskingStage, SpecStage, StagePosition } from './model/stages';

/**
 * The data every gate is a pure function of (solution.md — `WorkflowSnapshot`; NFR-012 AC-1/AC-2).
 *
 * Plain, serialisable, and constructible in a test from literals — the engine never receives a
 * database handle, a request, or a model client. A repository assembles this shape from persisted
 * state (`snapshot-assembler.ts`); the engine neither knows nor cares where it came from, which is
 * what makes the full transition matrix testable with no I/O at all.
 *
 * Nothing here is stored twice: every field is derived from tables that already exist, and the
 * snapshot itself is never persisted.
 */
export interface InformationNeedState {
  /** The stage the need belongs to. Needs are per-stage by definition (DR-13). */
  stage: AskingStage;
  /** Unique within its session and stage, so satisfaction is checked by key (DR-13). */
  name: string;
  /** True once an answered round (or a direct fallback answer, FR-005 AC-10) satisfied it. */
  satisfied: boolean;
}

export interface WorkflowSnapshot {
  /** Where the session is now. The `from` side of every evaluated transition. */
  position: StagePosition;

  /** FR-006 AC-1(a): a non-empty initial prompt is recorded on the session. */
  groundingInputRecorded: boolean;

  /** FR-006 AC-1(c): `sessions.summary` is persisted. */
  summaryPersisted: boolean;

  /**
   * The per-stage question-round budget (FR-005 AC-10), carried in the snapshot so
   * `roundBudgetGate` stays a pure function while the value remains configuration
   * (`MAX_ROUNDS_PER_STAGE`, task 27) rather than a constant baked into the engine.
   */
  roundBudget: number;

  /**
   * How many question rounds have been **answered** per asking stage. A presented-but-unanswered
   * round does not count: the budget gates asking another round, and what bounds presentation to
   * at most the budget is this count plus the one-pending-round-at-a-time rule.
   */
  answeredRounds: Readonly<Record<AskingStage, number>>;

  /** Every declared information need of the session, with its satisfaction state (FR-005 AC-7/AC-8). */
  informationNeeds: readonly InformationNeedState[];

  /**
   * Whether the stage's spec file exists **and its latest revision is approved** (FR-007 AC-3).
   * "Latest" matters: after a request-changes appends a new unapproved revision, the previously
   * approved one no longer represents what the user would be reviewing, so the flag drops to false
   * until the new revision is approved (FR-009 AC-4/AC-5).
   */
  specApproved: Readonly<Record<SpecStage, boolean>>;

  /**
   * Whether the stage's spec file has **any** approved revision (FR-020 AC-2). Distinct from
   * `specApproved`: a file whose latest revision awaits a decision still has approved history, and
   * completion cares about the existence of approved content, not about a pending redraft.
   */
  approvedRevisionExists: Readonly<Record<SpecStage, boolean>>;

  /** Whether the stage's review has been decided accept-or-ignore (FR-007 AC-4; FR-010 AC-5). */
  reviewDecided: Readonly<Record<SpecStage, boolean>>;

  /** The session's persisted Quality selection (`sessions.quality_enabled`; FR-013). */
  qualityEnabled: boolean;

  /** Registered optional stage capabilities; empty when the Quality module is off (A6). */
  capabilities: readonly CapabilityId[];
}

/** The names of `stage`'s declared-but-unsatisfied needs — what the AC-10 fallback lists. */
export function unmetNeedNames(snapshot: WorkflowSnapshot, stage: AskingStage): string[] {
  return snapshot.informationNeeds
    .filter((need) => need.stage === stage && !need.satisfied)
    .map((need) => need.name);
}

/** The names of `stage`'s satisfied needs — what the interview agent must never re-declare (FR-005 AC-9). */
export function satisfiedNeedNames(snapshot: WorkflowSnapshot, stage: AskingStage): string[] {
  return snapshot.informationNeeds
    .filter((need) => need.stage === stage && need.satisfied)
    .map((need) => need.name);
}
