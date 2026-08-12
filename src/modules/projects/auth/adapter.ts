import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { and, eq, isNull } from 'drizzle-orm';
import type { Adapter } from 'next-auth/adapters';

import type { SchemaDatabase } from '@/db';
import { accounts, authSessions, users, verificationTokens } from '@/db/schema';

/**
 * Binds Auth.js's Drizzle adapter to this project's tables (task 12; IR-002).
 *
 * The adapter is what makes FR-001 AC-2/AC-3 true: `getUserByAccount` looks the identity up in
 * `accounts` before anything is created, so a returning identity resolves to the existing row and a
 * second account is never inserted. Passing the tables explicitly is what lets the workflow session
 * keep the name `sessions` while the authentication session lives in `auth_sessions`.
 *
 * The database arrives as an argument rather than as an imported singleton so the identity contract
 * can be exercised against a real PostgreSQL instance in a unit test.
 */
export function createAuthAdapter(db: SchemaDatabase): Adapter {
  return DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: authSessions,
    verificationTokensTable: verificationTokens,
  });
}

/**
 * Records the provider identity that created an account, once (see the column note on `users`).
 *
 * Written from the `linkAccount` event rather than by the adapter, because `createUser` runs before
 * the account row exists and the identity is not yet known at that point. `IS NULL` in the predicate
 * makes the write single-shot: linking a second provider later must not rewrite history.
 */
export async function recordCreatingIdentity(
  db: SchemaDatabase,
  userId: string,
  providerAccountId: string,
): Promise<void> {
  await db
    .update(users)
    .set({ providerAccountId })
    .where(and(eq(users.id, userId), isNull(users.providerAccountId)));
}
