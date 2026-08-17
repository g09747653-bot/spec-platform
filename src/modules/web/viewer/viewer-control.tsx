'use client';

import { createContext, useContext, type ReactNode } from 'react';

import type { ViewerTarget } from './viewer-pane';

/**
 * How a card opens the viewer (task 138).
 *
 * A context rather than a prop threaded through the feed: the eye belongs to the document card and
 * to the drafting surface, and both are rendered several levels below the surface that owns the
 * pane. Passing an `onOpenViewer` down through `SessionFeed → renderBlock → DocumentBlock` would put
 * the same prop on components that have nothing to do with it.
 *
 * `null` outside a session surface, and the cards check for it — the document card is also rendered
 * on surfaces that have no pane to open, and an eye there would be a dead click.
 */
export interface ViewerControl {
  open: (target: ViewerTarget) => void;
  /** What is on screen, so a card can show its own eye as pressed. */
  openTarget: ViewerTarget | null;
}

const Context = createContext<ViewerControl | null>(null);

export function ViewerControlProvider({
  value,
  children,
}: {
  value: ViewerControl;
  children: ReactNode;
}) {
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useViewerControl(): ViewerControl | null {
  return useContext(Context);
}
