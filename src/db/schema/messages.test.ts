import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { projects, sessionMessages, sessions, users } from '@/db/schema';
import {
  captureDatabaseError,
  createMigratedDatabase,
  type TestDatabase,
} from '@/db/testing/migrated-database';

/**
 * Task 132 — the conversation's own turns, as the database enforces them.
 *
 * The interesting constraints are the two the position carries: a spec stage always has a substage
 * and `interview`/`complete` never do. They are the same pair `workflow_state` carries, and they
 * matter here for a different reason — a message whose recorded position is not a position the
 * machine can be in would be a `data-msg-stage` nobody could navigate by.
 */
describe('session_messages schema (task 132)', () => {
  let database: TestDatabase;
  let sessionId: string;

  beforeAll(async () => {
    database = await createMigratedDatabase();
  });

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    await database.db.delete(users);

    const [owner] = await database.db
      .insert(users)
      .values({ email: 'owner@example.test' })
      .returning({ id: users.id });
    const [project] = await database.db
      .insert(projects)
      .values({ ownerId: owner?.id ?? '', name: 'Messages' })
      .returning({ id: projects.id });
    const [session] = await database.db
      .insert(sessions)
      .values({ projectId: project?.id ?? '', initialPrompt: 'a prompt' })
      .returning({ id: sessions.id });
    sessionId = session?.id ?? '';
  });

  it('stores a chat turn and a bridge at the position each was written at', async () => {
    await database.db.insert(sessionMessages).values([
      {
        sessionId,
        role: 'user',
        origin: 'chat',
        stage: 'constitution',
        substage: 'review',
        body: 'what should I pick?',
      },
      {
        sessionId,
        role: 'assistant',
        origin: 'bridge',
        stage: 'interview',
        substage: null,
        body: 'Offline and email delivery pull against each other.',
      },
    ]);

    const rows = await database.db
      .select()
      .from(sessionMessages)
      .where(eq(sessionMessages.sessionId, sessionId));

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.origin).sort()).toEqual(['bridge', 'chat']);
  });

  it('refuses a spec-stage message with no substage, and an interview message with one', async () => {
    const noSubstage = await captureDatabaseError(() =>
      database.db.insert(sessionMessages).values({
        sessionId,
        role: 'user',
        origin: 'chat',
        stage: 'constitution',
        substage: null,
        body: 'text',
      }),
    );

    const straySubstage = await captureDatabaseError(() =>
      database.db.insert(sessionMessages).values({
        sessionId,
        role: 'user',
        origin: 'chat',
        stage: 'interview',
        substage: 'collect',
        body: 'text',
      }),
    );

    expect(noSubstage).toMatch(/session_messages_substage_valid/);
    expect(straySubstage).toMatch(/session_messages_substage_valid/);
  });

  it('refuses an unknown role or origin, and a blank body', async () => {
    const badRole = await captureDatabaseError(() =>
      database.db.insert(sessionMessages).values({
        sessionId,
        role: 'system',
        origin: 'chat',
        stage: 'interview',
        substage: null,
        body: 'text',
      }),
    );

    const badOrigin = await captureDatabaseError(() =>
      database.db.insert(sessionMessages).values({
        sessionId,
        role: 'user',
        origin: 'transcript',
        stage: 'interview',
        substage: null,
        body: 'text',
      }),
    );

    const blank = await captureDatabaseError(() =>
      database.db.insert(sessionMessages).values({
        sessionId,
        role: 'user',
        origin: 'chat',
        stage: 'interview',
        substage: null,
        body: '   ',
      }),
    );

    expect(badRole).toMatch(/session_messages_role_valid/);
    expect(badOrigin).toMatch(/session_messages_origin_valid/);
    expect(blank).toMatch(/session_messages_body_not_blank/);
  });

  it('goes with the session — a deleted chat takes its transcript with it', async () => {
    await database.db.insert(sessionMessages).values({
      sessionId,
      role: 'user',
      origin: 'chat',
      stage: 'interview',
      substage: null,
      body: 'text',
    });

    await database.db.delete(sessions).where(eq(sessions.id, sessionId));

    expect(await database.db.select().from(sessionMessages)).toHaveLength(0);
  });
});
