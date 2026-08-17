'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

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
        showToast('That step could not be reverted. Nothing changed.', 'danger');
        return;
      }

      showToast(
        `${revert.fileName} restored from revision ${String(revert.previousRevision)} — as a new revision.`,
        'success',
      );
      setShowing(false);
      router.refresh();
    } catch {
      showToast('That step could not be reverted. Nothing changed.', 'danger');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="border-border-subtle bg-surface flex w-full max-w-[46rem] flex-col gap-3 rounded-xl border p-4"
      data-testid="revert-card"
    >
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          data-testid="go-back"
          onClick={() => {
            setShowing((current) => !current);
          }}
        >
          Go back to previous step
        </Button>
        <span className="text-foreground-muted text-caption">
          {revert.fileName} is at revision {revert.currentRevision}. Going back writes revision{' '}
          {revert.currentRevision + 1} with the content of revision {revert.previousRevision} —
          nothing is deleted, and the history keeps every one of them.
        </span>
      </div>

      {showing && (
        <>
          <DiffBody unifiedDiff={revert.unifiedDiff} testId="revert-diff" />
          <div className="flex items-center gap-2">
            <Button
              data-testid="revert-apply"
              disabled={busy}
              onClick={() => {
                void apply();
              }}
            >
              {busy ? 'Restoring…' : `Restore revision ${String(revert.previousRevision)}`}
            </Button>
            <Button
              variant="ghost"
              data-testid="revert-cancel"
              disabled={busy}
              onClick={() => {
                setShowing(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
