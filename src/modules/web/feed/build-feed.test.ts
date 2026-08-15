import { describe, expect, it } from 'vitest';

import { buildFeed } from './build-feed';
import { appendChatTurns } from './chat-turns';
import type { FeedBlock, FeedQuestion } from './model';
import type {
  FeedSource,
  FeedSourceProposal,
  FeedSourceReview,
  FeedSourceRevision,
  FeedSourceRound,
  FeedSourceRun,
} from './source';

/**
 * The feed projection (task 104).
 *
 * Every claim the task makes is asserted here against literals rather than against a database,
 * because that is the point of a projection being pure: the fixtures below are the states the M6
 * gate walks through, written out, and a change that moves a block or renames an id fails here
 * rather than at a customer's session.
 */

const T = {
  created: '2026-08-15T09:00:00.000Z',
  round1: '2026-08-15T09:01:00.000Z',
  answered1: '2026-08-15T09:02:00.000Z',
  round2: '2026-08-15T09:03:00.000Z',
  answered2: '2026-08-15T09:04:00.000Z',
  run: '2026-08-15T09:05:00.000Z',
  revision: '2026-08-15T09:06:00.000Z',
  review: '2026-08-15T09:07:00.000Z',
  decided: '2026-08-15T09:08:00.000Z',
  revision2: '2026-08-15T09:09:00.000Z',
} as const;

const QUESTIONS: readonly FeedQuestion[] = [
  {
    id: 'q-audience',
    text: 'Who is this for?',
    type: 'single',
    options: [
      { id: 'solo-devs', label: 'Solo developers', description: 'One person, many projects' },
      { id: 'teams', label: 'Small teams', recommended: true },
    ],
    allowOther: true,
    required: true,
  },
];

function source(overrides: Partial<FeedSource> = {}): FeedSource {
  return {
    session: {
      sessionId: 'session-1',
      projectId: 'project-1',
      projectName: 'Local Voice Assistant',
      initialPrompt: 'A voice assistant that runs on my laptop',
      summary: null,
      createdAt: T.created,
      position: { stage: 'interview', substage: null },
      completionCount: 0,
      ...overrides.session,
    },
    rounds: overrides.rounds ?? [],
    runs: overrides.runs ?? [],
    revisions: overrides.revisions ?? [],
    reviews: overrides.reviews ?? [],
    proposals: overrides.proposals ?? [],
  };
}

const round = (over: Partial<FeedSourceRound> = {}): FeedSourceRound => ({
  roundId: 'r1',
  stage: 'interview',
  roundNumber: 1,
  presentedAt: T.round1,
  questions: QUESTIONS,
  answers: [],
  answeredAt: null,
  ...over,
});

const run = (over: Partial<FeedSourceRun> = {}): FeedSourceRun => ({
  runId: 'run-1',
  stage: 'constitution',
  status: 'running',
  attempt: 1,
  createdAt: T.run,
  ...over,
});

const revision = (over: Partial<FeedSourceRevision> = {}): FeedSourceRevision => ({
  revisionId: 'rev-1',
  specFileId: 'file-constitution',
  specType: 'constitution',
  fileName: 'constitution.md',
  revisionNumber: 1,
  approved: false,
  createdAt: T.revision,
  ...over,
});

const review = (over: Partial<FeedSourceReview> = {}): FeedSourceReview => ({
  reviewId: 'review-1',
  specFileId: 'file-constitution',
  specType: 'constitution',
  revisionNumber: 1,
  outcome: 'needs_revision',
  summary: 'The document holds together, but its scope is stated without a boundary.',
  items: [
    {
      id: 'item-1',
      sectionPath: 'Scope',
      title: 'No non-goals',
      body: 'The scope section names no non-goals.',
      suggestion: 'Add a non-goals list.',
      confidence: 8,
      severity: 'blocking',
      source: 'model',
    },
  ],
  decision: null,
  selectedItemIds: null,
  createdAt: T.review,
  decidedAt: null,
  ...over,
});

const proposal = (over: Partial<FeedSourceProposal> = {}): FeedSourceProposal => ({
  proposedChangeId: 'proposal-1',
  specFileId: 'file-constitution',
  fileName: 'constitution.md',
  instruction: 'Tighten the scope section',
  status: 'pending',
  createdAt: T.revision2,
  ...over,
});

const kinds = (blocks: readonly FeedBlock[]): string[] => blocks.map((block) => block.kind);
const ids = (blocks: readonly FeedBlock[]): string[] => blocks.map((block) => block.id);

