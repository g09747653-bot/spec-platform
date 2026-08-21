import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openMigratedDatabase } from '../db/migrate.ts';
import { createFakeEngine } from '../docker/testing/fake-engine.ts';
import { HANDOFF, HandoffTask, importHandoff, taskFileName } from '../intake/handoff.ts';
import { createLogger, type Logger } from '../observability/log.ts';

import { runCycle } from './run-cycle.ts';

/**
 * The iteration ceiling a task carries for itself (task 174; А-26 §2).
 *
 * `iterationTimeoutSec` lives in the assignment on disk — the mark an operator or the assignment
 * architect puts on a task known to be heavy — and the claim under test is that the cycle actually
 * reads it and hands it to the executor's clock, ahead of whatever the run was configured with. The
 * disk is the source of truth, so the case writes the mark where a person would: into
 * `task_*.json`.
 */

const PROJECT = 'ceiling';

let workspace: string;
let projectDirectory: string;
let database: DatabaseSync;
let logger: Logger;

function task(taskId: string, iterationTimeoutSec?: number): HandoffTask {
  return HandoffTask.parse({
    taskId,
    milestoneId: 'ms_01',
    title: `Задача ${taskId}`,
    description: 'Сделать',
    techStack: 'nodejs',
    filesToEdit: [],
    dependsOn: [],
    unitTestCmd: 'npm test',
    expectedArtifacts: [],
    status: 'PENDING',
    ...(iterationTimeoutSec === undefined ? {} : { iterationTimeoutSec }),
  });
}

function writeTree(tasks: readonly HandoffTask[]): void {
  mkdirSync(join(projectDirectory, HANDOFF.tasks), { recursive: true });
  mkdirSync(join(projectDirectory, HANDOFF.reports), { recursive: true });

  writeFileSync(
    join(projectDirectory, HANDOFF.milestones),
    `${JSON.stringify(
      {
        projectId: PROJECT,
        milestones: [{ milestoneId: 'ms_01', title: 'Ядро', description: '', dependsOn: [] }],
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  for (const entry of tasks) {
    writeFileSync(
      join(projectDirectory, HANDOFF.tasks, taskFileName(entry.taskId)),
      `${JSON.stringify(entry, null, 2)}\n`,
      'utf8',
    );
  }

  writeFileSync(
    join(projectDirectory, 'package.json'),
    JSON.stringify({ name: 'toy', private: true, scripts: { test: 'node -e 0' } }, null, 2),
    'utf8',
  );

  importHandoff(
    database,
    PROJECT,
    'Проект с потолками',
    [{ milestoneId: 'ms_01', title: 'Ядро', description: '', dependsOn: [], taskIds: [] }],
    tasks,
  );
}

/** An executor that never returns; the deadline is the only way the cycle can end. */
function hangingExecutor() {
  return createFakeEngine({
    onStart: ({ name }) =>
      name.startsWith('delivery-executor-')
        ? { stdout: ['работаю…'], until: new Promise<void>(() => undefined) }
        : { exitCode: 0 },
  });
}

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'loop-cycle-'));
  projectDirectory = join(workspace, PROJECT);
  mkdirSync(projectDirectory, { recursive: true });
  database = openMigratedDatabase(join(workspace, 'loop.db'));
  logger = createLogger(database);
});

afterEach(() => {
  database.close();
  try {
    rmSync(workspace, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  } catch {
    // Cleanup is not an assertion.
  }
});

describe('the per-task iteration ceiling (task 174)', () => {
  it('reads `iterationTimeoutSec` off the assignment and kills the iteration by it', async () => {
    writeTree([task('task_marked', 1)]);

    const startedAt = Date.now();
    const result = await runCycle(
      { projectId: PROJECT, taskId: 'task_marked', projectDirectory },
      {
        database,
        engine: hangingExecutor(),
        logger,
        credential: { kind: 'ANTHROPIC_API_KEY', value: 'not-a-real-key' },
        executorCommand: ['sh', '-c', 'sleep 600'],
        /* The run's own configuration says a minute; the task's own mark must outrank it. */
        executorTimeoutMs: 60_000,
      },
    );

    expect(result.outcome).toBe('FAILED');
    expect(result.executor.outcome).toBe('TIMEOUT');
    // Well under the run's 60 s: the 1-second mark decided, plus the deadline's 500 ms tick.
    expect(Date.now() - startedAt).toBeLessThan(20_000);

    const feed = database
      .prepare('SELECT message FROM agent_logs ORDER BY log_id')
      .all()
      .map((row) => String((row as { message: unknown }).message))
      .join('\n');
    expect(feed).toContain('собственный потолок итерации: 1 с');
  });

  it('uses the run’s configured limit when the assignment carries no mark', async () => {
    writeTree([task('task_plain')]);

    const result = await runCycle(
      { projectId: PROJECT, taskId: 'task_plain', projectDirectory },
      {
        database,
        engine: hangingExecutor(),
        logger,
        credential: { kind: 'ANTHROPIC_API_KEY', value: 'not-a-real-key' },
        executorCommand: ['sh', '-c', 'sleep 600'],
        executorTimeoutMs: 700,
      },
    );

    expect(result.outcome).toBe('FAILED');
    expect(result.executor.outcome).toBe('TIMEOUT');
  });

  it('rejects an assignment whose mark is out of range — the ceiling is a back stop', () => {
    expect(() => task('task_bad', 100_000)).toThrow();
    expect(() => task('task_bad', 0)).toThrow();
  });

  it('parses every assignment written before the field existed — additive, like D-223', () => {
    const legacy = HandoffTask.parse({
      taskId: 'task_old',
      milestoneId: 'ms_01',
      title: 'Старое задание',
      description: 'Сделать',
      techStack: 'nodejs',
      filesToEdit: [],
      expectedArtifacts: [],
      status: 'PENDING',
    });

    expect(legacy.iterationTimeoutSec).toBeUndefined();
  });
});
