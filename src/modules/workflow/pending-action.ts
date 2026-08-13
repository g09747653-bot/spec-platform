import { z } from 'zod';

/**
 * The persisted pending-action vocabulary (`workflow_state.pending_action`; FR-017 AC-3/AC-4).
 *
 * `workflow` owns the column, so it owns the shapes stored in it. Milestone 2 stores one kind —
 * the presented question round awaiting submission; spec/diff/review decisions keep being
 * re-derived from their own tables until their milestones wire richer kinds in.
 *
 * Readers parse, never assume: the column is `jsonb`, and a shape this module does not recognise
 * reads as "no pending round" rather than as a crash — fail closed, ask again.
 */
export const PendingQuestionRound = z.object({
  kind: z.literal('question-round'),
  roundId: z.uuid(),
});

export type PendingQuestionRoundAction = z.infer<typeof PendingQuestionRound>;

export function pendingQuestionRound(roundId: string): PendingQuestionRoundAction {
  return { kind: 'question-round', roundId };
}

/** The pending round's id, or `null` when the pending action is absent or of another kind. */
export function pendingRoundId(pendingAction: unknown): string | null {
  const parsed = PendingQuestionRound.safeParse(pendingAction);
  return parsed.success ? parsed.data.roundId : null;
}
