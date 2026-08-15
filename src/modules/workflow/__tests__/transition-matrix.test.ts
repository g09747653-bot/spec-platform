import { afterAll, describe, expect, it } from 'vitest';

import { canAskAnotherRound, canRequestChanges, evaluateTransition } from '../evaluate-transition';
import { GATES } from '../gates';
import {
  ALL_POSITIONS,
  positionKey,
  samePosition,
  SPEC_STAGES,
  type SpecStage,
  type StagePosition,
} from '../model/stages';
import {
  REASON_CODES,
  type InterviewCondition,
  type ReasonCode,
  type TransitionResult,
} from '../reason-codes';
import type { WorkflowSnapshot } from '../snapshot';
import { findTransition, TRANSITION_TABLE, type TransitionEdge } from '../transition-table';

import { makeSnapshot, maximalSnapshotAt, type SnapshotOverrides } from './snapshot-fixtures';

/**
 * The exhaustive transition matrix (task 30; NFR-012 AC-3/AC-4; SC-8).
 *
 * The suite enumerates the table programmatically — it never hand-picks "interesting" pairs:
 *
 * - every ordered pair of positions **not** in the table is refused, under the minimal snapshot
 *   and under maximally satisfied snapshots in both Quality configurations — no state unlocks an
 *   untabled edge;
 * - every row of the table passes under at least one satisfying snapshot and fails with the exact
 *   `ReasonCode` under every unsatisfying variant its gate defines, plus once more from a wrong
 *   position — so each of the 33 edges has both passing and refusing coverage;
 * - both stage orderings and the `complete → quality → complete` re-entry cycle are walked
 *   end to end (FR-007 AC-7; FR-020);
 * - a meta-assertion requires every `ReasonCode` to have been asserted by name at least once, so
 *   the vocabulary cannot silently lose coverage.
 *
 * Backward rows are permitted **unconditionally by requirement** (FR-007 AC-5); their refusing
 * case is the wrong-position attempt, because a same-stage backward move has no gate to fail.
 *
 * Everything here runs on frozen literal snapshots: no database, no model, no UI (NFR-012
 * AC-1/AC-2/AC-5) — a mutation attempt inside the engine would throw, and there is no I/O to
 * perform.
 */

/** Every reason asserted by name lands here; the suite closes by comparing against the full set. */
const assertedReasons = new Set<ReasonCode>();

function expectAllowed(snapshot: WorkflowSnapshot, to: StagePosition): void {
  expect(evaluateTransition(snapshot, to)).toEqual({ allowed: true });
}

function expectRejected(
  snapshot: WorkflowSnapshot,
  to: StagePosition,
  reason: ReasonCode,
  unmet?: readonly InterviewCondition[],
): void {
  const result = evaluateTransition(snapshot, to);

  expect(result.allowed).toBe(false);
  if (result.allowed) return;

  expect(result.reason).toBe(reason);
  if (unmet !== undefined) expect(result.unmet).toEqual(unmet);

  assertedReasons.add(reason);
}

/** A position from which `edge.to` is reachable by no row at all — the wrong-position refusal. */
function wrongFromFor(edge: TransitionEdge): StagePosition {
  const candidate = ALL_POSITIONS.find(
    (position) =>
      !samePosition(position, edge.from) && findTransition(position, edge.to) === undefined,
  );

  if (candidate === undefined) {
    throw new Error(`every position reaches ${positionKey(edge.to)}; the table cannot be right`);
  }

  return candidate;
}

interface FailCase {
  label: string;
  overrides: SnapshotOverrides;
  reason: ReasonCode;
  unmet?: readonly InterviewCondition[];
}

interface PassCase {
  label: string;
  overrides: SnapshotOverrides;
}

/**
 * Per-gate satisfying and violating snapshots. `overrides` omit `position` — the driver pins it
 * to the row's `from`, so the same case description serves every row the gate guards.
 */
const GATE_CASES: Record<
  TransitionEdge['gate'],
  {
    passes: (stage: SpecStage | null) => PassCase[];
    fails: (stage: SpecStage | null) => FailCase[];
  }