/** A session that has walked the whole constitution stage and is sitting on its review board. */
function walkedToReview(): FeedSource {
  return source({
    session: {
      sessionId: 'session-1',
      projectId: 'project-1',
      projectName: 'Local Voice Assistant',
      initialPrompt: 'A voice assistant that runs on my laptop',
      summary: 'The user wants an offline assistant.',
      createdAt: T.created,
      position: { stage: 'constitution', substage: 'review' },
      completionCount: 0,
    },
    rounds: [
      round({ answers: [], answeredAt: T.answered1 }),
      round({
        roundId: 'r2',
        stage: 'constitution',
        presentedAt: T.round2,
        answeredAt: T.answered2,
      }),
    ],
    runs: [run({ status: 'complete' })],
    revisions: [revision({ approved: true })],
    reviews: [review()],
  });
}

describe('the feed is a pure projection', () => {
  it('is a function of its source alone: the same state builds the identical feed', () => {
    const state = walkedToReview();

    expect(buildFeed(state)).toEqual(buildFeed(state));
    // …and of an equal-but-distinct source, which is what a reload actually hands it.
    expect(buildFeed(state)).toEqual(buildFeed(structuredClone(state)));
  });

  it('keeps block ids stable when history grows above them', () => {
    const before = buildFeed(walkedToReview());

    const after = buildFeed({
      ...walkedToReview(),
      proposals: [proposal()],
    });

    for (const id of ids(before.blocks)) {
      expect(ids(after.blocks), `${id} did not survive a later block being added`).toContain(id);
    }
  });

  it('derives every block id from the row it projects, never from an index', () => {
    const feed = buildFeed({ ...walkedToReview(), proposals: [proposal()] });

    expect(ids(feed.blocks)).toEqual(
      expect.arrayContaining([
        'seed',
        'round:r1',
        'summary',
        'round:r2',
        'run:run-1',
        'revision:rev-1',
        'review:review-1',
        'proposal:proposal-1',
      ]),
    );
  });
});

describe('block kinds', () => {
  it('opens with the seed as the user’s own bubble', () => {
    const [first] = buildFeed(source()).blocks;

    expect(first).toMatchObject({
      kind: 'seed',
      role: 'user',
      stage: 'interview',
      substage: null,
      projectName: 'Local Voice Assistant',
      prompt: 'A voice assistant that runs on my laptop',
    });
  });

  it('renders every kind the session can produce', () => {
    const feed = buildFeed({
      ...walkedToReview(),
      proposals: [proposal()],
    });

    expect(new Set(kinds(feed.blocks))).toEqual(
      new Set([
        'seed',
        'round',
        'message',
        'transition',
        'generation',
        'document',
        'review',
        'proposal',
      ]),
    );
  });

  it('anchors the interview summary to the round that produced it', () => {
    const feed = buildFeed(walkedToReview());
    const summary = feed.blocks.find((block) => block.id === 'summary');

    expect(summary).toMatchObject({ kind: 'message', origin: 'summary', at: T.answered1 });
    // It therefore sits after the round it summarises and before the next one.
    expect(ids(feed.blocks).indexOf('summary')).toBeGreaterThan(
      ids(feed.blocks).indexOf('round:r1'),
    );
    expect(ids(feed.blocks).indexOf('summary')).toBeLessThan(ids(feed.blocks).indexOf('round:r2'));
  });

  it('omits the summary while the interview has not persisted one', () => {
    expect(kinds(buildFeed(source({ rounds: [round()] })).blocks)).not.toContain('message');
  });

  it('keeps an answered round in place, with its answers', () => {
    const feed = buildFeed(
      source({
        rounds: [
          round({
            answeredAt: T.answered1,
            answers: [
              {
                questionId: 'q-audience',
                label: 'Who is this for?',
                selectedOptionIds: ['solo-devs'],
                freeText: null,
              },
            ],
          }),
        ],
      }),
    );

    expect(feed.blocks.find((block) => block.kind === 'round')).toMatchObject({
      answered: true,
      roundNumber: 1,
      answers: [{ questionId: 'q-audience', selectedOptionIds: ['solo-devs'] }],
    });
  });

  it('prints a document card with its bundle path and revision number', () => {
    const feed = buildFeed(walkedToReview());

    expect(feed.blocks.find((block) => block.kind === 'document')).toMatchObject({
      fileName: 'constitution.md',
      path: 'specs/local-voice-assistant/constitution.md',
      revisionNumber: 1,
      approved: true,
    });
  });

  it('marks a run in flight by the complement of the terminal statuses (D-101)', () => {
    for (const status of ['running', 'restarted'] as const) {
      const feed = buildFeed(source({ runs: [run({ status })] }));
      expect(feed.blocks.find((block) => block.kind === 'generation')).toMatchObject({
        inFlight: true,
      });
    }

    for (const status of ['complete', 'failed'] as const) {
      const feed = buildFeed(source({ runs: [run({ status })] }));
      expect(feed.blocks.find((block) => block.kind === 'generation')).toMatchObject({
        inFlight: false,
      });
    }
  });

  it('seals the session with a completion block', () => {
    const state = walkedToReview();
    const feed = buildFeed({
      ...state,
      session: {
        ...state.session,
        position: { stage: 'complete', substage: null },
        completionCount: 1,
      },
    });

    expect(feed.blocks[feed.blocks.length - 1]).toMatchObject({
      kind: 'completion',
      completionCount: 1,
    });
  });
});

