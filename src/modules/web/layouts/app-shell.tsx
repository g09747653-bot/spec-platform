import type { ReactNode } from 'react';

import { ConnectionBanner } from '../session/connection-banner';
import { BrandMark } from '../theme/brand-mark';
import { ThemeToggle } from '../theme/theme-toggle';
import { ToastViewport } from '../ui/toast-viewport';

/**
 * The authenticated area's chrome.
 *
 * The account controls arrive as a slot rather than being built here: signing out needs the Auth.js
 * instance, and `web` may not reach past a server action or route handler (constitution A1). The
 * layout that owns the request renders the control and hands it in.
 *
 * The theme switch sits next to them because it is a device preference, not account data — it never
 * touches the server (task 124).
 *
 * The connection banner and the toast region are here, once, for the whole authenticated area
 * (task 125): both are about the application rather than about any one page, and a page that
 * rendered its own would announce twice on the pages that nest.
 */
export function AppShell({ children, account }: { children: ReactNode; account?: ReactNode }) {
  /*
   * Minted per server render, and used for nothing but its freshness: the banner watches it to learn
   * that a render actually arrived, which is how Reconnect finds out the server came back without
   * asking a second endpoint.
   */
  const renderStamp = crypto.randomUUID();

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

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">
        <ConnectionBanner stamp={renderStamp} />
        {children}
      </main>

      <ToastViewport />
    </div>
  );
}