> = {
  'interview-exit': {
    passes: () => [
      {
        label: 'grounding input, one answered round, summary',
        overrides: {
          groundingInputRecorded: true,
          summaryPersisted: true,
          answeredRounds: { interview: 1 },
        },
      },
    ],
    fails: () => {
      // Every strict subset of the three conditions, each rejection naming exactly what is unmet
      // (FR-006 AC-1/AC-2).
      const combos: { grounding: boolean; round: boolean; summary: boolean }[] = [];
      for (const grounding of [false, true]) {
        for (const round of [false, true]) {
          for (const summary of [false, true]) {
            if (!(grounding && round && summary)) combos.push({ grounding, round, summary });
          }
        }
      }

      return combos.map(({ grounding, round, summary }) => {
        const unmet: InterviewCondition[] = [];
        if (!grounding) unmet.push('grounding-input');
        if (!round) unmet.push('answered-round');
        if (!summary) unmet.push('summary');

        return {
          label: `missing: ${unmet.join(', ')}`,
          overrides: {
            groundingInputRecorded: grounding,
            summaryPersisted: summary,
            answeredRounds: { interview: round ? 1 : 0 },
          },
          reason: 'INTERVIEW_INCOMPLETE' as const,
          unmet,
        };
      });
    },
  },

  collect: {
    passes: (stage) => [
      {
        label: 'one answered round',
        overrides: { answeredRounds: { [stage ?? 'constitution']: 1 } },
      },
      {
        label: 'budget fully used — the budget gates asking, never generating',
        overrides: { answeredRounds: { [stage ?? 'constitution']: 3 } },
      },
    ],
    fails: (stage) => [
      {
        label: 'no answered round for this stage (rounds elsewhere do not count)',
        overrides: {
          answeredRounds: Object.fromEntries(
            SPEC_STAGES.filter((other) => other !== stage).map((other) => [other, 1]),
          ),
        },
        reason: 'NO_ANSWERED_ROUND',
      },
    ],
  },

  approval: {
    passes: (stage) => [
      {
        label: 'latest revision approved',
        overrides: {
          specApproved: { [stage ?? 'constitution']: true },
          approvedRevisionExists: { [stage ?? 'constitution']: true },
        },
      },
    ],
    fails: (stage) => [
      { label: 'no revision approved', overrides: {}, reason: 'SPEC_NOT_APPROVED' },
      {
        label: 'approved history but the latest revision awaits a decision (FR-009 AC-4)',
        overrides: { approvedRevisionExists: { [stage ?? 'constitution']: true } },
        reason: 'SPEC_NOT_APPROVED',
      },
    ],
  },

  'review-advance': {
    passes: (stage) => [
      {
        label: 'review decided accept-or-ignore',
        overrides: { reviewDecided: { [stage ?? 'constitution']: true } },
      },
    ],
    fails: () => [{ label: 'review undecided', overrides: {}, reason: 'REVIEW_NOT_DECIDED' }],
  },

  backward: {
    // Unconditional by requirement (FR-007 AC-5): the minimal snapshot — nothing satisfied at
    // all — must pass. The refusing case is the wrong-position attempt added for every row.
    passes: () => [{ label: 'minimal snapshot — backward is unconditional', overrides: {} }],
    fails: () => [],
  },

  'tasks-to-complete': {
    passes: () => [
      {
        label: 'quality disabled, tasks review decided, all four core files approved',
        overrides: {
          qualityEnabled: false,
          reviewDecided: { tasks: true },
          approvedRevisionExists: {
            constitution: true,
            requirements: true,
            solution: true,
            tasks: true,
          },
        },
      },
    ],
    fails: () => [
      {
        label: 'quality enabled — the session ordering runs through quality (A2)',
        overrides: {
          qualityEnabled: true,
          capabilities: ['quality'],
          reviewDecided: { tasks: true },
          approvedRevisionExists: {
            constitution: true,
            requirements: true,
            solution: true,
            tasks: true,
          },
        },
        reason: 'TRANSITION_NOT_IN_TABLE',
      },
      {
        label: 'tasks review undecided',
        overrides: {
          approvedRevisionExists: {
            constitution: true,
            requirements: true,
            solution: true,
            tasks: true,
          },
        },
        reason: 'REVIEW_NOT_DECIDED',
      },
      ...SPEC_STAGES.filter(
        (stage): stage is Exclude<SpecStage, 'quality'> => stage !== 'quality',
      ).map((missing) => ({
        label: `approved revision missing for ${missing} (FR-020 AC-2)`,
        overrides: {
          reviewDecided: { tasks: true },
          approvedRevisionExists: {
            constitution: missing !== 'constitution',
            requirements: missing !== 'requirements',
            solution: missing !== 'solution',
            tasks: missing !== 'tasks',
          },
        },
        reason: 'SPEC_MISSING' as const,
      })),
    ],
  },

  'tasks-to-quality': {
    passes: () => [
      {
        label: 'capability registered, quality enabled, tasks review decided',
        overrides: {
          capabilities: ['quality'],
          qualityEnabled: true,
          reviewDecided: { tasks: true },
        },
      },
    ],
    fails: () => [
      {
        label: 'no capability registered — outranks everything else (A6)',
        overrides: { qualityEnabled: true, reviewDecided: { tasks: true } },
        reason: 'CAPABILITY_NOT_REGISTERED',
      },
      {
        label: 'quality not selected — the session ordering is tasks → complete',
        overrides: { capabilities: ['quality'], reviewDecided: { tasks: true } },
        reason: 'TRANSITION_NOT_IN_TABLE',
      },
      {
        label: 'tasks review undecided',
        overrides: { capabilities: ['quality'], qualityEnabled: true },
        reason: 'REVIEW_NOT_DECIDED',
      },
    ],
  },

  'quality-to-complete': {
    passes: () => [
      {
        label: 'quality review decided, core bundle approved',
        overrides: {
          reviewDecided: { quality: true },
          approvedRevisionExists: {
            constitution: true,
            requirements: true,
            solution: true,
            tasks: true,
          },
        },
      },
    ],
    fails: () => [
      {
        label: 'quality review undecided',
        overrides: {
          approvedRevisionExists: {
            constitution: true,
            requirements: true,
            solution: true,
            tasks: true,
          },
        },
        reason: 'REVIEW_NOT_DECIDED',
      },
      {
        label: 'a core file lost its approved revision',
        overrides: {
          reviewDecided: { quality: true },
          approvedRevisionExists: { constitution: true, requirements: true, solution: true },
        },
        reason: 'SPEC_MISSING',
      },
    ],
  },

  'quality-reentry': {
    passes: () => [
      {
        label: 'capability registered and quality enabled — nothing else required (FR-020 AC-5)',
        overrides: { capabilities: ['quality'], qualityEnabled: true },
      },
    ],
    fails: () => [
      {
        label: 'no capability registered',
        overrides: { qualityEnabled: true },
        reason: 'CAPABILITY_NOT_REGISTERED',
      },
      {
        label: 'quality not enabled — the session stays sealed (FR-020 AC-9)',
        overrides: { capabilities: ['quality'] },
        reason: 'SESSION_SEALED',
      },
    ],
  },
};

