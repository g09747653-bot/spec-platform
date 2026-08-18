import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { LocaleProvider, SERVER_DEFAULT_THEME, ThemeScript, UiStateScript } from '@/modules/web';
import { currentLocale, serverT } from '@/modules/web/i18n/server-locale';

import './globals.css';

/**
 * The document's own copy, in the language this device asked for (task 143).
 *
 * A function rather than the static `metadata` object it replaces: the title and the description are
 * chrome like everything else, and a static export cannot read a cookie. This is the one metadata
 * call in the tree.
 */
export async function generateMetadata(): Promise<Metadata> {
  const t = await serverT();

  return {
    title: t('shell.brand.name'),
    description: t('page.meta.description'),
  };
}

/**
 * The document shell.
 *
 * `data-theme` ships with the server's default and is corrected by `ThemeScript` while the browser
 * is still parsing `<head>` — before the first paint, so a dark-mode user never sees a white flash.
 * `suppressHydrationWarning` on `<html>` is the other half of that: the script has changed the
 * attribute by the time React hydrates, and React must keep the DOM rather than the payload.
 *
 * **`lang` is the point of task 143 and is deliberately not that kind of attribute.** It is read
 * from the cookie *here*, on the server, so the first byte of HTML declares the language the copy is
 * actually in. That is what stops the customer's browser offering to translate the page — the
 * failure this whole task exists to end. Note the trap the theme leaves behind:
 * `suppressHydrationWarning` silences *every* attribute mismatch on `<html>`, so a wrong `lang` fails
 * silently rather than warning. It is asserted in `e2e/locale.spec.ts`, with JavaScript disabled, for
 * exactly that reason.
 *
 * The provider is mounted at the root rather than inside `(app)` because the sign-in screen, the home
 * page and the not-found page live outside that group and speak too. `children` passes straight
 * through, so nothing below is forced to become a client component by being wrapped.
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await currentLocale();

  return (
    <html lang={locale} data-theme={SERVER_DEFAULT_THEME} suppressHydrationWarning>
      <head>
        <ThemeScript />
        <UiStateScript />
      </head>
      <body className="bg-background text-foreground min-h-screen antialiased">
        <LocaleProvider locale={locale}>{children}</LocaleProvider>
      </body>
    </html>
  );
}
