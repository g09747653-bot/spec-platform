'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

import { diffLines, formatUnifiedDiff } from '@/modules/specs/diff';

import { type PhraseKey } from '../i18n/dictionary';
import { useT } from '../i18n/locale-context';
import { cn } from '../lib/cn';
import { useGenerationStream } from '../session/generation-context';
import { viewerViewValue } from '../state/ui-state';
import { useUiState } from '../state/use-ui-state';
import { Button, buttonVariants } from '../ui/button';
import { DiffBody } from '../ui/diff-body';
import { CloseIcon } from '../ui/icons';

import { contentUrl, useCopyContent } from './content';
import { Markdown } from './markdown';
import { documentMetrics } from './metrics';
import { outlineOf } from './outline';
import { RawPane } from './raw-pane';
import {
  DOCUMENT_VIEWS,
  VIEW_LABELS,
  isDocumentView,
  isViewerView,
  type DocumentView,
  type ViewerView,
} from './views';

/**
 * The document viewer — a centred overlay over the conversation (tasks 138, 147).
 *
 * **«The card is a door, not a box.»** The complaint this closes is the customer's own: their
 * reference opens a generated file into a full reading surface with several views, ours opened a
 * ~300-pixel `<pre>` inside the card and called it a preview. The card keeps a bounded excerpt — that
 * is what an excerpt is for — and the eye on it opens *this*, at every stage of the document's life:
 * while it is being written, once it is drafted, and after it is approved.
 *
 * **Why it stopped being a dock** (task 147, from the customer's video, А-17 §5). A pane in the
 * right-hand dock had to be sized as a share of the row, so its width followed the window and the
 * document competed with the conversation for it; and the sidebar had to be displaced to make room,
 * which is a second thing moving every time a document is opened. Centred over a scrim, the panel's
 * width is a decision instead of a residue: `max-w-4xl`, the same in all four views, independent of
 * what is inside it. That last property is the acceptance criterion — «identical width across all
 * tabs» — and it is also what made D-205 possible, because a panel whose width is content-derived is
 * a panel a single 1 200-character line can carry off the edge of the screen.
 *
 * **One data path, two surfaces.** While a generation is in flight the text here is the session's
 * reader, taken from context — the same bytes, the same sequence de-duplication, the same run. There
 * is no second `GET …/stream`. The AC that the liveness invariant survives an open viewer is
 * therefore met by construction *and* by this panel carrying its own Stop: whatever is on screen, the
 * control that ends the wait is on the surface the reader is looking at (Д-1). Task 147's header
 * list does not mention Stop, and it stays anyway for exactly that reason.
 *
 * **`position: fixed` and nothing else.** There is no portal in this codebase; `ShortcutsDialog` is
 * the one existing overlay and it escapes its frame the same way, which works because no ancestor
 * carries a transform. Adding a portal for one more overlay would be a second mechanism for the same
 * job.
 */
export type ViewerTarget =
  | {
      kind: 'revision';
      specFileId: string;
      fileName: string;
      stage: string;
      revisionNumber: number;
      approved: boolean;
    }
  | { kind: 'live'; stage: string; fileName: string };

interface Loaded {
  /** Which document and revision these bytes are, so a stale answer is discarded by comparison. */
  key: string;
  content: string;
  previous: string | null;
  previousRevision: number | null;
}

