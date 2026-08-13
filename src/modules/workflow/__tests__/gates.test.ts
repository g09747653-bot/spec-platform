import { describe, expect, it } from 'vitest';

import {
  approvalGate,
  collectGate,
  completionGate,
  interviewGate,
  reviewGate,
  roundBudgetGate,
} from '../gates';
import { SPEC_STAGES } from '../model/stages';
import { satisfiedNeedNames, unmetNeedNames } from '../snapshot';

import { makeSnapshot } from './snapshot-fixtures';

/**
 * Gate predicates in isolation (task 26; task 27; NFR-012 AC-1).
 *
 * Every case invokes a gate with a frozen literal snapshot: there is no database, no network, no
 * model anywhere in scope, and a mutation attempt inside a gate would throw. The matrix suite
 * exercises the same predicates through the table; this file pins their individual contracts.
 */
describe('interviewGate (FR-006)', () => {
  it('permits only the conjunction of all three persisted conditions (AC-1/AC-3)', () => {
    for (const grounding of [false, true]) {
      for (const round of [false, true]) {
        for (const summary of [false, true]) {
          const snapshot = makeSnapshot({
            groundingInputRecorded: grounding,
            summaryPersisted: summary,
            answeredRounds: { interview: round ? 1 : 0 },
          });

          const result = interviewGate(snapshot);

          if (grounding && round && summary) {
            expect(result).toEqual({ allowed: true });
          } else {
            expect(result.allowed).toBe(false);
            if (!result.allowed) {
              expect(result.reason).toBe('INTERVIEW_INCOMPLETE');

              // AC-2: the rejection names every unmet condition, in stable order.
              const expected = [
                ...(grounding ? [] : ['grounding-input' as const]),
                ...(round ? [] : ['answered-round' as const]),
                ...(summary ? [] : ['summary' as const]),
              ];
              expect(result.unmet).toEqual(expected);
            }
          }
        }
      }
    }
  });

  it('is not satisfied by anything an agent could claim (AC-4): only snapshot fields exist', () => {
    // The gate's signature admits a snapshot and nothing else; this pins the three fields it
    // reads. Satisfying everything *except* the summary must refuse — an agent "saying" the
    // interview is complete has no field to say it in.
    const result = interviewGate(
      makeSnapshot({ groundingInputRecorded: true, answeredRounds: { interview: 2 } }),
    );

    expect(result).toMatchObject({ allowed: false, reason: 'INTERVIEW_INCOMPLETE' });
    if (!result.allowed) expect(result.unmet).toEqual(['summary']);
  });
});

describe('collectGate (FR-007 AC-2)', () => {
  it.each(SPEC_STAGES)('for %s: refuses at zero answered rounds, permits at one', (stage) => {
    expect(collectGate(makeSnapshot(), stage)).toMatchObject({
      allowed: false,
      reason: 'NO_ANSWERED_ROUND',
    });

    expect(collectGate(makeSnapshot({ answeredRounds: { [stage]: 1 } }), stage)).toEqual({
      allowed: true,
    });
  });

  it('counts rounds per stage: answers elsewhere do not satisfy this stage', () => {
    const snapshot = makeSnapshot({
      answeredRounds: { interview: 3, constitution: 2, solution: 1 },
    });

    expect(collectGate(snapshot, 'requirements')).toMatchObject({
      allowed: false,
      reason: 'NO_ANSWERED_ROUND',
    });
  });
});

describe('approvalGate (FR-007 AC-3; FR-009)', () => {
  it('requires the latest revision to be approved, not merely an approved history', () => {
    expect(approvalGate(makeSnapshot(), 'constitution')).toMatchObject({
      allowed: false,
      reason: 'SPEC_NOT_APPROVED',
    });

    // A request-changes redraft: approved content exists, but the newest revision awaits its
    // decision — reviewing would show stale content, so the gate holds (FR-009 AC-4/AC-5).
    const redraft = makeSnapshot({ approvedRevisionExists: { constitution: true } });
    expect(approvalGate(redraft, 'constitution')).toMatchObject({
      allowed: false,
      reason: 'SPEC_NOT_APPROVED',
    });

    const approved = makeSnapshot({
      specApproved: { constitution: true },
      approvedRevisionExists: { constitution: true },
    });
    expect(approvalGate(approved, 'constitution')).toEqual({ allowed: true });
  });
});

