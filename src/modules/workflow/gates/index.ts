import { isSpecStage, type SpecStage, type StagePosition } from '../model/stages';
import { allowed, rejected, type TransitionResult } from '../reason-codes';
import type { WorkflowSnapshot } from '../snapshot';
import type { GateId, TransitionEdge } from '../transition-table';

import { approvalGate } from './approval';
import { collectGate } from './collect';
import { completionGate } from './completion';
import { interviewGate } from './interview';
import { reviewGate } from './review';

/**
 * Gate lookup: the transition table names a gate per row, this registry holds the predicate
 * (task 26; solution.md — `gates`).
 *
 * Every entry is a pure, synchronous function over the snapshot — no network, database,
 * filesystem or model I/O exists anywhere beneath this file (NFR-012 AC-1). The composite gates
 * of the Quality fork sequence their checks from the structural to the situational, so the reason
 * a caller receives is the most fundamental unmet condition:
 *
 * 1. **Capability** — with no `quality` capability registered, the Quality rows are effectively
 *    absent from the table (A6), and `CAPABILITY_NOT_REGISTERED` outranks everything else.
 * 2. **Ordering** — constitution A2 makes the ordering binding per session: with Quality enabled
 *    the legal path is `tasks → quality → complete`, with it disabled `tasks → complete`. The row
 *    contradicting the persisted selection is not part of that session's ordering, and attempting
 *    it is answered with `TRANSITION_NOT_IN_TABLE` — deliberately the same code as for a pair no
 *    row defines, because for this session that is precisely what it is. Out of `complete` the
 *    same situation reads `SESSION_SEALED`: re-entry without the Quality selection enabled leaves
 *    the session sealed (FR-020 AC-9).
 * 3. **Progress** — only then the ordinary gates: review decided, bundle complete.
 */

/** The stage a substage row belongs to. Table construction makes non-spec stages unreachable here. */
function specStageOf(position: StagePosition): SpecStage {
  if (!isSpecStage(position.stage)) {
    throw new Error(`transition row expected a spec stage, found: ${position.stage}`);
  }

  return position.stage;
}

function qualityCapabilityRegistered(snapshot: WorkflowSnapshot): boolean {
  return snapshot.capabilities.includes('quality');
}

/** `tasks.review → complete`: the parity exit (FR-007 AC-7; FR-020 AC-1/AC-2). */
function tasksToComplete(snapshot: WorkflowSnapshot): TransitionResult {
  // With Quality enabled the session's ordering runs through `quality`; skipping it would violate
  // the binding ordering rule of constitution A2, so for this session the edge does not exist.
  if (snapshot.qualityEnabled) return rejected('TRANSITION_NOT_IN_TABLE');

  const review = reviewGate(snapshot, 'tasks');
  if (!review.allowed) return review;

  return completionGate(snapshot);
}

/** `tasks.review → quality.collect`: the opt-in exit (FR-007 AC-7; FR-013 AC-5). */
function tasksToQuality(snapshot: WorkflowSnapshot): TransitionResult {
  if (!qualityCapabilityRegistered(snapshot)) return rejected('CAPABILITY_NOT_REGISTERED');

  // Quality not selected → the session's ordering is `tasks → complete`; this edge is not in it.
  if (!snapshot.qualityEnabled) return rejected('TRANSITION_NOT_IN_TABLE');

  return reviewGate(snapshot, 'tasks');
}

/** `quality.review → complete`: closes both the first pass and every re-entry (FR-020 AC-7). */
function qualityToComplete(snapshot: WorkflowSnapshot): TransitionResult {
  const review = reviewGate(snapshot, 'quality');
  if (!review.allowed) return review;

  return completionGate(snapshot);
}

/**
 * `complete → quality.collect`: the one way out of `complete` (FR-020 AC-5/AC-9).
 *
 * Requires the capability and the persisted Quality selection — nothing more: re-entry exists so
 * the owner can enable Quality after completion, and all substage gates apply once inside
 * (FR-020 AC-6). Without the selection the session stays sealed.
 */
function qualityReentry(snapshot: WorkflowSnapshot): TransitionResult {
  if (!qualityCapabilityRegistered(snapshot)) return rejected('CAPABILITY_NOT_REGISTERED');
  if (!snapshot.qualityEnabled) return rejected('SESSION_SEALED');

  return allowed();
}

export const GATES: Readonly<
  Record<GateId, (snapshot: WorkflowSnapshot, edge: TransitionEdge) => TransitionResult>
> = {
  'interview-exit': (snapshot) => interviewGate(snapshot),
  collect: (snapshot, edge) => collectGate(snapshot, specStageOf(edge.from)),
  approval: (snapshot, edge) => approvalGate(snapshot, specStageOf(edge.from)),
  'review-advance': (snapshot, edge) => reviewGate(snapshot, specStageOf(edge.from)),
  /** Backward within a stage is unconditional (FR-007 AC-5) — the row's existence is the rule. */
  backward: () => allowed(),
  'tasks-to-complete': (snapshot) => tasksToComplete(snapshot),
  'tasks-to-quality': (snapshot) => tasksToQuality(snapshot),
  'quality-to-complete': (snapshot) => qualityToComplete(snapshot),
  'quality-reentry': (snapshot) => qualityReentry(snapshot),
};

export { approvalGate } from './approval';
export { collectGate } from './collect';
export { completionGate } from './completion';
export { interviewGate } from './interview';
export { reviewGate } from './review';
export { roundBudgetGate } from './round-budget';
