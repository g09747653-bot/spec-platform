import type { StagePosition } from '@/modules/workflow/model/stages';

/**
 * The conversation feed — what a session looks like when it is one continuous chat (task 104).
 *
 * The whole surface of M7п rests on one claim: **the feed is a projection, not a store.** Every block
 * below is derived from a row that already exists — the seed prompt, a question round, a generation
 * run, a revision, a review — so nothing has to be written for the conversation to exist, and nothing
 * can drift out of step with the workflow. Reloading rebuilds the identical feed because rebuilding
 * *is* how it was built the first time (FR-017 AC-1).
 *
 * That is also why the block ids are derived from row ids rather than from array positions: an id
 * that changes when a block is inserted earlier in history is not an id, it is an index, and anchors,
 * scroll restoration and test selectors all break on it.
 *
 * The five block kinds of the reference product (Эталон §1.1) map onto this union as: ordinary
 * messages → `seed`/`message`, question rounds → `round`, stage chips → `transition`, document cards
 * → `document`, review cards → `review`. `generation`, `proposal` and `completion` are ours: a run in
 * flight, a conversational refinement awaiting a decision, and the sealed session — three states the
 * M6 gate visits that the reference has no separate block for.
 */
export type FeedRole = 'user' | 'assistant' | 'system';

export type FeedBlockKind =
  | 'seed'
  | 'message'
  | 'round'
  | 'transition'
  | 'bundle'
  | 'generation'
  | 'document'
  | 'review'
  | 'proposal'
  | 'completion';

export interface FeedBlockBase {
  /** Stable across reloads: derived from the row this block projects, never from its index. */
  id: string;
  role: FeedRole;
  /**
   * The workflow position this block belongs to.
   *
   * A block that evidences a position (a round is `collect`, a run is `generate`, a review is
   * `review`) carries that one; a block that evidences none — a chat reply, a refinement — carries
   * whatever position was current when it happened. It is what `data-msg-stage`/`data-msg-substage`
   * render, and what free chat is stamped with (task 109).
   */
  stage: string;
  substage: string | null;
  /** When the underlying row happened, ISO-8601. The ordering key, and never re-derived. */
  at: string;
  /**
   * A one-line plain-text gist, for `data-msg-snippet` (task 134; Эталон §1.1).
   *
   * The fifth of the reference's navigation attributes, and the one we did not carry: id, role,
   * stage and substage say *where* a message is, and the snippet says *what* it is, which is what
   * an anchor preview or a jump list needs. Derived in the projection (`snippetOf`), never stored.
   */
  snippet?: string;
}

/** The templated opening bubble: «I want to build {name}. My project description is: {prompt}». */
export interface SeedBlock extends FeedBlockBase {
  kind: 'seed';
  role: 'user';
  projectName: string;
  prompt: string;
}

/**
 * Ordinary prose.
 *
 * `origin` says where the text came from, and every one of them is now persisted somewhere: a
 * `summary` is a column on the session, a `revision-note` is a column on the board whose decision it
 * explains (task 113), and `chat`/`bridge` are rows of `session_messages` (task 132). Marking the
 * origin is what lets the feed give each its own test id and its own placement without four block
 * kinds that render identically.
 *
 * A `chat` block is the one case with a transient twin: the turn drawn optimistically while the
 * request is in flight carries no id from the server yet, and is replaced by the persisted block on
 * the next render — see `chat-turns.ts`.
 */
export interface MessageBlock extends FeedBlockBase {
  kind: 'message';
  /** `bridge` is the interviewer's commentary between two rounds (task 132; Эталон §1.2). */
  origin: 'summary' | 'chat' | 'revision-note' | 'bridge';
  text: string;
  /** True while an assistant reply is still being written into the feed (task 109). */
  streaming: boolean;
  /**
   * Whether this block's position was **recorded** rather than derived (task 132).
   *
   * The chip pass stamps every block with the position the walk is currently in, which is right for
   * everything derived from a row that has no position of its own. A persisted message has one: it
   * was written at a place in the workflow, and re-stamping it would make `data-msg-stage` say where
   * the session is now instead of what it was doing then — the second half of checklist row `1.2-4`.
   */
  positionRecorded?: boolean;
}

