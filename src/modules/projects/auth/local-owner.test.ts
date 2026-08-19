import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { users } from '@/db/schema';
import { createMigratedDatabase, type TestDatabase } from '@/db/testing/migrated-database';

import { LOCAL_OWNER_EMAIL, resolveLocalOwnerId } from './local-owner';

/**
 * Task 148 — one fixed local owner identity, created on first boot.
 *
 * The claims worth a database: the row is created exactly once, every later call answers the same
 * id, and a burst of racing first requests — the shape of a server accepting traffic the moment it
 * boots — settles on one row rather than five. The unique index on `users.email` is the arbiter,
 * so the test runs against a real PostgreSQL instance, not a mock of one.
 */
describe('resolveLocalOwnerId (task 148)', () => {
  let database: TestDatabase;

  beforeAll(async () => {
    database = await createMigratedDatabase();
  });

  afterAll(async () => {
    await database.close();
  });

  it('creates the owner row on first need and finds the same row ever after', async () => {
    const first = await resolveLocalOwnerId(database.db);
    const second = await resolveLocalOwnerId(database.db);

    expect(first).toBe(second);

    const rows = await database.db.select({ email: users.email }).from(users);
    expect(rows).toEqual([{ email: LOCAL_OWNER_EMAIL }]);
  });

  it('settles racing first requests on one identity', async () => {
    const ids = await Promise.all(
      Array.from({ length: 5 }, () => resolveLocalOwnerId(database.db)),
    );

    expect(new Set(ids).size).toBe(1);

    const rows = await database.db.select({ id: users.id }).from(users);
    expect(rows).toHaveLength(1);
  });
});
