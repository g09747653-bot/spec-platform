import type { ReactNode } from 'react';

import { serverT } from '../i18n/server-locale';
import { ConnectionBanner } from '../session/connection-banner';
import { ShortcutsButton } from '../session/shortcuts-ui';
import { BrandMark } from '../theme/brand-mark';
import { LocaleToggle } from '../i18n/locale-toggle';
import { ThemeToggle } from '../theme/theme-toggle';
import { ToastViewport } from '../ui/toast-viewport';

/**
 * The authenticated area's chrome — an **application frame**, not a document (tasks 137, 141).
 *
 * The frame is exactly one viewport tall and does not scroll. Whatever the page puts inside it
 * scrolls within itself. That is what makes the session surface behave like an application: the
 * header, the step pills, the composer and the sidebar's collapse control stay where they were put,
 * instead of scrolling away underneath a conversation that grows all day. It is also the single
 * biggest thing a desktop wrapper would otherwise have to rewrite — a window whose whole content
 * scrolls is a web page in a frame, and it reads like one.
 *
 * It is what the customer's two defect reports had in common, as well. The collapse control lived at
 * the top of a page-height column, so on a long session it was scrolled out of view and pressing it
 * "again" was not possible; and the whole surface was capped at `max-w-5xl`, so a 1920-pixel monitor
 * bought exactly as much conversation as a 1024-pixel one and the sidebar took its width out of the
 * feed. Both are properties of this file.
 *
 * The account controls arrive as a slot rather than being built here: signing out needs the Auth.js
 * instance, and `web` may not reach past a server action or route handler (constitution A1). The
 * layout that owns the request renders the control and hands it in.
 *
 * The connection banner and the toast region are here, once, for the whole authenticated area
 * (task 125): both are about the application rather than about any one page, and a page that
 * rendered its own would announce twice on the pages that nest.
 *
 * Asynchronous since task 143: the frame prints two words of its own — the product's name and the
 * account region's label — and the chrome language is a cookie, which only the server can read while
 * it renders. Every route under this shell already reads the session and the database per request,
 * so the dynamic rendering it opts into costs nothing that was not already being paid.
 */
export async function AppShell({
  children,
  account,
}: {
  children: ReactNode;
  account?: ReactNode;
}) {
  const t = await serverT();

  /*
   * Minted per server render, and used for nothing but its freshness: the banner watches it to learn
   * that a render actually arrived, which is how Reconnect finds out the server came back without
   * asking a second endpoint.
   */
  const renderStamp = crypto.randomUUID();

  return (
    <div className="bg-background flex h-dvh flex-col overflow-hidden" data-testid="app-frame">
      <header className="border-border-subtle bg-surface z-20 flex h-12 shrink-0 items-center justify-between gap-4 border-b px-4">
        <span className="flex items-center gap-2 text-sm font-semibold tracking-tight">
          <BrandMark />
          {t('shell.brand.name')}
        </span>
        <nav
          aria-label={t('shell.account.nav')}
          className="text-foreground-muted text-caption flex items-center gap-2"
        >
          {account}
          <ShortcutsButton />
          <LocaleToggle />
          <ThemeToggle />
        </nav>
      </header>

      {/*
        The banner sits between the frame's header and the page, in the flow and outside the scroll:
        Д-1 wants it visible without it covering anything, and a surface that scrolls with the feed
        would be a warning you can lose by scrolling past it.
      */}
      <ConnectionBanner stamp={renderStamp} />

      <main className="flex min-h-0 flex-1 flex-col" data-testid="app-body">
        {children}
      </main>

      <ToastViewport />
    </div>
  );
}

/**
 * The scrolling body for the pages that *are* documents — the project list, a project's chats, a
 * document opened on its own URL.
 *
 * The session surface deliberately does not use this: it lays its own panes out inside the frame.
 * Everything else is a page of content and should scroll like one, inside the frame rather than
 * with it.
 */
export function PageBody({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto" data-testid="page-scroll">
      <div className="mx-auto w-full max-w-5xl px-6 py-8">{children}</div>
    </div>
  );
}
