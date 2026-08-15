'use client';

import { Button } from '../ui/button';

/**
 * What the page offers while a session-moving request is in flight (round 5, Р-3).
 *
 * Two things, and they are the two the gate's frozen page had neither of:
 *
 * - **a live control.** The button that started the request is disabled so it cannot be clicked
 *   twice; this one is never disabled, so there is always something that moves the session — the
 *   Д-1 invariant, now holding during a transition and not only during a stream.
 * - **an honest status.** An elapsed count that keeps moving is the difference between "working"
 *   and "dead", and it is exactly what a static `Checking the gate…` — or the dev overlay's
 *   `Rendering…` the customer sat in front of — cannot express.
 *
 * Stopping abandons the *wait*, not the work: the request is aborted, the page re-reads the server,
 * and whatever the server had already done stands. That is Р-2's lesson applied to a plain POST.
 */
export interface WaitingOnProps {
  /** What is being waited for, phrased to follow "Waiting for …". */
  what: string;
  elapsedSeconds: number;
  onStop: () => void;
}

export function WaitingOn({ what, elapsedSeconds, onStop }: WaitingOnProps) {
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="waiting-on">
      <Button variant="secondary" data-testid="stop-waiting" onClick={onStop}>
        Stop waiting
      </Button>
      <span className="text-ink-muted text-xs" data-testid="waiting-status">
        Waiting for {what} — {String(elapsedSeconds)} s. Stopping loses nothing: the page re-reads
        the session from the server either way.
      </span>
    </div>
  );
}
