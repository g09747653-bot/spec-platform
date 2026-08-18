import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { auth, signOut, SIGN_IN_PATH } from '@/modules/projects/auth';
import { AppShell, Button } from '@/modules/web';
import { serverT } from '@/modules/web/i18n/server-locale';

/**
 * Layout for the authenticated area.
 *
 * The proxy (task 14) already turns an anonymous request away before this renders; the check here is
 * the second half of defence in depth — the proxy sees only the cookie, this sees whether the
 * session behind it still exists (FR-001 AC-5/AC-6). Every route under `(app)` therefore has an
 * authenticated user, and the ownership check that follows is the repository's job (task 13).
 */
export default async function AuthenticatedAreaLayout({ children }: { children: ReactNode }) {
  const session = await auth();

  if (!session?.user) redirect(SIGN_IN_PATH);

  const t = await serverT();

  const account = (
    <>
      <span data-testid="account-email">
        {session.user.email ?? session.user.name ?? t('shell.account.signed-in')}
      </span>
      <form
        action={async () => {
          'use server';
          await signOut({ redirectTo: SIGN_IN_PATH });
        }}
      >
        <Button type="submit" variant="secondary" size="sm" data-testid="sign-out">
          {t('shell.account.sign-out')}
        </Button>
      </form>
    </>
  );

  return <AppShell account={account}>{children}</AppShell>;
}
