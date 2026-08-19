import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { signOut, SIGN_IN_PATH } from '@/modules/projects/auth';
import { isLocalSingleUser } from '@/modules/projects/auth/local-owner';
import { currentSessionUser } from '@/modules/projects/auth/scope';
import { AppShell, Button } from '@/modules/web';
import { serverT } from '@/modules/web/i18n/server-locale';

/**
 * Layout for the authenticated area.
 *
 * The proxy (task 14) already turns an anonymous request away before this renders; the check here is
 * the second half of defence in depth — the proxy sees only the cookie, this sees whether the
 * session behind it still exists (FR-001 AC-5/AC-6). Every route under `(app)` therefore has an
 * authenticated user, and the ownership check that follows is the repository's job (task 13).
 *
 * **In local single-user mode there is nobody to redirect** (task 148): a request without a session
 * is the owner, `currentOwnerScope()` says so at the seam, and the account slot names the mode
 * instead of an address. Sign-out is absent — there is no session to end and no screen to end it
 * on. A session that does exist (the end-to-end suite plants them directly in the database) renders
 * exactly the account slot it always has.
 */
export default async function AuthenticatedAreaLayout({ children }: { children: ReactNode }) {
  const user = await currentSessionUser();

  if (user === null && !isLocalSingleUser()) redirect(SIGN_IN_PATH);

  const t = await serverT();

  const account =
    user === null ? (
      <span data-testid="account-local">{t('shell.account.local-owner')}</span>
    ) : (
      <>
        <span data-testid="account-email">
          {user.email ?? user.name ?? t('shell.account.signed-in')}
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
