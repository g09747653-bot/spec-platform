'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

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
 * the React-shaped concerns: one reader instance per mount, state in a `useState`, and an abort on
 * unmount so a navigated-away page stops reading.
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

  const stream = (): ResumableStream => {
    streamRef.current ??= createResumableStream({ onState: setState });
    return streamRef.current;
  };

  useEffect(() => {
    return () => {
      // Leaving the page stops the reader, never the run: the generation continues server-side and
      // the durable chunk log is what the next visit resumes against (NFR-003 AC-3).
      streamRef.current?.stop();
    };
  }, []);

  const start = useCallback((sessionId: string) => stream().start(sessionId), []);

  const resume = useCallback(
    (runId: string, from?: number, attempt?: number) => stream().resume(runId, from, attempt),
    [],
  );

  const stop = useCallback(() => {
    streamRef.current?.stop();
  }, []);

  return { state, start, resume, stop };
}
