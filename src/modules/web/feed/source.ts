import type { StagePosition } from '@/modules/workflow/model/stages';

import type { FeedQuestion, FeedReviewItem } from './model';

/**
 * The persisted rows the feed is built from (task 104).
 *
 * Plain, serialisable and free of database handles, for the same reason `WorkflowSnapshot` is: the
 * projection is then a pure function that a test can drive from literals, and "same state → identical
 * feed" is something the type system helps enforce rather than something the tests hope for.
 *
 * Timestamps are ISO-8601 **strings**, not `Date`s. The feed crosses the server/client boundary as
 * props, and a `Date` that survives serialisation in development and arrives as a string in
 * production is the kind of difference that only shows up in the ordering of a customer's session.
 *
 * `web` may import neither repositories nor `agents` (constitution A1), so the composition root
 * assembles this shape: it is the one place that knows how a `question_rounds.questions` payload is
 * validated and how an option id becomes a label.
 */
export interface FeedSourceSession {
  sessionId: string;
  projectId: string;
  projectName: string;
  initialPrompt: string;
  /** The interview summary, once the agent has persisted one (constitution A2, condition 3). */
  summary: string | null;
  createdAt: string;
  /** Where the session is now — read, never inferred. */
  position: StagePosition;
  completionCount: number;
  /** The session's methodology (task 117); its documents name the files the cards show. */
  methodologyId: string;
  /**
   * How many times one stage may be sent back for changes (task 113).
   *
   * Configuration, so it arrives with the source rather than being read inside a pure projection —
   * the same route `deadlineMs` takes to the page, and the same reason: `buildFeed` reads no
   * environment, so two sessions with identical rows produce identical feeds.
   */
  revisionCycleBudget: number;
}

export interface FeedSourceAnswer {
  questionId: string | null;
  label: string;
  selectedOptionIds: readonly string[];
  freeText: string | null;
}

export interface FeedSourceRound {
  roundId: string;
  stage: string;
  roundNumber: number;
  presentedAt: string;
  questions: readonly FeedQuestion[];
  answers: readonly FeedSourceAnswer[];
  /** When the round was answered, or `null` while it is still pending. */
  answeredAt: string | null;
}

export interface FeedSourceRun {
  runId: string;
  stage: string;
  status: 'running' | 'restarted' | 'complete' | 'failed';
  attempt: number;
  createdAt: string;
}

export interface FeedSourceRevision {
  revisionId: string;
  specFileId: string;
  specType: string;
  fileName: string;
  revisionNumber: number;
  approved: boolean;
  createdAt: string;
}

export interface FeedSourceReview {
  reviewId: string;
  specFileId: string;
  specType: string;
  /** The revision this review read. A review of anything but the latest is history (FR-010 AC-8). */
  revisionNumber: number;
  outcome: 'pass' | 'needs_revision';
  /** `null` on a board written before review.v2, which had no summary to write (task 111). */
  summary: string | null;
  items: readonly FeedReviewItem[];
  decision: 'accept' | 'ignore' | 'request_changes' | null;
  selectedItemIds: readonly string[] | null;
  /** The writer's paragraph before Rev N+1, once a request-changes decision produced one (113). */
  revisionNote: string | null;
  createdAt: string;
  decidedAt: string | null;
}

export interface FeedSourceProposal {
  proposedChangeId: string;
  specFileId: string;
  fileName: string;
  instruction: string;
  status: 'pending' | 'accepted' | 'rejected';
  /** The cross-file edit this belongs to (task 118); `null` for a single-file refinement. */
  editBatchId: string | null;
  createdAt: string;
}

/**
 * A persisted turn of the conversation — a free-chat message or an analytical bridge (task 132).
 *
 * `stage`/`substage` come from the row, not from the session's current position: the whole point of
 * `session_messages` is that a message records where it was written, so a reply given during a
 * review still reads `review` after the session has sealed (checklist row `1.2-4`).
 */
export interface FeedSourceMessage {
  messageId: string;
  role: 'user' | 'assistant';
  origin: 'chat' | 'bridge' | 'driver';
  stage: string;
  substage: string | null;
  body: string;
  createdAt: string;
}

export interface FeedSource {
  session: FeedSourceSession;
  rounds: readonly FeedSourceRound[];
  runs: readonly FeedSourceRun[];
  revisions: readonly FeedSourceRevision[];
  reviews: readonly FeedSourceReview[];
  proposals: readonly FeedSourceProposal[];
  /** Free-chat turns and analytical bridges, oldest first (task 132). */
  messages: readonly FeedSourceMessage[];
}
