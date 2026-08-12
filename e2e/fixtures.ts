import { randomUUID } from 'node:crypto';

import { Client } from 'pg';
import type { BrowserContext } from '@playwright/test';

/**
 * End-to-end fixtures: a signed-in identity, without an OAuth round-trip.
 *
 * **How a test signs in.** Auth.js uses the database session strategy, so a session *is* a row in
 * `auth_sessions` and the cookie carries its token. A test therefore creates the row and sets the
 * cookie — the application then authenticates the request exactly as it would after a real callback,
 * through the same adapter and the same query. Nothing test-only is added to the application: there is no
 * bypass provider, no test route and no branch in production code that a test could later come to depend
 * on (which is precisely what a "test mode" flag becomes).
 *
 * The live OAuth hop with Google and GitHub cannot be automated — it needs a real account and a consent
 * screen — and is verified by hand at the milestone gate.
 */
const TEST_DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:5497/postgres';

/** The cookie name Auth.js uses over plain http, which is what the test server speaks. */
const SESSION_COOKIE = 'authjs.session-token';

export interface SignedInUser {
  userId: string;
  email: string;
  sessionToken: string;
}

async function withClient<T>(body: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();

  try {
    return await body(client);
  } finally {
    await client.end();
  }
}

/** Creates a user with a live session. Each call is a distinct person. */
export async function createSignedInUser(label: string): Promise<SignedInUser> {
  const email = `${label}-${randomUUID().slice(0, 8)}@example.test`;
  const sessionToken = randomUUID();

  const userId = await withClient(async (client) => {
    const inserted = await client.query<{ id: string }>(
      'INSERT INTO users (email, name) VALUES ($1, $2) RETURNING id',
      [email, label],
    );
    const row = inserted.rows[0];
    if (row === undefined) throw new Error('fixture could not create a user');

    await client.query(
      `INSERT INTO auth_sessions (session_token, user_id, expires)
       VALUES ($1, $2, now() + interval '1 day')`,
      [sessionToken, row.id],
    );

    return row.id;
  });

  return { userId, email, sessionToken };
}

/** Puts the session cookie in the browser context, which is what "being signed in" means here. */
export async function signIn(context: BrowserContext, user: SignedInUser): Promise<void> {
  await context.addCookies([
    {
      name: SESSION_COOKIE,
      value: user.sessionToken,
      domain: '127.0.0.1',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
      expires: Math.floor(Date.now() / 1000) + 60 * 60,
    },
  ]);
}

/** Deletes the session row, as signing out does — the cookie stays in the browser. */
export async function revokeSession(user: SignedInUser): Promise<void> {
  await withClient(async (client) => {
    await client.query('DELETE FROM auth_sessions WHERE session_token = $1', [user.sessionToken]);
  });
}
