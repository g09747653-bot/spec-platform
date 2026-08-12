import { handlers } from '@/modules/projects/auth';

/**
 * The OAuth endpoints (`/api/auth/*`): authorize, callback, csrf, session, signout.
 *
 * This is the only route family the proxy leaves unauthenticated (task 14) — an unauthenticated
 * visitor must be able to reach it in order to become authenticated at all.
 */
export const { GET, POST } = handlers;
