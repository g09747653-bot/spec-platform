'use client';

import { useT } from '../i18n/locale-context';
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
  /**
   * What is being waited for, already in the reader's language.
   *
   * A word rather than a key (task 143): the six things this product waits for are named by the
   * three surfaces that do the waiting, and each of them knows which one applies. The frame is
   * theirs to fit, not to fill — English follows «Waiting for …» and Russian follows «Ожидание: …»,
   * so a value has to be a noun group in the nominative, and the callers were rewritten for it.
   */
  what: string;
  elapsedSeconds: number;
  onStop: () => void;
}

export function WaitingOn({ what, elapsedSeconds, onStop }: WaitingOnProps) {
  const t = useT();

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="waiting-on">
      <Button variant="secondary" data-testid="stop-waiting" onClick={onStop}>
        {t('session.waiting.stop')}
      </Button>
      {/*
        The reading itself, next to the sentence that frames it (task 143). «A number that keeps
        moving» is the property the walk has to check, and checking it by parsing «— 3 s.» out of a
        sentence makes the check a hostage of how that sentence is worded in each locale.
      */}
      <span
        className="text-foreground-muted text-xs"
        data-testid="waiting-status"
        data-elapsed={String(elapsedSeconds)}
      >
        {t('session.waiting.status', { what, seconds: elapsedSeconds })}
      </span>
    </div>
  );
}
