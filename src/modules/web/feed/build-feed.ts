import {
  isSpecStage,
  positionKey,
  samePosition,
  type StagePosition,
} from '@/modules/workflow/model/stages';

import { specPath } from './labels';
import type {
  CompletionBlock,
  DocumentBlock,
  Feed,
  FeedBlock,
  FeedTail,
  GenerationBlock,
  MessageBlock,
  ProposalBlock,
  ReviewBlock,
  RoundBlock,
  SeedBlock,
  TransitionBlock,
} from './model';
import type { FeedSource, FeedSourceReview, FeedSourceRevision } from './source';

/**
 * The conversation feed, derived from persisted state and nothing else (task 104).
 *
 * Pure: a source in, a feed out. No clock, no randomness, no database — so "same state → identical
 * feed" is a property a test can assert by calling it twice, and a reload reproduces the session
 * because rebuilding is the only way the feed is ever built (FR-017 AC-1).
 *
 * Three decisions carry the design:
 *
 * 1. **Ordering is by the row's own timestamp**, with a causal rank as the tiebreak. Two rows written
 *    in the same millisecond — a revision and the review of it, on a fast stub — must not be able to
 *    swap places between two renders of the same data, so the tiebreak is a total order over
 *    (timestamp, kind rank, id) rather than whatever the query happened to return.
 * 2. **Stage chips are derived, not stored.** There is no transition log, and inventing one would be
 *    the new write path this task forbids. Instead every block declares the position it *evidences* —
 *    a round is its stage's `collect`, a run is `generate`, a review is `review` — and a chip is
 *    emitted wherever consecutive blocks disagree. The chips therefore appear exactly at position
 *    changes, because that is the only thing that can produce one (task 107 AC-3).
 * 3. **The tail names the block that owns the pending decision.** Its precedence is the precedence of
 *    `findPendingDecision`, so the card the page draws controls on is the card a typed decision in
 *    chat resolves against (FR-009 AC-7).
 */

/** Where the session starts, and what every derived chip is measured from. */
const START: StagePosition = { stage: 'interview', substage: null };

/**
 * Causal order for blocks sharing an instant.
 *
 * Not cosmetic: a stub provider writes a revision and its review inside the same millisecond, and a
 * feed that showed the review above the document it reviewed would be wrong in exactly the way a
 * reader would not question.
 */
const KIND_RANK: Record<FeedBlock['kind'], number> = {
  seed: 0,
  round: 1,
  message: 2,
  transition: 3,
  generation: 4,
  document: 5,
  review: 6,
  proposal: 7,
  completion: 8,
};

