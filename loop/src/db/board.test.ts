import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { listProjects, readBoard, summarise, type Board } from './board.ts';
import { openMigratedDatabase } from './migrate.ts';

/** A stand-in the assertions above rule out, so the count case never reads one silently. */
const emptyBoard = (): Board => ({
  projectId: '',
  title: '',
  description: null,
  status: 'ACTIVE',
  createdAt: '',
  workspaceDir: null,
  milestones: [],
});

/**
 * What the dashboard reads (task 153).
 *
 * The tree it draws is the operator's only view of an unattended run, so the order it comes back in
 * and the dependencies it carries are the substance: a task list without `dependsOn` is a plan whose
 * ordering argument is invisible, which is exactly the bundle the M14а gate produced.
 */
describe('the dashboard board (task 153)', () => {
  let directory: string;
  let database: DatabaseSync;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'loop-board-'));
    database = openMigratedDatabase(join(directory, 'loop.db'));

    database
      .prepare('INSERT INTO projects (project_id, title, description, status) VALUES (?, ?, ?, ?)')
      .run('p1', 'Проект', 'Описание', 'ACTIVE');

    const milestone = database.prepare(
      `INSERT INTO milestones (milestone_id, project_id, title, depends_on, position, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    milestone.run('ms_02', 'p1', 'Ядро', '["ms_01"]', 1, 'PENDING');
    milestone.run('ms_01', 'p1', 'Каркас', '[]', 0, 'IN_PROGRESS');

    const task = database.prepare(
      `INSERT INTO tasks (project_id, task_id, milestone_id, title, description, tech_stack,
                          files_to_edit, expected_artifacts, depends_on, position, status)
       VALUES ('p1', ?, ?, ?, '', 'nodejs', '[]', '[]', ?, ?, ?)`,
    );
    task.run('task_2', 'ms_01', 'Схема базы', '["task_1"]', 1, 'PENDING');
    task.run('task_1', 'ms_01', 'Инициализация', '[]', 0, 'COMPLETED');
    task.run('task_3', 'ms_02', 'Репозиторий', '["task_2"]', 0, 'BLOCKED');
  });

  afterEach(() => {
    database.close();
    try {
      rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    } catch {
      // Cleanup is not an assertion.
    }
  });

  it('reads milestones and tasks in their recorded order, not their insertion order', () => {
    const board = readBoard(database, 'p1');

    expect(board?.milestones.map((milestone) => milestone.milestoneId)).toEqual(['ms_01', 'ms_02']);
    expect(board?.milestones[0]?.tasks.map((task) => task.taskId)).toEqual(['task_1', 'task_2']);
  });

  it('carries the dependency lists the plan states', () => {
    const board = readBoard(database, 'p1');

    expect(board?.milestones[1]?.dependsOn).toEqual(['ms_01']);
    expect(board?.milestones[0]?.tasks[1]?.dependsOn).toEqual(['task_1']);
    expect(board?.milestones[0]?.tasks[0]?.dependsOn).toEqual([]);
  });

  it('treats an unreadable dependency column as no dependencies rather than as a crash', () => {
    // The column is JSON written by the intake. A dashboard that dies on one bad row is a dashboard
    // that hides the whole run over one field.
    database.prepare('UPDATE tasks SET depends_on = ? WHERE task_id = ?').run('не json', 'task_2');

    expect(readBoard(database, 'p1')?.milestones[0]?.tasks[1]?.dependsOn).toEqual([]);
  });

  it('counts the tasks by status for the header', () => {
    const board = readBoard(database, 'p1');
    expect(board).not.toBeNull();

    const counts = summarise(board ?? emptyBoard());

    expect(counts.total).toBe(3);
    expect(counts.COMPLETED).toBe(1);
    expect(counts.PENDING).toBe(1);
    expect(counts.BLOCKED).toBe(1);
    expect(counts.FAILED).toBe(0);
  });

  it('answers null for a project that is not there', () => {
    expect(readBoard(database, 'нет такого')).toBeNull();
  });

  it('lists projects newest first — the dashboard opens on the current run', () => {
    database
      .prepare(
        `INSERT INTO projects (project_id, title, status, created_at)
         VALUES (?, ?, 'ACTIVE', datetime('now', '+1 hour'))`,
      )
      .run('p2', 'Новее');

    expect(listProjects(database).map((project) => project.projectId)).toEqual(['p2', 'p1']);
  });
});
