'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { useT } from '../i18n/locale-context';
import { Button } from '../ui/button';
import { DiffBody } from '../ui/diff-body';
import { showToast } from '../ui/toast';

/**
 * «Go back to previous step» (task 127; Эталон §5.1).
 *
 * **The diff comes first.** Pressing the control does not write anything: it shows exactly what
 * going back would change, in the same green-and-red renderer the Edit review cards use, and the
 * apply is a second, separate decision. A revert that acted on the first click would be the only
 * content-changing action in this product that never showed its diff.
 *
 * **And it is an append.** The endpoint writes Rev N+1 with the content of Rev N-1; nothing is
 * unwound, and the history keeps all three (task 16's triggers make that structural). So the card
 * says «restores», not «undoes» — the difference is visible in the file's own history, and the copy
 * should not be the one place that pretends otherwise.
 */
export interface RevertModel {
  specFileId: string;
  fileName: string;
  /** The revision on screen now. */
  currentRevision: number;
  /** The one its content would be restored from. */
  previousRevision: number;
  /** Current → previous, so the preview reads as what pressing apply would do. */
  unifiedDiff: string;
}

export function RevertCard({ sessionId, revert }: { sessionId: string; revert: RevertModel }) {
  const router = useRouter();
  const t = useT();
  const [showing, setShowing] = useState(false);
  const [busy, setBusy] = useState(false);

  async function apply(): Promise<void> {
    setBusy(true);

    try {
      const response = await fetch(`/api/sessions/${sessionId}/revert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ specFileId: revert.specFileId }),
      });

      if (!response.ok) {
        showToast(t('feed.revert.toast-failed'), 'danger', 'revert-failed');
        return;
      }

      showToast(
        t('feed.revert.toast-applied', {
          fileName: revert.fileName,
          revision: revert.previousRevision,
        }),
        'success',
        'revert-applied',
      );
      setShowing(false);
      router.refresh();
    } catch {
      showToast(t('feed.revert.toast-failed'), 'danger', 'revert-failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="border-border-subtle bg-surface flex w-full flex-col gap-3 rounded-xl border p-4"
      data-testid="revert-card"
      /*
        The three revisions the sentence beside the button names, as numbers (task 143).
        «writes revision N+1 with the content of revision M» is the claim worth asserting, and the
        only way to assert it was to match the prose that states it. `next` is spelled out rather
        than left as an addition for the reader, because the append is precisely the part of this
        card people expect to be an unwind.
      */
      data-current-revision={String(revert.currentRevision)}
      data-previous-revision={String(revert.previousRevision)}
      data-next-revision={String(revert.currentRevision + 1)}
    >
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          data-testid="go-back"
          onClick={() => {
            setShowing((current) => !current);
          }}
        >
          {t('feed.revert.open')}
        </Button>
        <span className="text-foreground-muted text-caption">
          {/*
            One phrase, four numbers (task 143). The sentence is the card's honesty about being an
            append, and a translation that took it in fragments could not reorder «ревизию {next}
            с содержимым ревизии {previous}» without leaving a stray article behind.
          */}
          {t('feed.revert.explanation', {
            fileName: revert.fileName,
            current: revert.currentRevision,
            next: revert.currentRevision + 1,
            previous: revert.previousRevision,
          })}
        </span>
      </div>

      {showing && (
        <>
          <DiffBody unifiedDiff={revert.unifiedDiff} testId="revert-diff" />
          <div className="flex items-center gap-2">
            {/*
              Secondary: this card is an offer, not the next step. The tail names the loud control
              (task 142; `tail-primary.ts`), and going back is never it.
            */}
            <Button
              variant="secondary"
              data-testid="revert-apply"
              disabled={busy}
              onClick={() => {
                void apply();
              }}
            >
              {busy
                ? t('feed.revert.apply-busy')
                : t('feed.revert.apply', { revision: revert.previousRevision })}
            </Button>
            <Button
              variant="ghost"
              data-testid="revert-cancel"
              disabled={busy}
              onClick={() => {
                setShowing(false);
              }}
            >
              {t('common.cancel')}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
