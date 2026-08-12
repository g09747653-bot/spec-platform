import type { NextAuthConfig } from 'next-auth';
import GitHub from 'next-auth/providers/github';
import Google from 'next-auth/providers/google';

import { getEnv } from '@/config/env';
import type { SchemaDatabase } from '@/db';

import { createAuthAdapter, recordCreatingIdentity } from './adapter';

/** Where an unauthenticated visitor is sent, and where a failed OAuth attempt comes back to. */
export const SIGN_IN_PATH = '/signin';

/** Query parameter carrying the reason a sign-in did not complete (FR-001 AC-4). */
export const SIGN_IN_ERROR_PARAM = 'error';

/**
 * Session cookie flags (solution.md — Security Architecture; task 12).
 *
 * Stated explicitly rather than left implicit, because "httpOnly, `SameSite=Lax`" is a requirement
 * and a requirement should be readable in the code. `secure` is deliberately **not** set here: Auth.js
 * derives it from the resolved URL's protocol and applies the same derivation to the CSRF, state and
 * PKCE cookies, so overriding one of them by hand is how the set drifts apart. Auth.js deep-merges
 * this over its defaults, so the cookie keeps its default name.
 */
export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  path: '/',
} as const;

/**
 * The Auth.js configuration (FR-001; IR-002).
 *
 * Credentials are read through `getEnv()`, so they are Zod-validated once at boot and a missing one
 * is a named boot failure rather than a runtime redirect loop. They stay server-side only
 * (constitution S1).
 *
 * The database session strategy is a requirement, not a preference: FR-001 AC-6 demands that a
 * request carrying the prior cookie be unauthenticated after sign-out, and only a server-side
 * session record can be revoked. A JWT cookie cannot.
 */
export function createAuthConfig(db: SchemaDatabase): NextAuthConfig {
  const env = getEnv();

  return {
    adapter: createAuthAdapter(db),
    session: { strategy: 'database' },
    cookies: { sessionToken: { options: sessionCookieOptions } },
    pages: {
      signIn: SIGN_IN_PATH,
      // FR-001 AC-4: a cancelled or failed flow returns to the sign-in screen with a message,
      // instead of Auth.js's own error page.
      error: SIGN_IN_PATH,
    },
    providers: [
      Google({
        clientId: env.AUTH_GOOGLE_ID,
        clientSecret: env.AUTH_GOOGLE_SECRET,
        // Ask for the profile only. DR-15: nothing beyond what the provider returns for sign-in.
        authorization: { params: { scope: 'openid email profile' } },
      }),
      GitHub({
        clientId: env.AUTH_GITHUB_ID,
        clientSecret: env.AUTH_GITHUB_SECRET,
      }),
    ],
    secret: env.AUTH_SECRET,
    /**
     * The application is single-tenant and always runs behind a proxy it does not control the host
     * of (Vercel sets `x-forwarded-host` for both preview and production domains). Trusting it is
     * what lets one build serve every deployment URL without pinning `AUTH_URL` per environment.
     */
    trustHost: true,
    events: {
      linkAccount: async ({ user, account }) => {
        if (user.id === undefined) return;
        await recordCreatingIdentity(db, user.id, account.providerAccountId);
      },
    },
  };
}
