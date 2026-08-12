import { redirect } from 'next/navigation';

import { OwnerScope } from '../repositories/owner-scope';

import { auth, SIGN_IN_PATH } from './index';

/**
 * The bridge from "who is making this request" to "what may it touch" (task 14; NFR-005 AC-3).
 *
 * Both helpers derive the scope from the Auth.js session and nothing else. No route handler, server
 * action or page constructs an `OwnerScope` any other way, so a user id in a request body can never
 * become an authorization decision.
 */

/** For pages: an anonymous visitor is sent to sign-in and the page never renders (FR-001 AC-5). */
export async function requireOwnerScope(): Promise<OwnerScope> {
  const scope = await currentOwnerScope();

  if (scope === null) redirect(SIGN_IN_PATH);

  return scope;
}

/**
 * For route handlers: `null` means unauthenticated, which the caller answers with `UNAUTHENTICATED`.
 *
 * This is the check the proxy cannot make. The proxy sees a cookie; this sees whether the session row
 * behind it still exists, which is what makes a signed-out cookie useless (FR-001 AC-6).
 */
export async function currentOwnerScope(): Promise<OwnerScope | null> {
  const session = await auth();
  const userId = session?.user?.id;

  return userId === undefined || userId === '' ? null : OwnerScope.forAuthenticatedUser(userId);
}