function compare(a: FeedBlock, b: FeedBlock): number {
  if (a.at !== b.at) return a.at < b.at ? -1 : 1;

  const rank = KIND_RANK[a.kind] - KIND_RANK[b.kind];
  if (rank !== 0) return rank;

  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * The position a block evidences, or `null` when it evidences none.
 *
 * A refinement proposal and a chat reply are the `null` cases: both can happen at any position and
 * neither moves the session, so treating them as evidence would invent chips for transitions that
 * never occurred.
 */
function evidencedPosition(block: FeedBlock): StagePosition | null {
  switch (block.kind) {
    case 'seed':
      return START;
    case 'message':
      return block.origin === 'summary' ? START : null;
    case 'round':
      return block.stage === 'interview'
        ? START
        : isSpecStage(block.stage)
          ? { stage: block.stage, substage: 'collect' }
          : null;
    case 'generation':
      return isSpecStage(block.stage) ? { stage: block.stage, substage: 'generate' } : null;
    case 'document':
      return isSpecStage(block.specType) ? { stage: block.specType, substage: 'generate' } : null;
    case 'review':
      return isSpecStage(block.specType) ? { stage: block.specType, substage: 'review' } : null;
    case 'completion':
      return { stage: 'complete', substage: null };
    case 'transition':
    case 'proposal':
      return null;
  }
}

function transitionBlock(
  from: StagePosition,
  to: StagePosition,
  anchorId: string,
  at: string,
): TransitionBlock {
  return {
    kind: 'transition',
    id: `transition:${positionKey(from)}->${positionKey(to)}@${anchorId}`,
    role: 'system',
    stage: to.stage,
    substage: to.substage,
    at,
    from,
    to,
  };
}

/** The file whose newest revision is newest overall — `specFiles.currentFile`, as a pure lookup. */
function currentSpecFileId(revisions: readonly FeedSourceRevision[]): string | null {
  let best: FeedSourceRevision | null = null;

  for (const revision of revisions) {
    if (
      best === null ||
      revision.createdAt > best.createdAt ||
      (revision.createdAt === best.createdAt && revision.specType < best.specType)
    ) {
      best = revision;
    }
  }

  return best === null ? null : best.specFileId;
}

/** The highest revision number a file has reached — what "the latest revision" means. */
function latestRevisionNumber(
  revisions: readonly FeedSourceRevision[],
  specFileId: string,
): number {
  return revisions
    .filter((revision) => revision.specFileId === specFileId)
    .reduce((highest, revision) => Math.max(highest, revision.revisionNumber), 0);
}

/** A review still awaiting a decision **on its file's latest revision** (`pendingForFile`). */
function isPending(review: FeedSourceReview, revisions: readonly FeedSourceRevision[]): boolean {
  return (
    review.decision === null &&
    review.revisionNumber === latestRevisionNumber(revisions, review.specFileId)
  );
}

function seedBlock(source: FeedSource): SeedBlock {
  const { session } = source;

  return {
    kind: 'seed',
    id: 'seed',
    role: 'user',
    stage: START.stage,
    substage: START.substage,
    at: session.createdAt,
    projectName: session.projectName,
    prompt: session.initialPrompt,
  };
}

/**
 * The interview summary, anchored to the round that produced it.
 *
 * `sessions.summary` is a column with no timestamp of its own: it is rewritten after every answered
 * grounding round. Anchoring it to the newest of those rounds is what puts it where it was written
 * rather than at the top or the bottom of the conversation — and it is derivable, which a stored
 * timestamp would only be if we started writing one.
 */
function summaryBlock(source: FeedSource): MessageBlock | null {
  const { summary } = source.session;
  if (summary === null || summary.trim() === '') return null;

  const answeredAt = source.rounds
    .filter((round) => round.stage === 'interview')
    .map((round) => round.answeredAt)
    .filter((at): at is string => at !== null);

  const anchor = answeredAt.reduce<string | null>(
    (newest, at) => (newest === null || at > newest ? at : newest),
    null,
  );

  return {
    kind: 'message',
    id: 'summary',
    role: 'assistant',
    stage: START.stage,
    substage: START.substage,
    at: anchor ?? source.session.createdAt,
    origin: 'summary',
    text: summary,
    streaming: false,
  };
}

function roundBlocks(source: FeedSource): RoundBlock[] {
  return source.rounds.map((round) => ({
    kind: 'round',
    id: `round:${round.roundId}`,
    role: 'assistant',
    stage: round.stage,
    substage: null,
    at: round.presentedAt,
    roundId: round.roundId,
    roundNumber: round.roundNumber,
    questions: round.questions,
    answers: round.answers,
    answered: round.answeredAt !== null,
  }));
}

function generationBlocks(source: FeedSource): GenerationBlock[] {
  return source.runs.map((run) => ({
    kind: 'generation',
    id: `run:${run.runId}`,
    role: 'assistant',
    stage: run.stage,
    substage: null,
    at: run.createdAt,
    runId: run.runId,
    attempt: run.attempt,
    status: run.status,
    // D-101: "in flight" is the complement of the terminal statuses, never `status === 'running'`.
    inFlight: run.status !== 'complete' && run.status !== 'failed',
  }));
}

function documentBlocks(source: FeedSource): DocumentBlock[] {
  return source.revisions.map((revision) => ({
    kind: 'document',
    id: `revision:${revision.revisionId}`,
    role: 'assistant',
    stage: revision.specType,
    substage: null,
    at: revision.createdAt,
    revisionId: revision.revisionId,
    specFileId: revision.specFileId,
    specType: revision.specType,
    fileName: revision.fileName,
    path: specPath(source.session.projectName, revision.fileName),
    revisionNumber: revision.revisionNumber,
    approved: revision.approved,
  }));
}

function reviewBlocks(source: FeedSource): ReviewBlock[] {
  return source.reviews.map((review) => ({
    kind: 'review',
    id: `review:${review.reviewId}`,
    role: 'assistant',
    stage: review.specType,
    substage: null,
    at: review.createdAt,
    reviewId: review.reviewId,
    specType: review.specType,
    outcome: review.outcome,
    items: review.items,
    decision: review.decision,
    selectedItemIds: review.selectedItemIds,
  }));
}

function proposalBlocks(source: FeedSource): ProposalBlock[] {
  return source.proposals.map((proposal) => ({
    kind: 'proposal',
    id: `proposal:${proposal.proposedChangeId}`,
    role: 'assistant',
    stage: source.session.position.stage,
    substage: null,
    at: proposal.createdAt,
    proposedChangeId: proposal.proposedChangeId,
    specFileId: proposal.specFileId,
    fileName: proposal.fileName,
    instruction: proposal.instruction,
    status: proposal.status,
  }));
}

/**
 * What the session is waiting on.
 *
 * The order is `findPendingDecision`'s, with the run in flight inserted where it belongs: a pending
 * round blocks generation (FR-005 AC-4) so it outranks everything, and a run in flight precedes the
 * decisions because the revision those decisions are about does not exist until the run finishes.
 */
function computeTail(source: FeedSource, blocks: readonly FeedBlock[]): FeedTail {
  const idOf = (prefix: string, key: string): string => `${prefix}:${key}`;
  const has = (id: string): boolean => blocks.some((block) => block.id === id);

  const pendingRound = source.rounds
    .filter((round) => round.answeredAt === null)
    .sort((a, b) => (a.presentedAt < b.presentedAt ? 1 : -1))[0];

  if (pendingRound !== undefined) {
    return {
      kind: 'pending-round',
      blockId: idOf('round', pendingRound.roundId),
      roundId: pendingRound.roundId,
    };
  }

  const activeRun = source.runs
    .filter((run) => run.status !== 'complete' && run.status !== 'failed')
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];

  if (activeRun !== undefined) {
    return {
      kind: 'generating',
      blockId: idOf('run', activeRun.runId),
      runId: activeRun.runId,
      attempt: activeRun.attempt,
      stage: activeRun.stage,
    };
  }

  const pendingProposal = source.proposals.find((proposal) => proposal.status === 'pending');
  if (pendingProposal !== undefined) {
    return {
      kind: 'pending-proposal',
      blockId: idOf('proposal', pendingProposal.proposedChangeId),
      proposedChangeId: pendingProposal.proposedChangeId,
    };
  }

  const currentFileId = currentSpecFileId(source.revisions);

  if (currentFileId !== null) {
    const pendingReview = source.reviews.find(
      (review) => review.specFileId === currentFileId && isPending(review, source.revisions),
    );

    if (pendingReview !== undefined) {
      return {
        kind: 'pending-review',
        blockId: idOf('review', pendingReview.reviewId),
        reviewId: pendingReview.reviewId,
      };
    }

    const latestNumber = latestRevisionNumber(source.revisions, currentFileId);
    const latest = source.revisions.find(
      (revision) =>
        revision.specFileId === currentFileId && revision.revisionNumber === latestNumber,
    );

    if (latest !== undefined && !latest.approved) {
      return {
        kind: 'pending-approval',
        blockId: idOf('revision', latest.revisionId),
        specFileId: latest.specFileId,
        revisionNumber: latest.revisionNumber,
      };
    }
  }

  if (source.session.position.stage === 'complete' && has('completion')) {
    return { kind: 'sealed', blockId: 'completion' };
  }

  return { kind: 'open' };
}

