import type { ReactNode } from 'react';

/**
 * The authenticated area's chrome.
 *
 * The account controls arrive as a slot rather than being built here: signing out needs the Auth.js
 * instance, and `web` may not reach past a server action or route handler (constitution A1). The
 * layout that owns the request renders the control and hands it in.
 *
 * The stage rail (task 19, FR-007 AC-9) and the session pane fill this frame next.
 */
export function AppShell({ children, account }: { children: ReactNode; account?: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-border-subtle bg-surface border-b">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <span className="text-sm font-semibold tracking-tight">Spec Platform</span>
          <nav aria-label="Account" className="text-ink-muted flex items-center gap-3 text-sm">
            {account}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