export interface FeedOption {
  id: string;
  label: string;
  description?: string | undefined;
  /** The model's single suggestion for this question, if it made one (Эталон §1.1). */
  recommended?: boolean | undefined;
  /** Short tags the model attached to this option, when it did (task 134; Эталон §1.1). */
  tags?: readonly string[] | undefined;
  /**
   * The справка: what this option is, in two sentences (task 144; видео §5).
   *
   * A property of the **option**, never of the question, which is what makes the asymmetry the
   * reference product shows possible — «Anthropic Claude» carries one and «No preference» does not,
   * inside one question. Optional on the same compatibility contract `recommended` and `tags` carry:
   * every round drafted before this renders exactly as it did.
   */
  note?: string | undefined;
  /**
   * The technology's own home page, when the option names a technology that has one.
   *
   * Model-authored, and therefore narrowed before it ever reaches here: the schema accepts only an
   * https home page on the vendor's own host and drops anything else (`HomePageUrl`). The renderer
   * is not the security boundary and does not act as though it were.
   */
  href?: string | undefined;
  /**
   * Which vendored mark to draw beside the label, as a plain slug.
   *
   * A **string**, not the schema's union: `web` may not import `agents` (constitution A1), so the
   * closed set crosses the boundary the way `questionsPerRound` does — as a value the renderer looks
   * up. A slug this build has no drawing for renders no mark, which is the same nothing an option
   * without a logo renders.
   */
  logo?: string | undefined;
}

export interface FeedQuestion {
  id: string;
  text: string;
  type: 'single' | 'multiple';
  options: readonly FeedOption[];
  allowOther: boolean;
  /** Whether an answer is required — the red asterisk of Эталон §1.1. */
  required: boolean;
}

/** One recorded answer, already resolved to something a person can read. */
export interface FeedAnswer {
  /** `null` for a free-text reply to the card as a whole (FR-005 AC-6). */
  questionId: string | null;
  /** How to name what was answered — the question text, or the need for a fallback answer. */
  label: string;
  selectedOptionIds: readonly string[];
  freeText: string | null;
}

/**
 * A question round, pending or answered.
 *
 * Both states are the same block: after submission the form stays in the feed, disabled, with the
 * chosen answers fixed (Эталон §1.1). Rendering an answered round as something *other* than the form
 * that was answered is how a chat log becomes a summary of itself.
 */
export interface RoundBlock extends FeedBlockBase {
  kind: 'round';
  role: 'assistant';
  roundId: string;
  roundNumber: number;
  questions: readonly FeedQuestion[];
  answers: readonly FeedAnswer[];
  answered: boolean;
}

/** The stage chip: `{Stage} · {from} ──▶ {Stage} · {to}` (Эталон §1.1). */
export interface TransitionBlock extends FeedBlockBase {
  kind: 'transition';
  role: 'system';
  from: StagePosition;
  to: StagePosition;
}

/** A generation run — the card a stream draws into, and the only place `Stop` belongs. */
export interface GenerationBlock extends FeedBlockBase {
  kind: 'generation';
  role: 'assistant';
  runId: string;
  attempt: number;
  status: 'running' | 'restarted' | 'complete' | 'failed';
  /** True while the run is neither complete nor failed — the D-101 definition of "in flight". */
  inFlight: boolean;
}

/** A document card: stage name, mono path, `Rev N`, Approved badge, preview toggle (task 107). */
export interface DocumentBlock extends FeedBlockBase {
  kind: 'document';
  role: 'assistant';
  revisionId: string;
  specFileId: string;
  specType: string;
  fileName: string;
  /** `specs/{bundle}/{file}.md` — the path the reference product prints under the stage name. */
  path: string;
  revisionNumber: number;
  approved: boolean;
}

/** One finding, in the shape the card renders it (task 111; Эталон §1.3). */
export interface FeedReviewItem {
  id: string;
  /** «Section — subsection»: the item's heading. */
  sectionPath: string;
  title: string;
  body: string;
  suggestion: string;
  confidence: number;
  severity: 'blocking' | 'advisory';
  /** `linter` items are measurements, not judgements — the card says so (task 114). */
  source: 'model' | 'linter';
}

