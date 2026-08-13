import { randomUUID } from 'node:crypto';

import { expect, type BrowserContext, type Page } from '@playwright/test';
import { Client } from 'pg';

import { TEST_DATABASE_URL } from './test-database';

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

/**
 * Walks a fresh session from `interview` to `constitution/generate`, through the real gates.
 *
 * From task 45 the generation endpoint checks the `collect → generate` gate before it calls a model,
 * so drafting is reachable only by answering a round in the interview and a round in the stage. That
 * is not an obstacle the tests route around — it is the behaviour constitution P1 requires — so the
 * walk lives here and every journey that needs a draft performs it.
 */
export async function reachDrafting(page: Page): Promise<void> {
  await expect(page.getByTestId('interview-panel')).toBeVisible();

  // The grounding interview: one answered round plus the persisted summary opens the exit gate.
  await page.getByTestId('ask-round').click();
  await expect(page.getByTestId('mcq-card')).toBeVisible();
  await page.getByTestId('mcq-option-q-audience-solo-devs').check();
  await page.getByTestId('mcq-option-q-problem-context').check();
  await page.getByTestId('mcq-submit').click();

  await expect(page.getByTestId('interview-panel')).toContainText('summary saved');
  await page.getByTestId('proceed').click();
  await expect(page.getByTestId('stage-current')).toHaveText(/Constitution/);

  // The stage collects for itself before it drafts (FR-007 AC-2).
  await page.getByTestId('ask-round').click();
  await expect(page.getByTestId('mcq-card')).toBeVisible();
  await page.getByTestId('mcq-option-q-constitution-scope-strict').check();
  await page.getByTestId('mcq-submit').click();

  await expect(page.getByTestId('interview-panel')).toBeVisible();
  await page.getByTestId('proceed').click();
  await expect(page.getByTestId('stage-substage')).toHaveText(/generate/);
}

/**
 * The id of the review awaiting a decision for a given owner, read straight from the database.
 *
 * The board does not put the id in the DOM, and it should not have to: the id is an API detail, not
 * something the user sees. A test that needs to call the endpoint as *somebody else* needs a real id
 * though — a made-up UUID would prove only that unknown ids 404, not that owned-by-another ones do.
 */
export async function pendingReviewIdFor(userId: string): Promise<string> {
  return withClient(async (client) => {
    const found = await client.query<{ id: string }>(
      `SELECT rf.id
         FROM review_feedback rf
         JOIN spec_revisions sr ON sr.id = rf.spec_revision_id
         JOIN spec_files sf ON sf.id = sr.spec_file_id
         JOIN projects p ON p.id = sf.project_id
        WHERE p.owner_id = $1 AND rf.decision IS NULL
        ORDER BY rf.created_at DESC
        LIMIT 1`,
      [userId],
    );

    const row = found.rows[0];
    if (row === undefined) throw new Error('fixture found no pending review for that owner');

    return row.id;
  });
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