const specStageOf = (position: StagePosition): SpecStage | null =>
  SPEC_STAGES.find((stage) => stage === position.stage) ?? null;

describe('transition table shape (task 24)', () => {
  it('is a plain enumerable array of 33 rows', () => {
    expect(Array.isArray(TRANSITION_TABLE)).toBe(true);
    expect(TRANSITION_TABLE).toHaveLength(33);
  });

  it('has unique row ids and unique (from, to) pairs', () => {
    const ids = new Set(TRANSITION_TABLE.map((row) => row.id));
    const pairs = new Set(
      TRANSITION_TABLE.map((row) => `${positionKey(row.from)}=>${positionKey(row.to)}`),
    );

    expect(ids.size).toBe(TRANSITION_TABLE.length);
    expect(pairs.size).toBe(TRANSITION_TABLE.length);
  });

  it('references only real positions and registered gates', () => {
    for (const row of TRANSITION_TABLE) {
      expect(ALL_POSITIONS.some((position) => samePosition(position, row.from))).toBe(true);
      expect(ALL_POSITIONS.some((position) => samePosition(position, row.to))).toBe(true);
      expect(GATES[row.gate]).toBeTypeOf('function');
    }
  });

  it('defines exactly one exit from complete: the quality re-entry (FR-007 AC-8)', () => {
    const fromComplete = TRANSITION_TABLE.filter((row) => row.from.stage === 'complete');

    expect(fromComplete).toHaveLength(1);
    expect(fromComplete[0]?.to).toEqual({ stage: 'quality', substage: 'collect' });
  });

  it('contains no self-transition', () => {
    expect(TRANSITION_TABLE.some((row) => samePosition(row.from, row.to))).toBe(false);
  });
});