export function ViewerPane({ target, onClose }: { target: ViewerTarget; onClose: () => void }) {
  const t = useT();
  const [storedView, setStoredView] = useUiState(viewerViewValue);
  const view: ViewerView = isViewerView(storedView) ? storedView : 'preview';
  const stream = useGenerationStream();
  const closeRef = useRef<HTMLButtonElement>(null);

  /*
   * Which document view the outline panel is dropped over.
   *
   * The outline is no longer a fourth pane but a panel anchored to its own button, so opening it
   * cannot take the document off the screen — the video shows the document under it. The stored
   * preference still has four members, because `data-view`, the `1`–`4` keys and the persisted value
   * all name the outline among them; this remembers what the reader was reading, so closing the
   * panel puts them back there rather than in Preview. Written in the button's own handler, which is
   * why it can be plain state: nothing here sets it during a render.
   */
  const [documentView, setDocumentView] = useState<DocumentView>('preview');
  const shown: DocumentView = isDocumentView(view) ? view : documentView;

  const [fetched, setFetched] = useState<Loaded | null>(null);
  /*
   * The failure is remembered as a phrase key rather than as a sentence (task 143): the fetch runs
   * in an effect that must not close over the translator, and a language chosen between the failure
   * and the paint should still print the message the reader can read.
   */
  const [failed, setFailed] = useState<{ key: string; reason: PhraseKey } | null>(null);

  const revisionNumber = target.kind === 'revision' ? target.revisionNumber : null;
  const specFileId = target.kind === 'revision' ? target.specFileId : null;
  const key =
    target.kind === 'revision' ? `${target.specFileId}:${String(target.revisionNumber)}` : 'live';

  /*
   * What is on screen is decided by comparing keys at render time, not by clearing state in an
   * effect. Switching documents therefore shows «reading…» in the same render that changes the
   * target, instead of showing the previous document's bytes for one frame under the new title —
   * and no `setState` runs synchronously inside an effect body (`react-hooks/set-state-in-effect`).
   */
  const loaded = fetched?.key === key ? fetched : null;
  const failure = failed?.key === key ? failed.reason : null;

  /*
   * The keyboard lands inside the overlay when it opens, as it does in the shortcuts dialog: a modal
   * surface nobody's caret is on is one `Tab` walks straight out of, into the conversation it is
   * covering. Escape is the session's own binding and is deliberately left there (it closes the
   * shortcuts dialog first, then this).
   */
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  useEffect(() => {
    if (target.kind !== 'revision') return;

    const readSpecFileId = target.specFileId;
    const number = target.revisionNumber;

    /*
     * The stored bytes of this revision and of the one before it — one request each, through the
     * endpoint that already answers "the bytes of this file" (task 74). The predecessor is what makes
     * the Diff view answerable without a second concept of history on the client.
     *
     * Cancelled by an `AbortController` rather than by a "was this still the current target" flag:
     * closing the panel, or opening another document, should stop the request rather than let it
     * finish and be thrown away. An abort surfaces as a rejection, which is why the catch asks
     * whether it *was* one before reporting a failure the reader would not understand.
     */
    const attempt = new AbortController();

    void (async () => {
      const read = async (revision: number): Promise<string | null> => {
        const response = await fetch(contentUrl(readSpecFileId, revision), {
          signal: attempt.signal,
        });

        return response.ok ? await response.text() : null;
      };

      try {
        const content = await read(number);

        if (content === null) {
          setFailed({ key, reason: 'viewer.pane.read-failed' });
          return;
        }

        const previous = number > 1 ? await read(number - 1) : null;

        setFetched({
          key,
          content,
          previous,
          previousRevision: previous === null ? null : number - 1,
        });
      } catch {
        if (!attempt.signal.aborted) {
          setFailed({ key, reason: 'viewer.pane.read-failed' });
        }
      }
    })();

    return () => {
      attempt.abort();
    };
    // `key` is the identity of what is being read; the target object is rebuilt on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const streaming = target.kind === 'live';
  const content = streaming ? stream.state.text : (loaded?.content ?? '');
  const metrics = documentMetrics(content);
  const counted = content !== '';
  const following = stream.state.status === 'streaming' || stream.state.status === 'reconnecting';

  return (
    /*
      `z-[25]`, decided rather than defaulted: the application header is 20, the connection banner
      30, the toasts 40 and the shortcuts dialog 50. A document must cover the header — it is the
      thing the reader asked for — and must not cover the two surfaces that speak *about* the
      product's state while it is open: «you are offline» is exactly the news a reader must not lose
      behind a document, and Copy's confirmation is a toast, so a toast under the overlay would be a
      control reporting into a place nobody can see.
    */
    <div
      className="bg-scrim fixed inset-0 z-[25] flex items-center justify-center p-4"
      data-testid="viewer-overlay"
      onClick={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        /*
          One width in every view (task 147 AC). Fixed rather than derived: `max-w-4xl` is a number
          this design chose, and no view can widen the panel by being wide — which is the whole of
          the identical-width criterion, and the class of defect D-205 belonged to.
        */
        className="border-border-subtle bg-surface flex max-h-full w-full max-w-4xl min-w-0 flex-col rounded-xl border shadow-xl"
        data-testid="viewer-pane"
        data-viewer-kind={target.kind}
        data-view={view}
        aria-label={t('viewer.pane.label', { fileName: target.fileName })}
        onClick={(event) => {
          // The backdrop closes; the panel does not, the way the shortcuts dialog behaves.
          event.stopPropagation();
        }}
      >
        <header className="border-border-subtle flex shrink-0 items-start justify-between gap-4 border-b px-4 py-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate font-mono text-sm" data-testid="viewer-pane-name">
              {target.fileName}
            </span>
            <span
              className="text-foreground-muted flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs"
              data-testid="viewer-pane-metrics"
              data-approved={String(target.kind === 'revision' && target.approved)}
            >
              {/*
                «Draft» and «Rev 3» are two states of the same reading, and a walk that told them
                apart by the word would be reading chrome (task 143). The attribute says which one
                this is; the span still says it in the reader's own language.
              */}
              <span
                data-testid="viewer-metric-revision"
                data-revision={revisionNumber === null ? 'draft' : String(revisionNumber)}
              >
                {revisionNumber === null
                  ? t('viewer.metrics.draft')
                  : t('common.revision-badge', { revision: revisionNumber })}
              </span>
              {/*
                Withheld until there is something to count. «0 lines · 0 words» over a document
                still being fetched is a measurement of nothing presented as a measurement, and it
                was on screen for as long as the request took.
              */}
              {counted && (
                <>
                  <span aria-hidden>·</span>
                  <span data-testid="viewer-metric-lines" data-lines={String(metrics.lines)}>
                    {t('viewer.metrics.lines', { count: metrics.lines })}
                  </span>
                  <span aria-hidden>·</span>
                  <span data-testid="viewer-metric-words" data-words={String(metrics.words)}>
                    {t('viewer.metrics.words', { count: metrics.words })}
                  </span>
                </>
              )}
              {target.kind === 'revision' && target.approved && (
                <>
                  <span aria-hidden>·</span>
                  <span className="text-success-ink">{t('viewer.metrics.approved')}</span>
                </>
              )}
              {/*
                The way to this document's own URL, kept out of the header's right-hand line
                because the video's composition is that one line and this is not one of its members
                (task 147). It stays on the surface at all: `/specs/:id` is the only place a reader
                can walk the file's revisions and link somebody to one, and dropping the single
                affordance that reaches it would strand the page.
              */}
              {target.kind === 'revision' && (
                <>
                  <span aria-hidden>·</span>
                  <Link
                    href={`/specs/${target.specFileId}?view=${shown}&rev=${String(target.revisionNumber)}`}
                    className="hover:text-foreground underline underline-offset-2"
                    data-testid="viewer-pane-full"
                  >
                    {t('viewer.pane.full-page')}
                  </Link>
                </>
              )}
            </span>
          </div>

          {/*
            The header's right-hand line, in the video's order: Outline · [Preview|Raw|Diff] · Copy ·
            Download · ✕, plus Stop while a generation is being watched.
          */}
          <div className="flex shrink-0 items-center gap-1.5">
            {streaming && following && (
              <Button
                variant="secondary"
                size="sm"
                data-testid="viewer-stop-generation"
                onClick={stream.detach}
              >
                {t('common.stop')}
              </Button>
            )}

            <OutlineButton
              content={content}
              open={view === 'outline'}
              onToggle={() => {
                if (view === 'outline') {
                  setStoredView(documentView);
                  return;
                }

                setDocumentView(shown);
                setStoredView('outline');
              }}
            />

            <nav
              className="border-border-subtle bg-background flex gap-0.5 rounded-md border p-0.5"
              aria-label={t('viewer.tabs.label')}
              data-testid="viewer-pane-tabs"
            >
              {DOCUMENT_VIEWS.map((candidate) => (
                <button
                  key={candidate}
                  type="button"
                  data-testid={`viewer-pane-tab-${candidate}`}
                  data-state={view === candidate ? 'current' : 'available'}
                  className={cn(
                    'rounded px-2.5 py-1 text-xs transition-colors',
                    view === candidate
                      ? 'bg-primary text-primary-foreground font-medium'
                      : 'text-foreground-muted hover:bg-surface',
                  )}
                  onClick={() => {
                    setDocumentView(candidate);
                    setStoredView(candidate);
                  }}
                >
                  {t(VIEW_LABELS[candidate])}
                </button>
              ))}
            </nav>

            {/*
              Copy and Download, on the header rather than inside Raw (task 147). They are about the
              document, not about one way of reading it, and the reader who wants the file is as
              likely to be in Preview. `content.ts` is the one place that decides which bytes either
              of them hands over — a draft still being written has none, so neither is offered.
            */}
            {specFileId !== null && revisionNumber !== null && (
              <TakeAway
                specFileId={specFileId}
                revision={revisionNumber}
                fileName={target.fileName}
              />
            )}

            <button
              ref={closeRef}
              type="button"
              aria-label={t('viewer.pane.close')}
              title={t('viewer.pane.close-hint')}
              data-testid="viewer-pane-close"
              className="border-border-subtle text-foreground-muted hover:bg-background hover:text-foreground inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border"
              onClick={onClose}
            >
              <CloseIcon />
            </button>
          </div>
        </header>

        {/*
          The panel scrolls inside itself, which is what keeps the page still: `min-h-0` so this box
          may be shorter than its content, and the scroll on this box rather than on the document.
        */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4" data-testid="viewer-pane-body">
          {failure !== null && (
            <p role="alert" className="text-sm text-danger-ink">
              {t(failure)}
            </p>
          )}

          {failure === null && target.kind === 'revision' && loaded === null && (
            <p className="text-foreground-muted text-sm" data-testid="viewer-pane-loading">
              {t('viewer.pane.reading')}
            </p>
          )}

          {failure === null && content === '' && streaming && (
            <p className="text-foreground-muted text-sm" data-testid="viewer-pane-waiting">
              {t('viewer.pane.waiting')}
            </p>
          )}

          {content !== '' && (
            <ViewerBody
              view={shown}
              content={content}
              fileName={target.fileName}
              specFileId={specFileId}
              revisionNumber={revisionNumber}
              previous={loaded?.previous ?? null}
              previousRevision={loaded?.previousRevision ?? null}
              currentRevision={revisionNumber}
            />
          )}
        </div>
      </section>
    </div>
  );
}

/**
 * The outline, dropped from its own button (task 147; video §1, frame 11).
 *
 * A panel anchored to the control that opens it, over a document that stays visible underneath —
 * rather than a fourth tab, which replaced the document with its own table of contents and made
 * «where was I» a question. The button keeps the `viewer-pane-tab-outline` id it had as a tab,
 * because that is the name every walk and every shot script already presses; what changed is what
 * the press does.
 */
function OutlineButton({
  content,
  open,
  onToggle,
}: {
  content: string;
  open: boolean;
  onToggle: () => void;
}) {
  const t = useT();
  const outline = outlineOf(content);

  return (
    <div className="relative">
      <button
        type="button"
        data-testid="viewer-pane-tab-outline"
        data-state={open ? 'current' : 'available'}
        aria-expanded={open}
        className={cn(
          'border-border-subtle rounded-md border px-2.5 py-1 text-xs transition-colors',
          open
            ? 'bg-primary text-primary-foreground font-medium'
            : 'text-foreground-muted hover:bg-background',
        )}
        onClick={onToggle}
      >
        {t('common.view-outline')}
      </button>

      {open && (
        <nav
          data-testid="viewer-pane-outline"
          aria-label={t('common.view-outline')}
          className="border-border-subtle bg-surface absolute top-full right-0 z-10 mt-1 flex max-h-80 w-72 flex-col gap-0.5 overflow-y-auto rounded-md border p-2 text-left shadow-lg"
        >
          {outline.length === 0 ? (
            <p className="text-foreground-muted text-sm">{t('viewer.pane.outline-empty')}</p>
          ) : (
            outline.map((heading) => (
              <span
                key={heading.anchor}
                data-testid="viewer-pane-outline-entry"
                data-anchor={heading.anchor}
                className="text-sm"
                style={{ paddingLeft: `${String((heading.level - 1) * 0.85)}rem` }}
              >
                {heading.text}
              </span>
            ))
          )}
        </nav>
      )}
    </div>
  );
}

/**
 * Copy and Download over the same bytes (task 147; FR-016 AC-5).
 *
 * Download is an anchor with a `download` attribute rather than a fetch-and-object-URL: the
 * endpoint answers `Content-Disposition: inline`, and for a same-origin link the attribute is what
 * turns a view into a save — with no second request, so there is no second set of bytes to differ
 * from Copy's. The route's header is deliberately left alone: it is what makes the same URL
 * readable in a tab.
 */
function TakeAway({
  specFileId,
  revision,
  fileName,
}: {
  specFileId: string;
  revision: number;
  fileName: string;
}) {
  const t = useT();
  const { copy } = useCopyContent(specFileId, revision);

  return (
    <>
      <Button variant="ghost" size="sm" data-testid="viewer-copy" onClick={copy}>
        {t('common.copy')}
      </Button>
      <a
        href={contentUrl(specFileId, revision)}
        download={fileName}
        data-testid="viewer-download"
        title={t('viewer.pane.download-hint', { fileName })}
        className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }))}
      >
        {t('common.download')}
      </a>
    </>
  );
}

