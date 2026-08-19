'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useT } from '../i18n/locale-context';
import { Button } from '../ui/button';

import type { TailPrimary } from './tail-primary';

/**
 * The autonomous run, watched and stoppable (task 145; А-7).
 *
 * Two jobs, and keeping them in one component is deliberate — they are two halves of one claim.
 *
 * **It ticks.** While a run is live this posts one step, waits for it, and posts the next. That is
 * the whole of «zero human clicks»: the decisions are all the server's, and this is the heartbeat
 * that asks for the next one. It is not a scheduler in disguise — a step that answers `done` ends
 * the loop, and a step that refuses ends it too, because a driver that has stopped has said why and
 * the page's job is to show that rather than to try again.
 *
 * **It offers Stop.** The control is present for every frame the run is live, which is Д-1 applied
 * to a wait that lasts a whole session rather than one request: the loudest thing on the page while
 * a machine is acting for you must be the way to take it back. Pressing it is one request that ends
 * the run row; the step in flight, if there is one, finds its claim gone and dispatches nothing.
 *
 * **The refresh is separate from the tick, and has to be.** A `generate` step lasts as long as the
 * model does, and during it the ticker is blocked on its own request — so a page that only refreshed
 * between steps would show a frozen feed for minutes while a document was being written into it. The
 * interval below re-reads the server independently, which is what makes the run watchable: the
 * document card appears, the stream attaches through the surface that already knows how to resume a
 * run it did not start, and the feed fills in as the driver works.
 */
const REFRESH_MS = 2_000;

/**
 * Whether a step reported the run over. Read defensively: this is a network boundary like any other,
 * and a body this cannot read is treated as an ending rather than as a reason to keep ticking.
 */
function runIsOver(payload: unknown): boolean {
  if (typeof payload !== 'object' || payload === null) return true;

  return 'done' in payload && payload.done === true;
}

export interface DriverModel {
  /** The live run, or `null` when this chat is an ordinary one. */
  running: { steps: number } | null;
  /** Why the last run ended, when one has — a token, worded by the feed's own note. */
  lastStopReason: string | null;
}

export function DriverPanel({
  sessionId,
  driver,
  primary,
}: {
  sessionId: string;
  driver: DriverModel;
  /** Which control the tail says is the loud one (task 142); see `tail-primary.ts`. */
  primary: TailPrimary;
}) {
  const t = useT();
  const router = useRouter();
  const [stopping, setStopping] = useState(false);
  const [starting, setStarting] = useState(false);
  const running = driver.running !== null;

  /*
   * The tick, in a ref rather than in state: a step is in flight or it is not, and re-rendering on
   * that fact would restart the effect that owns the loop. The mounted flag is what stops a loop
   * from outliving the page that started it — an unmounted ticker would keep driving a session
   * nobody is watching, which is precisely the autonomy this design does not offer.
   */
  const inFlight = useRef(false);
  const mounted = useRef(true);
  /** Set once a step reports the run over, so no tick outlives the ending it already read. */
  const finished = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /*
   * A step does **not** refresh the page, and the omission is deliberate. A refresh re-renders the
   * whole session on the server, and a bundle is fifty steps: refreshing after each would spend most
   * of the run redrawing rather than driving, while showing nothing the interval below is not about
   * to show anyway. The ticker drives; the interval shows; the two meet only at the ending, which is
   * the one moment the page must not be two seconds behind.
   */
  const step = useCallback(async () => {
    if (inFlight.current || finished.current) return;
    inFlight.current = true;

    try {
      const response = await fetch(`/api/sessions/${sessionId}/autonomous/step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const payload: unknown = await response.json().catch(() => null);
      if (!mounted.current) return;

      /*
       * A refused step is not retried here. Every refusal the driver can survive is already retried
       * server-side by the next tick's re-read (`CONFLICT` is the only retryable code), and one it
       * cannot survive has stopped the run and written why — so the honest thing for the page to do
       * is show that, not ask again.
       */
      if (!response.ok || runIsOver(payload)) {
        finished.current = true;
        router.refresh();
      }
    } finally {
      inFlight.current = false;
    }
  }, [router, sessionId]);

  /*
   * The loop. `void step()` on every interval rather than a chain of awaits: `step` guards itself
   * against overlap, so a tick that arrives while a long generate is still running is a no-op rather
   * than a second driver. One interval, one guard, no queue.
   */
  useEffect(() => {
    if (!running) return;

    finished.current = false;
    void step();
    const timer = setInterval(() => void step(), 400);
    return () => {
      clearInterval(timer);
    };
  }, [running, step]);

  /* The independent re-read — see the note above on why it is not the tick. */
  useEffect(() => {
    if (!running) return;

    const timer = setInterval(() => {
      router.refresh();
    }, REFRESH_MS);

    return () => {
      clearInterval(timer);
    };
  }, [running, router]);

  if (!running && driver.lastStopReason === null) {
    /*
     * An ordinary chat. The offer to hand it over is rendered as a quiet control rather than not at
     * all, because the mode is per chat and a chat that was started by hand must still be able to
     * ask for it (AC «a per-chat mode»).
     */
    return (
      <div
        className="border-border-subtle bg-surface flex w-full items-center gap-3 rounded-xl border p-4"
        data-testid="driver-panel"
        data-driver="off"
      >
        <Button
          variant={primary === 'autonomous-stop' ? 'primary' : 'secondary'}
          data-testid="driver-start"
          disabled={starting}
          onClick={() => {
            setStarting(true);
            void fetch(`/api/sessions/${sessionId}/autonomous`, { method: 'POST' }).then(() => {
              if (!mounted.current) return;
              setStarting(false);
              router.refresh();
            });
          }}
        >
          {starting ? t('feed.driver.starting') : t('feed.driver.start-action')}
        </Button>
      </div>
    );
  }

  return (
    <div
      className="border-border-subtle bg-surface flex w-full flex-wrap items-center gap-3 rounded-xl border p-4"
      data-testid="driver-panel"
      data-driver={running ? 'running' : 'stopped'}
      data-stop-reason={driver.lastStopReason ?? ''}
      data-steps={String(driver.running?.steps ?? 0)}
    >
      <p className="text-foreground-muted text-sm" data-testid="driver-status">
        {running
          ? t('feed.driver.running', { steps: driver.running?.steps ?? 0 })
          : t('feed.driver.stopped')}
      </p>

      {running ? (
        <Button
          variant={primary === 'autonomous-stop' ? 'primary' : 'secondary'}
          data-testid="driver-stop"
          disabled={stopping}
          onClick={() => {
            setStopping(true);
            void fetch(`/api/sessions/${sessionId}/autonomous`, { method: 'DELETE' }).then(() => {
              if (!mounted.current) return;
              setStopping(false);
              router.refresh();
            });
          }}
        >
          {stopping ? t('feed.driver.stopping') : t('feed.driver.stop-action')}
        </Button>
      ) : (
        <Button
          variant="secondary"
          data-testid="driver-start"
          disabled={starting}
          onClick={() => {
            setStarting(true);
            void fetch(`/api/sessions/${sessionId}/autonomous`, { method: 'POST' }).then(() => {
              if (!mounted.current) return;
              setStarting(false);
              router.refresh();
            });
          }}
        >
          {starting ? t('feed.driver.starting') : t('feed.driver.start-action')}
        </Button>
      )}
    </div>
  );
}
