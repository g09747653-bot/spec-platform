import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { SERVER_DEFAULT_THEME, ThemeScript } from '@/modules/web';

import './globals.css';

export const metadata: Metadata = {
  title: 'Spec Platform',
  description: 'Turn a plain-language prompt into an agent-ready specification bundle.',
};

/**
 * The document shell.
 *
 * `data-theme` ships with the server's default and is corrected by `ThemeScript` while the browser
 * is still parsing `<head>` — before the first paint, so a dark-mode user never sees a white flash.
 * `suppressHydrationWarning` on `<html>` is the other half of that: the script has changed the
 * attribute by the time React hydrates, and React must keep the DOM rather than the payload.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme={SERVER_DEFAULT_THEME} suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="bg-background text-foreground min-h-screen antialiased">{children}</body>
    </html>
  );
}
