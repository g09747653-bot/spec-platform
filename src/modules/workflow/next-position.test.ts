import { describe, expect, it } from 'vitest';

import { maximalSnapshotAt, makeSnapshot } from './__tests__/snapshot-fixtures';
import { evaluateTransition } from './evaluate-transition';
import { ALL_POSITIONS, positionKey, samePosition, type StagePosition } from './model/stages';
import { nextPosition } from './next-position';
import type { WorkflowSnapshot } from './snapshot';
import { findTransition } from './transition-table';

/**
 * Task 78 — the forward map the interface draws its one door from.
 *
 * The property that matters is not which position it names but that the engine agrees the pair is a
 * movement at all: a door for an edge no table row defines is a button whose only possible outcome
 * is a confusing rejection. So the first test is a loop over every position rather than a list of
 * examples.
 */
describe('nextPosition (task 78)', () => {
  const at = (
    position: StagePosition,
    quality: { qualityEnabled?: boolean; capabilities?: readonly 'quality'[] } = {},
  ): WorkflowSnapshot =>
    makeSnapshot({
      position,
      qualityEnabled: quality.qualityEnabled ?? false,
      capabilities: quality.capabilities ?? [],
    });

  it('never names a movement the transition table does not define', () => {
    for (const position of ALL_POSITIONS) {
      for (const qualityEnabled of [false, true]) {
        for (const capabilities of [[], ['quality'] as const]) {
          const snapshot = at(position, { qualityEnabled, capabilities });
          const to = nextPosition(snapshot);

          if (to === null) continue;

          expect(
            findTransition(position, to),
            `${positionKey(position)} → ${positionKey(to)} is not a row of the table`,
          ).toBeDefined();
        }
      }
    }
  });

  describe('the ordinary sequence', () => {
    it('leaves the interview for the constitution', () => {
      expect(nextPosition(at({ stage: 'interview', substage: null }))).toEqual({
        stage: 'constitution',
        substage: 'collect',
      });
    });

    it('runs collect → generate → review inside a stage', () => {
      expect(nextPosition(at({ stage: 'requirements', substage: 'collect' }))).toEqual({
        stage: 'requirements',
        substage: 'generate',
      });
      expect(nextPosition(at({ stage: 'requirements', substage: 'generate' }))).toEqual({
        stage: 'requirements',
        substage: 'review',
      });
    });

    it('carries a decided review into the next stage, in parity order', () => {
      const order = [
        ['constitution', 'requirements'],
        ['requirements', 'solution'],
        ['solution', 'tasks'],
      ] as const;

      for (const [from, to] of order) {
        expect(nextPosition(at({ stage: from, substage: 'review' }))).toEqual({
          stage: to,
          substage: 'collect',
        });
      }
    });
  });

  describe('the fork out of tasks.review (FR-007 AC-7; FR-013 AC-4/AC-5)', () => {
    const tasksReview = { stage: 'tasks', substage: 'review' } as const;

    it('goes to complete when Quality is not selected', () => {
      expect(
        nextPosition(at(tasksReview, { qualityEnabled: false, capabilities: ['quality'] })),
      ).toEqual({ stage: 'complete', substage: null });
    });

    it('goes to complete when Quality is selected but no module is installed', () => {
      // The selection alone must not point at a stage that cannot run (A6).
      expect(nextPosition(at(tasksReview, { qualityEnabled: true, capabilities: [] }))).toEqual({
        stage: 'complete',
        substage: null,
      });
    });

    it('detours through quality when both the module and the selection are there', () => {
      expect(
        nextPosition(at(tasksReview, { qualityEnabled: true, capabilities: ['quality'] })),
      ).toEqual({ stage: 'quality', substage: 'collect' });
    });
  });

  describe('the sealed state (FR-020 AC-9)', () => {
    const complete = { stage: 'complete', substage: null } as const;

    it('offers no door at all when Quality is not the way on', () => {
      expect(
        nextPosition(at(complete, { qualityEnabled: false, capabilities: ['quality'] })),
      ).toBeNull();
      expect(nextPosition(at(complete, { qualityEnabled: true, capabilities: [] }))).toBeNull();
      expect(nextPosition(at(complete, { qualityEnabled: false, capabilities: [] }))).toBeNull();
    });

    /*
     * `null` rather than a position the gate would refuse: a disabled button that says what is
     * missing is right everywhere else in the session, and wrong here. Nothing is missing — the
     * session is finished, and the interface should say so rather than imply a way onward.
     */
    it('offers the quality re-entry when both are there, and the engine allows it', () => {
      const snapshot = maximalSnapshotAt(complete, { enabled: true, registered: true });
      const to = nextPosition(snapshot);

      expect(to).toEqual({ stage: 'quality', substage: 'collect' });
      expect(to !== null && evaluateTransition(snapshot, to).allowed).toBe(true);
    });

    it('closes the cycle from quality.review back to complete (FR-020 AC-7)', () => {
      expect(
        nextPosition(at({ stage: 'quality', substage: 'review' }, { qualityEnabled: true })),
      ).toEqual({ stage: 'complete', substage: null });
    });
  });

  /*
   * The other half of "never names a movement the table refuses": the door must not vanish where a
   * legal forward movement exists. A position with an outgoing non-backward row must produce one.
   */
  it('offers a door wherever a forward row exists', () => {
    for (const position of ALL_POSITIONS) {
      const snapshot = at(position, { qualityEnabled: true, capabilities: ['quality'] });
      const forward = ALL_POSITIONS.some((candidate) => {
        const row = findTransition(position, candidate);
        return row !== undefined && row.gate !== 'backward';
      });

      if (!forward) continue;

      expect(
        nextPosition(snapshot),
        `${positionKey(position)} has a forward row but no door`,
      ).not.toBeNull();
    }
  });

  it('is a forward map: the target is never the position it was asked about', () => {
    for (const position of ALL_POSITIONS) {
      const to = nextPosition(at(position, { qualityEnabled: true, capabilities: ['quality'] }));
      if (to === null) continue;

      expect(samePosition(position, to)).toBe(false);
    }
  });
});
