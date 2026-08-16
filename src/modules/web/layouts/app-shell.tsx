import type { ReactNode } from 'react';

import { BrandMark } from '../theme/brand-mark';
import { ThemeToggle } from '../theme/theme-toggle';

/**
 * The authenticated area's chrome.
 *
 * The account controls arrive as a slot rather than being built here: signing out needs the Auth.js
 * instance, and `web` may not reach past a server action or route handler (constitution A1). The
 * layout that owns the request renders the control and hands it in.
 *
 * The theme switch sits next to them because it is a device preference, not account data — it never
 * touches the server (task 124).
 */
export function AppShell({ children, account }: { children: ReactNode; account?: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-border-subtle bg-surface border-b">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <span className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <BrandMark />
            Spec Platform
          </span>
          <nav
            aria-label="Account"
            className="text-foreground-muted text-caption flex items-center gap-3"
          >
            {account}
            <ThemeToggle />
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