describe('ordering', () => {
  it('is chronological', () => {
    const feed = buildFeed(walkedToReview());
    const stamps = feed.blocks.map((block) => block.at);

    expect([...stamps].sort()).toEqual(stamps);
  });

  it('breaks a shared instant causally: a document before the review of it', () => {
    const instant = '2026-08-15T09:06:00.000Z';

    const feed = buildFeed(
      source({
        session: {
          ...source().session,
          position: { stage: 'constitution', substage: 'review' },
        },
        revisions: [revision({ createdAt: instant })],
        reviews: [review({ createdAt: instant })],
      }),
    );

    expect(ids(feed.blocks).indexOf('revision:rev-1')).toBeLessThan(
      ids(feed.blocks).indexOf('review:review-1'),
    );
  });
});

describe('stage chips', () => {
  it('appear exactly where the evidenced position changes', () => {
    const feed = buildFeed(walkedToReview());

    const chips = feed.blocks
      .filter((block) => block.kind === 'transition')
      .map((block) => block.id);

    expect(chips).toEqual([
      'transition:interview->constitution.collect@round:r2',
      'transition:constitution.collect->constitution.generate@run:run-1',
      'transition:constitution.generate->constitution.review@review:review-1',
    ]);
  });

  it('emits no chip where nothing moved', () => {
    const feed = buildFeed(
      source({ rounds: [round(), round({ roundId: 'r1b', roundNumber: 2 })] }),
    );

    expect(kinds(feed.blocks)).not.toContain('transition');
  });

  it('names a backward move honestly', () => {
    const state = walkedToReview();

    // Request changes on the review: a second revision, written from `generate` again.
    const feed = buildFeed({
      ...state,
      revisions: [
        revision({ approved: true }),
        revision({ revisionId: 'rev-2', revisionNumber: 2, createdAt: T.revision2 }),
      ],
      reviews: [
        review({ decision: 'request_changes', selectedItemIds: ['item-1'], decidedAt: T.decided }),
      ],
      session: { ...state.session, position: { stage: 'constitution', substage: 'generate' } },
    });

    expect(
      feed.blocks.filter((block) => block.kind === 'transition').map((block) => block.id),
    ).toContain('transition:constitution.review->constitution.generate@revision:rev-2');
  });

  it('closes the feed with a chip into a position nothing has evidenced yet', () => {
    const state = walkedToReview();

    const feed = buildFeed({
      ...state,
      reviews: [review({ decision: 'accept', decidedAt: T.decided })],
      session: { ...state.session, position: { stage: 'requirements', substage: 'collect' } },
    });

    const last = feed.blocks[feed.blocks.length - 1];

    expect(last).toMatchObject({
      kind: 'transition',
      id: 'transition:constitution.review->requirements.collect@tail',
      from: { stage: 'constitution', substage: 'review' },
      to: { stage: 'requirements', substage: 'collect' },
    });
  });

  it('stamps every block with the position it belongs to', () => {
    const feed = buildFeed(walkedToReview());
    const stamped = Object.fromEntries(
      feed.blocks.map((block) => [block.id, `${block.stage}/${String(block.substage)}`]),
    );

    expect(stamped.seed).toBe('interview/null');
    expect(stamped['round:r1']).toBe('interview/null');
    expect(stamped['round:r2']).toBe('constitution/collect');
    expect(stamped['run:run-1']).toBe('constitution/generate');
    expect(stamped['revision:rev-1']).toBe('constitution/generate');
    expect(stamped['review:review-1']).toBe('constitution/review');
  });
});