export function buildFeed(source: FeedSource): Feed {
  const unordered: FeedBlock[] = [
    seedBlock(source),
    ...roundBlocks(source),
    ...generationBlocks(source),
    ...documentBlocks(source),
    ...reviewBlocks(source),
    ...proposalBlocks(source),
  ];

  const summary = summaryBlock(source);
  if (summary !== null) unordered.push(summary);

  const ordered = [...unordered].sort(compare);

  if (source.session.position.stage === 'complete') {
    const last = ordered[ordered.length - 1];

    ordered.push({
      kind: 'completion',
      id: 'completion',
      role: 'system',
      stage: 'complete',
      substage: null,
      at: last?.at ?? source.session.createdAt,
      completionCount: source.session.completionCount,
    } satisfies CompletionBlock);
  }

  /*
   * The chip pass. Walking the ordered blocks with a running position does two things at once: it
   * emits a chip wherever the evidenced position changes, and it stamps every block — including the
   * ones that evidence nothing — with the position it belongs to. A chat reply typed during a review
   * therefore carries `review` without anyone having to remember to stamp it (task 109).
   */
  const blocks: FeedBlock[] = [];
  let current = START;

  for (const block of ordered) {
    const evidenced = evidencedPosition(block);

    if (evidenced !== null && !samePosition(evidenced, current)) {
      blocks.push(transitionBlock(current, evidenced, block.id, block.at));
      current = evidenced;
    }

    blocks.push({ ...block, stage: current.stage, substage: current.substage });
  }

  /*
   * The chip into where the session is *now*. Everything above is evidence of positions the session
   * has been in; the position it currently occupies may have no evidence at all yet — a stage that
   * has been entered but has not been asked anything is exactly that state, and it is where the M6
   * gate spends a good deal of its time.
   */
  const { position } = source.session;

  if (!samePosition(position, current)) {
    const last = blocks[blocks.length - 1];
    blocks.push(transitionBlock(current, position, 'tail', last?.at ?? source.session.createdAt));
  }

  return { blocks, position, tail: computeTail(source, blocks) };
}
