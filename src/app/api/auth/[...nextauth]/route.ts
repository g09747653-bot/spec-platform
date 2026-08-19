import type { NextRequest } from 'next/server';

import { handlers } from '@/modules/projects/auth';
import { isLocalSingleUser } from '@/modules/projects/auth/local-owner';
import { errorResponse } from '@/modules/web/api/responses';

/**
 * The OAuth endpoints (`/api/auth/*`): authorize, callback, csrf, session, signout.
 *
 * This is the only route family the proxy leaves unauthenticated (task 14) — an unauthenticated
 * visitor must be able to reach it in order to become authenticated at all.
 *
 * **In local single-user mode the family refuses** (task 148): the owner's session is made by the
 * deployment itself, and an endpoint that could mint or end sessions has no business existing on a
 * machine that serves one person. `NOT_FOUND` rather than a redirect, because a route that does not
 * exist is what these are here — the proxy refuses them too, and this is the second half of that.
 */
export function GET(request: NextRequest): Response | Promise<Response> {
  if (isLocalSingleUser()) return errorResponse('NOT_FOUND');
  return handlers.GET(request);
}

export function POST(request: NextRequest): Response | Promise<Response> {
  if (isLocalSingleUser()) return errorResponse('NOT_FOUND');
  return handlers.POST(request);
}
