'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { useT } from '../i18n/locale-context';

import { connectionFromStream, reportServerAnswered, reportServerUnreachable } from './connection';
import {
  createResumableStream,
  initialStreamState,
  type ResumableStream,
  type StreamState,
} from './resumable-stream';

/**
 * React binding for the resumable stream (task 46).
 *
 * Deliberately thin. Everything worth testing — sequence tracking, restart semantics, reconnect
 * backoff — lives in `resumable-stream.ts` and is exercised without a renderer; this hook only owns
 * the React-shaped concerns: one reader instance per mount, state in a `useState`, an abort on
 * unmount so a navigated-away page stops reading, and the translator the reader needs for the one
 * sentence it writes itself (task 143).
 */
export interface UseResumableStream {
  state: StreamState;
  /** Starts a generation for this session and streams it. */
  start: (sessionId: string) => Promise<StreamState>;
  /** Re-attaches to a run already in flight — the page-reload path (FR-017). */
  resume: (runId: string, from?: number, attempt?: number) => Promise<StreamState>;
  stop: () => void;
}

export function useResumableStream(): UseResumableStream {
  const [state, setState] = useState<StreamState>(initialStreamState);
  const streamRef = useRef<ResumableStream | null>(null);
  const t = useT();

  /*
   * A `useCallback` since task 143, and only because the reader now closes over the translator: `t`
   * is a value the render produced, so the two callbacks below genuinely depend on it and saying so
   * is cheaper than arguing with the dependency check. The instance itself is still created once —
   * `??=` sees to that — so a re-render with a new `t` does not build a second reader.
   */
  const stream = useCallback((): ResumableStream => {
    streamRef.current ??= createResumableStream({
      t,
      onState: (next) => {
        setState(next);

        /*
         * Task 125: the reader already knows whether it has a connection — `reconnecting` is its own
         * word for having lost one — so the connection banner reads that rather than probing for
         * itself. Deliberately not a `useEffect` on `state.status`: this is the same call stack the
         * reader publishes from, so the banner and the card never disagree for a frame.
         */
        const reported = connectionFromStream(next);
        if (reported === 'lost') reportServerUnreachable();
        else if (reported === 'online') reportServerAnswered();
      },
    });
    return streamRef.current;
  }, [t]);

  useEffect(() => {
    return () => {
      // Leaving the page stops the reader, never the run: the generation continues server-side and
      // the durable chunk log is what the next visit resumes against (NFR-003 AC-3).
      streamRef.current?.stop();
    };
  }, []);

  const start = useCallback((sessionId: string) => stream().start(sessionId), [stream]);

  const resume = useCallback(
    (runId: string, from?: number, attempt?: number) => stream().resume(runId, from, attempt),
    [stream],
  );

  const stop = useCallback(() => {
    streamRef.current?.stop();
  }, []);

  return { state, start, resume, stop };
}
