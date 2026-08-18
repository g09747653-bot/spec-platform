'use client';

import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { GenerationStreamProvider } from '../session/generation-context';
import {
  isTypingTarget,
  setShortcutsOpen,
  shortcutFor,
  shortcutsOpen,
  type ShortcutId,
} from '../session/shortcuts';
import { useChatDecision } from '../session/useChatDecision';
import { sidebarCollapsedValue, viewerViewValue } from '../state/ui-state';
import { useUiState } from '../state/use-ui-state';
import { ChevronDownIcon } from '../ui/icons';
import { ViewerControlProvider } from '../viewer/viewer-control';
import type { ViewerTarget } from '../viewer/viewer-pane';

/**
 * The viewer arrives when a document is opened, not before (tasks 138, 141).
 *
 * It brings the markdown renderer and the diff machinery with it, and a session that never opens a
 * document should not pay for either — the conversation is what has to be interactive quickly, and
 * every kilobyte in front of hydration is a click that lands on an unhydrated control. `ssr: false`
 * because nothing here is on the server's first paint: the pane exists only after a press.
 */
const ViewerPane = dynamic(async () => (await import('../viewer/viewer-pane')).ViewerPane, {
  ssr: false,
});

import { BundleCreated, MessageBubble, SeedBubble, StageChip } from './bubbles';
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
import { tailPrimary } from './tail-primary';

/**
 * The session surface: one conversation, a docked composer, and a right-hand pane (tasks 105, 137).
 *
 * There are no stage pages any more. Everything the session has done is a block of this feed, in the
 * order it happened, and everything it is waiting on is the tail of it. The page above builds the
 * feed from persisted state; this component renders it and owns exactly two things the projection
 * cannot: the chat turns of this visit, and which document the composer's refinements apply to.
 *
 * **The tail decides where controls live.** A card renders its decision only when the feed says the
 * session is waiting on that card — so an older review keeps its verdict without keeping its
 * buttons, and there is never a second Approve on screen for a revision that has been superseded.
 *
 * **What M12п changed is the frame around all that** (tasks 136, 137, 141). The conversation scrolls
 * inside itself, between a header and a composer that do not move, rather than being one long page
 * that carries its header and its controls out of reach as it grows. The right dock holds the
 * sidebar or — when a document is opened — the viewer, which is wider, because a document is the
 * thing this product makes and a 300-pixel well was never a way to read one.
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
  /** The session header — rendered by the page, pinned by this component (task 137). */
  header: ReactNode;
  /** The sidebar's panels. Rendered in the dock, and displaced by the viewer when one is open. */
  sidebar: ReactNode;
}

export function SessionFeed(props: SessionFeedProps) {
  /*
   * The reader is provided here, outside everything that uses it: the drafting card writes the
   * streamed document into the feed and the viewer pane shows the same words, and there is exactly
   * one run and one reader behind both (task 138).
   */
  return (
    <GenerationStreamProvider>
      <SessionSurface {...props} />
    </GenerationStreamProvider>
  );
}

const VIEW_KEYS: Readonly<Record<string, string>> = {
  'view-outline': 'outline',
  'view-preview': 'preview',
  'view-raw': 'raw',
  'view-diff': 'diff',
};

