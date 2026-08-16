'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { reportServerAnswered, reportServerUnreachable } from './connection';
import {
  createSessionRequest,
  initialSessionRequestState,
  type SessionRequest,
  type SessionRequestResult,
  type SessionRequestState,
} from './session-request';

/**
 * React binding for a session-moving POST (round 5, Р-3).
 *
 * Deliberately thin, like `useResumableStream`. Everything worth testing — the deadline, what an
 * abandoned request settles to, which message the user is shown — lives in `session-request.ts` and
 * is exercised without a renderer. This hook owns only the React-shaped concerns:
 *
 * - one request instance per mount, aborted when the page goes away;
 * - the elapsed counter, which is what turns a frozen caption into an honest one: a number that
 *   keeps moving is the difference between "the page is working" and "the page is dead", and the
 *   frozen `Rendering…` of the gate could say neither;
 * - the refresh. Every settled request re-reads the server, whether it succeeded, failed, timed out
 *   or was abandoned — the client never assumes what its own abandoned request did or did not do.
 */
export interface UseSessionRequest {
  state: SessionRequestState;
  /** Whole seconds the in-flight request has been running; `0` when nothing is. */
  elapsedSeconds: number;
  send: (action: string, url: string, body?: unknown) => Promise<SessionRequestResult>;
  /** Stops waiting. The request is aborted; whatever it started on the server is not. */
  abandon: () => void;
  dismiss: () => void;
}

export function useSessionRequest(deadlineMs?: number): UseSessionRequest {
  const router = useRouter();
  const [state, setState] = useState<SessionRequestState>(initialSessionRequestState);
  /** Last tick of the clock, written only by the interval — never from an effect body. */
  const [tickedAt, setTickedAt] = useState(0);
  const requestRef = useRef<SessionRequest | null>(null);

  const getRequest = useCallback((): SessionRequest => {
    requestRef.current ??= createSessionRequest({
      onState: setState,
      // Task 125: every session-moving request already learns whether the server is there. This is
      // where that knowledge reaches the connection banner — no extra request is made for it.
      onReachability: (reachable) => {
        if (reachable) reportServerAnswered();
        else reportServerUnreachable();
      },
      ...(deadlineMs === undefined ? {} : { deadlineMs }),
    });
    return requestRef.current;
  }, [deadlineMs]);

  useEffect(() => {
    return () => {
      requestRef.current?.abandon();
    };
  }, []);

  const { startedAt } = state;

  useEffect(() => {
    if (startedAt === null) return;

    const handle = setInterval(() => {
      setTickedAt(Date.now());
    }, 1000);

    return () => {
      clearInterval(handle);
    };
  }, [startedAt]);

  /*
   * Zero until the first tick lands, and zero again the moment nothing is running: a stale
   * `tickedAt` from an earlier request reads as a negative age, which is the clamp's whole job.
   */
  const elapsedSeconds =
    startedAt === null ? 0 : Math.max(0, Math.floor((tickedAt - startedAt) / 1000));

  const send = useCallback(
    async (action: string, url: string, body?: unknown): Promise<SessionRequestResult> => {
      const result = await getRequest().send(action, url, body);

      // Unconditional on purpose (session-request.ts, property 3): the server's state is the only
      // honest answer to what just happened, including when the client stopped listening.
      router.refresh();

      return result;
    },
    [getRequest, router],
  );

  const abandon = useCallback(() => {
    requestRef.current?.abandon();
  }, []);

  const dismiss = useCallback(() => {
    requestRef.current?.dismiss();
  }, []);

  return { state, elapsedSeconds, send, abandon, dismiss };
}
