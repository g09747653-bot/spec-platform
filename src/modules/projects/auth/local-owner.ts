import { eq } from 'drizzle-orm';

import { getEnv } from '@/config/env';
import type { SchemaDatabase } from '@/db';
import { getDatabase } from '@/db/client';
import { OwnerScope } from '@/db/owner-scope';
import { users } from '@/db/schema';

/**
 * The fixed local owner (task 148; А-7 §4; А-20).
 *
 * In local single-user mode there is exactly one person, and this module is their identity: a
 * regular row in `users`, created the first time the deployment serves a request and found by its
 * fixed address ever after. Everything below `currentOwnerScope()` — every scope check, gate and
 * repository call — sees an ordinary `OwnerScope` and cannot tell this deployment from a hosted one,
 * which is the whole of the design: one substitution point at the seam, no local-mode branch
 * anywhere downstream.
 */

/**
 * The address that names the local owner's row.
 *
 * `.invalid` is the TLD RFC 2606 reserves for names that must never resolve, which is exactly what
 * this is: a lookup key with the shape of an email, deliberately not a mailbox. The `users.email`
 * unique index is what makes "one fixed identity" a database fact rather than a convention.
 */
export const LOCAL_OWNER_EMAIL = 'owner@local.invalid';

/** Whether this deployment is the local single-user kind. A boot-time property, never per-request. */
export function isLocalSingleUser(): boolean {
  return getEnv().LOCAL_SINGLE_USER;
}

/**
 * Finds the owner row, creating it on the deployment's first request.
 *
 * Two racing first requests both reach the insert; the unique index on `email` admits one, the
 * `onConflictDoNothing` returns no row to the other, and the re-read gives both the same answer. No
 * lock, no transaction — the index is the arbiter.
 *
 * Exported for the unit test; the application calls `localOwnerScope()`.
 */
export async function resolveLocalOwnerId(db: SchemaDatabase): Promise<string> {
  const found = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, LOCAL_OWNER_EMAIL))
    .limit(1);

  const existing = found[0];
  if (existing !== undefined) return existing.id;

  const inserted = await db
    .insert(users)
    .values({ email: LOCAL_OWNER_EMAIL })
    .onConflictDoNothing({ target: users.email })
    .returning({ id: users.id });

  const created = inserted[0];
  if (created !== undefined) return created.id;

  const reread = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, LOCAL_OWNER_EMAIL))
    .limit(1);

  const row = reread[0];
  if (row === undefined) {
    throw new Error('the local owner row could neither be found nor created');
  }

  return row.id;
}

/*
 * Memoised per process, not per request: the row is immutable once created, and the id is what every
 * request needs. A restarted server re-finds the same row by its address, which is what makes the
 * identity a property of the *database* — it survives every process that ever served it.
 */
let cachedOwnerId: string | undefined;

/** The local owner's scope — what `currentOwnerScope()` answers when nobody is signed in here. */
export async function localOwnerScope(): Promise<OwnerScope> {
  cachedOwnerId ??= await resolveLocalOwnerId(getDatabase());
  return OwnerScope.forAuthenticatedUser(cachedOwnerId);
}
