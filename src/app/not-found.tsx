import Link from 'next/link';

import { serverT } from '@/modules/web/i18n/server-locale';

/**
 * The generic not-found view (AR-2).
 *
 * Deliberately says nothing about *why*: a project that does not exist and a project belonging to
 * someone else must be indistinguishable, and that promise is only as good as the page that keeps it.
 *
 * Asynchronous since task 143, because reading the chrome language is reading a cookie. The
 * convention allows it — `not-found.js` is an ordinary server component and may be `async` — and the
 * page has nothing to prerender anyway: it is three lines of copy and a link.
 */
export default async function NotFound() {
  const t = await serverT();

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-3 px-6">
      <h1 className="text-h1">{t('page.not-found.title')}</h1>
      <p className="text-foreground-muted text-sm">{t('page.not-found.body')}</p>
      <Link href="/projects" className="text-sm underline" data-testid="not-found-back">
        {t('page.not-found.back')}
      </Link>
    </main>
  );
}
