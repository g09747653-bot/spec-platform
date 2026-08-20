import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readBoard } from '../db/board.ts';
import { openMigratedDatabase } from '../db/migrate.ts';
import {
  HANDOFF,
  HandoffTask,
  importHandoff,
  taskFileName,
  type MilestonesFile,
} from '../intake/handoff.ts';
import { createLogger } from '../observability/log.ts';

import {
  nextRunnableTask,
  readHandoffTree,
  recoverFromDisk,
  refreshMilestoneStatus,
} from './orchestrator.ts';

/**
 * Recovering from disk, and choosing what runs next (task 158).
 *
 * The claim under test is the gate's own: **an orchestrator killed mid-cycle comes back with the
 * plan intact**. Everything about the plan lives in `handoff/`, so the harshest honest test is to
 * delete the database entirely and boot — which is what these cases do.
 */

let workspace: string;
let projectDirectory: string;
let database: DatabaseSync;

const MILESTONES: MilestonesFile = {
  projectId: 'toy',
  milestones: [
    { milestoneId: 'ms_01', title: 'Фаза 1', description: 'первая', dependsOn: [] },
    { milestoneId: 'ms_02', title: 'Фаза 2', description: 'вторая', dependsOn: ['ms_01'] },
  ],
};

function task(taskId: string, milestoneId: string, status: HandoffTask['status']): HandoffTask {
  return HandoffTask.parse({
    taskId,
    milestoneId,
    title: `Задача ${taskId}`,
    description: 'Сделать',
    techStack: 'nodejs',
    filesToEdit: ['index.js'],
    dependsOn: [],
    expectedArtifacts: [],
    status,
  });
}

function writeTree(tasks: readonly HandoffTask[]): void {
  mkdirSync(join(projectDirectory, HANDOFF.tasks), { recursive: true });
  mkdirSync(join(projectDirectory, HANDOFF.reports), { recursive: true });

  writeFileSync(
    join(projectDirectory, HANDOFF.milestones),
    `${JSON.stringify(MILESTONES, null, 2)}\n`,
    'utf8',
  );

  for (const entry of tasks) {
    writeFileSync(
      join(projectDirectory, HANDOFF.tasks, taskFileName(entry.taskId)),
      `${JSON.stringify(entry, null, 2)}\n`,
      'utf8',
    );
  }
}

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'loop-recover-'));
  projectDirectory = join(workspace, 'toy');
  mkdirSync(projectDirectory, { recursive: true });
  database = openMigratedDatabase(join(workspace, '.db', 'loop.db'));
});

