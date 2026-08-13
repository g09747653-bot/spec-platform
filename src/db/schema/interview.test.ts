import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { answers, informationNeeds, projects, questionRounds, sessions, users } from '@/db/schema';
import {
  captureDatabaseError,
  createMigratedDatabase,
  type TestDatabase,
} from '@/db/testing/migrated-database';

/**
 * Task 31 — the interview tables as the database enforces them.
 *
 * Uniqueness, stage vocabulary and cascade behaviour are database properties, so they are asserted
 * against a real PostgreSQL instance running the shipped migrations (D-13), not against a mock.
 */
describe('interview schema (task 31)', () => {
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
      .values({ ownerId: owner?.id ?? '', name: 'Interview' })
      .returning({ id: projects.id });
    const [session] = await database.db
      .insert(sessions)
      .values({ projectId: project?.id ?? '', initialPrompt: 'a prompt' })
      .returning({ id: sessions.id });
    sessionId = session?.id ?? '';
  });

  async function insertRound(stage: string, roundNumber: number): Promise<string> {
    const [round] = await database.db
      .insert(questionRounds)
      .values({ sessionId, stage, roundNumber, questions: { stage, questions: [] } })
      .returning({ id: questionRounds.id });

    return round?.id ?? '';
  }

  it('rejects a duplicate round number within a session and stage (AC-2)', async () => {
    await insertRound('interview', 1);

    const error = await captureDatabaseError(() => insertRound('interview', 1));
    expect(error).toMatch(/question_rounds_session_stage_round_unique|duplicate key/i);

    // The same number in another stage is a different counter.
    await insertRound('constitution', 1);
  });

  it('rejects duplicate information-need names within a stage (AC-1) and permits them across stages', async () => {
    await database.db
      .insert(informationNeeds)
      .values({ sessionId, stage: 'interview', name: 'target-users' });

    const error = await captureDatabaseError(() =>
      database.db
        .insert(informationNeeds)
        .values({ sessionId, stage: 'interview', name: 'target-users' }),
    );
    expect(error).toMatch(/information_needs_session_stage_name_unique|duplicate key/i);

    await database.db
      .insert(informationNeeds)
      .values({ sessionId, stage: 'constitution', name: 'target-users' });
  });

  it('confines rounds and needs to asking stages — complete asks nothing', async () => {
    expect(await captureDatabaseError(() => insertRound('complete', 1))).toMatch(
      /question_rounds_stage_valid/i,
    );

    expect(
      await captureDatabaseError(() =>
        database.db
          .insert(informationNeeds)
          .values({ sessionId, stage: 'complete', name: 'anything' }),
      ),
    ).toMatch(/information_needs_stage_valid/i);
  });

  it('rejects a zero round number and a non-object questions payload', async () => {
    expect(await captureDatabaseError(() => insertRound('interview', 0))).toMatch(
      /question_rounds_round_number_positive/i,
    );

    expect(
      await captureDatabaseError(() =>
        database.db
          .insert(questionRounds)
          .values({ sessionId, stage: 'interview', roundNumber: 1, questions: [] }),
      ),
    ).toMatch(/question_rounds_questions_is_object/i);
  });

  it('requires every answer to carry substance and at most one per question (DR-5)', async () => {
    const roundId = await insertRound('interview', 1);

    // Empty answer: no options, no text.
    expect(
      await captureDatabaseError(() =>
        database.db.insert(answers).values({ roundId, questionId: 'q1' }),
      ),
    ).toMatch(/answers_carry_substance/i);

    // Whitespace-only free text is not substance either.
    expect(
      await captureDatabaseError(() =>
        database.db.insert(answers).values({ roundId, questionId: 'q1', freeText: '  \n ' }),
      ),
    ).toMatch(/answers_carry_substance/i);

    await database.db
      .insert(answers)
      .values({ roundId, questionId: 'q1', selectedOptionIds: ['a'] });

    expect(
      await captureDatabaseError(() =>
        database.db.insert(answers).values({ roundId, questionId: 'q1', freeText: 'again' }),
      ),
    ).toMatch(/answers_round_question_unique|duplicate key/i);

    // Card-level free-text replies carry a NULL question id, and several may exist (task 36).
    await database.db.insert(answers).values({ roundId, freeText: 'a reply in chat' });
    await database.db.insert(answers).values({ roundId, freeText: 'another reply' });
  });

  it('retains both selected options and free text on one answer (DR-5)', async () => {
    const roundId = await insertRound('interview', 1);

    await database.db.insert(answers).values({
      roundId,
      questionId: 'q1',
      selectedOptionIds: ['a', 'c'],
      freeText: 'and also this',
    });

    const [stored] = await database.db.select().from(answers).where(eq(answers.roundId, roundId));
    expect(stored?.selectedOptionIds).toEqual(['a', 'c']);
    expect(stored?.freeText).toBe('and also this');
  });

  it('cascades a session deletion through rounds, answers and satisfied needs (DR-6)', async () => {
    // The regression this pins: `satisfied_by_round` must not abort the cascade. A RESTRICT
    // foreign key would be checked before the needs rows die on their own cascade path and the
    // whole deletion would fail; NO ACTION checks at statement end, when both paths are done.
    const roundId = await insertRound('interview', 1);
    await database.db.insert(answers).values({ roundId, questionId: 'q1', freeText: 'answered' });
    await database.db
      .insert(informationNeeds)
      .values({ sessionId, stage: 'interview', name: 'target-users', satisfiedByRound: roundId });

    await database.db.delete(sessions).where(eq(sessions.id, sessionId));

    expect(await database.db.select().from(questionRounds)).toHaveLength(0);
    expect(await database.db.select().from(answers)).toHaveLength(0);
    expect(await database.db.select().from(informationNeeds)).toHaveLength(0);
  });
});