export interface ReviewBlock extends FeedBlockBase {
  kind: 'review';
  role: 'assistant';
  reviewId: string;
  specType: string;
  outcome: 'pass' | 'needs_revision';
  /** The paragraph that opens the card; `null` on a board written before review.v2. */
  summary: string | null;
  items: readonly FeedReviewItem[];
  decision: 'accept' | 'ignore' | 'request_changes' | null;
  /** What the user ticked, once the decision is taken — history, not a live selection. */
  selectedItemIds: readonly string[] | null;
  /**
   * How many times this file has already been sent back, and how many times it may be (task 113).
   *
   * Derived, not stored: the count is the number of request-changes decisions among this file's
   * boards, and the budget is configuration. The card needs both to say *why* it is not offering
   * Request changes any more, which is the whole of the gate-copy lesson (D-97).
   */
  cyclesUsed: number;
  cycleBudget: number;
  /**
   * The board that replaced this one, or `null` when nothing has (task 142).
   *
   * **Supersession is its own fact, and it is not the negation of «is the tail».** The card used to
   * infer «you are looking at an old board» from not being the block the feed is waiting on, and
   * those are different things: a pending round, a run in flight and an undecided proposal all
   * outrank a pending review in the tail order, so a board that is perfectly current — latest
   * revision, no decision, nothing newer anywhere — renders as not-the-tail whenever any of them is
   * outstanding. Telling that reader «a newer review is below» would be a lie the product states
   * confidently, which is worse than the confusion it was meant to fix.
   *
   * So it is computed here from the two things that actually make a board old: another board on the
   * same file written after it, or a revision of that file newer than the one it reviewed
   * (FR-010 AC-8). The value is the newer board's id, so the badge could one day link to it.
   */
  supersededBy: string | null;
}

/** A conversational refinement awaiting accept or reject (FR-011). */
export interface ProposalBlock extends FeedBlockBase {
  kind: 'proposal';
  role: 'assistant';
  /**
   * The proposal the decision is addressed to. For a cross-file edit (task 118) that is the first
   * member of the batch — the endpoint recognises the batch from it and decides the whole set, so
   * the card has one id to send whether it shows one diff or four.
   */
  proposedChangeId: string;
  specFileId: string;
  /** Every file this card covers, in bundle order. One entry for an M4 refinement. */
  files: readonly { specFileId: string; fileName: string }[];
  fileName: string;
  instruction: string;
  status: 'pending' | 'accepted' | 'rejected';
  /** Present when this block is a cross-file edit rather than a single-file refinement. */
  editBatchId: string | null;
}

/**
 * «Project bundle created» — the session leaving the interview (task 133; Эталон §1.2).
 *
 * Derived at the one transition out of the entry stage rather than stored, like every other block
 * here: the bundle has no row of its own, and the moment it comes into existence is the moment the
 * first document has somewhere to go.
 */
export interface BundleBlock extends FeedBlockBase {
  kind: 'bundle';
  role: 'system';
  /** The folder the document cards print in their paths — `bundleSlug` of the project's name. */
  bundleName: string;
  /** What this methodology's bundle will contain, in graph order. */
  fileNames: readonly string[];
}

/** The sealed session (FR-020 AC-3). */
export interface CompletionBlock extends FeedBlockBase {
  kind: 'completion';
  role: 'system';
  /** How many times the session has reached `complete` — a re-entry is a second sealing. */
  completionCount: number;
}

export type FeedBlock =
  | SeedBlock
  | MessageBlock
  | RoundBlock
  | TransitionBlock
  | BundleBlock
  | GenerationBlock
  | DocumentBlock
  | ReviewBlock
  | ProposalBlock
  | CompletionBlock;

/**
 * What the session is waiting on, as a tail of the feed (task 104 AC-2).
 *
 * The five states the M6 gate walks through — a pending round, a generation in flight, a draft
 * awaiting approval, an undecided review, a sealed session — each map to exactly one variant here,
 * and each variant names the block that owns it. That is what makes "the controls live inside the
 * block they belong to" a consequence of the projection rather than a rule the page has to remember.
 *
 * **The precedence mirrors `findPendingDecision`** (`specs/pending-decision.ts`) on purpose: the page
 * and the chat endpoint must agree about which card is in front of the user, or a typed "approve"
 * applies to something other than what is on screen (FR-009 AC-7).
 */
export type FeedTail =
  | { kind: 'pending-round'; blockId: string; roundId: string }
  | { kind: 'generating'; blockId: string; runId: string; attempt: number; stage: string }
  | { kind: 'pending-proposal'; blockId: string; proposedChangeId: string }
  | { kind: 'pending-review'; blockId: string; reviewId: string }
  | { kind: 'pending-approval'; blockId: string; specFileId: string; revisionNumber: number }
  | { kind: 'sealed'; blockId: string }
  | { kind: 'open' };

export interface Feed {
  blocks: readonly FeedBlock[];
  /** Where the session is now, straight from `workflow_state` — never inferred from the blocks. */
  position: StagePosition;
  tail: FeedTail;
  /**
   * A rewrite the review board asked for and the session has not produced yet (task 113).
   *
   * Mirrors `requestedChangesForFile` exactly — a request-changes decision standing on the file's
   * latest revision — so the control the page offers and the work the generation will actually do
   * are derived from the same fact rather than from two guesses about it.
   */
  revisionOwed: { specType: string; points: number } | null;
}