describe('every untabled pair is refused, under any state (task 30; NFR-012 AC-3)', () => {
  const untabled: [StagePosition, StagePosition][] = [];

  for (const from of ALL_POSITIONS) {
    for (const to of ALL_POSITIONS) {
      if (findTransition(from, to) === undefined) untabled.push([from, to]);
    }
  }

  it('covers the full cross product: 17 × 17 = 33 legal + 256 illegal pairs', () => {
    expect(ALL_POSITIONS).toHaveLength(17);
    expect(untabled).toHaveLength(17 * 17 - TRANSITION_TABLE.length);
  });

  it.each(untabled.map(([from, to]) => [positionKey(from), positionKey(to), from, to] as const))(
    'refuses %s -> %s under minimal and maximal snapshots',
    (_fromKey, _toKey, from, to) => {
      const reason: ReasonCode =
        from.stage === 'complete' ? 'SESSION_SEALED' : 'TRANSITION_NOT_IN_TABLE';

      const snapshots = [
        makeSnapshot({ position: from }),
        maximalSnapshotAt(from, { enabled: false, registered: true }),
        maximalSnapshotAt(from, { enabled: true, registered: true }),
      ];

      for (const snapshot of snapshots) {
        expectRejected(snapshot, to, reason);
      }
    },
  );
});

describe('every table row has passing and refusing coverage (task 30)', () => {
  it.each(TRANSITION_TABLE.map((row) => [row.id, row] as const))('%s', (_id, row) => {
    const stage = specStageOf(row.from);
    const cases = GATE_CASES[row.gate];

    const passes = cases.passes(stage);
    expect(passes.length).toBeGreaterThanOrEqual(1);

    for (const pass of passes) {
      expectAllowed(makeSnapshot({ ...pass.overrides, position: row.from }), row.to);
    }

    for (const fail of cases.fails(stage)) {
      expectRejected(
        makeSnapshot({ ...fail.overrides, position: row.from }),
        row.to,
        fail.reason,
        fail.unmet,
      );
    }

    // The wrong-position refusal: the same target, attempted from a position with no row to it.
    // For unconditional backward rows this is the refusing case; for gated rows it is one more.
    const wrongFrom = wrongFromFor(row);
    expectRejected(
      maximalSnapshotAt(wrongFrom, { enabled: true, registered: true }),
      row.to,
      wrongFrom.stage === 'complete' ? 'SESSION_SEALED' : 'TRANSITION_NOT_IN_TABLE',
    );
  });
});

