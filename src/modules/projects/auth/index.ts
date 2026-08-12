import NextAuth from 'next-auth';

import { getDatabase } from '@/db/client';

import { createAuthConfig } from './config';

/**
 * The application's single Auth.js instance (task 12).
 *
 * `auth()` is the only sanctioned way to learn who is making a request: route handlers and server
 * components call it and derive an `OwnerScope` from the result (task 13), so ownership is never
 * taken from a client-supplied identifier (NFR-005 AC-3).
 */
export const { handlers, auth, signIn, signOut } = NextAuth(createAuthConfig(getDatabase()));

export { SIGN_IN_PATH, SIGN_IN_ERROR_PARAM } from './config';