describe('reviewGate (FR-007 AC-4; FR-010 AC-5)', () => {
  it('waits for an accept-or-ignore decision', () => {
    expect(reviewGate(makeSnapshot(), 'tasks')).toMatchObject({
      allowed: false,
      reason: 'REVIEW_NOT_DECIDED',
    });

    expect(reviewGate(makeSnapshot({ reviewDecided: { tasks: true } }), 'tasks')).toEqual({
      allowed: true,
    });
  });
});

describe('completionGate (FR-020 AC-2)', () => {
  const allCore = {
    constitution: true,
    requirements: true,
    solution: true,
    tasks: true,
  } as const;

  it('permits completion only with an approved revision for every core file', () => {
    expect(completionGate(makeSnapshot({ approvedRevisionExists: allCore }))).toEqual({
      allowed: true,
    });

    for (const missing of ['constitution', 'requirements', 'solution', 'tasks'] as const) {
      const snapshot = makeSnapshot({
        approvedRevisionExists: { ...allCore, [missing]: false },
      });

      expect(completionGate(snapshot)).toMatchObject({ allowed: false, reason: 'SPEC_MISSING' });
    }
  });

  it('does not demand quality.md: the core four are the required set', () => {
    // On the Quality ordering, quality.md's own approval gate already ran before quality.review
    // could be reached; completion is about the parity bundle existing.
    const snapshot = makeSnapshot({
      qualityEnabled: true,
      capabilities: ['quality'],
      approvedRevisionExists: { ...allCore, quality: false },
    });

    expect(completionGate(snapshot)).toEqual({ allowed: true });
  });
});

describe('roundBudgetGate (task 27; FR-005 AC-10; D-2)', () => {
  it('permits below the budget, refuses at it — the fourth round is refused at the default of 3', () => {
    for (const answered of [0, 1, 2]) {
      expect(
        roundBudgetGate(makeSnapshot({ answeredRounds: { interview: answered } }), 'interview'),
      ).toEqual({ allowed: true });
    }

    expect(
      roundBudgetGate(makeSnapshot({ answeredRounds: { interview: 3 } }), 'interview'),
    ).toMatchObject({ allowed: false, reason: 'ROUND_LIMIT_REACHED' });
  });

  it('reads the budget from the snapshot, so configuration alone changes behaviour (AC-2)', () => {
    expect(
      roundBudgetGate(
        makeSnapshot({ roundBudget: 5, answeredRounds: { constitution: 4 } }),
        'constitution',
      ),
    ).toEqual({ allowed: true });

    expect(
      roundBudgetGate(
        makeSnapshot({ roundBudget: 1, answeredRounds: { constitution: 1 } }),
        'constitution',
      ),
    ).toMatchObject({ allowed: false, reason: 'ROUND_LIMIT_REACHED' });
  });

  it('budgets are per stage: exhaustion in one stage leaves another open', () => {
    const snapshot = makeSnapshot({ answeredRounds: { interview: 3 } });

    expect(roundBudgetGate(snapshot, 'interview')).toMatchObject({ allowed: false });
    expect(roundBudgetGate(snapshot, 'constitution')).toEqual({ allowed: true });
  });
});

describe('information-need helpers (FR-005 AC-8/AC-9)', () => {
  it('splits needs by stage and satisfaction', () => {
    const snapshot = makeSnapshot({
      informationNeeds: [
        { stage: 'interview', name: 'target-users', satisfied: true },
        { stage: 'interview', name: 'core-problem', satisfied: false },
        { stage: 'constitution', name: 'principles', satisfied: false },
      ],
    });

    expect(satisfiedNeedNames(snapshot, 'interview')).toEqual(['target-users']);
    expect(unmetNeedNames(snapshot, 'interview')).toEqual(['core-problem']);
    expect(unmetNeedNames(snapshot, 'constitution')).toEqual(['principles']);
    expect(unmetNeedNames(snapshot, 'tasks')).toEqual([]);
  });
});