describe('stage orderings walked end to end (NFR-012 AC-3; FR-007 AC-7)', () => {
  /** A mutable world the walk advances through; every step re-evaluates a frozen snapshot. */
  function walker(initial: SnapshotOverrides) {
    let state: SnapshotOverrides = { ...initial, position: { stage: 'interview', substage: null } };

    return {
      set(patch: SnapshotOverrides) {
        state = {
          ...state,
          ...patch,
          answeredRounds: { ...state.answeredRounds, ...patch.answeredRounds },
          specApproved: { ...state.specApproved, ...patch.specApproved },
          approvedRevisionExists: {
            ...state.approvedRevisionExists,
            ...patch.approvedRevisionExists,
          },
          reviewDecided: { ...state.reviewDecided, ...patch.reviewDecided },
        };
      },
      at(position: StagePosition) {
        state = { ...state, position };
      },
      snapshot(): WorkflowSnapshot {
        return makeSnapshot(state);
      },
      advance(to: StagePosition) {
        expectAllowed(makeSnapshot(state), to);
        state = { ...state, position: to };
      },
      refuse(to: StagePosition, reason: ReasonCode, unmet?: readonly InterviewCondition[]) {
        expectRejected(makeSnapshot(state), to, reason, unmet);
      },
    };
  }

  /** Interview through the four core stages, gating and then satisfying each gate in turn. */
  function walkCoreStages(walk: ReturnType<typeof walker>) {
    walk.refuse({ stage: 'constitution', substage: 'collect' }, 'INTERVIEW_INCOMPLETE', [
      'grounding-input',
      'answered-round',
      'summary',
    ]);
    walk.set({
      groundingInputRecorded: true,
      summaryPersisted: true,
      answeredRounds: { interview: 1 },
    });
    walk.advance({ stage: 'constitution', substage: 'collect' });

    for (const stage of ['constitution', 'requirements', 'solution', 'tasks'] as const) {
      walk.refuse({ stage, substage: 'generate' }, 'NO_ANSWERED_ROUND');
      walk.set({ answeredRounds: { [stage]: 1 } });
      walk.advance({ stage, substage: 'generate' });

      // Backward and forward again: re-asking is always open (FR-007 AC-5).
      walk.advance({ stage, substage: 'collect' });
      walk.advance({ stage, substage: 'generate' });

      walk.refuse({ stage, substage: 'review' }, 'SPEC_NOT_APPROVED');
      walk.set({
        specApproved: { [stage]: true },
        approvedRevisionExists: { [stage]: true },
      });
      walk.advance({ stage, substage: 'review' });

      const next =
        stage === 'constitution'
          ? ({ stage: 'requirements', substage: 'collect' } as const)
          : stage === 'requirements'
            ? ({ stage: 'solution', substage: 'collect' } as const)
            : stage === 'solution'
              ? ({ stage: 'tasks', substage: 'collect' } as const)
              : null;

      if (next !== null) {
        walk.refuse(next, 'REVIEW_NOT_DECIDED');
        walk.set({ reviewDecided: { [stage]: true } });
        walk.advance(next);
      }
    }
  }

  it('quality disabled: … → tasks → complete, and quality is unreachable', () => {
    const walk = walker({ qualityEnabled: false, capabilities: [] });

    walkCoreStages(walk);

    // At tasks.review. Quality is neither installed nor selected.
    walk.refuse({ stage: 'quality', substage: 'collect' }, 'CAPABILITY_NOT_REGISTERED');
    walk.refuse({ stage: 'complete', substage: null }, 'REVIEW_NOT_DECIDED');
    walk.set({ reviewDecided: { tasks: true } });

    // Even with the capability installed, an unselected quality stage is not this session's path.
    walk.set({ capabilities: ['quality'] });
    walk.refuse({ stage: 'quality', substage: 'collect' }, 'TRANSITION_NOT_IN_TABLE');
    walk.set({ capabilities: [] });

    walk.advance({ stage: 'complete', substage: null });

    // Sealed: every movement out of complete is refused (FR-020 AC-9). The quality target reads
    // CAPABILITY_NOT_REGISTERED here because the module is absent — the seal reason appears once
    // the capability exists but the selection does not.
    walk.refuse({ stage: 'interview', substage: null }, 'SESSION_SEALED');
    walk.refuse({ stage: 'tasks', substage: 'review' }, 'SESSION_SEALED');
    walk.refuse({ stage: 'quality', substage: 'collect' }, 'CAPABILITY_NOT_REGISTERED');
    walk.set({ capabilities: ['quality'] });
    walk.refuse({ stage: 'quality', substage: 'collect' }, 'SESSION_SEALED');
  });

  it('quality enabled: … → tasks → quality → complete, and skipping quality is refused', () => {
    const walk = walker({ qualityEnabled: true, capabilities: ['quality'] });

    walkCoreStages(walk);

    walk.set({ reviewDecided: { tasks: true } });

    // The parity exit contradicts the enabled ordering (A2) — refused as not-in-table for this
    // session.
    walk.refuse({ stage: 'complete', substage: null }, 'TRANSITION_NOT_IN_TABLE');

    walk.advance({ stage: 'quality', substage: 'collect' });

    walk.refuse({ stage: 'quality', substage: 'generate' }, 'NO_ANSWERED_ROUND');
    walk.set({ answeredRounds: { quality: 1 } });
    walk.advance({ stage: 'quality', substage: 'generate' });

    walk.refuse({ stage: 'quality', substage: 'review' }, 'SPEC_NOT_APPROVED');
    walk.set({ specApproved: { quality: true }, approvedRevisionExists: { quality: true } });
    walk.advance({ stage: 'quality', substage: 'review' });

    walk.refuse({ stage: 'complete', substage: null }, 'REVIEW_NOT_DECIDED');
    walk.set({ reviewDecided: { quality: true } });
    walk.advance({ stage: 'complete', substage: null });
  });

  it('re-enters complete → quality → complete repeatedly (FR-020 AC-5/AC-7/AC-10)', () => {
    const walk = walker({
      qualityEnabled: true,
      capabilities: ['quality'],
      groundingInputRecorded: true,
      summaryPersisted: true,
      answeredRounds: { interview: 1, quality: 1 },
      specApproved: { quality: true },
      approvedRevisionExists: {
        constitution: true,
        requirements: true,
        solution: true,
        tasks: true,
        quality: true,
      },
      reviewDecided: { quality: true },
    });
    walk.at({ stage: 'complete', substage: null });

    for (let lap = 1; lap <= 2; lap += 1) {
      walk.advance({ stage: 'quality', substage: 'collect' });
      walk.advance({ stage: 'quality', substage: 'generate' });
      walk.advance({ stage: 'quality', substage: 'review' });
      walk.advance({ stage: 'complete', substage: null });
    }

    // Disabling from complete changes export mode only — the state machine stays sealed
    // (FR-020 AC-8/AC-9): with the selection off, even the quality door is closed.
    walk.set({ qualityEnabled: false });
    walk.refuse({ stage: 'quality', substage: 'collect' }, 'SESSION_SEALED');
  });
});

