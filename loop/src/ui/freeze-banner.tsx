'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { RU } from './strings.ts';

/**
 * The stop state, and the one control that lifts it (task 160).
 *
 * Everything a person needs to decide is on the banner before they touch anything: which task went
 * red, which check said so, and how many executors are standing paused. «Возобновить» is the only
 * button on the dashboard that changes the loop's mind, and it is the only one that should be — a
 * pipeline stopped by a red verdict is a decision waiting for a person, and a control that resumed
 * it without saying what it was resuming would make that decision on their behalf.
 *
 * A client component because it is the one place the dashboard writes. The tree beside it stays
 * server-rendered; `router.refresh()` brings the new statuses back through the same path the feed's
 * status events use.
 */
export function FreezeBanner({
  reason,
  taskId,
  pausedCount,
  workspaceDir,
}: {
  reason: string;
  taskId: string;
  pausedCount: number;
  workspaceDir: string | null;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const router = useRouter();

  const retry = async () => {
    if (workspaceDir === null) return;

    setBusy(true);
    setFailed(null);

    try {
      const response = await fetch('/api/orchestrator/retry', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectDirectory: workspaceDir }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        setFailed(payload?.error ?? `${RU.retryFailed} (${String(response.status)})`);
        return;
      }

      router.refresh();
    } catch (error) {
      setFailed(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel frozen" data-testid="freeze-banner" data-task-id={taskId}>
      <h2>{RU.frozenTitle}</h2>

      <p className="frozen-reason" data-testid="freeze-reason">
        {reason}
      </p>
      <p className="meta" data-testid="freeze-detail">
        {RU.frozenTask}: <strong>{taskId}</strong> · {RU.frozenPaused}:{' '}
        <span data-testid="freeze-paused">{pausedCount}</span>
      </p>

      <button
        type="button"
        data-testid="retry-pipeline"
        onClick={() => void retry()}
        disabled={busy || workspaceDir === null}
      >
        {busy ? RU.retrying : RU.retry}
      </button>

      {workspaceDir === null && <p className="meta">{RU.retryNoDirectory}</p>}
      {failed !== null && (
        <p className="meta" data-testid="retry-error">
          {failed}
        </p>
      )}
    </section>
  );
}
