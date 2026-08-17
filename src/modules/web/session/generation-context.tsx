'use client';

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

import { useResumableStream, type UseResumableStream } from './useResumableStream';

/**
 * The one reader of the one generation this session may have in flight (task 138).
 *
 * It used to live inside `GenerationSurface`, which was right while the drafting card was the only
 * thing that showed the text being written. It is not right any more: the viewer opens *onto a
 * document being generated* and must show the same words, and the acceptance criterion is explicit
 * that this happens through the existing resumable reader rather than a second data path. A second
 * reader over the same run would be a second `GET …/stream`, a second de-duplication by sequence,
 * and two answers to "how far has this got" — which is the class of defect D-100/D-101 already cost
 * a milestone.
 *
 * So the reader is lifted to the surface and handed to both. `detached` travels with it for the same
 * reason: Stop means "this page stops following", and the page is one thing whether the words are
 * being read on the card or in the viewer.
 */
export interface GenerationStream extends UseResumableStream {
  /** True once the reader was stopped by hand: the run carries on, this page no longer follows. */
  detached: boolean;
  detach: () => void;
}

const GenerationStreamContext = createContext<GenerationStream | null>(null);

export function GenerationStreamProvider({ children }: { children: ReactNode }) {
  const stream = useResumableStream();
  const [detached, setDetached] = useState(false);

  const value = useMemo<GenerationStream>(
    () => ({
      ...stream,
      detached,
      detach: () => {
        setDetached(true);
        stream.stop();
      },
    }),
    [stream, detached],
  );

  return (
    <GenerationStreamContext.Provider value={value}>{children}</GenerationStreamContext.Provider>
  );
}

/**
 * The session's reader.
 *
 * Throws when it is missing rather than falling back to a private one: a component that read a
 * stream nobody else could see would look like it worked and would be exactly the second data path
 * this context exists to prevent.
 */
export function useGenerationStream(): GenerationStream {
  const value = useContext(GenerationStreamContext);
  if (value === null) throw new Error('useGenerationStream used outside a session surface');

  return value;
}