describe('round budget (task 27; FR-005 AC-10)', () => {
  it('permits rounds below the budget and refuses at it, per stage', () => {
    const snapshot = makeSnapshot({ answeredRounds: { interview: 3, constitution: 2 } });

    expect(canAskAnotherRound(snapshot, 'interview')).toMatchObject({
      allowed: false,
      reason: 'ROUND_LIMIT_REACHED',
    });
    assertedReasons.add('ROUND_LIMIT_REACHED');
    expect(canAskAnotherRound(snapshot, 'constitution')).toEqual({ allowed: true });
    expect(canAskAnotherRound(snapshot, 'requirements')).toEqual({ allowed: true });
  });

  it('honours a reconfigured budget with no code change (task 27 AC-2)', () => {
    const widened = makeSnapshot({ roundBudget: 5, answeredRounds: { interview: 3 } });
    expect(canAskAnotherRound(widened, 'interview')).toEqual({ allowed: true });

    const narrowed = makeSnapshot({ roundBudget: 1, answeredRounds: { interview: 1 } });
    expect(canAskAnotherRound(narrowed, 'interview')).toMatchObject({
      allowed: false,
      reason: 'ROUND_LIMIT_REACHED',
    });
  });
});

describe('revision-cycle budget (task 113; Эталон §1.3)', () => {
  it('permits a cycle below the budget and refuses at it', () => {
    expect(canRequestChanges(0, 5)).toEqual({ allowed: true });
    expect(canRequestChanges(4, 5)).toEqual({ allowed: true });
    expect(canRequestChanges(5, 5)).toMatchObject({
      allowed: false,
      reason: 'REVISION_LIMIT_REACHED',
    });
    assertedReasons.add('REVISION_LIMIT_REACHED');
  });

  it('honours a reconfigured budget with no code change', () => {
    expect(canRequestChanges(5, 8)).toEqual({ allowed: true });
    expect(canRequestChanges(1, 1)).toMatchObject({ allowed: false });
  });

  /**
   * The loop needs no row of its own, and this is the assertion that says so out loud.
   *
   * `review → generate` already exists as a **backward** row, and backward movement inside a stage
   * is unconditional by requirement (FR-007 AC-5; constitution A2). Bounding the loop by gating that
   * edge would have traded a requirement for a budget — so the bound sits on the `request_changes`
   * decision instead, and the table is exactly the 33 rows it was. The matrix above still covers
   * every one of them, which is the M2 rule holding rather than being re-derived.
   */
  it('adds no row to the table: the cycle is made of edges that already exist', () => {
    expect(TRANSITION_TABLE).toHaveLength(33);

    for (const stage of ['constitution', 'requirements', 'solution', 'tasks'] as const) {
      const back = findTransition({ stage, substage: 'review' }, { stage, substage: 'generate' });
      const forward = findTransition(
        { stage, substage: 'generate' },
        { stage, substage: 'review' },
      );

      expect(back?.gate).toBe('backward');
      expect(forward?.gate).toBe('approval');
    }
  });

  it('leaves the backward edge unconditional however many cycles have been spent', () => {
    // The minimal snapshot — nothing satisfied, no notion of a budget anywhere in it.
    expectAllowed(makeSnapshot({ position: { stage: 'constitution', substage: 'review' } }), {
      stage: 'constitution',
      substage: 'generate',
    });
  });
});

describe('engine purity (NFR-012 AC-1)', () => {
  it('every gate is synchronous over a frozen snapshot — no promise, no mutation', () => {
    const snapshot = maximalSnapshotAt(
      { stage: 'tasks', substage: 'review' },
      {
        enabled: true,
        registered: true,
      },
    );

    for (const row of TRANSITION_TABLE) {
      const result: TransitionResult = GATES[row.gate](snapshot, row);
      expect(result).not.toBeInstanceOf(Promise);
      expect(typeof result.allowed).toBe('boolean');
    }
  });
});

afterAll(() => {
  // The meta-assertion of task 30: every ReasonCode has been asserted by name at least once.
  expect([...assertedReasons].sort()).toEqual([...REASON_CODES].sort());
});
