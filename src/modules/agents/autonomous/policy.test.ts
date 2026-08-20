import { describe, expect, it } from 'vitest';

import {
  countSeedWords,
  MAX_FRUITLESS_ASKS,
  MAX_IDLE_STEPS,
  MIN_SEED_WORDS,
  nextMove,
  type AutonomousSituation,
} from './policy';

/**
 * The driver's whole decision, as a table (task 145).
 *
 * The same argument `tail-primary.test.ts` makes about the loud button: a live run can prove the
 * driver walks a healthy session, and only a table can prove what it does at the positions a healthy
 * session never reaches. Those are the positions that matter here — a hostile seed, a spent budget,
 * a loop — because every one of them is a way for an autonomous run to become something nobody asked
 * for, and none of them is reachable from a walk.
 */
const at = (over: Partial<AutonomousSituation> = {}): AutonomousSituation => ({
  seedWords: 12,
  sealed: false,
  generationInFlight: null,
  pending: null,
  asking: false,
  canAskMore: false,
  canGenerate: false,
  documentApproved: false,
  revisionOwed: false,
  target: { toStage: 'constitution', toSubstage: 'collect', ready: true },
  steps: 0,
  stepBudget: 200,
  idleSteps: 0,
  fruitlessAsks: 0,
  ...over,
});

describe('the endings, which are checked before anything else', () => {
  it('a sealed session is a finished run, whatever else is true of it', () => {
    expect(
      nextMove(at({ sealed: true, pending: { kind: 'question-round', roundId: 'r' } })),
    ).toEqual({ kind: 'stop', reason: 'completed' });
  });

  it('a seed too thin to answer an interview from stops the run rather than inventing a product', () => {
    expect(nextMove(at({ seedWords: MIN_SEED_WORDS - 1 }))).toEqual({
      kind: 'stop',
      reason: 'seed-too-thin',
    });

    expect(nextMove(at({ seedWords: MIN_SEED_WORDS }))).not.toEqual({
      kind: 'stop',
      reason: 'seed-too-thin',
    });
  });

  it('the step ceiling ends the run — a backstop that fires before the work does', () => {
    expect(nextMove(at({ steps: 200, stepBudget: 200 }))).toEqual({
      kind: 'stop',
      reason: 'step-budget',
    });
  });

  it('two steps that changed nothing is a loop, and a loop is an ending', () => {
    expect(nextMove(at({ idleSteps: MAX_IDLE_STEPS }))).toEqual({
      kind: 'stop',
      reason: 'stalled',
    });
    expect(nextMove(at({ idleSteps: MAX_IDLE_STEPS - 1 }))).not.toEqual({
      kind: 'stop',
      reason: 'stalled',
    });
  });

  /**
   * Asked three times, drafted nothing three times (task 170).
   *
   * The ending is `needs-unanswered` and not `stalled`, and the difference is the whole point: the
   * driver was not walking in circles, it was asking honestly and being given nothing — which is the
   * fallback panel's state, where a person supplies what the model could not extract.
   */
  it('an interviewer that keeps drafting nothing ends the run, naming what is missing', () => {
    const asking = { asking: true, canAskMore: true, target: null };

    expect(nextMove(at({ ...asking, fruitlessAsks: MAX_FRUITLESS_ASKS }))).toEqual({
      kind: 'stop',
      reason: 'needs-unanswered',
    });
    expect(nextMove(at({ ...asking, fruitlessAsks: MAX_FRUITLESS_ASKS - 1 }))).toEqual({
      kind: 'ask-round',
    });
  });
});

