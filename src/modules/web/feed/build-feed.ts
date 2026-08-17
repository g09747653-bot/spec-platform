import { methodologyConfig } from '@/modules/methodologies';
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
      /*
       * A revision note evidences nothing, and that is deliberate: it is written while the session
       * sits in `generate` after a request-changes, and the chip for that move was already emitted
       * by the run. Claiming a position here would invent a second transition for one movement.
       */
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
  /*
   * The card shows the name the *methodology* exports, not the storage slot (task 117): SpecKit's
   * Plan lives in the `solution` row and is `plan.md` everywhere the user can see it — the card, the
   * path, and the ZIP. Falling back to the stored name keeps a session on an unknown methodology
   * rendering its files rather than blanks.
   */
  const config = methodologyConfig(source.session.methodologyId);
  const exportedName = (specType: string, stored: string): string =>
    config.stages.find((stage) => stage.document?.specType === specType)?.document?.fileName ??
    stored;

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
    fileName: exportedName(revision.specType, revision.fileName),
    path: specPath(source.session.projectName, exportedName(revision.specType, revision.fileName)),
    revisionNumber: revision.revisionNumber,
    approved: revision.approved,
  }));
}

/**
 * How many times a file has been sent back, counted from the boards themselves.
 *
 * Derived rather than stored, like everything else in this projection (D-102): the count *is* the
 * number of request-changes decisions, so there is nothing to keep in step.
 */
function cyclesUsedFor(source: FeedSource, specFileId: string): number {
  return source.reviews.filter(
    (review) => review.specFileId === specFileId && review.decision === 'request_changes',
  ).length;
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
    summary: review.summary,
    items: review.items,
    decision: review.decision,
    selectedItemIds: review.selectedItemIds,
    cyclesUsed: cyclesUsedFor(source, review.specFileId),
    cycleBudget: source.session.revisionCycleBudget,
  }));
}

/**
 * The writer's paragraph before Rev N+1 (task 113; Эталон §1.3).
 *
 * Anchored to the decision it explains — `decidedAt`, not the moment it was written — so it lands
 * between the board the user decided and the revision that decision produced. That is where the
 * reference product puts it, and it is derivable, which a written-at timestamp would only be if we
 * started storing one.
 */
function revisionNoteBlocks(source: FeedSource): MessageBlock[] {
  return source.reviews
    .filter((review) => review.revisionNote !== null && review.decidedAt !== null)
    .map((review) => ({
      kind: 'message',
      id: `revision-note:${review.reviewId}`,
      role: 'assistant',
      stage: review.specType,
      substage: null,
      at: review.decidedAt ?? review.createdAt,
      origin: 'revision-note',
      text: review.revisionNote ?? '',
      streaming: false,
    }));
}

/**
 * The conversation's own turns — free chat and the analytical bridge (task 132).
 *
 * The last of the feed's sources, and the only one written *for* the feed. Everything else here
 * projects a row that exists because the workflow needed it; a chat exchange and a bridge exist
 * because somebody said something, and until M11п the first of them was thrown away on reload
 * (checklist row `1.2-4`) and the second did not exist at all (`1.2-3`).
 *
 * `positionRecorded` is what stops the chip pass below from overwriting the position the row
 * carries. A message knows where it was written; nothing else here does.
 */
function messageBlocks(source: FeedSource): MessageBlock[] {
  return source.messages.map((message) => ({
    kind: 'message',
    id: `message:${message.messageId}`,
    role: message.role,
    stage: message.stage,
    substage: message.substage,
    at: message.createdAt,
    origin: message.origin,
    text: message.body,
    streaming: false,
    positionRecorded: true,
  }));
}

/**
 * Proposals, grouped into the cards a person decides on (task 118).
 *
 * A cross-file edit is stored as one row per file — that is what makes it applicable atomically and
 * what makes the pending-per-file index apply to it — but it is **one decision**, so it is one
 * block. Grouping happens here rather than in the query for the same reason the chips are derived
 * here: the projection owns what the conversation looks like, and the tables own what happened.
 *
 * An M4 refinement has no batch and is therefore its own group of one, through the same code path
 * rather than around it.
 */
