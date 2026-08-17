'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useChatDecision } from '../session/useChatDecision';

import { MessageBubble, SeedBubble, StageChip } from './bubbles';
import { appendChatTurns } from './chat-turns';
import { CompletionPanel, type CompletionModel } from './completion-panel';
import { Composer } from './composer';
import type { ReferenceTarget, SlashCommand } from './composer-menus';
import { DocumentBlock } from './document-block';
import { FeedItem } from './feed-item';
import { GenerationSurface } from './generation-surface';
import { MethodologyNaming } from './methodology-naming';
import type { Feed, FeedBlock } from './model';
import { ProposalBlockCard, RefineBox, type PendingProposalModel } from './proposal-block';
import { RevertCard, type RevertModel } from './revert-card';
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
  /** Whose vocabulary the chips and captions speak (task 132) — the session's own methodology. */
  methodologyId: string;
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
  /**
   * The sentence the Describe step opens with, for an Edit chat (task 118; Эталон §5.1).
   *
   * The session's own `initial_prompt`, handed down rather than stored a second time on the round —
   * one sentence, one row, shown where the user finishes it.
   */
  describePrefill: string | null;
  /** A run the server reported in flight when this page rendered (round 5, Р-3). */
  activeRun: { runId: string; attempt: number } | null;
  /** Everything the completion panel needs: the bundle, its files, and where to export it. */
  completion: CompletionModel;
  /** The go-back offer for the document on screen, or `null` when it has only one revision. */
  revert: RevertModel | null;
  /** What an `@` may name in this chat: the bundle's files and the session's documents (task 121). */
  references: readonly ReferenceTarget[];
  /** Auto plus each configured model. A model whose key is absent is not in this list. */
  models: readonly { id: string; label: string }[];
  /** The chat's stored choice, `auto` when it has made none. */
  selectedModel: string;
}

export function SessionFeed({
  sessionId,
  feed,
  methodologyId,
  deadlineMs,
  actions,
  primaryRevisionId,
  primaryContent,
  proposal,
  refineFileId,
  canGenerate,
  describePrefill,
  activeRun,
  completion,
  revert,
  references,
  models,
  selectedModel,
}: SessionFeedProps) {
  const router = useRouter();
  const { state: chat, send } = useChatDecision(sessionId);
  const [draft, setDraft] = useState('');

  /**
   * A slash command presses **the control itself** (task 121).
   *
   * Not "calls the same endpoint" — the same button, found by the test id the page already puts on
   * it. That makes the acceptance criterion structural rather than a promise kept in two places: a
   * command cannot dispatch a different body from the button, cannot skip a confirmation the button
   * shows, and a gate that refuses answers in the gate's own words because it is the same refusal.
   *
   * `false` means the control is not on the page — which is exactly what "this command is not
   * available at this point" means, stated by the page's own rendering rather than by a second list
   * of which commands apply where.
   */
  function pressControl(command: SlashCommand): boolean {
    const node = document.querySelector<HTMLElement>(`[data-testid="${command.control}"]`);
    if (node === null) return false;

    node.scrollIntoView({ block: 'center' });
    node.click();

    return true;
  }

  async function selectModel(modelId: string): Promise<void> {
    await fetch(`/api/sessions/${sessionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelId }),
    });

    // The choice is persisted on the session, so the page re-reads it rather than remembering it:
    // a reload must show the same model, and so must the next request's adapter.
    router.refresh();
  }

  /*
   * The persisted feed with this visit's chat turns on the end. A reply still arriving is an
   * assistant block being written into, so the conversation never jumps from "sent" to "answered"
   * with nothing in between (task 109).
   */
  const withChat = appendChatTurns(feed, chat.turns);

  const { tail } = feed;
  const blocked = tail.kind === 'pending-round';

  /*
   * Where the drafting surface belongs. It replaces the run block while a run is in flight — the
   * same card, with Stop on it rather than Generate (task 107) — and otherwise sits at the tail
   * whenever the position can draft and nothing is waiting to be approved.
   *
   * It used to ask "does this stage already have a revision?", and that question has a wrong answer
   * in exactly one place: a stage the **review board sent back** has a revision and owes another one
   * (task 113). The session then sat at `generate` with an approved document, a decided board, and
   * nothing to press — the M8п cycle walk is what found it. The right question is whether a draft is
   * waiting for a decision, which is what `pending-approval` means.
   */
  const generationAtTail =
    tail.kind !== 'generating' && tail.kind !== 'pending-approval' && (canGenerate || blocked);

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
            freeTextPrefill={describePrefill}
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
                revisionOwed={feed.revisionOwed}
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
            <p
              className="text-foreground-muted max-w-[46rem] text-xs"
              data-testid="generation-marker"
            >
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
        return <CompletionPanel key={block.id} block={block} completion={completion} />;
    }
  }

  return (
    <MethodologyNaming methodologyId={methodologyId}>
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
                revisionOwed={feed.revisionOwed}
              />
            </li>
          )}

          <li className="flex w-full">
            <StageActions
              sessionId={sessionId}
              actions={actions}
              awaitingRound={blocked}
              deadlineMs={deadlineMs}
            />
          </li>

          {refineFileId !== null && proposal === null && (
            <li className="flex w-full">
              <RefineBox specFileId={refineFileId} />
            </li>
          )}

          {revert !== null && proposal === null && (
            <li className="flex w-full">
              <RevertCard sessionId={sessionId} revert={revert} />
            </li>
          )}
        </ol>

        <Composer
          value={draft}
          onChange={setDraft}
          onSend={(referenceIds) => {
            const outgoing = draft;
            setDraft('');
            void send(outgoing, referenceIds);
          }}
          busy={chat.busy}
          error={chat.error}
          hasPendingDecision={tail.kind !== 'open'}
          references={references}
          models={models}
          selectedModel={selectedModel}
          onSelectModel={(modelId) => {
            void selectModel(modelId);
          }}
          onCommand={pressControl}
        />
      </div>
    </MethodologyNaming>
  );
}