afterEach(() => {
  database.close();
  try {
    rmSync(workspace, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  } catch {
    // Cleanup is not an assertion.
  }
});

describe('recovering the plan from disk (task 158)', () => {
  it('rebuilds a whole project into an empty database', () => {
    writeTree([task('1.1', 'ms_01', 'COMPLETED'), task('2.1', 'ms_02', 'PENDING')]);

    const recovered = recoverFromDisk(database, workspace, createLogger(database));

    expect(recovered).toHaveLength(1);
    expect(recovered[0]).toMatchObject({ projectId: 'toy', milestones: 2, tasks: 2, resumed: [] });

    const board = readBoard(database, 'toy');
    expect(board?.milestones).toHaveLength(2);
    expect(board?.milestones.flatMap((milestone) => milestone.tasks)).toHaveLength(2);
    expect(board?.milestones[1]?.dependsOn).toEqual(['ms_01']);
  });

  it('returns a task the dead process had in flight to PENDING, on disk and in the index', () => {
    // This is the SIGKILL: the assignment on disk still says IN_PROGRESS, and nobody is running it.
    writeTree([task('1.1', 'ms_01', 'IN_PROGRESS')]);

    const recovered = recoverFromDisk(database, workspace, createLogger(database));

    expect(recovered[0]?.resumed).toEqual(['1.1']);

    const onDisk = HandoffTask.parse(
      JSON.parse(readFileSync(join(projectDirectory, HANDOFF.tasks, taskFileName('1.1')), 'utf8')),
    );
    expect(onDisk.status).toBe('PENDING');
    expect(database.prepare("SELECT status FROM tasks WHERE task_id = '1.1'").get()?.status).toBe(
      'PENDING',
    );
  });

  it('keeps every other status exactly as the disk has it', () => {
    writeTree([
      task('1.1', 'ms_01', 'COMPLETED'),
      task('1.2', 'ms_01', 'BLOCKED'),
      task('2.1', 'ms_02', 'FAILED'),
    ]);

    recoverFromDisk(database, workspace);

    const statuses = Object.fromEntries(
      database
        .prepare('SELECT task_id, status FROM tasks')
        .all()
        .map((row) => [String(row.task_id), String(row.status)]),
    );

    expect(statuses).toEqual({ '1.1': 'COMPLETED', '1.2': 'BLOCKED', '2.1': 'FAILED' });
  });

  it('says what it recovered, in the feed the operator is watching', () => {
    writeTree([task('1.1', 'ms_01', 'IN_PROGRESS')]);
    recoverFromDisk(database, workspace, createLogger(database));

    const said = database
      .prepare('SELECT message FROM agent_logs')
      .all()
      .map((row) => String(row.message))
      .join('\n');

    expect(said).toContain('Состояние восстановлено с диска');
    expect(said).toContain('1.1');
  });

  it('skips a directory with no handoff tree rather than failing the boot', () => {
    mkdirSync(join(workspace, 'не-проект'), { recursive: true });
    writeTree([task('1.1', 'ms_01', 'PENDING')]);

    expect(recoverFromDisk(database, workspace).map((project) => project.projectId)).toEqual([
      'toy',
    ]);
  });

  it('skips one unreadable assignment rather than losing the plan', () => {
    writeTree([task('1.1', 'ms_01', 'PENDING'), task('1.2', 'ms_01', 'PENDING')]);
    writeFileSync(
      join(projectDirectory, HANDOFF.tasks, taskFileName('1.2')),
      '{ это не json',
      'utf8',
    );

    const tree = readHandoffTree(projectDirectory);

    expect(tree?.tasks.map((entry) => entry.taskId)).toEqual(['1.1']);
  });

  it('answers null for a directory that has no milestones file at all', () => {
    expect(readHandoffTree(projectDirectory)).toBeNull();
  });
});

describe('choosing what runs next (task 158)', () => {
  function seed(tasks: readonly HandoffTask[]): void {
    importHandoff(
      database,
      'toy',
      'toy',
      MILESTONES.milestones.map((milestone) => ({ ...milestone, taskIds: [] })),
      tasks,
    );
  }

  it('never starts a milestone whose dependency is unfinished', () => {
    seed([task('1.1', 'ms_01', 'PENDING'), task('2.1', 'ms_02', 'PENDING')]);

    expect(nextRunnableTask(database, 'toy')).toEqual({ taskId: '1.1', milestoneId: 'ms_01' });
  });

  it('moves on once the milestone before it is complete', () => {
    seed([task('1.1', 'ms_01', 'COMPLETED'), task('2.1', 'ms_02', 'PENDING')]);
    refreshMilestoneStatus(database, 'ms_01');

    expect(nextRunnableTask(database, 'toy')).toEqual({ taskId: '2.1', milestoneId: 'ms_02' });
  });

  it('answers null when nothing is runnable', () => {
    seed([task('1.1', 'ms_01', 'BLOCKED')]);

    expect(nextRunnableTask(database, 'toy')).toBeNull();
  });

  it('marks a milestone complete only when every task in it is', () => {
    seed([task('1.1', 'ms_01', 'COMPLETED'), task('1.2', 'ms_01', 'PENDING')]);

    refreshMilestoneStatus(database, 'ms_01');
    expect(
      database.prepare("SELECT status FROM milestones WHERE milestone_id = 'ms_01'").get()?.status,
    ).toBe('IN_PROGRESS');

    database.prepare("UPDATE tasks SET status = 'COMPLETED' WHERE task_id = '1.2'").run();
    refreshMilestoneStatus(database, 'ms_01');
    expect(
      database.prepare("SELECT status FROM milestones WHERE milestone_id = 'ms_01'").get()?.status,
    ).toBe('COMPLETED');
  });
});