function ViewerBody({
  view,
  content,
  fileName,
  specFileId,
  revisionNumber,
  previous,
  previousRevision,
  currentRevision,
}: {
  view: DocumentView;
  content: string;
  fileName: string;
  specFileId: string | null;
  revisionNumber: number | null;
  previous: string | null;
  previousRevision: number | null;
  currentRevision: number | null;
}) {
  const t = useT();

  if (view === 'preview') return <Markdown content={content} />;

  if (view === 'raw') {
    /*
     * Raw here carries no Copy of its own: the header has one, over the same bytes, and two copy
     * controls on one surface would be two answers to a reader asking which one is the file. The
     * standalone page keeps the pane's own, because there the pane is the whole surface.
     */
    return (
      <RawPane
        specFileId={specFileId ?? ''}
        content={content}
        revision={revisionNumber}
        copyable={false}
      />
    );
  }

  if (previous === null || previousRevision === null || currentRevision === null) {
    /*
     * Two different emptinesses, one element (task 143): a document still being written has no
     * stored predecessor *yet*, a first revision never will. The sentences already say which; the
     * attribute says it to anything that cannot read them.
     */
    return (
      <p
        className="text-sm"
        data-testid="viewer-pane-diff-empty"
        data-empty-reason={currentRevision === null ? 'still-writing' : 'no-predecessor'}
      >
        {currentRevision === null
          ? t('viewer.diff.still-writing')
          : t('viewer.diff.first-revision', { fileName })}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-foreground-muted text-xs" data-testid="viewer-pane-diff-caption">
        {t('viewer.diff.caption', { from: previousRevision, to: currentRevision })}
      </p>
      <DiffBody
        unifiedDiff={formatUnifiedDiff(diffLines(previous, content), fileName)}
        testId="viewer-pane-diff"
      />
    </div>
  );
}
