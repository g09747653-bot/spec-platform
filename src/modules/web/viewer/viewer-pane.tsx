'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { diffLines, formatUnifiedDiff } from '@/modules/specs/diff';

import { type PhraseKey } from '../i18n/dictionary';
import { useT } from '../i18n/locale-context';
import { cn } from '../lib/cn';
import { useGenerationStream } from '../session/generation-context';
import { viewerViewValue } from '../state/ui-state';
import { useUiState } from '../state/use-ui-state';
import { Button } from '../ui/button';
import { DiffBody } from '../ui/diff-body';
import { CloseIcon } from '../ui/icons';

import { Markdown } from './markdown';
import { documentMetrics } from './metrics';
import { outlineOf } from './outline';
import { RawPane } from './raw-pane';
import { VIEWS, VIEW_LABELS, isViewerView, type ViewerView } from './views';

/**
 * The document viewer, docked beside the conversation (task 138).
 *
 * **«The card is a door, not a box.»** The complaint this closes is the customer's own: their
 * reference opens a generated file into a full reading surface with several views, ours opened a
 * ~300-pixel `<pre>` inside the card and called it a preview. The card keeps a bounded excerpt — that
 * is what an excerpt is for — and the eye on it opens *this*, at every stage of the document's life:
 * while it is being written, once it is drafted, and after it is approved.
 *
 * **One data path, two surfaces.** While a generation is in flight the text here is the session's
 * reader, taken from context — the same bytes, the same sequence de-duplication, the same run. There
 * is no second `GET …/stream`. The AC that the liveness invariant survives an open viewer is
 * therefore met by construction *and* by this pane carrying its own Stop: whatever the width of the
 * window, the control that ends the wait is on the surface the reader is looking at.
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

  const [fetched, setFetched] = useState<Loaded | null>(null);
  /*
   * The failure is remembered as a phrase key rather than as a sentence (task 143): the fetch runs
   * in an effect that must not close over the translator, and a language chosen between the failure
   * and the paint should still print the message the reader can read.
   */
  const [failed, setFailed] = useState<{ key: string; reason: PhraseKey } | null>(null);

  const revisionNumber = target.kind === 'revision' ? target.revisionNumber : null;
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

  useEffect(() => {
    if (target.kind !== 'revision') return;

    const specFileId = target.specFileId;
    const number = target.revisionNumber;

    /*
     * The stored bytes of this revision and of the one before it — one request each, through the
     * endpoint that already answers "the bytes of this file" (task 74). The predecessor is what makes
     * the Diff view answerable without a second concept of history on the client.
     *
     * Cancelled by an `AbortController` rather than by a "was this still the current target" flag:
     * closing the pane, or opening another document, should stop the request rather than let it
     * finish and be thrown away. An abort surfaces as a rejection, which is why the catch asks
     * whether it *was* one before reporting a failure the reader would not understand.
     */
    const attempt = new AbortController();

    void (async () => {
      const read = async (revision: number): Promise<string | null> => {
        const response = await fetch(`/api/specs/${specFileId}/content?rev=${String(revision)}`, {
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
    <section
      className="border-border-subtle bg-surface flex min-h-0 w-[clamp(26rem,44%,52rem)] shrink-0 flex-col border-l"
      data-testid="viewer-pane"
      data-viewer-kind={target.kind}
      data-view={view}
      aria-label={t('viewer.pane.label', { fileName: target.fileName })}
    >
      <header className="border-border-subtle flex shrink-0 flex-col gap-2 border-b px-4 py-3">
        <div className="flex items-start justify-between gap-3">
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
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {/*
              Stop, on the surface the reader is on (Д-1). The card below carries one too; they are
              the same control over the same reader, which is the point of lifting the stream to the
              surface rather than letting each place own one.
            */}
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

            {target.kind === 'revision' && (
              <Link
                href={`/specs/${target.specFileId}?view=${view}&rev=${String(target.revisionNumber)}`}
                className="text-foreground-muted hover:text-foreground text-xs underline underline-offset-2"
                data-testid="viewer-pane-full"
              >
                {t('viewer.pane.full-page')}
              </Link>
            )}

            <button
              type="button"
              aria-label={t('viewer.pane.close')}
              title={t('viewer.pane.close-hint')}
              data-testid="viewer-pane-close"
              className="border-border-subtle text-foreground-muted hover:bg-background hover:text-foreground inline-flex h-8 w-8 items-center justify-center rounded-md border"
              onClick={onClose}
            >
              <CloseIcon />
            </button>
          </div>
        </div>

        <nav
          className="flex gap-1"
          aria-label={t('viewer.tabs.label')}
          data-testid="viewer-pane-tabs"
        >
          {VIEWS.map((candidate) => (
            <button
              key={candidate}
              type="button"
              data-testid={`viewer-pane-tab-${candidate}`}
              data-state={view === candidate ? 'current' : 'available'}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs transition-colors',
                view === candidate
                  ? 'bg-primary text-primary-foreground font-medium'
                  : 'text-foreground-muted hover:bg-background',
              )}
              onClick={() => {
                setStoredView(candidate);
              }}
            >
              {t(VIEW_LABELS[candidate])}
            </button>
          ))}
        </nav>
      </header>

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
            view={view}
            content={content}
            fileName={target.fileName}
            specFileId={target.kind === 'revision' ? target.specFileId : null}
            previous={loaded?.previous ?? null}
            previousRevision={loaded?.previousRevision ?? null}
            currentRevision={target.kind === 'revision' ? target.revisionNumber : null}
          />
        )}
      </div>
    </section>
  );
}

function ViewerBody({
  view,
  content,
  fileName,
  specFileId,
  previous,
  previousRevision,
  currentRevision,
}: {
  view: ViewerView;
  content: string;
  fileName: string;
  specFileId: string | null;
  previous: string | null;
  previousRevision: number | null;
  currentRevision: number | null;
}) {
  const t = useT();

  if (view === 'outline') {
    const outline = outlineOf(content);

    return (
      <nav data-testid="viewer-pane-outline" className="flex flex-col gap-0.5">
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
    );
  }

  if (view === 'preview') return <Markdown content={content} />;

  if (view === 'raw') {
    /*
     * A draft still being written has no stored bytes to copy, so the Copy control is withheld
     * rather than offered and failing — the same instinct as the card's Preview, which is offered
     * only where the endpoint can answer.
     */
    return (
      <RawPane specFileId={specFileId ?? ''} content={content} copyable={specFileId !== null} />
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
