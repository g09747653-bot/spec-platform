import { methodologyConfig, stageOf } from '@/modules/methodologies';

import type { AskingStage } from '../model/stages';
import { allowed, rejected, type TransitionResult } from '../reason-codes';
import type { WorkflowSnapshot } from '../snapshot';

/**
 * The budget in force for a stage: the methodology's number if it declares one, otherwise the
 * configured default carried in the snapshot (task 116).
 *
 * Exported because the surface has to say the same number the gate enforces — a card that offers
 * "round 3 of 3" while the gate counts to 2 is the M6 lesson (D-97) in a new place.
 */
export function roundBudgetFor(snapshot: WorkflowSnapshot, stage: AskingStage): number {
  return (
    stageOf(methodologyConfig(snapshot.methodologyId), stage)?.roundBudget ?? snapshot.roundBudget
  );
}

/**
 * The question-round budget (task 27; FR-005 AC-10; D-2).
 *
 * `answeredRounds(stage) < roundBudget` — nothing else. The budget arrives in the snapshot from
 * configuration (`MAX_ROUNDS_PER_STAGE`, default 3), so changing it is an environment edit with no
 * code change, while the gate itself stays a pure predicate (constitution P1: a prompt asking the
 * model to "keep it to three rounds" would be neither enforceable nor testable — this is).
 *
 * The budget counts **answered** rounds and gates **asking another**. Presentation stays within
 * the bound because at most one round is pending at a time: with the budget at 3, the fourth ask
 * finds three answered rounds and is refused with `ROUND_LIMIT_REACHED`, which is exactly the
 * signal the exhaustion fallback (task 37) renders as "here is what remains unanswered".
 */
export function roundBudgetGate(snapshot: WorkflowSnapshot, stage: AskingStage): TransitionResult {
  return snapshot.answeredRounds[stage] < roundBudgetFor(snapshot, stage)
    ? allowed()
    : rejected('ROUND_LIMIT_REACHED');
}
