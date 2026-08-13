import { GATES } from './gates';
import { roundBudgetGate } from './gates/round-budget';
import type { AskingStage, StagePosition } from './model/stages';
import { rejected, type TransitionResult } from './reason-codes';
import type { WorkflowSnapshot } from './snapshot';
import { findTransition } from './transition-table';

/**
 * The heart of the state machine (solution.md — `evaluateTransition`; NFR-012).
 *
 * Pure and synchronous: a snapshot in, a verdict out, no I/O anywhere on the path (NFR-012 AC-1).
 * The decision is two steps and only two:
 *
 * 1. **Is the movement a row of the table?** A pair the table does not define is illegal — from
 *    `complete` that reads `SESSION_SEALED`, because the one defined exit is `complete → quality`
 *    and everything else is the seal itself (FR-020 AC-9); from anywhere else it is
 *    `TRANSITION_NOT_IN_TABLE`.
 * 2. **Does the row's gate hold?** Gates see persisted state only; nothing a model says can reach
 *    them (constitution P1).
 *
 * Illegal transitions are rejected with a typed reason, never coerced to the nearest legal one
 * (constitution A2) — the caller learns *why* and stays put.
 */
export function evaluateTransition(
  snapshot: WorkflowSnapshot,
  to: StagePosition,
): TransitionResult {
  const row = findTransition(snapshot.position, to);

  if (row === undefined) {
    return rejected(
      snapshot.position.stage === 'complete' ? 'SESSION_SEALED' : 'TRANSITION_NOT_IN_TABLE',
    );
  }

  return GATES[row.gate](snapshot, row);
}

/**
 * May another question round be asked for `stage`? (solution.md — `canAskAnotherRound`.)
 *
 * The budget applies to every asking stage — the grounding interview included, which is why the
 * parameter is the asking union rather than the spec-stage union: FR-005 bounds "question rounds
 * per stage", and the interview is the first stage that asks.
 */
export function canAskAnotherRound(
  snapshot: WorkflowSnapshot,
  stage: AskingStage,
): TransitionResult {
  return roundBudgetGate(snapshot, stage);
}
