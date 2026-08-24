import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openMigratedDatabase } from '../db/migrate.ts';
import { HANDOFF, taskFileName } from '../intake/handoff.ts';

import { runProbe } from './bench.ts';
import { checkInvariants, planFingerprint } from './invariants.ts';
import { hostPathOfBind } from './stub-executor.ts';

/**
 * Стенд контура, проверяющий сам себя (А-40).
 *
 * Стенд — код, а непроверенный код стенда опаснее отсутствующего: зелёный стенд, который ничего не
 * измеряет, это ровно та лживая галочка, которую мы только что похоронили в конвейере. Поэтому
 * здесь ДВА рода случаев: что стенд доводит прогон и что стенд ВИДИТ подложенное нарушение.
 */

let workspace: string;
let database: DatabaseSync;

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'loop-bench-'));
  mkdirSync(join(workspace, 'projects'), { recursive: true });
  database = openMigratedDatabase(join(workspace, 'loop.db'));
});

afterEach(() => {
  database.close();
  try {
    rmSync(workspace, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  } catch {
    // Уборка — не утверждение.
  }
});

const root = (): string => join(workspace, 'projects');

describe('стенд доводит прогон и считает нажатия', () => {
  it('одна задача: конвейер зван один раз, инварианты держатся', async () => {
    const run = await runProbe(
      { projectId: 'p1', milestoneSizes: [1] },
      { database, workspaceRoot: root() },
    );

    expect(run.violations).toEqual([]);
    expect(run.accepted).toBe(1);
    expect(run.externalDrives).toBe(1);
  }, 30_000);

  it('шесть задач в пяти вехах — форма живого раунда А-37.1', async () => {
    const run = await runProbe(
      { projectId: 'p6', milestoneSizes: [2, 1, 1, 1, 1] },
      { database, workspaceRoot: root() },
    );

    expect(run.violations).toEqual([]);
    expect(run.accepted).toBe(6);
    expect(run.externalDrives).toBe(1);
  }, 60_000);
});

describe('составной ключ: два проекта с одинаковыми задачами (А-38 п.3)', () => {
  it('не видят строк друг друга — ни планом, ни статусом', async () => {
    /* `unscopedIds` снимает область, которую даёт интейк: остаются голые BT01/ms_01 — форма D-325. */
    const first = await runProbe(
      { projectId: 'alpha', milestoneSizes: [2], unscopedIds: true },
      { database, workspaceRoot: root() },
    );

    expect(first.violations).toEqual([]);
    expect(first.accepted).toBe(2);

    const second = await runProbe(
      { projectId: 'beta', milestoneSizes: [3], unscopedIds: true },
      { database, workspaceRoot: root() },
    );

    /*
     * До составного ключа этот прогон был лживой галочкой из индекса: `beta` перехватывала строки
     * `alpha`, а `ON CONFLICT` не трогал статус — и три задачи «уже приняты» до единого контейнера.
     */
    expect(second.violations).toEqual([]);
    expect(second.accepted, 'у beta свои три задачи, а не чужие две').toBe(3);
    expect(second.externalDrives).toBe(1);

    const rows = database
      .prepare('SELECT project_id, task_id FROM tasks ORDER BY project_id, task_id')
      .all() as { project_id: string; task_id: string }[];

    expect(rows.filter((row) => row.project_id === 'alpha')).toHaveLength(2);
    expect(rows.filter((row) => row.project_id === 'beta')).toHaveLength(3);
    expect(
      rows.filter((row) => row.task_id === 'BT01'),
      'одно имя, две разные строки',
    ).toHaveLength(2);

    const milestones = database
      .prepare("SELECT project_id, status FROM milestones WHERE milestone_id = 'ms_01'")
      .all() as { project_id: string; status: string }[];

    expect(milestones).toHaveLength(2);
    expect(milestones.every((row) => row.status === 'COMPLETED')).toBe(true);
  }, 60_000);
});

describe('стенд видит подложенное нарушение (иначе он врёт)', () => {
  it('«доска равна диску»: расхождение индекса названо поимённо', async () => {
    const run = await runProbe(
      { projectId: 'p-drift', milestoneSizes: [2] },
      { database, workspaceRoot: root() },
    );
    expect(run.violations).toEqual([]);

    /* Подложенная порча ИНДЕКСА — ровно форма D-325: диск «принято», доска PENDING. */
    database.prepare("UPDATE tasks SET status = 'PENDING' WHERE project_id = 'p-drift'").run();

    const violations = checkInvariants({
      database,
      projectId: 'p-drift',
      projectDirectory: join(root(), 'p-drift'),
      at: 'подложенная порча',
      containers: { names: run.containers },
    });

    expect(violations.map((entry) => entry.invariant)).toEqual([
      'доска равна диску',
      'доска равна диску',
    ]);
    expect(violations[0]?.detail).toContain('доска «PENDING», диск «COMPLETED»');
  }, 60_000);

  it('«принято без контейнера»: галочка без улики названа галочкой', async () => {
    const run = await runProbe(
      { projectId: 'p-tick', milestoneSizes: [1] },
      { database, workspaceRoot: root() },
    );
    expect(run.violations).toEqual([]);

    /* Те же принятые задачи, но улик приёмки нет ни одной — это и есть лживая галочка. */
    const violations = checkInvariants({
      database,
      projectId: 'p-tick',
      projectDirectory: join(root(), 'p-tick'),
      at: 'без улик приёмки',
      containers: { names: [] },
    });

    expect(violations).toHaveLength(1);
    expect(violations[0]?.invariant).toBe('«принято» невозможно без контейнера');
  }, 60_000);

  it('«перезаход даёт тот же план»: подменённый план назван подменённым', async () => {
    const run = await runProbe(
      { projectId: 'p-plan', milestoneSizes: [2] },
      { database, workspaceRoot: root() },
    );
    expect(run.violations).toEqual([]);

    const directory = join(root(), 'p-plan');
    const before = planFingerprint(directory);

    /* Ровно форма D-326: перезаход дописал задачу нарезки поверх цельного плана. */
    writeFileSync(
      join(directory, HANDOFF.tasks, taskFileName('T001')),
      `${JSON.stringify(
        {
          taskId: 'T001',
          milestoneId: 'ms_p-plan_01',
          title: 'Нарезанная задача, взявшаяся ниоткуда',
          description: 'Подложена стендом',
          techStack: 'nodejs',
          filesToEdit: [],
          dependsOn: [],
          expectedArtifacts: [],
          status: 'PENDING',
        },
        null,
        2,
      )}\n`,
      'utf8',
    );

    const violations = checkInvariants({
      database,
      projectId: 'p-plan',
      projectDirectory: directory,
      at: 'после подмены плана',
      containers: { names: run.containers },
      planBefore: before,
    });

    expect(violations.map((entry) => entry.invariant).sort()).toEqual([
      'доска равна диску',
      'перезаход даёт тот же план',
      'счётчик доски равен числу файлов',
    ]);
  }, 60_000);
});

describe('обратный перевод пути демона', () => {
  it('переводит хостовый путь Windows туда и обратно', () => {
    expect(hostPathOfBind('/c/Users/Bob/proj:/workspace:rw')).toBe('C:\\Users\\Bob\\proj');
  });

  it('оставляет POSIX-путь как есть — на Linux перевод тождественный', () => {
    expect(hostPathOfBind('/var/loop/proj:/workspace:ro')).toBe('/var/loop/proj');
  });
});
