'use client';

import { createContext, useContext, type ReactNode } from 'react';

/**
 * Which methodology's vocabulary this conversation speaks (task 132; checklist row `1.4-6`).
 *
 * A context rather than six more props, and the reason is that exactly **one** file reads it:
 * `bubbles.tsx`, where both surfaces that name a position live — the stage chip and the caption
 * every card prints above itself. Threading an id through `DocumentBlock`, `ReviewBlockCard`,
 * `RoundBlock`, `GenerationSurface` and `ProposalBlockCard` would make five components carry a value
 * none of them uses, purely to hand it to a sixth.
 *
 * The default is `null`, which means "no methodology in scope" and yields the canonical stage names.
 * That is what keeps a component test that renders a caption on its own working, and it is the same
 * fallback `stageLabel` already applies where a configuration does not name a position.
 */
const MethodologyNamingContext = createContext<string | null>(null);

export function MethodologyNaming({
  methodologyId,
  children,
}: {
  methodologyId: string | null;
  children: ReactNode;
}) {
  return (
    <MethodologyNamingContext.Provider value={methodologyId}>
      {children}
    </MethodologyNamingContext.Provider>
  );
}

/** The methodology in scope, or `null` outside a session's feed. */
export function useMethodologyId(): string | null {
  return useContext(MethodologyNamingContext);
}
