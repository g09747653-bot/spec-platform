'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useSyncExternalStore } from 'react';

import { Button } from '../ui/button';

import {
  connectionServerSnapshot,
  connectionSnapshot,
  reportCheckingConnection,
  reportServerAnswered,
  subscribeConnection,
} from './connection';

/**
 * «Connection lost», our rendering of it (task 125; Эталон §1.5).
 *
 * **A banner, not a modal — and that is a decision, not a shortcut.** The reference product blocks
 * the page with a dialog. Round 2's Д-1 is the reason we do not: the invariant this product holds is
 * that *there is always something the user can do*, and a dialog over a session whose generation is
 * still streaming server-side takes away the one control that matters (Stop) at the exact moment it
 * became interesting. The banner says the same thing, offers the same reconnect, and leaves the page
 * usable — a connection that dropped for four seconds should not cost a click.
 *
 * **Reconnect re-reads the page, and reads nothing else.** `router.refresh()` is the same re-read
 * every settled session request already performs (`useSessionRequest`, property 3). If the server is
 * back, it answers and the render below reports it; if it is not, the state stays `checking` and the
 * banner says so rather than claiming a recovery it cannot see. There is no ping endpoint, because a
 * second opinion about reachability is a second thing that can be wrong.
 */
export function ConnectionBanner({ stamp }: { stamp: string }) {
  const router = useRouter();
  const state = useSyncExternalStore(
    subscribeConnection,
    connectionSnapshot,
    connectionServerSnapshot,
  );

  /*
   * A rendered page is a server that answered.
   *
   * `stamp` is minted per server render, so this effect runs on the first one and again on every
   * `router.refresh()` that actually came back — which is precisely the evidence the Reconnect
   * control is waiting for, taken from the render itself rather than from a second request asking
   * whether the first one worked. It is an effect rather than a render-time call because reporting
   * during render would write to a store other components read in the same pass.
   */
  useEffect(() => {
    reportServerAnswered();
  }, [stamp]);

  if (state === 'online') return null;

  return (
    <div
      role="alert"
      data-testid="connection-lost"
      data-connection-state={state}
      /*
        A band across the frame rather than a floating card (task 137): it now sits between the
        application header and the panes, where nothing scrolls, so `sticky` has nothing left to do
        and a rounded box would read as content rather than as chrome.
      */
      className="border-warning-ink/40 bg-warning-soft text-warning-ink z-30 flex shrink-0 flex-wrap items-center gap-3 border-b px-4 py-2"
    >
      <span className="text-caption">
        {state === 'checking'
          ? 'Still trying to reach the server. Nothing you have done is lost — it is all on the server or on its way there.'
          : 'The server stopped answering. Nothing is lost: a generation already running carries on, and everything approved is saved.'}
      </span>
      <Button
        size="sm"
        variant="secondary"
        data-testid="connection-reconnect"
        onClick={() => {
          reportCheckingConnection();
          router.refresh();
        }}
      >
        Reconnect
      </Button>
    </div>
  );
}