function SessionSurface({
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
  header,
  sidebar,
}: SessionFeedProps) {
  const router = useRouter();
  const { state: chat, send } = useChatDecision(sessionId);
  const [draft, setDraft] = useState('');
  const [viewer, setViewer] = useState<ViewerTarget | null>(null);
  const [collapsed, setCollapsed] = useUiState(sidebarCollapsedValue);
  const [, setViewerView] = useUiState(viewerViewValue);

  const scrollRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  /** Whether the reader is still at the end of the conversation, and should be kept there. */
  const stuck = useRef(true);
  const [atBottom, setAtBottom] = useState(true);

  const openViewer = useCallback((target: ViewerTarget) => {
    setViewer(target);
  }, []);

  const closeViewer = useCallback(() => {
    setViewer(null);
  }, []);

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
    return press(command.control);
  }

  /**
   * Presses a control the page already renders, by the test id it already carries.
   *
   * Shared by the slash commands and by the composer's attach button (task 133): the file input
   * lives in the sidebar's Attachments card, and the composer opening *that* input is what keeps
   * one upload path rather than two.
   */
  function press(controlId: string): boolean {
    const node = document.querySelector<HTMLElement>(`[data-testid="${controlId}"]`);
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

  /*
   * The completion panel is held back to the very end (task 133; row `1.1-13`) — see the note where
   * it is rendered. Split here rather than in the projection: `buildFeed` is a statement about what
   * happened and in what order, and the panel *is* the last thing that happened; what this fixes is
   * the page rendering four more surfaces after the block list.
   */
  const tailPanel = withChat.blocks.find((block) => block.kind === 'completion');
  const body = withChat.blocks.filter((block) => block.kind !== 'completion');

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

  /** The newest document card, which is what the `V` shortcut means by «the document» (task 141). */
  const newestDocument = [...body]
    .reverse()
    .find((block): block is Extract<FeedBlock, { kind: 'document' }> => block.kind === 'document');

  /*
   * The one loud control, worked out once (task 142).
   *
   * Every surface below is handed the answer rather than reaching for `<Button>` and getting the
   * cva default. `tail-primary.ts` holds the table and its unit tests; what belongs here is only the
   * gathering of the facts it reads, all of which the page has already computed.
   */
  const primary = tailPrimary({
    tail,
    canGenerate,
    revisionOwed: feed.revisionOwed !== null && feed.revisionOwed.specType === feed.position.stage,
    // This stage's own newest document — an approved constitution says nothing about a draft tasks.
    documentApproved:
      [...body]
        .reverse()
        .find(
          (block): block is Extract<FeedBlock, { kind: 'document' }> =>
            block.kind === 'document' && block.specType === feed.position.stage,
        )?.approved ?? false,
    asking: actions.askingStage !== null,
    canAskMore: actions.canAskMore,
    fallbackOffered:
      actions.askingStage !== null &&
      !blocked &&
      !actions.canAskMore &&
      actions.unmetNeeds.length > 0,
    hasTarget: actions.target !== null,
  });

  /*
   * Keyboard shortcuts (task 141).
   *
   * One listener on the surface rather than one per control: what a key means depends on what is
   * open, and that is knowledge this component has and its children do not. `shortcutFor` decides
   * *which* shortcut a press is — including the rule that a plain letter typed into the composer is
   * a letter — so the mapping is unit-testable without a browser and this only performs it.
   */
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const id: ShortcutId | null = shortcutFor({
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        typing: isTypingTarget(event.target),
      });

      // `send` is the composer's own binding, and it has to work with the caret inside the box.
      if (id === null || id === 'send') return;

      // Escape closes the topmost thing that is open, and nothing when nothing is.
      if (id === 'close') {
        if (shortcutsOpen()) setShortcutsOpen(false);
        else if (viewer !== null) closeViewer();
        else return;

        event.preventDefault();
        return;
      }

      if (id === 'shortcuts') {
        setShortcutsOpen(true);
        event.preventDefault();
        return;
      }

      if (id === 'toggle-sidebar') {
        setCollapsed(!collapsed);
        event.preventDefault();
        return;
      }

      if (id === 'focus-composer' || id === 'slash') {
        composerRef.current?.focus();
        if (id === 'slash') setDraft((current) => (current === '' ? '/' : current));
        event.preventDefault();
        return;
      }

      if (id === 'open-viewer') {
        if (newestDocument === undefined) return;

        openViewer({
          kind: 'revision',
          specFileId: newestDocument.specFileId,
          fileName: newestDocument.fileName,
          stage: newestDocument.stage,
          revisionNumber: newestDocument.revisionNumber,
          approved: newestDocument.approved,
        });
        event.preventDefault();
        return;
      }

      /*
       * The four view keys belong to the pane, and a pane that is not open has no view to switch.
       * The pane reads the stored view, so setting it here is how the key reaches it — one value,
       * one home (task 141's single persistence module).
       */
      const view = VIEW_KEYS[id];
      if (viewer !== null && view !== undefined) {
        setViewerView(view);
        event.preventDefault();
      }
    }

    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [collapsed, setCollapsed, viewer, closeViewer, openViewer, newestDocument, setViewerView]);

  /** Whether the conversation is scrolled to its end, which decides the jump control (task 137). */
  const onScroll = useCallback(() => {
    const node = scrollRef.current;
    if (node === null) return;

    const ended = node.scrollHeight - node.scrollTop - node.clientHeight < 64;
    stuck.current = ended;
    setAtBottom(ended);
  }, []);

  function jumpToEnd() {
    const node = scrollRef.current;
    stuck.current = true;
    node?.scrollTo({ top: node.scrollHeight });
  }

  /*
   * The conversation stays at its end unless the reader has moved away from it (task 137).
   *
   * A conversation that grows while you are reading the middle of it must not yank you to the
   * bottom — but one you have never left should show what just arrived, and before this a completed
   * session opened with the review board of two stages ago on screen and the completion panel below
   * the fold. `stuck` is a ref rather than state because it is read inside the observer and changing
   * it must not re-render.
   *
   * A `ResizeObserver` rather than a dependency on the block count: the document being written grows
   * the feed continuously without adding a block, and that is exactly when following it matters.
   */
  useEffect(() => {
    const scroller = scrollRef.current;
    const list = listRef.current;
    if (scroller === null || list === null) return;

    scroller.scrollTop = scroller.scrollHeight;

    const observer = new ResizeObserver(() => {
      if (stuck.current) scroller.scrollTop = scroller.scrollHeight;
    });
    observer.observe(list);

    return () => {
      observer.disconnect();
    };
  }, []);

  function renderBlock(block: FeedBlock) {
    const isTail = tail.kind !== 'open' && tail.blockId === block.id;

    switch (block.kind) {
      case 'seed':
        return <SeedBubble key={block.id} block={block} />;

      case 'message':
        return <MessageBubble key={block.id} block={block} />;

      case 'transition':
        return <StageChip key={block.id} block={block} />;

      case 'bundle':
        return <BundleCreated key={block.id} block={block} />;

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
            <p className="text-foreground-muted w-full text-xs" data-testid="generation-marker">
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
      <ViewerControlProvider value={{ open: openViewer, openTarget: viewer }}>
        {/*
          `min-w-0` is the whole of the Raw-clipping fix, and it belongs here rather than on any of
          the surfaces that showed the symptom (task 142).

          The row is a flex item of the page's own `session` row, with `flex: 1 1 0%`. Without this
          class its automatic minimum size is content-based — and the content it is measured against
          is the viewer pane, whose width is `clamp(26rem, 44%, 52rem)`. A percentage is indefinite
          while intrinsic sizes are being computed, so the middle term falls back to the pane's
          contents, and the widest of those is the Raw view's `<pre>`, which does not wrap. A single
          1 200-character `_Touches:_` line therefore sized this row to twenty-eight thousand pixels:
          the conversation column, being `flex-1`, swallowed the surplus and carried the pane off the
          right-hand edge, where the frame's `overflow-hidden` ate it. Measured before the fix: the
          pane's right edge at 28 516 px in a 1 280 px window, its own width unchanged at 832.

          So the defect was never in the pane or in the `<pre>`; both behaved. What was missing was
          the instruction, at the one place a row learns it, that this row is as wide as the window
          and its children are the ones that scroll. `e2e/bug-hunt-M13.spec.ts` measures it.
        */}
        <div className="flex min-h-0 min-w-0 flex-1" data-testid="session-panes">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {/* Pinned: the title, the pills and the collapse control never scroll away. */}
            <div className="border-border-subtle bg-surface shrink-0 border-b px-4 py-2.5">
              {header}
            </div>

            <div
              ref={scrollRef}
              onScroll={onScroll}
              className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain"
              data-testid="feed-scroll"
            >
              <ol
                ref={listRef}
                className="feed-measure flex flex-col gap-4 px-4 pt-6 pb-8"
                data-testid="feed"
              >
                {body.map((block) => (
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
                      primary={primary}
                    />
                  </li>
                )}

                <li className="flex w-full">
                  <StageActions
                    sessionId={sessionId}
                    actions={actions}
                    awaitingRound={blocked}
                    deadlineMs={deadlineMs}
                    primary={primary}
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

                {/*
                  The end of the feed, and it means it (task 133; row `1.1-13`; Эталон §1.1).

                  The panel was already the last *block*, but four surfaces render after the block
                  list — the drafting card, the stage bar, Refine, the revert offer — and a chat
                  reply appended during a completed session landed below all of them. So the
                  reference's "final panel" was a panel with a working stage bar underneath it. Held
                  back to here instead: nothing is hidden, everything that was offered is still
                  offered, and the session ends where it says it ends.
                */}
                {tailPanel !== undefined && (
                  <li key={tailPanel.id} className="contents">
                    {renderBlock(tailPanel)}
                  </li>
                )}
              </ol>

              {/*
                «You are not at the end» (Эталон §1.1). Sticky inside the scroller, so it rides the
                bottom edge of the conversation rather than the bottom of the document — and it is
                absent when there is nothing below, because a control that does nothing is noise.
              */}
              {!atBottom && (
                <button
                  type="button"
                  data-testid="jump-to-end"
                  aria-label="Jump to the end of the conversation"
                  onClick={jumpToEnd}
                  className="border-border-subtle bg-surface text-foreground-muted hover:text-foreground sticky bottom-4 left-full z-10 mr-4 -mt-2 inline-flex h-9 w-9 items-center justify-center rounded-full border shadow-lg"
                >
                  <ChevronDownIcon />
                </button>
              )}
            </div>

            <Composer
              value={draft}
              onChange={setDraft}
              inputRef={composerRef}
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
              onAttach={() => {
                press('attachment-input');
              }}
            />
          </div>

          {/*
            One dock, two possible occupants. A document displaces the panels rather than squeezing
            in beside them: at any width this product has to work at, three columns leave none of
            them wide enough to be the reason it exists.

            The sidebar stays mounted while the viewer is open — hidden, not unmounted — because its
            file input is the one upload path, and the composer's attach button presses it.
          */}
          {viewer !== null && <ViewerPane target={viewer} onClose={closeViewer} />}
          {/*
            `display: contents`, so the pane itself is the row's flex child and its `max-w-[40%]`
            resolves against the row. A wrapper box in between would have been the flex child, and
            the cap would have measured forty per cent of a box the pane itself sizes.

            `hidden` rather than not rendering it: the pane holds the session's one file input, and
            the composer's attach button presses exactly that control.
          */}
          <div className="contents" hidden={viewer !== null}>
            {sidebar}
          </div>
        </div>
      </ViewerControlProvider>
    </MethodologyNaming>
  );
}