describe('the tail names what the session is waiting on', () => {
  it('a pending round outranks everything else', () => {
    const feed = buildFeed(
      source({
        rounds: [round({ answeredAt: T.answered1 }), round({ roundId: 'r2', roundNumber: 2 })],
        runs: [run()],
        revisions: [revision()],
      }),
    );

    expect(feed.tail).toEqual({ kind: 'pending-round', blockId: 'round:r2', roundId: 'r2' });
  });

  it('a generation in flight', () => {
    const feed = buildFeed(source({ runs: [run({ status: 'restarted', attempt: 3 })] }));

    expect(feed.tail).toEqual({
      kind: 'generating',
      blockId: 'run:run-1',
      runId: 'run-1',
      attempt: 3,
      stage: 'constitution',
    });
  });

  it('a draft awaiting approval', () => {
    const feed = buildFeed(
      source({ runs: [run({ status: 'complete' })], revisions: [revision()] }),
    );

    expect(feed.tail).toEqual({
      kind: 'pending-approval',
      blockId: 'revision:rev-1',
      specFileId: 'file-constitution',
      revisionNumber: 1,
    });
  });

  it('an undecided review', () => {
    expect(buildFeed(walkedToReview()).tail).toEqual({
      kind: 'pending-review',
      blockId: 'review:review-1',
      reviewId: 'review-1',
    });
  });

  it('ignores a review of anything but the file’s latest revision', () => {
    const state = walkedToReview();

    const feed = buildFeed({
      ...state,
      revisions: [
        revision({ approved: true }),
        revision({ revisionId: 'rev-2', revisionNumber: 2, createdAt: T.revision2 }),
      ],
    });

    expect(feed.tail.kind).toBe('pending-approval');
  });

  it('a pending refinement, ahead of the review it was raised over', () => {
    const feed = buildFeed({ ...walkedToReview(), proposals: [proposal()] });

    expect(feed.tail).toEqual({
      kind: 'pending-proposal',
      blockId: 'proposal:proposal-1',
      proposedChangeId: 'proposal-1',
    });
  });

  it('a sealed session', () => {
    const state = walkedToReview();

    const feed = buildFeed({
      ...state,
      reviews: [review({ decision: 'accept', decidedAt: T.decided })],
      session: {
        ...state.session,
        position: { stage: 'complete', substage: null },
        completionCount: 1,
      },
    });

    expect(feed.tail).toEqual({ kind: 'sealed', blockId: 'completion' });
  });

  it('an open position, with nothing pending', () => {
    const state = walkedToReview();

    const feed = buildFeed({
      ...state,
      reviews: [review({ decision: 'accept', decidedAt: T.decided })],
      session: { ...state.session, position: { stage: 'requirements', substage: 'collect' } },
    });

    expect(feed.tail).toEqual({ kind: 'open' });
  });

  it('names a block that is actually in the feed, whatever the state', () => {
    const states = [
      source({ rounds: [round()] }),
      source({ runs: [run()] }),
      source({ runs: [run({ status: 'complete' })], revisions: [revision()] }),
      walkedToReview(),
      { ...walkedToReview(), proposals: [proposal()] },
    ];

    for (const state of states) {
      const feed = buildFeed(state);
      if (feed.tail.kind === 'open') continue;

      expect(ids(feed.blocks), `tail ${feed.tail.kind} points at nothing`).toContain(
        feed.tail.blockId,
      );
    }
  });
});

describe('free chat rides on the tail', () => {
  it('stamps turns with the position the session is in now', () => {
    const feed = appendChatTurns(buildFeed(walkedToReview()), [
      { role: 'user', text: 'what should I pick?' },
      { role: 'assistant', text: 'Either is fine.', streaming: true },
    ]);

    expect(feed.blocks.slice(-2)).toMatchObject([
      { kind: 'message', origin: 'chat', role: 'user', stage: 'constitution', substage: 'review' },
      { kind: 'message', origin: 'chat', role: 'assistant', streaming: true },
    ]);
  });

  it('leaves the feed alone when there is nothing to append', () => {
    const feed = buildFeed(walkedToReview());

    expect(appendChatTurns(feed, [])).toBe(feed);
  });
});
