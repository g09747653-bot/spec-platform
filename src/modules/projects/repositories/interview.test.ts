import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { answers, informationNeeds, projects, sessions, users } from '@/db/schema';
import {
  captureDatabaseError,
  createMigratedDatabase,
  type TestDatabase,
} from '@/db/testing/migrated-database';

import { createInterviewRepository, type InterviewRepository } from './interview';

/**
 * Tasks 31/35–37 — the interview repository against a real database.
 */
describe('interview repository', () => {
  let database: TestDatabase;
  let repository: InterviewRepository;
  let sessionId: string;

  beforeAll(async () => {
    database = await createMigratedDatabase();
    repository = createInterviewRepository(database.db);
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
      .values({ ownerId: owner?.id ?? '', name: 'Interview repo' })
      .returning({ id: projects.id });
    const [session] = await database.db
      .insert(sessions)
      .values({ projectId: project?.id ?? '', initialPrompt: 'prompt' })
      .returning({ id: sessions.id });
    sessionId = session?.id ?? '';
  });

  const questions = { stage: 'interview', questions: [] };

  it('creates a round together with its declared needs, atomically', async () => {
    const round = await repository.createRound({
      sessionId,
      stage: 'interview',
      roundNumber: 1,
      questions,
      declaredNeeds: ['target-users', 'core-problem'],
    });

    const stored = await repository.findRoundById(round.id);
    expect(stored?.roundNumber).toBe(1);
    expect(stored?.answered).toBe(false);

    const needs = await database.db
      .select({ name: informationNeeds.name, satisfiedBy: informationNeeds.satisfiedByRound })
      .from(informationNeeds)
      .where(eq(informationNeeds.sessionId, sessionId));

    expect(needs.map((need) => need.name).sort()).toEqual(['core-problem', 'target-users']);
    expect(needs.every((need) => need.satisfiedBy === null)).toBe(true);
  });

  it('re-declaring an existing need in a later round leaves the register unchanged', async () => {
    await repository.createRound({
      sessionId,
      stage: 'interview',
      roundNumber: 1,
      questions,
      declaredNeeds: ['target-users'],
    });
    await repository.createRound({
      sessionId,
      stage: 'interview',
      roundNumber: 2,
      questions,
      declaredNeeds: ['target-users', 'success-criteria'],
    });

    const needs = await database.db
      .select({ name: informationNeeds.name })
      .from(informationNeeds)
      .where(eq(informationNeeds.sessionId, sessionId));

    expect(needs.map((need) => need.name).sort()).toEqual(['success-criteria', 'target-users']);
  });

  it('persists a full card submission in one statement and reports the round answered', async () => {
    const round = await repository.createRound({
      sessionId,
      stage: 'interview',
      roundNumber: 1,
      questions,
      declaredNeeds: ['target-users'],
    });

    await repository.submitCardAnswers(round.id, [
      { questionId: 'q1', selectedOptionIds: ['a', 'b'] },
      { questionId: 'q2', selectedOptionIds: [], freeText: 'my own words' },
    ]);

    const rows = await repository.answersForRound(round.id);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.selectedOptionIds).toEqual(['a', 'b']);
    expect(rows[1]?.freeText).toBe('my own words');

    expect((await repository.findRoundById(round.id))?.answered).toBe(true);
  });

  it('marks only outstanding needs satisfied, and never re-attributes one (FR-005 AC-8)', async () => {
    const first = await repository.createRound({
      sessionId,
      stage: 'interview',
      roundNumber: 1,
      questions,
      declaredNeeds: ['target-users', 'core-problem'],
    });
    const second = await repository.createRound({
      sessionId,
      stage: 'interview',
      roundNumber: 2,
      questions,
      declaredNeeds: ['success-criteria'],
    });

    await repository.markNeedsSatisfied(sessionId, 'interview', ['target-users'], first.id);
    // An attempt to steal the attribution must not move it.
    await repository.markNeedsSatisfied(sessionId, 'interview', ['target-users'], second.id);

    const needs = await database.db
      .select({ name: informationNeeds.name, satisfiedBy: informationNeeds.satisfiedByRound })
      .from(informationNeeds)
      .where(eq(informationNeeds.sessionId, sessionId));

    const byName = new Map(needs.map((need) => [need.name, need.satisfiedBy]));
    expect(byName.get('target-users')).toBe(first.id);
    expect(byName.get('core-problem')).toBeNull();
    expect(byName.get('success-criteria')).toBeNull();
  });

  it('records reply and fallback answers in their documented namespaces (tasks 36/37)', async () => {
    const round = await repository.createRound({
      sessionId,
      stage: 'interview',
      roundNumber: 1,
      questions,
      declaredNeeds: ['constraints'],
    });

    await repository.addReplyAnswer(round.id, 'a reply in chat');
    await repository.addFallbackAnswer(round.id, 'constraints', 'ship on the mandated stack');

    const rows = await repository.answersForRound(round.id);
    expect(rows.map((row) => row.questionId)).toEqual([null, 'need:constraints']);

    // One fallback row per need per round — the unique constraint holds the line.
    const duplicate = await captureDatabaseError(() =>
      repository.addFallbackAnswer(round.id, 'constraints', 'again'),
    );
    expect(duplicate).toMatch(/answers_round_question_unique|duplicate key/i);
  });

  it('resolves the latest round per stage and deletes only unanswered rounds', async () => {
    const first = await repository.createRound({
      sessionId,
      stage: 'interview',
      roundNumber: 1,
      questions,
      declaredNeeds: ['target-users'],
    });
    const second = await repository.createRound({
      sessionId,
      stage: 'interview',
      roundNumber: 2,
      questions,
      declaredNeeds: ['success-criteria'],
    });

    expect((await repository.latestRound(sessionId, 'interview'))?.id).toBe(second.id);
    expect(await repository.latestRound(sessionId, 'constitution')).toBeNull();

    await repository.submitCardAnswers(first.id, [{ questionId: 'q1', selectedOptionIds: ['a'] }]);

    // The answered round survives a delete attempt; the unanswered one goes.
    await repository.deleteUnansweredRound(first.id);
    await repository.deleteUnansweredRound(second.id);

    expect(await repository.findRoundById(first.id)).not.toBeNull();
    expect(await repository.findRoundById(second.id)).toBeNull();
  });

  it('duplicate answers for one question are refused by the database', async () => {
    const round = await repository.createRound({
      sessionId,
      stage: 'interview',
      roundNumber: 1,
      questions,
      declaredNeeds: ['target-users'],
    });

    await repository.submitCardAnswers(round.id, [{ questionId: 'q1', selectedOptionIds: ['a'] }]);

    const error = await captureDatabaseError(() =>
      database.db.insert(answers).values({ roundId: round.id, questionId: 'q1', freeText: 'x' }),
    );
    expect(error).toMatch(/answers_round_question_unique|duplicate key/i);
  });
});
