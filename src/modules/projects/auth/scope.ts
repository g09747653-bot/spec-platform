import { redirect } from 'next/navigation';

import { OwnerScope } from '@/db/owner-scope';

import { auth, SIGN_IN_PATH } from './index';
import { isLocalSingleUser, localOwnerScope } from './local-owner';

/**
 * The bridge from "who is making this request" to "what may it touch" (task 14; NFR-005 AC-3).
 *
 * Both helpers derive the scope from the Auth.js session and nothing else. No route handler, server
 * action or page constructs an `OwnerScope` any other way, so a user id in a request body can never
 * become an authorization decision.
 *
 * **Local single-user mode substitutes here, and only here** (task 148). Where the session answers
 * "nobody", a local deployment answers "the owner" — one fixed identity created on first boot (see
 * `local-owner.ts`). The substitution sits at this seam so that everything downstream of a scope is
 * byte-identical in both kinds of deployment; and it is a *fallback*, not a mask, so the end-to-end
 * suite's planted sessions authenticate exactly as they do today. In a real local deployment no
 * session can exist at all — the OAuth surface refuses, so nothing can mint one.
 */

/** The session's user, shaped as the layout consumes it. */
export interface SessionUser {
  id?: string;
  email?: string | null;
  name?: string | null;
}

/**
 * The authenticated user behind this request, or `null` — which in local mode is not a redirect but
 * the cue to serve the local owner.
 *
 * In local mode the Auth.js call is guarded: a local deployment is allowed to run without
 * `AUTH_SECRET` (task 148 made the OAuth variables conditional), and Auth.js throws on any call
 * without one. Nobody can sign in on such a deployment — the OAuth routes refuse — so "the library
 * cannot read a cookie" and "there is no session" are the same answer, and it is answered rather
 * than thrown. Outside local mode nothing is caught: a misconfigured hosted deployment must fail
 * loudly, exactly as it always has.
 */
export async function currentSessionUser(): Promise<SessionUser | null> {
  if (!isLocalSingleUser()) return (await auth())?.user ?? null;

  try {
    return (await auth())?.user ?? null;
  } catch {
    return null;
  }
}

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
  const userId = (await currentSessionUser())?.id;

  if (userId !== undefined && userId !== '') return OwnerScope.forAuthenticatedUser(userId);

  return isLocalSingleUser() ? localOwnerScope() : null;
}
