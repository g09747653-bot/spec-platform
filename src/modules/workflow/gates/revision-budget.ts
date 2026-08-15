import { allowed, rejected, type TransitionResult } from '../reason-codes';

/**
 * The revision-cycle budget (task 113; Эталон §1.3).
 *
 * `cyclesUsed < budget` — nothing else, and the budget arrives from configuration
 * (`MAX_REVISION_CYCLES_PER_STAGE`, default 5), so widening the loop is an environment edit rather
 * than a code change. Five is the depth the reference session actually reached: its constitution
 * went through six revisions, which is five request-changes cycles.
 *
 * **What this is not.** It is not a transition gate, and it is deliberately not attached to a row of
 * the table. `review → generate` is a backward movement, and constitution A2 makes backward movement
 * inside a stage unconditional — so gating that edge would trade a requirement for a budget. What is
 * bounded here is *asking the machine for another revision*: the review decision `request_changes`,
 * which is the only thing in the loop that spends a model call and appends a revision. Accept,
 * ignore, and stepping back by hand stay available at every point, which is what keeps the
 * exhausted state a fork rather than a dead end.
 *
 * It lives beside `roundBudgetGate` and reads like it on purpose: the two are the same shape of
 * rule, and the M6 gate's lesson about the round budget — an exhausted budget must *say so*, not
 * simply stop offering a button (D-97) — applies here unchanged.
 */
export function revisionBudgetGate(cyclesUsed: number, budget: number): TransitionResult {
  return cyclesUsed < budget ? allowed() : rejected('REVISION_LIMIT_REACHED');
}
