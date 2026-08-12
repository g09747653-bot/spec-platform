import { eq } from 'drizzle-orm';
import type { Adapter, AdapterAccount, AdapterUser } from 'next-auth/adapters';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { accounts, authSessions, users } from '@/db/schema';
import { createMigratedDatabase, type TestDatabase } from '@/db/testing/migrated-database';

import { createAuthAdapter, recordCreatingIdentity } from './adapter';

/**
 * Task 12 — the identity contract, exercised against a real PostgreSQL instance.
 *
 * FR-001 AC-2/AC-3 and IR-002-AC-3 are claims about what happens on a *second* sign-in, so they are
 * asserted through the adapter that Auth.js actually calls, against this project's tables. A live
 * OAuth round-trip cannot be automated (it needs a real Google/GitHub account and a browser), but
 * everything downstream of the provider's callback — account lookup, user creation, session
 * revocation — is exactly this surface.
 */
describe('Auth.js adapter over the project schema (task 12)', () => {
  let database: TestDatabase;
  let adapter: Adapter;

  beforeAll(async () => {
    database = await createMigratedDatabase();
    adapter = createAuthAdapter(database.db);
  });

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    // The tables cascade from `users`, so one delete is a full reset.
    await database.db.delete(users);
  });

  const googleIdentity = (providerAccountId: string): AdapterAccount => ({
    provider: 'google',
    providerAccountId,
    type: 'oidc',
    userId: '',
  });

  const githubIdentity = (providerAccountId: string): AdapterAccount => ({
    provider: 'github',
    providerAccountId,
    type: 'oauth',
    userId: '',
  });

  const signIn = async (identity: AdapterAccount, profile: { email: string; name: string }) => {
    // The shape of what Auth.js's callback does: look the identity up, create only if unseen.
    const existing = await adapter.getUserByAccount?.({
      provider: identity.provider,
      providerAccountId: identity.providerAccountId,
    });
    if (existing) return existing;

    const created = await adapter.createUser?.({
      id: crypto.randomUUID(),
      email: profile.email,
      name: profile.name,
      emailVerified: null,
    } satisfies AdapterUser);
    if (created === undefined) throw new Error('adapter cannot create users');

    await adapter.linkAccount?.({ ...identity, userId: created.id });
    await recordCreatingIdentity(database.db, created.id, identity.providerAccountId);
    return created;
  };

  it('creates exactly one user for a first Google sign-in (FR-001 AC-2)', async () => {
    const user = await signIn(googleIdentity('google-1'), {
      email: 'first@example.test',
      name: 'First',
    });

    expect(user.email).toBe('first@example.test');
    expect(await database.db.select().from(users)).toHaveLength(1);
    expect(await database.db.select().from(accounts)).toHaveLength(1);
  });

  it('reuses the account when the same identity signs in again (FR-001 AC-3, IR-002-AC-3)', async () => {
    const first = await signIn(googleIdentity('google-1'), {
      email: 'returning@example.test',
      name: 'Returning',
    });
    const second = await signIn(googleIdentity('google-1'), {
      email: 'returning@example.test',
      name: 'Returning',
    });

    expect(second.id).toBe(first.id);
    expect(await database.db.select().from(users)).toHaveLength(1);
    expect(await database.db.select().from(accounts)).toHaveLength(1);
  });

  it('creates a new account for an unseen GitHub identity (task 12 AC-3)', async () => {
    await signIn(googleIdentity('google-1'), { email: 'a@example.test', name: 'A' });
    const github = await signIn(githubIdentity('github-1'), {
      email: 'b@example.test',
      name: 'B',
    });

    expect(await database.db.select().from(users)).toHaveLength(2);
    expect(github.email).toBe('b@example.test');
  });

  it('does not confuse two providers that issue the same account id', async () => {
    const google = await signIn(googleIdentity('shared-id'), {
      email: 'g@example.test',
      name: 'G',
    });
    const github = await signIn(githubIdentity('shared-id'), {
      email: 'h@example.test',
      name: 'H',
    });

    expect(github.id).not.toBe(google.id);
    expect(await database.db.select().from(accounts)).toHaveLength(2);
  });

  it('records the creating identity once and never rewrites it', async () => {
    const user = await signIn(googleIdentity('google-1'), {
      email: 'once@example.test',
      name: 'Once',
    });

    // A second provider linked later must not overwrite the historical value.
    await adapter.linkAccount?.({ ...githubIdentity('github-9'), userId: user.id });
    await recordCreatingIdentity(database.db, user.id, 'github-9');

    const [row] = await database.db.select().from(users).where(eq(users.id, user.id));

    expect(row?.providerAccountId).toBe('google-1');
  });

  it('resolves a session to its user, and stops resolving it after sign-out (FR-001 AC-6)', async () => {
    const user = await signIn(googleIdentity('google-1'), {
      email: 'session@example.test',
      name: 'Session',
    });
    const sessionToken = crypto.randomUUID();
    const expires = new Date(Date.now() + 60 * 60 * 1000);

    await adapter.createSession?.({ sessionToken, userId: user.id, expires });

    const resolved = await adapter.getSessionAndUser?.(sessionToken);
    expect(resolved?.user.id).toBe(user.id);

    await adapter.deleteSession?.(sessionToken);

    expect(await adapter.getSessionAndUser?.(sessionToken)).toBeNull();
    expect(await database.db.select().from(authSessions)).toHaveLength(0);
  });

  it('drops sessions and linked identities when the user is deleted (DR-6)', async () => {
    const user = await signIn(googleIdentity('google-1'), {
      email: 'gone@example.test',
      name: 'Gone',
    });
    await adapter.createSession?.({
      sessionToken: crypto.randomUUID(),
      userId: user.id,
      expires: new Date(Date.now() + 1000),
    });

    await database.db.delete(users).where(eq(users.id, user.id));

    expect(await database.db.select().from(accounts)).toHaveLength(0);
    expect(await database.db.select().from(authSessions)).toHaveLength(0);
  });
});
