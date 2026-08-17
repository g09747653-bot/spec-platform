'use client';

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';

import { cn } from '../lib/cn';

/**
 * The session sidebar — Specs, Local Workspace, Attachments (task 119; Эталон §1.5).
 *
 * **Width is client state, and stays client state.** It is a property of this browser window, not of
 * the session: the same bundle opened on a laptop and on a wide monitor wants two different widths,
 * and persisting it on the server would make one of them wrong. `localStorage`, therefore, and the
 * initial render is the default width on both sides so hydration has nothing to disagree about
 * (the lesson of D-28 read the other way round: the way to avoid a mismatch is to render the same
 * thing, then correct after mount).
 *
 * The drag handle is a `separator` with keyboard control, because a resize that only a mouse can
 * perform is a feature half the users do not have.
 *
 * **The column track follows this width** (task 133; row `1.5-3`). It used to be a fixed `20rem`, so
 * the handle could shrink the panel inside its track and could not widen it past the edge: half a
 * control, and the walk could not tell because it read the `data-width` the component writes about
 * itself. The default is the reference's own ~280px rather than the 320 that happened to equal the
 * old track.
 */
const STORAGE_KEY = 'spec-platform:sidebar-width';
const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 220;
const MAX_WIDTH = 560;
const KEYBOARD_STEP = 16;

function clampWidth(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_WIDTH;
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(value)));
}

export interface SessionSidebarProps {
  children: ReactNode;
}

/**
 * The stored width, as an external store (D-28's pattern, applied the other way round).
 *
 * `useSyncExternalStore` rather than "read `localStorage` in an effect and set state": the server
 * snapshot is the default width and the client snapshot is what is stored, and React reconciles the
 * two itself at hydration. Setting state from an effect would do the same thing a frame later and
 * with a lint rule against it — and this way the value is also shared by every sidebar on the page
 * without one of them being the owner.
 */
const listeners = new Set<() => void>();
let cachedWidth: number | null = null;

function subscribeWidth(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function widthSnapshot(): number {
  cachedWidth ??= clampWidth(Number(window.localStorage.getItem(STORAGE_KEY) ?? DEFAULT_WIDTH));
  return cachedWidth;
}

/** The server has no stored width, and must render what the client's first paint renders. */
const serverWidthSnapshot = (): number => DEFAULT_WIDTH;

function storeWidth(next: number): void {
  cachedWidth = clampWidth(next);
  window.localStorage.setItem(STORAGE_KEY, String(cachedWidth));
  for (const listener of listeners) listener();
}

export function SessionSidebar({ children }: SessionSidebarProps) {
  const width = useSyncExternalStore(subscribeWidth, widthSnapshot, serverWidthSnapshot);
  const [collapsed, setCollapsed] = useState(false);
  const dragging = useRef(false);

  const setWidth = (next: number) => {
    storeWidth(next);
  };

  useEffect(() => {
    function onMove(event: MouseEvent) {
      if (!dragging.current) return;
      // The sidebar is on the right, so the width grows as the pointer moves left.
      setWidth(clampWidth(window.innerWidth - event.clientX));
    }

    function onUp() {
      dragging.current = false;
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);

    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  return (
    <div className="flex min-h-0" data-testid="session-sidebar" data-collapsed={String(collapsed)}>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize the sidebar"
        aria-valuenow={width}
        aria-valuemin={MIN_WIDTH}
        aria-valuemax={MAX_WIDTH}
        tabIndex={0}
        data-testid="sidebar-resize"
        className={cn(
          'hover:bg-primary/40 focus-visible:bg-primary/60 w-1 shrink-0 cursor-col-resize rounded-full',
          collapsed && 'hidden',
        )}
        onMouseDown={() => {
          dragging.current = true;
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') setWidth(width + KEYBOARD_STEP);
          if (event.key === 'ArrowRight') setWidth(width - KEYBOARD_STEP);
        }}
      />

      <aside
        className="flex min-h-0 flex-col gap-4 overflow-y-auto pl-3"
        style={collapsed ? undefined : { width: `${String(width)}px` }}
        data-testid="sidebar-panel"
        data-width={String(width)}
        hidden={collapsed}
      >
        {children}
      </aside>

      <button
        type="button"
        data-testid="sidebar-toggle"
        aria-expanded={!collapsed}
        className="border-border-subtle text-foreground-muted hover:bg-background h-8 shrink-0 self-start rounded-md border px-2 text-xs"
        onClick={() => {
          setCollapsed((current) => !current);
        }}
      >
        {collapsed ? '‹' : '›'}
      </button>
    </div>
  );
}

/**
 * Local Workspace — an honest stub (task 119 AC-4; Эталон §1.5).
 *
 * It performs no network call, opens no picker, and claims nothing. The reference product mounts a
 * real folder; we do not, and the copy says so in the words a person would use rather than in the
 * words a roadmap would. The control is disabled because a control that looks live and does nothing
 * is the dead click D-28 already ruled out once.
 */
export function LocalWorkspace() {
  return (
    <section
      className="border-border-subtle flex flex-col gap-2 rounded-lg border p-3"
      data-testid="local-workspace"
    >
      <h2 className="text-sm font-medium">Local Workspace</h2>
      <button
        type="button"
        disabled
        data-testid="mount-folder"
        className="border-border-subtle text-foreground-muted cursor-not-allowed rounded-md border px-3 py-1.5 text-sm opacity-60"
      >
        Mount folder
      </button>
      <p className="text-foreground-muted text-xs">
        Mounting a folder from this machine is not built yet. Nothing here reads or writes your
        files.
      </p>
    </section>
  );
}