function proposalBlocks(source: FeedSource): ProposalBlock[] {
  const groups = new Map<string, FeedSource['proposals'][number][]>();

  for (const proposal of source.proposals) {
    const key = proposal.editBatchId ?? `single:${proposal.proposedChangeId}`;
    groups.set(key, [...(groups.get(key) ?? []), proposal]);
  }

  return [...groups.values()].flatMap((members): ProposalBlock[] => {
    const ordered = [...members].sort((a, b) => (a.fileName < b.fileName ? -1 : 1));
    const first = ordered[0];
    if (first === undefined) return [];

    return [
      {
        kind: 'proposal',
        id: `proposal:${first.proposedChangeId}`,
        role: 'assistant',
        stage: source.session.position.stage,
        substage: null,
        // The batch was written by one statement, so its rows share an instant; the earliest is it.
        at: ordered.reduce((earliest, member) =>
          member.createdAt < earliest.createdAt ? member : earliest,
        ).createdAt,
        proposedChangeId: first.proposedChangeId,
        specFileId: first.specFileId,
        files: ordered.map((member) => ({
          specFileId: member.specFileId,
          fileName: member.fileName,
        })),
        fileName: first.fileName,
        instruction: first.instruction,
        // A batch is decided as a whole, so its members always agree; taking the first is exact.
        status: first.status,
        editBatchId: first.editBatchId,
      },
    ];
  });
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

  /*
   * The pending proposal card, found among the **blocks** rather than among the rows.
   *
   * A cross-file edit is several rows and one card (task 118), and the card's id is decided by the
   * grouping above. Reading the rows here would name a member the page never renders as a block, and
   * the tail would point at nothing — which is how a decision typed in chat would stop matching the
   * card on screen (FR-009 AC-7).
   */
  const pendingProposal = blocks.find(
    (block): block is ProposalBlock => block.kind === 'proposal' && block.status === 'pending',
  );

  if (pendingProposal !== undefined) {
    return {
      kind: 'pending-proposal',
      blockId: pendingProposal.id,
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
    ...revisionNoteBlocks(source),
    ...proposalBlocks(source),
    ...messageBlocks(source),
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
   *
   * **Unless the block recorded its own** (task 132). A persisted message carries the position it
   * was written at, and the running position is only the same thing while the walk happens to be
   * there: after a request-changes the session goes back to `generate`, after sealing to `complete`,
   * and a stamp applied here would rewrite history to match the present. So a block that says its
   * position is recorded keeps it — which is what makes `data-msg-stage` answer "what was the
   * session doing when this was written?", the question `feed-item.tsx` says it answers.
   */
  const blocks: FeedBlock[] = [];
  let current = START;

  for (const block of ordered) {
    const evidenced = evidencedPosition(block);

    if (evidenced !== null && !samePosition(evidenced, current)) {
      blocks.push(transitionBlock(current, evidenced, block.id, block.at));
      current = evidenced;
    }

    const recorded = block.kind === 'message' && block.positionRecorded === true;

    blocks.push(recorded ? block : { ...block, stage: current.stage, substage: current.substage });
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

  return {
    blocks,
    position,
    tail: computeTail(source, blocks),
    revisionOwed: computeRevisionOwed(source),
  };
}

/**
 * The rewrite the board asked for and the session still owes (task 113).
 *
 * The same predicate `requestedChangesForFile` runs in SQL: a request-changes decision standing on
 * the file's **latest** revision. Once the rewrite lands, a newer revision exists and the decision
 * stops describing the newest content — which is exactly when the page should stop offering to
 * apply it, and exactly when the server stops carrying the feedback into the prompt.
 *
 * Without this the feed had no way to say "this stage owes a revision", and so no way to offer one:
 * a session sent back by its review board sat at `generate` with an approved document, a decided
 * board, and nothing to press. The M8п cycle walk is what found it.
 */
function computeRevisionOwed(source: FeedSource): Feed['revisionOwed'] {
  for (const review of source.reviews) {
    if (review.decision !== 'request_changes') continue;
    if (review.revisionNumber !== latestRevisionNumber(source.revisions, review.specFileId))
      continue;

    return { specType: review.specType, points: (review.selectedItemIds ?? []).length };
  }

  return null;
}
