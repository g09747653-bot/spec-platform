import { stageLabel } from '../session/stage-display';

import { FeedItem } from './feed-item';
import { positionLabel } from './labels';
import type { CompletionBlock, MessageBlock, SeedBlock, TransitionBlock } from './model';

/**
 * The prose blocks of the conversation (task 105; Эталон §1.1, block types 1 and 3).
 *
 * Presentational and server-renderable: nothing here fetches, decides or holds state, so these
 * blocks are part of the first paint rather than something that appears once the page's JavaScript
 * has run. That matters for the invariant round 5 established — a page that has not hydrated yet
 * still shows where the session is and what it has been told.
 */

/**
 * The seed, rendered as the user's own opening message.
 *
 * The wording is the reference product's template (Эталон §1.2), and it is composed here rather than
 * stored: `sessions.initial_prompt` holds what the user actually typed, and wrapping it in a
 * sentence at write time would have made the stored grounding input a presentation decision.
 */
export function SeedBubble({ block }: { block: SeedBlock }) {
  return (
    <FeedItem block={block} align="right">
      <div className="bg-canvas border-border-subtle max-w-[34rem] rounded-2xl rounded-tr-sm border px-4 py-3 text-sm">
        <p className="whitespace-pre-wrap" data-testid="session-prompt-line">
          I want to build {block.projectName}. My project description is:{' '}
          <span data-testid="session-prompt">{block.prompt}</span>
        </p>
      </div>
    </FeedItem>
  );
}

export function MessageBubble({ block }: { block: MessageBlock }) {
  if (block.role === 'user') {
    return (
      <FeedItem block={block} align="right">
        <div
          className="bg-canvas border-border-subtle max-w-[34rem] rounded-2xl rounded-tr-sm border px-4 py-3 text-sm whitespace-pre-wrap"
          data-testid="chat-turn-user"
        >
          {block.text}
        </div>
      </FeedItem>
    );
  }

  return (
    <FeedItem block={block}>
      <div
        className="max-w-[46rem] text-sm leading-relaxed whitespace-pre-wrap"
        data-testid={block.origin === 'chat' ? 'chat-turn-assistant' : 'session-summary'}
      >
        {block.text}
        {block.streaming && <span className="text-ink-muted"> ▌</span>}
      </div>
    </FeedItem>
  );
}

/**
 * The stage chip: where the session moved, and where it moved to (Эталон §1.1, block type 3).
 *
 * Derived, never stored — see `build-feed.ts`. The dashes are animated in the reference; here they
 * are a static rule of the same width, because a chip that animates for ever is a page that looks
 * like it is still working when it is not, and round 5 was entirely about that distinction.
 */
export function StageChip({ block }: { block: TransitionBlock }) {
  return (
    <FeedItem block={block} align="center">
      <span
        className="border-border-subtle text-ink-muted inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs"
        data-testid="stage-chip"
        data-from={`${block.from.stage}${block.from.substage === null ? '' : `.${block.from.substage}`}`}
        data-to={`${block.to.stage}${block.to.substage === null ? '' : `.${block.to.substage}`}`}
      >
        <span>{positionLabel(block.from)}</span>
        <span aria-hidden className="opacity-50">
          ──▶
        </span>
        <span className="text-ink font-medium">{positionLabel(block.to)}</span>
      </span>
    </FeedItem>
  );
}

/** The sealed session (FR-020 AC-3). The export controls live beside the feed, not inside it. */
export function CompletionPanel({
  block,
  fileCount,
}: {
  block: CompletionBlock;
  fileCount: number;
}) {
  return (
    <FeedItem block={block}>
      <div
        className="border-border-subtle bg-surface w-full max-w-[46rem] rounded-xl border p-4"
        data-testid="session-complete"
      >
        <p className="text-sm font-medium">Session completed</p>
        <p className="text-ink-muted mt-1 text-sm">
          {fileCount} spec {fileCount === 1 ? 'file' : 'files'} generated. Every file in the bundle
          has an approved revision and the workflow is sealed here — no stage reopens (FR-020 AC-9).
          Download it beside the conversation, or keep refining any file: a refinement produces a
          new revision without moving the session (FR-020 AC-4).
        </p>
        {block.completionCount > 1 && (
          <p className="text-ink-muted mt-1 text-xs">
            Sealed {block.completionCount} times — the session has been re-opened and completed
            again.
          </p>
        )}
      </div>
    </FeedItem>
  );
}

/** The small caption above a card, naming the stage it belongs to. */
export function BlockCaption({ stage, trailing }: { stage: string; trailing?: string }) {
  return (
    <p className="text-ink-muted text-xs font-medium tracking-wide uppercase">
      {stageLabel(stage)}
      {trailing !== undefined && ` · ${trailing}`}
    </p>
  );
}
