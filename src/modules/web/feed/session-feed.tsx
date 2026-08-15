'use client';

import { useState } from 'react';

import { useChatDecision } from '../session/useChatDecision';

import { CompletionPanel, MessageBubble, SeedBubble, StageChip } from './bubbles';
import { appendChatTurns } from './chat-turns';
import { Composer } from './composer';
import { DocumentBlock } from './document-block';
import { FeedItem } from './feed-item';
import { GenerationSurface } from './generation-surface';
import type { Feed, FeedBlock } from './model';
import { ProposalBlockCard, RefineBox, type PendingProposalModel } from './proposal-block';
import { ReviewBlockCard } from './review-block';
import { RoundBlock } from './round-block';
import { StageActions, type StageActionsModel } from './stage-actions';

/**
 * The session, as one conversation (task 105; Эталон §1.1).
 *
 * There are no stage pages any more. Everything the session has done is a block of this feed, in the
 * order it happened, and everything it is waiting on is the tail of it. The page above builds the
 * feed from persisted state; this component renders it and owns exactly two things the projection
 * cannot: the chat turns of this visit, and which document the composer's refinements apply to.
 *
 * **The tail decides where controls live.** A card renders its decision only when the feed says the
 * session is waiting on that card — so an older review keeps its verdict without keeping its
 * buttons, and there is never a second Approve on screen for a revision that has been superseded.
 */
export interface SessionFeedProps {
  sessionId: string;
  feed: Feed;
  deadlineMs: number;
  actions: StageActionsModel;
  /** The primary document — the newest revision of the file the session is working on. */
  primaryRevisionId: string | null;
  /** That revision's text, loaded by the server so a decision never waits on a fetch. */
  primaryContent: string | null;
  /** The diff of the proposal awaiting a decision, when there is one. */
  proposal: PendingProposalModel | null;
  /** The file a refinement instruction would apply to, or `null` when nothing is drafted yet. */
  refineFileId: string | null;
  /** Whether the position drafts a document (round 2, Д-4). */
  canGenerate: boolean;
  /** Whether the stage the session is on already has a revision. */
  hasDraft: boolean;
  /** A run the server reported in flight when this page rendered (round 5, Р-3). */
  activeRun: { runId: string; attempt: number } | null;
  /** How many files the bundle currently holds, for the completion panel. */
  bundleFileCount: number;
}

export function SessionFeed({
  sessionId,
  feed,
  deadlineMs,
  actions,
  primaryRevisionId,
  primaryContent,
  proposal,
  refineFileId,
  canGenerate,
  hasDraft,
  activeRun,
  bundleFileCount,
}: SessionFeedProps) {
  const { state: chat, send } = useChatDecision(sessionId);
  const [draft, setDraft] = useState('');

  /*
   * The persisted feed with this visit's chat turns on the end. A turn in flight is shown as an
   * assistant block still being written, so the conversation never jumps from "sent" to "answered"
   * with nothing in between (task 109).
   */
  const withChat = appendChatTurns(
    feed,
    chat.busy ? [...chat.turns, { role: 'assistant', text: '…', streaming: true }] : chat.turns,
  );

  const { tail } = feed;
  const blocked = tail.kind === 'pending-round';

  /*
   * Where the drafting surface belongs. It replaces the run block while a run is in flight — the
   * same card, with Stop on it rather than Generate (task 107) — and otherwise sits at the tail
   * while the position can still produce a first draft.
   */
  const generationAtTail = tail.kind !== 'generating' && !hasDraft && (canGenerate || blocked);

  function renderBlock(block: FeedBlock) {
    const isTail = tail.kind !== 'open' && tail.blockId === block.id;

    switch (block.kind) {
      case 'seed':
        return <SeedBubble key={block.id} block={block} />;

      case 'message':
        return <MessageBubble key={block.id} block={block} />;

      case 'transition':
        return <StageChip key={block.id} block={block} />;

      case 'round':
        return (
          <RoundBlock
            key={block.id}
            sessionId={sessionId}
            block={block}
            pending={isTail}
            deadlineMs={deadlineMs}
          />
        );

      case 'generation':
        // The run the session is waiting on is drawn by the surface; a finished one is a marker.
        if (isTail && tail.kind === 'generating') {
          return (
            <FeedItem key={block.id} block={block}>
              <GenerationSurface
                sessionId={sessionId}
                stage={block.stage}
                activeRun={activeRun}
                canGenerate={canGenerate}
                blocked={blocked}
              />
            </FeedItem>
          );
        }

        /*
         * A run that finished on its first attempt says nothing the document card beside it does
         * not already say, so it renders nothing — the projection still holds it, which is what
         * puts the `collect → generate` chip above it. A failure, or a failover, is worth a line.
         */
        if (block.status !== 'failed' && block.attempt === 1) return null;

        return (
          <FeedItem key={block.id} block={block}>
            <p className="text-ink-muted max-w-[46rem] text-xs" data-testid="generation-marker">
              {block.status === 'failed'
                ? 'That generation did not complete. Nothing was lost.'
                : `Drafted on attempt ${String(block.attempt)} — an earlier provider did not answer.`}
            </p>
          </FeedItem>
        );

      case 'document':
        return (
          <DocumentBlock
            key={block.id}
            block={block}
            pending={isTail}
            primary={block.revisionId === primaryRevisionId}
            content={block.revisionId === primaryRevisionId ? primaryContent : null}
            deadlineMs={deadlineMs}
          />
        );

      case 'review':
        return <ReviewBlockCard key={block.id} block={block} pending={isTail} />;

      case 'proposal':
        return (
          <ProposalBlockCard key={block.id} block={block} proposal={isTail ? proposal : null} />
        );

      case 'completion':
        return <CompletionPanel key={block.id} block={block} fileCount={bundleFileCount} />;
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* `pb-28` keeps the last block clear of the sticky composer, which floats over the feed. */}
      <ol className="flex flex-col gap-4 px-4 pt-6 pb-28" data-testid="feed">
        {withChat.blocks.map((block) => (
          <li key={block.id} className="contents">
            {renderBlock(block)}
          </li>
        ))}

        {generationAtTail && (
          <li className="flex w-full">
            <GenerationSurface
              sessionId={sessionId}
              stage={feed.position.stage}
              activeRun={null}
              canGenerate={canGenerate}
              blocked={blocked}
            />
          </li>
        )}

        <li className="flex w-full">
          <StageActions sessionId={sessionId} actions={actions} deadlineMs={deadlineMs} />
        </li>

        {refineFileId !== null && proposal === null && (
          <li className="flex w-full">
            <RefineBox specFileId={refineFileId} />
          </li>
        )}
      </ol>

      <Composer
        value={draft}
        onChange={setDraft}
        onSend={() => {
          const outgoing = draft;
          setDraft('');
          void send(outgoing);
        }}
        busy={chat.busy}
        error={chat.error}
        hasPendingDecision={tail.kind !== 'open'}
      />
    </div>
  );
}
