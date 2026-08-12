import { integer, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { users } from './users';

/**
 * The tables Auth.js's Drizzle adapter owns (task 12; IR-002).
 *
 * These exist because the constitution mandates a vetted authentication library (S3) and
 * solution.md mandates the **database** session strategy: a session is a row, so signing out can
 * delete it and a stolen cookie stops working the moment the row is gone (FR-001 AC-6). Nothing in
 * the domain reads them — `users` is the only table both sides share.
 *
 * Naming: the workflow session of the ERD is `sessions`, so the authentication session table is
 * `auth_sessions`. Two different lifetimes never share a name.
 */

/**
 * One row per linked OAuth identity. This — not `users.provider_account_id` — is the table that
 * answers "have I seen this identity before?" (FR-001 AC-3, IR-002-AC-3), and the composite primary
 * key is what makes a duplicate account impossible rather than merely unlikely.
 */
export const accounts = pgTable(
  'accounts',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (table) => [
    primaryKey({
      name: 'accounts_provider_provider_account_id_pk',
      columns: [table.provider, table.providerAccountId],
    }),
  ],
);

/** An authenticated browser session. Deleting the row is what makes FR-001 AC-6 true. */
export const authSessions = pgTable('auth_sessions', {
  sessionToken: text('session_token').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { withTimezone: true, mode: 'date' }).notNull(),
});

/**
 * Required by the adapter contract. v1 registers only OAuth providers, so nothing writes here —
 * it exists so the adapter is complete rather than partially implemented.
 */
export const verificationTokens = pgTable(
  'verification_tokens',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { withTimezone: true, mode: 'date' }).notNull(),
  },
  (table) => [
    primaryKey({
      name: 'verification_tokens_identifier_token_pk',
      columns: [table.identifier, table.token],
    }),
  ],
);

export type AccountRow = typeof accounts.$inferSelect;
export type AuthSessionRow = typeof authSessions.$inferSelect;
