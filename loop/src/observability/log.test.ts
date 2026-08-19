import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openMigratedDatabase } from '../db/migrate.ts';
import type { LoopEvent } from '../events/bus.ts';

import { createLogger } from './log.ts';

/**
 * Writing a log line, and the two things one write has to do (task 153).
 *
 * The row is what a reload reads; the event is what an open page receives. A line that reached only
 * one of them is the failure this module exists to make impossible, so both halves are asserted
 * from the same call.
 */
describe('the loop logger (task 153)', () => {
  let directory: string;
  let database: DatabaseSync;
  const published: LoopEvent[] = [];

  const bus = {
    publish: (event: LoopEvent) => published.push(event),
    subscribe: () => () => true,
    subscriberCount: () => 1,
  };

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'loop-log-'));
    database = openMigratedDatabase(join(directory, 'loop.db'));
    database
      .prepare('INSERT INTO projects (project_id, title, status) VALUES (?, ?, ?)')
      .run('p1', 'Проект', 'ACTIVE');
    published.length = 0;
  });

  afterEach(() => {
    database.close();
    try {
      rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    } catch {
      // Cleanup is not an assertion.
    }
  });

  it('persists and publishes in one call, carrying the same identity', () => {
    const event = createLogger(database, bus).write({
      projectId: 'p1',
      agentRole: 'ORCHESTRATOR',
      message: 'задача принята в работу',
    });

    expect(published).toEqual([{ type: 'log', log: event }]);

    const stored = database
      .prepare('SELECT log_id, message FROM agent_logs WHERE log_id = ?')
      .get(event.logId);
    expect(stored?.message).toBe('задача принята в работу');
  });

  it('assigns rising ids, which is what a reconnecting page deduplicates against', () => {
    const logger = createLogger(database, bus);

    const ids = ['одна', 'две', 'три'].map(
      (message) => logger.write({ projectId: 'p1', agentRole: 'EXECUTOR', message }).logId,
    );

    expect(ids).toEqual([...ids].sort((left, right) => left - right));
    expect(new Set(ids).size).toBe(3);
  });

  it('defaults the level to INFO and keeps the one it is given', () => {
    const logger = createLogger(database, bus);

    expect(
      logger.write({ projectId: 'p1', agentRole: 'EXECUTOR', message: 'обычная' }).logLevel,
    ).toBe('INFO');
    expect(
      logger.write({ projectId: 'p1', agentRole: 'CONTROLLER', message: 'сбой', logLevel: 'ERROR' })
        .logLevel,
    ).toBe('ERROR');
  });

  it('reads the tail oldest-first, bounded, and only for the project asked about', () => {
    const logger = createLogger(database, bus);
    database
      .prepare('INSERT INTO projects (project_id, title, status) VALUES (?, ?, ?)')
      .run('p2', 'Другой', 'ACTIVE');

    for (let index = 0; index < 10; index += 1) {
      logger.write({ projectId: 'p1', agentRole: 'EXECUTOR', message: `строка ${String(index)}` });
    }
    logger.write({ projectId: 'p2', agentRole: 'EXECUTOR', message: 'чужая строка' });

    const tail = logger.tail('p1', 3);

    expect(tail.map((line) => line.message)).toEqual(['строка 7', 'строка 8', 'строка 9']);
    expect(tail.every((line) => line.projectId === 'p1')).toBe(true);
  });

  it('carries the task a line belongs to, and null when it belongs to none', () => {
    const logger = createLogger(database, bus);
    database
      .prepare(
        `INSERT INTO milestones (milestone_id, project_id, title, status) VALUES (?, ?, ?, 'PENDING')`,
      )
      .run('ms_1', 'p1', 'Веха');
    database
      .prepare(
        `INSERT INTO tasks (task_id, milestone_id, title, description, tech_stack, files_to_edit,
                            expected_artifacts, status)
         VALUES (?, ?, ?, '', 'nodejs', '[]', '[]', 'PENDING')`,
      )
      .run('task_1', 'ms_1', 'Задача');

    expect(
      logger.write({ projectId: 'p1', taskId: 'task_1', agentRole: 'EXECUTOR', message: 'ход' })
        .taskId,
    ).toBe('task_1');
    expect(
      logger.write({ projectId: 'p1', agentRole: 'ARCHITECT', message: 'общий ход' }).taskId,
    ).toBeNull();
  });
});
