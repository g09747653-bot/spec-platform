import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Account identity (DR-1, DR-15; solution.md — Data Model).
 *
 * The column set is the intersection of two contracts: the ERD's `users` entity, and the shape
 * Auth.js's Drizzle adapter reads and writes for the database session strategy (`emailVerified`,
 * `image`). Both are satisfied by one table, so there is no second notion of "user".
 *
 * `email` and `name` are nullable because DR-15 forbids requiring anything the provider does not
 * return — GitHub withholds the address of a user whose email is private. Uniqueness still holds
 * for the addresses that are returned: Postgres permits multiple NULLs in a unique index.
 *
 * `provider_account_id` records the identity that *created* the account. It is written once, at
 * sign-up (task 12), and is deliberately not a lookup key: identity→account matching (FR-001 AC-3,
 * IR-002-AC-3) resolves through the `accounts` table, which is the only place that stays correct
 * once a second provider is linked.
 */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').unique(),
  name: text('name'),
  emailVerified: timestamp('email_verified', { withTimezone: true, mode: 'date' }),
  image: text('image'),
  providerAccountId: text('provider_account_id'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export type UserRow = typeof users.$inferSelect;
