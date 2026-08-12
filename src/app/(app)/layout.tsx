import type { ReactNode } from 'react';

import { AppShell } from '@/modules/web';

/**
 * Layout for the authenticated area.
 *
 * Route protection — redirect when unauthenticated, `NOT_FOUND` when the resource belongs to
 * someone else — is added by the middleware in task 14 (FR-001 AC-5; AR-2).
 */
export default function AuthenticatedAreaLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
