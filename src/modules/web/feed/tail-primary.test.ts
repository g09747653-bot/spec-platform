import { describe, expect, it } from 'vitest';

import { tailPrimary, type TailPrimaryInput } from './tail-primary';

/**
 * One primary action per state, asserted as a table (task 142).
 *
 * A walk can prove there is exactly one loud button on the states it visits; only a table can prove
 * it for the states it does not. This is the table.
 */
const at = (over: Partial<TailPrimaryInput> = {}): TailPrimaryInput => ({
  tail: { kind: 'open' },
  canGenerate: false,
  revisionOwed: false,
  documentApproved: false,
  asking: false,
  canAskMore: false,
  fallbackOffered: false,
  hasTarget: true,
  ...over,
});

describe('which control is the loud one', () => {
  it('a card holding a decision always wins', () => {
    expect(tailPrimary(at({ tail: { kind: 'pending-round', blockId: 'b', roundId: 'r' } }))).toBe(
      'mcq-submit',
    );
    expect(
      tailPrimary(
        at({
          tail: { kind: 'pending-approval', blockId: 'b', specFileId: 'f', revisionNumber: 1 },
        }),
      ),
    ).toBe('approve-spec');
    expect(
      tailPrimary(at({ tail: { kind: 'pending-proposal', blockId: 'b', proposedChangeId: 'p' } })),
    ).toBe('accept-diff');
    expect(tailPrimary(at({ tail: { kind: 'pending-review', blockId: 'b', reviewId: 'v' } }))).toBe(
      'review-accept',
    );
    expect(tailPrimary(at({ tail: { kind: 'sealed', blockId: 'b' } }))).toBe('completion-download');
  });

  it('promotes Stop while a generation is in flight', () => {
    const tail = {
      kind: 'generating' as const,
      blockId: 'b',
      runId: 'run',
      attempt: 1,
      stage: 'constitution',
    };

    // …even at a position that could otherwise offer Generate and a door.
    expect(tailPrimary(at({ tail, canGenerate: true, hasTarget: true }))).toBe('stop-generation');
  });

  it('asks another round while the budget allows, then offers the direct answer', () => {
    expect(tailPrimary(at({ asking: true, canAskMore: true }))).toBe('ask-round');
    expect(tailPrimary(at({ asking: true, canAskMore: false, fallbackOffered: true }))).toBe(
      'fallback-submit',
    );
  });

  it('makes Generate the loud one only while there is something to write', () => {
    expect(tailPrimary(at({ canGenerate: true }))).toBe('generate-spec');
    expect(tailPrimary(at({ canGenerate: true, revisionOwed: true, documentApproved: true }))).toBe(
      'generate-spec',
    );
  });

  /**
   * The customer's screenshot, as an assertion.
   *
   * Approving a document does not leave the `generate` substage, so `canGenerate` stays true and
   * Generate stayed loud over a document that was already written and already approved — beside a
   * door that was the actual next step, and beside a refinement box that was equally loud.
   */
  it('hands the headline to the door once the document is approved', () => {
    expect(tailPrimary(at({ canGenerate: true, documentApproved: true }))).toBe('proceed');
  });

  it('has no loud control at a position with nowhere to go', () => {
    expect(tailPrimary(at({ hasTarget: false }))).toBeNull();
  });
});