describe('what the driver presses, in the order a person would', () => {
  it('drains a run already in flight before anything else, because nothing else can start', () => {
    expect(
      nextMove(
        at({
          generationInFlight: { runId: 'run-1' },
          pending: { kind: 'question-round', roundId: 'r' },
        }),
      ),
    ).toEqual({ kind: 'await-generation', runId: 'run-1' });
  });

  it('answers the round on screen', () => {
    expect(nextMove(at({ pending: { kind: 'question-round', roundId: 'r-9' } }))).toEqual({
      kind: 'answer-round',
      roundId: 'r-9',
    });
  });

  it('approves the draft on screen', () => {
    expect(
      nextMove(at({ pending: { kind: 'spec', specFileId: 'f-1', revisionNumber: 3 } })),
    ).toEqual({ kind: 'approve-spec', specFileId: 'f-1', revisionNumber: 3 });
  });

  it('asks another round while the door is shut and the budget allows one', () => {
    expect(
      nextMove(
        at({
          asking: true,
          canAskMore: true,
          target: { toStage: 'constitution', toSubstage: 'collect', ready: false },
        }),
      ),
    ).toEqual({ kind: 'ask-round' });
  });

  it('stops asking the moment the gate opens, however much budget is left', () => {
    expect(nextMove(at({ asking: true, canAskMore: true }))).toEqual({
      kind: 'proceed',
      toStage: 'constitution',
      toSubstage: 'collect',
    });
  });

  it('drafts a document that does not exist, and redrafts one a board sent back', () => {
    expect(nextMove(at({ canGenerate: true, documentApproved: false }))).toEqual({
      kind: 'generate',
    });

    expect(nextMove(at({ canGenerate: true, documentApproved: true, revisionOwed: true }))).toEqual(
      { kind: 'generate' },
    );
  });

  it('does not redraft an approved document nothing was asked about', () => {
    expect(
      nextMove(at({ canGenerate: true, documentApproved: true, revisionOwed: false })),
    ).toEqual({ kind: 'proceed', toStage: 'constitution', toSubstage: 'collect' });
  });

  it('walks through a door whose gate holds', () => {
    expect(
      nextMove(at({ target: { toStage: 'requirements', toSubstage: 'collect', ready: true } })),
    ).toEqual({ kind: 'proceed', toStage: 'requirements', toSubstage: 'collect' });
  });
});

describe('the review decision, which is code and not judgement', () => {
  const board = (over: { hasBlocking: boolean; cyclesLeft: number }) =>
    at({ pending: { kind: 'review', reviewId: 'rv-1', ...over } });

  it('sends a blocked board back while there is rewrite budget', () => {
    expect(nextMove(board({ hasBlocking: true, cyclesLeft: 5 }))).toEqual({
      kind: 'decide-review',
      reviewId: 'rv-1',
      decision: 'request_changes',
    });
  });

  it('accepts a board with nothing blocking', () => {
    expect(nextMove(board({ hasBlocking: false, cyclesLeft: 5 }))).toEqual({
      kind: 'decide-review',
      reviewId: 'rv-1',
      decision: 'accept',
    });
  });

  /*
   * The bound the AC names, read the only way that terminates: «until Pass» is not a licence to
   * loop. A file whose budget is spent is accepted with its findings intact, which is what stops the
   * four stages of a bundle from becoming twenty rewrites.
   */
  it('accepts a board it cannot send back again, rather than trying', () => {
    expect(nextMove(board({ hasBlocking: true, cyclesLeft: 0 }))).toEqual({
      kind: 'decide-review',
      reviewId: 'rv-1',
      decision: 'accept',
    });
  });
});

describe('the two states the driver refuses to resolve', () => {
  /*
   * Sovereignty read in the direction that costs the driver something. A pending diff blocks the
   * whole session, so deciding it would be the cheapest way to keep going — and it would be the
   * driver answering a question that was addressed to a person.
   */
  it('will not decide a refinement a person proposed', () => {
    expect(nextMove(at({ pending: { kind: 'diff', proposedChangeId: 'pc-1' } }))).toEqual({
      kind: 'stop',
      reason: 'human-decision-pending',
    });
  });

  it('will not answer its own unmet needs after the round budget is spent', () => {
    expect(
      nextMove(
        at({
          asking: true,
          canAskMore: false,
          target: { toStage: 'constitution', toSubstage: 'collect', ready: false },
        }),
      ),
    ).toEqual({ kind: 'stop', reason: 'needs-unanswered' });
  });

  it('stops rather than pressing a door it has already been told will not open', () => {
    expect(
      nextMove(at({ target: { toStage: 'complete', toSubstage: null, ready: false } })),
    ).toEqual({ kind: 'stop', reason: 'gate-refused' });

    expect(nextMove(at({ target: null }))).toEqual({ kind: 'stop', reason: 'gate-refused' });
  });
});

describe('counting the seed', () => {
  it('counts words, not characters, and treats whitespace of any shape as one gap', () => {
    expect(countSeedWords('')).toBe(0);
    expect(countSeedWords('   \n  ')).toBe(0);
    expect(countSeedWords('a todo app')).toBe(3);
    expect(countSeedWords('  a\ttool\nthat  tracks grants ')).toBe(5);
  });

  /* A wall of one word is still one word: length is not evidence of intent. */
  it('does not mistake a long single token for a description', () => {
    expect(countSeedWords('a'.repeat(400))).toBe(1);
  });
});
