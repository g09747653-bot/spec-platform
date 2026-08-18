import type { FeedTail } from './model';

/**
 * Which control is **the** thing to do here — one decision, made once (task 142).
 *
 * The customer sent a screenshot of the tail with three primary buttons in three stacked cards:
 * `Generate`, the door out of the stage, and `Propose change`. Every one of them was defensible on
 * its own — none of the three components knew the other two existed, and `<Button>` without a
 * variant is primary (`ui/button.tsx`). «One primary action per state» is therefore not something a
 * component can be careful about; it is a property of the tail, and the only way to have it is to
 * work it out in one place and hand each surface its answer.
 *
 * **It is a pure function of the position, so it is unit-tested rather than walked.** Everything it
 * reads is already computed: the feed's tail, whether this position drafts, whether a rewrite is
 * owed, and whether the gate held when the page rendered. Nothing here decides what is *allowed* —
 * that is the state machine's, and P1 says so. This decides only which of the allowed things is
 * printed loudest, which is a presentation question and belongs on this side of the boundary.
 *
 * When a milestone adds a surface to the tail — the autonomous driver of task 145 will — it adds a
 * case here. That is the point: the pile comes back the moment the answer is spread out again.
 */
export type TailPrimary =
  | 'mcq-submit'
  | 'stop-generation'
  | 'approve-spec'
  | 'accept-diff'
  | 'review-accept'
  | 'ask-round'
  | 'fallback-submit'
  | 'generate-spec'
  | 'proceed'
  | 'completion-download'
  | null;

export interface TailPrimaryInput {
  tail: FeedTail;
  /** Whether this position drafts a document at all (`substage === 'generate'`). */
  canGenerate: boolean;
  /** Whether the stage still owes the rewrite a review board asked for. */
  revisionOwed: boolean;
  /** Whether the document on screen has been approved — i.e. drafting is behind us. */
  documentApproved: boolean;
  /** Whether this position asks questions, and whether it may ask another round. */
  asking: boolean;
  canAskMore: boolean;
  /** Whether the budget is spent and something is still unanswered. */
  fallbackOffered: boolean;
  /** Whether there is a door out of this position at all. */
  hasTarget: boolean;
}

export function tailPrimary(input: TailPrimaryInput): TailPrimary {
  /*
   * A card holding a decision wins outright. That is P2 rendered: when the machine is waiting on a
   * human, the loudest control on the page is the one that answers it, and nothing else competes.
   */
  switch (input.tail.kind) {
    case 'pending-round':
      return 'mcq-submit';

    /*
     * Stop is promoted from secondary here, and it is not a demotion of anything: during a
     * generation it is the only control that does something. Leaving it quiet while the door out of
     * the stage stayed loud was the tail telling the reader to do the one thing that cannot work.
     */
    case 'generating':
      return 'stop-generation';

    case 'pending-approval':
      return 'approve-spec';

    case 'pending-proposal':
      return 'accept-diff';

    case 'pending-review':
      return 'review-accept';

    case 'sealed':
      return 'completion-download';

    case 'open':
      break;
  }

  // Still collecting: another round, or — once the budget is spent — the direct answer.
  if (input.asking && input.canAskMore) return 'ask-round';
  if (input.fallbackOffered) return 'fallback-submit';

  /*
   * Drafting. A document that does not exist yet, or a rewrite the review asked for, is genuinely
   * the next thing; a document that has been approved is not — and that last case is the one in the
   * screenshot. `Generate` stayed primary over an approved document because `canGenerate` is only
   * «this substage drafts», and approving does not leave the substage. So the door becomes the
   * headline and Generate steps back to being what it now is: a way to write it again.
   */
  if (input.canGenerate && (input.revisionOwed || !input.documentApproved)) return 'generate-spec';

  return input.hasTarget ? 'proceed' : null;
}
