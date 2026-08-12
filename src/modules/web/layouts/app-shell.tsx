import type { ReactNode } from 'react';

/**
 * The authenticated area's chrome.
 *
 * Empty by design in Milestone 0: it establishes the frame that later milestones fill —
 * the stage rail in task 19 (FR-007 AC-9), the session pane, and the export actions.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-border-subtle bg-surface border-b">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <span className="text-sm font-semibold tracking-tight">Spec Platform</span>
          {/* Session controls and the account menu arrive with Auth.js in task 12. */}
          <nav aria-label="Account" className="text-ink-muted text-sm" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
