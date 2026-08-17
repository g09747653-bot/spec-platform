'use client';

import { useEffect, useRef, type ReactNode } from 'react';

import { cn } from '../lib/cn';
import {
  clampSidebarWidth,
  sidebarCollapsedValue,
  sidebarWidthValue,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
} from '../state/ui-state';
import { useUiState } from '../state/use-ui-state';
import { PanelIcon } from '../ui/icons';

import { SidePanel } from './side-panel';

/**
 * The session sidebar — Specs, Local Workspace, Attachments (task 119; Эталон §1.5), rebuilt as a
 * **pane** in the application frame (tasks 136, 137, 141).
 *
 * Three things changed, and all three were defects the customer met:
 *
 * 1. **The collapse control is not in here any more.** It was, at the top of a column as tall as the
 *    conversation, so on a session of any length it was scrolled off the screen — collapse it once
 *    and «press it again» is not an available move. It now lives in the session header, which does
 *    not scroll, and is exported as {@link SidebarToggle} for the header to render.
 * 2. **Collapsed is remembered** (`ui-state`), so the state survives a reload instead of being undone
 *    by one.
 * 3. **The width can no longer starve the feed.** The stored value is clamped, and the pane is
 *    additionally capped at a share of the frame in CSS, so no width — dragged, stored by an older
 *    build, or typed into `localStorage` by hand — can leave the conversation column too narrow to
 *    use. That was the other half of the squashed-composer report: the composer was as wide as its
 *    column, and its column was whatever the sidebar had left.
 *
 * Width stays *device* state and not session state: the same bundle opened on a laptop and on a wide
 * monitor wants two different widths, and persisting it on the server would make one of them wrong.
 *
 * The drag handle is a `separator` with keyboard control, because a resize that only a mouse can
 * perform is a feature half the users do not have.
 */
const KEYBOARD_STEP = 16;

export interface SessionSidebarProps {
  children: ReactNode;
}

export function SessionSidebar({ children }: SessionSidebarProps) {
  const [width, setWidth] = useUiState(sidebarWidthValue);
  const [collapsed] = useUiState(sidebarCollapsedValue);
  const dragging = useRef(false);

  useEffect(() => {
    function onMove(event: MouseEvent) {
      if (!dragging.current) return;
      // The sidebar is on the right, so the width grows as the pointer moves left.
      setWidth(clampSidebarWidth(window.innerWidth - event.clientX));
    }

    function onUp() {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.removeProperty('user-select');
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);

    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [setWidth]);

  if (collapsed) {
    /*
     * Nothing at all, rather than a zero-width shell. The pane's contents are server-rendered inside
     * it, and leaving them mounted at width zero would keep their file input and their links in the
     * tab order behind an invisible edge — a keyboard trap that a mouse user cannot see.
     */
    return <div data-testid="session-sidebar" data-collapsed="true" hidden />;
  }

  return (
    <div
      /*
        The width is stored and clamped; the *share of the frame* it may take is capped by the
        surface that docks it (see `session-feed.tsx`), because a clamp in pixels cannot know how
        wide the window is — 480 px is a third of a 1440 monitor and half of a 1000-pixel one. Both
        halves together are what make «the conversation always keeps most of the frame» a property
        of the layout rather than of every code path that can set a width.
      */
      className="flex min-h-0 max-w-[40%] shrink-0"
      data-testid="session-sidebar"
      data-collapsed="false"
      style={{ width: `${String(width)}px` }}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize the sidebar"
        aria-valuenow={width}
        aria-valuemin={SIDEBAR_MIN_WIDTH}
        aria-valuemax={SIDEBAR_MAX_WIDTH}
        tabIndex={0}
        data-testid="sidebar-resize"
        className="hover:bg-primary/40 focus-visible:bg-primary/60 border-border-subtle w-1.5 shrink-0 cursor-col-resize border-l"
        onMouseDown={() => {
          dragging.current = true;
          // Without this a drag selects the conversation text it passes over.
          document.body.style.setProperty('user-select', 'none');
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') setWidth(clampSidebarWidth(width + KEYBOARD_STEP));
          if (event.key === 'ArrowRight') setWidth(clampSidebarWidth(width - KEYBOARD_STEP));
        }}
      />

      <aside
        className="bg-surface flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-y-auto p-3"
        data-testid="sidebar-panel"
        data-width={String(width)}
        aria-label="Session panels"
      >
        {children}
      </aside>
    </div>
  );
}

/**
 * The collapse control, for the session header to render (task 136).
 *
 * Separate from the pane on purpose: a control that hides something must not live inside the thing
 * it hides, or its second press has nowhere to happen. The header is the only part of the session
 * surface guaranteed to be on screen, which makes it the only correct home for this.
 */
export function SidebarToggle({ className }: { className?: string }) {
  const [collapsed, setCollapsed] = useUiState(sidebarCollapsedValue);

  return (
    <button
      type="button"
      data-testid="sidebar-toggle"
      aria-expanded={!collapsed}
      aria-label={collapsed ? 'Show the sidebar' : 'Hide the sidebar'}
      title={`${collapsed ? 'Show' : 'Hide'} the sidebar (B)`}
      className={cn(
        'border-border-subtle text-foreground-muted hover:bg-background hover:text-foreground inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition-colors',
        className,
      )}
      onClick={() => {
        setCollapsed(!collapsed);
      }}
    >
      <PanelIcon open={!collapsed} />
    </button>
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
    <SidePanel title="Local Workspace" testId="local-workspace">
      <button
        type="button"
        disabled
        data-testid="mount-folder"
        className="border-border-subtle text-foreground-muted cursor-not-allowed rounded-md border border-dashed px-3 py-1.5 text-sm opacity-60"
      >
        Mount folder
      </button>
      <p className="text-foreground-muted text-xs">
        Mounting a folder from this machine is not built yet. Nothing here reads or writes your
        files.
      </p>
    </SidePanel>
  );
}
