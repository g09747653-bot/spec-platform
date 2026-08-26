import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readBoard } from '../db/board.ts';
import { openMigratedDatabase } from '../db/migrate.ts';
import {
  createFakeEngine,
  type FakeEngine,
  type StartOutcome,
} from '../docker/testing/fake-engine.ts';
import { acceptanceContainerName } from '../gate/accept.ts';
import { blockedPath, setTaskStatusOnDisk } from '../gate/blocked.ts';
import { coherentJudgeChain, probeStubOutcome } from '../gate/testing/judge-stub.ts';
import { observerStubOutcome } from '../gate/testing/observer-stub.ts';
import { PROBE_RESULT } from '../gate/product-probe.ts';
import { executorContainerName } from '../executor/run.ts';
import { HANDOFF, HandoffTask, importHandoff, taskFileName } from '../intake/handoff.ts';
import { createLogger, type Logger } from '../observability/log.ts';

import { freezePipeline, isFrozen, liftFreeze, readFreeze } from './freeze.ts';
import { driveProject, livePipeline, resumeAfterUnblock } from './orchestrator.ts';

/**
 * The pipeline: many executors, a tariff that closes, and a red verdict that stops the world
 * (tasks 159, 160).
 *
 * Against the fake daemon, deliberately — see `docker/testing/fake-engine.ts`. Everything else is
 * the real thing: the real `runCycle`, the real acceptance ordering, the real disk tree, the real
 * index. What the fake decides is only what a container *does*, which is the one part a case has to
 * dictate to ask these questions at all.
 */

const PROJECT = 'parallel';

let workspace: string;
let projectDirectory: string;
let database: DatabaseSync;
let logger: Logger;

/** Three tasks in one milestone, touching three different files — the shape the gate asks for. */
function task(taskId: string, files: string[], milestoneId = 'ms_01'): HandoffTask {
  return HandoffTask.parse({
    taskId,
    milestoneId,
    title: `Задача ${taskId}`,
    description: 'Сделать',
    techStack: 'nodejs',
    filesToEdit: files,
    dependsOn: [],
    unitTestCmd: 'npm test',
    expectedArtifacts: [],
    status: 'PENDING',
  });
}

const MILESTONES = [
  { milestoneId: 'ms_01', title: 'Ядро', description: 'первая', dependsOn: [], taskIds: [] },
  {
    milestoneId: 'ms_02',
    title: 'Сборка',
    description: 'вторая',
    dependsOn: ['ms_01'],
    taskIds: [],
  },
];

function writeTree(tasks: readonly HandoffTask[]): void {
  mkdirSync(join(projectDirectory, HANDOFF.tasks), { recursive: true });
  mkdirSync(join(projectDirectory, HANDOFF.reports), { recursive: true });

  writeFileSync(
    join(projectDirectory, HANDOFF.milestones),
    `${JSON.stringify({ projectId: PROJECT, milestones: MILESTONES.map(({ taskIds: _, ...rest }) => rest) }, null, 2)}\n`,
    'utf8',
  );

  for (const entry of tasks) {
    writeFileSync(
      join(projectDirectory, HANDOFF.tasks, taskFileName(entry.taskId)),
      `${JSON.stringify(entry, null, 2)}\n`,
      'utf8',
    );
  }

  /* A Node project, so the stack detection agrees with the assignments and nothing is rewritten. */
  writeFileSync(
    join(projectDirectory, 'package.json'),
    JSON.stringify({ name: 'toy', private: true, scripts: { test: 'node -e 0' } }, null, 2),
    'utf8',
  );

  importHandoff(database, PROJECT, 'Параллельный проект', MILESTONES, tasks);
}

/** What an executor container leaves behind when it succeeds: a report the cycle can read. */
function writeReport(taskId: string, status: 'SUCCESS' | 'FAILED' = 'SUCCESS'): void {
  writeFileSync(
    join(projectDirectory, HANDOFF.reports, `report_${taskId}.json`),
    JSON.stringify(
      {
        taskId,
        executorId: `exec-${taskId}`,
        status,
        testsRun: {
          total: 1,
          passed: status === 'SUCCESS' ? 1 : 0,
          failed: status === 'SUCCESS' ? 0 : 1,
        },
        errors: [],
      },
      null,
      2,
    ),
    'utf8',
  );
}

const statuses = (): Record<string, string> =>
  Object.fromEntries(
    (readBoard(database, PROJECT)?.milestones ?? [])
      .flatMap((milestone) => milestone.tasks)
      .map((entry) => [entry.taskId, entry.status]),
  );

const statusOnDisk = (taskId: string): string =>
  HandoffTask.parse(
    JSON.parse(readFileSync(join(projectDirectory, HANDOFF.tasks, taskFileName(taskId)), 'utf8')),
  ).status;

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'loop-pipeline-'));
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

describe('many executors at once (task 159)', () => {
  it('runs the three tasks of one milestone together and never more than the ceiling', async () => {
    writeTree([
      task('1', ['lib/a.js']),
      task('2', ['lib/b.js']),
      task('3', ['lib/c.js']),
      task('4', ['lib/d.js'], 'ms_02'),
    ]);

    let live = 0;
    let peak = 0;
    let holding = true;
    const release = new Map<string, () => void>();

    const engine: FakeEngine = createFakeEngine({
      onStart: ({ name, spec }) => {
        if (!name.startsWith('delivery-executor-')) return observerStubOutcome(name) ?? {};

        const taskId = name.replace('delivery-executor-', '');
        writeReport(taskId);

        live += 1;
        peak = Math.max(peak, live);

        if (!holding) {
          live -= 1;
          return {};
        }

        /* Held open until every executor of this wave has started — that is what «together» means. */
        return {
          until: new Promise<void>((resolve) => {
            release.set(taskId, () => {
              live -= 1;
              resolve();
            });
          }),
          stdout: [`executor ${taskId} ready`, String(spec.workingDir)],
        };
      },
    });

    const driving = driveProject(PROJECT, projectDirectory, {
      database,
      engine,
      logger,
      credential: { kind: 'ANTHROPIC_API_KEY', value: 'x' },
      judgeChain: coherentJudgeChain(),
      maxExecutors: 3,
    });

    await waitFor(() => release.size === 3);
    expect(peak, 'three tasks of one milestone, three containers').toBe(3);
    expect(release.has('4'), 'the second milestone waits for the first').toBe(false);

    holding = false;
    for (const stop of release.values()) stop();
    const results = await driving;

    expect(results.map((entry) => entry.outcome)).toEqual([
      'COMPLETED',
      'COMPLETED',
      'COMPLETED',
      'COMPLETED',
    ]);
    expect(peak).toBeLessThanOrEqual(3);
    expect(statuses()).toEqual({
      '1': 'COMPLETED',
      '2': 'COMPLETED',
      '3': 'COMPLETED',
      '4': 'COMPLETED',
    });
    expect(readBoard(database, PROJECT)?.status).toBe('COMPLETED');
  }, 30_000);

  it('holds a task whose file another executor already has', async () => {
    writeTree([task('1', ['lib/shared.js']), task('2', ['lib/shared.js'])]);

    let live = 0;
    let peak = 0;
    const release = new Map<string, () => void>();

    const engine = createFakeEngine({
      onStart: ({ name }) => {
        if (!name.startsWith('delivery-executor-')) return observerStubOutcome(name) ?? {};
        const taskId = name.replace('delivery-executor-', '');
        writeReport(taskId);
        live += 1;
        peak = Math.max(peak, live);

        return {
          until: new Promise<void>((resolve) => {
            release.set(taskId, () => {
              live -= 1;
              resolve();
            });
          }),
        };
      },
    });

    const driving = driveProject(PROJECT, projectDirectory, {
      database,
      engine,
      logger,
      credential: { kind: 'ANTHROPIC_API_KEY', value: 'x' },
      judgeChain: coherentJudgeChain(),
      maxExecutors: 10,
    });

    await waitFor(() => release.size >= 1);
    expect(peak, 'two tasks, one file, one container').toBe(1);

    release.get('1')?.();
    await waitFor(() => release.size === 2);
    for (const stop of release.values()) stop();

    await driving;
    expect(peak).toBe(1);
  }, 30_000);
});

describe('the tariff window closing mid-run (task 159; А-24 §2)', () => {
  it('stops starting new executors, lets the running ones finish, and resumes when it reopens', async () => {
    writeTree([task('1', ['lib/a.js']), task('2', ['lib/b.js']), task('3', ['lib/c.js'])]);

    let clock = 1_000_000;
    const reopensAt = clock + 60_000;
    const slept: number[] = [];
    const startedIn: string[] = [];

    const engine = createFakeEngine({
      onStart: ({ name }) => {
        if (!name.startsWith('delivery-executor-')) return observerStubOutcome(name) ?? {};
        const taskId = name.replace('delivery-executor-', '');
        startedIn.push(taskId);
        writeReport(taskId);

        /*
         * The first executor meets a closed window and says so on its own stream, exactly as the
         * CLI does. Its own iteration finishes — a throttle is not a failure of the work in hand.
         */
        return taskId === startedIn[0]
          ? {
              stdout: [
                JSON.stringify({
                  type: 'rate_limit_event',
                  rate_limit_info: {
                    status: 'rejected',
                    rateLimitType: 'five_hour',
                    resetsAt: reopensAt / 1000,
                  },
                }),
              ],
            }
          : {};
      },
    });

    const results = await driveProject(PROJECT, projectDirectory, {
      database,
      engine,
      logger,
      credential: { kind: 'ANTHROPIC_API_KEY', value: 'x' },
      judgeChain: coherentJudgeChain(),
      maxExecutors: 1,
      now: () => clock,
      sleep: (ms: number) => {
        slept.push(ms);
        /* The window reopens by the clock moving, which is the only thing that lifts a hold. */
        clock += ms;
        return Promise.resolve();
      },
    });

    expect(results, 'every task still ran — a throttle delays, it does not fail').toHaveLength(3);
    expect(results.every((entry) => entry.outcome === 'COMPLETED')).toBe(true);
    expect(slept.length, 'the pipeline waited rather than hammering the window').toBeGreaterThan(0);

    const feed = logger.tail(PROJECT, 200).map((line) => line.message);
    expect(feed.some((line) => line.includes('Лимит тарифа') && line.includes('five_hour'))).toBe(
      true,
    );
    expect(feed.some((line) => line.includes('Возобновление через'))).toBe(true);
    expect(feed.some((line) => line.includes('снова открыто'))).toBe(true);
  }, 30_000);
});

describe('красный CI: the whole orchestration stops (task 160)', () => {
  /** Three parallel executors, one of them red at acceptance — and the world stops for all three. */
  async function frozenRun(): Promise<{
    engine: FakeEngine;
    driving: Promise<unknown>;
    release: Map<string, () => void>;
  }> {
    writeTree([task('1', ['lib/a.js']), task('2', ['lib/b.js']), task('3', ['lib/c.js'])]);

    const release = new Map<string, () => void>();
    let repaired = false;

    const engine = createFakeEngine({
      onStart: ({ name }) => {
        if (name.startsWith('delivery-executor-')) {
          const taskId = name.replace('delivery-executor-', '');
          writeReport(taskId);

          /* Task 1 returns at once; the other two stay in flight, which is what gets frozen. */
          if (taskId === '1') return {};

          return {
            until: new Promise<void>((resolve) => {
              release.set(taskId, resolve);
            }),
          };
        }

        /*
         * The acceptance of task 1 is red — the staged failing test of the gate — and red **once**:
         * a retry that met the same failure would freeze again forever, which is a test that proves
         * the freeze works and nothing about the retry.
         */
        if (name === `${acceptanceContainerName('1')}-unit` && !repaired) {
          repaired = true;
          return { exitCode: 1, stdout: ['1 test failed'] };
        }

        return observerStubOutcome(name) ?? {};
      },
    });

    const driving = driveProject(PROJECT, projectDirectory, {
      database,
      engine,
      logger,
      credential: { kind: 'ANTHROPIC_API_KEY', value: 'x' },
      judgeChain: coherentJudgeChain(),
      maxExecutors: 3,
    });

    await waitFor(() => isFrozen(projectDirectory));

    return { engine, driving, release };
  }

  it('pauses every live container, writes the freeze to disk, and names the reason', async () => {
    const { engine, driving, release } = await frozenRun();

    expect(engine.pausedNames().sort()).toEqual([
      executorContainerName('2'),
      executorContainerName('3'),
    ]);

    const record = readFreeze(projectDirectory);
    expect(record?.taskId).toBe('1');
    expect(record?.paused.map((entry) => entry.taskId).sort()).toEqual(['2', '3']);
    expect(record?.reason).toBeTruthy();

    expect(statusOnDisk('2'), 'the freeze is on disk, not only in the index').toBe('PAUSED');
    expect(statuses()['3']).toBe('PAUSED');
    expect(readBoard(database, PROJECT)?.status).toBe('PAUSED');

    const feed = logger.tail(PROJECT, 200).map((line) => line.message);
    expect(feed.some((line) => line.includes('КРАСНЫЙ CI') && line.includes('Возобновить'))).toBe(
      true,
    );

    /* And it does not resume itself, however long the loop is left alone. */
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(isFrozen(projectDirectory)).toBe(true);
    expect(engine.pausedNames()).toHaveLength(2);

    /* Retry, in the process that froze it: the very same iterations continue. */
    const lifted = await liftFreeze(database, engine, {
      projectId: PROJECT,
      projectDirectory,
      stillAwaited: livePipeline(PROJECT)?.running() ?? [],
    });

    expect(lifted.resumed.sort()).toEqual(['2', '3']);
    expect(lifted.requeued, 'the red task is re-checked from the top').toContain('1');
    expect(engine.pausedNames()).toEqual([]);

    /*
     * **Every** red task is re-queued, not only the one the marker names (task 160, найдено
     * репетицией гейта 163). One planted failing test froze the pipeline and two tasks came back
     * red from it — the second's acceptance had already copied the workspace — and re-queueing one
     * of them left the other permanently FAILED with its milestone unable to complete.
     */
    database.prepare("UPDATE tasks SET status = 'FAILED' WHERE task_id = '3'").run();
    const second = await liftFreezeAgain();
    expect(second.requeued, 'a red task nobody named is still a red task').toContain('3');

    for (const stop of release.values()) stop();
    await driving;

    /** Freezes and lifts again, so the second lift has a marker to read. */
    async function liftFreezeAgain() {
      await freezePipeline(database, engine, {
        projectId: PROJECT,
        projectDirectory,
        taskId: '1',
        reason: 'вторая заморозка репетиции',
        inFlight: [],
      });

      return liftFreeze(database, engine, {
        projectId: PROJECT,
        projectDirectory,
        stillAwaited: [],
      });
    }
  }, 30_000);

  it('a frozen pipeline stays frozen across a restart, and only retry lifts it', async () => {
    /*
     * The freeze is built by the same function a red verdict calls, and then this process behaves
     * like the one that comes **after** the crash: it has no pipeline, no promises and no memory —
     * only the disk. Modelling the death by releasing the paused containers would have been a
     * different claim (a container that finished while paused, which cannot happen).
     */
    writeTree([task('1', ['lib/a.js']), task('2', ['lib/b.js']), task('3', ['lib/c.js'])]);

    const engine = createFakeEngine();
    const executor = await engine.createContainer({ name: executorContainerName('2'), image: 'x' });
    await engine.startContainer(executor);

    await freezePipeline(database, engine, {
      projectId: PROJECT,
      projectDirectory,
      taskId: '1',
      reason: 'Приёмочный прогон «npm test» в чистом контейнере вернул 1 — задача не принята.',
      inFlight: [{ taskId: '2', previousStatus: 'IN_PROGRESS' }],
    });

    expect(isFrozen(projectDirectory), 'the marker is on disk, where a restart reads it').toBe(
      true,
    );
    expect(statusOnDisk('2')).toBe('PAUSED');
    expect(engine.pausedNames()).toEqual([executorContainerName('2')]);
    expect(livePipeline(PROJECT), 'no pipeline survives the process').toBeNull();

    /* The new process boots and drives — and must not walk into a frozen plan. */
    const afterBoot = await driveProject(PROJECT, projectDirectory, {
      database,
      engine,
      logger,
      credential: { kind: 'ANTHROPIC_API_KEY', value: 'x' },
      judgeChain: coherentJudgeChain(),
    });

    expect(afterBoot, 'a frozen pipeline runs nothing at all').toEqual([]);
    expect(statusOnDisk('2'), 'and it did not quietly resume anything').toBe('PAUSED');
    expect(statusOnDisk('3')).toBe('PENDING');

    /* Retry after a restart: nobody is awaiting that container, so its task starts over. */
    const lifted = await liftFreeze(database, engine, {
      projectId: PROJECT,
      projectDirectory,
      stillAwaited: [],
    });

    expect(lifted.resumed).toEqual([]);
    expect(lifted.requeued.sort()).toEqual(['1', '2']);
    expect(statusOnDisk('1'), 'the red task goes round again').toBe('PENDING');
    expect(isFrozen(projectDirectory)).toBe(false);
    expect(statusOnDisk('2')).toBe('PENDING');
    expect(readBoard(database, PROJECT)?.status).toBe('ACTIVE');
    expect(engine.byName(executorContainerName('2')).at(-1)?.removed).toBe(true);
    expect(existsSync(join(projectDirectory, HANDOFF.tasks))).toBe(true);
  }, 30_000);
});

/**
 * «Без нажатий»: конвейер переходит между вехами сам (А-38 п.1).
 *
 * Регрессия дословно на форму живого раунда А-37.1, где перехода не было четыре раза подряд. Диагноз
 * из рапорта («не переходит между вехами») был симптомом; механизм нашёлся в ленте прогона:
 * `allowed_warning` семидневного окна — предупреждение, при котором вызов РАЗРЕШЁН и состоялся, —
 * читался как отказ и запирал новые старты на 216 162 секунды. Поэтому кейс не про планировщик: он
 * гонит две вехи и подкладывает исполнителю ровно то предупреждение, что пришло живьём.
 */
describe('конвейер переходит между вехами сам (А-38 п.1)', () => {
  /** Точная полезная нагрузка из ленты А-37.1 — 77% семидневного окна, вызов разрешён. */
  const ALLOWED_WARNING = JSON.stringify({
    type: 'rate_limit_event',
    rate_limit_info: {
      status: 'allowed_warning',
      resetsAt: 1_787_734_800,
      rateLimitType: 'seven_day',
      utilization: 0.77,
      isUsingOverage: false,
      surpassedThreshold: 0.75,
    },
  });

  it('вторая веха разблокируется завершением первой — ни одного внешнего хода', async () => {
    writeTree([task('1', ['lib/a.js']), task('2', ['lib/b.js']), task('4', ['lib/d.js'], 'ms_02')]);

    const engine = createFakeEngine({
      onStart: ({ name }) => {
        if (!name.startsWith('delivery-executor-')) return observerStubOutcome(name) ?? {};
        writeReport(name.replace('delivery-executor-', ''));
        return {};
      },
    });

    const results = await driveProject(PROJECT, projectDirectory, {
      database,
      engine,
      logger,
      credential: { kind: 'ANTHROPIC_API_KEY', value: 'x' },
      judgeChain: coherentJudgeChain(),
      maxExecutors: 2,
    });

    expect(results, 'один вызов довёз обе вехи').toHaveLength(3);
    expect(statuses()).toEqual({ '1': 'COMPLETED', '2': 'COMPLETED', '4': 'COMPLETED' });
    expect(readBoard(database, PROJECT)?.status).toBe('COMPLETED');
  }, 30_000);

  it('предупреждение тарифа НЕ запирает старты: доска доходит до конца сама', async () => {
    writeTree([task('1', ['lib/a.js']), task('4', ['lib/d.js'], 'ms_02')]);

    const engine = createFakeEngine({
      onStart: ({ name }) => {
        if (!name.startsWith('delivery-executor-')) return observerStubOutcome(name) ?? {};
        const taskId = name.replace('delivery-executor-', '');
        writeReport(taskId);
        /* Первая волна получает предупреждение — ровно как живьём, через секунды после старта. */
        return { stdout: [ALLOWED_WARNING] };
      },
    });

    /*
     * Часы стоят, а сон СЧИТАЕТСЯ и на пятидесятом бросает.
     *
     * Регрессия обязана падать быстро и громко, а не «висеть, пока не сработает предел кейса»: при
     * запертых стартах цикл ушёл бы в опрос по секунде и за тридцать секунд намолотил бы десятки
     * тысяч холостых оборотов — а юнит-набор этой машины и без того ложится по памяти на полном
     * числе воркеров. Пятьдесят — заведомо больше, чем нужно здоровому проходу (ему хватает нуля).
     */
    let slept = 0;
    const results = await driveProject(PROJECT, projectDirectory, {
      database,
      engine,
      logger,
      credential: { kind: 'ANTHROPIC_API_KEY', value: 'x' },
      judgeChain: coherentJudgeChain(),
      maxExecutors: 1,
      now: () => 1_000_000,
      sleep: () => {
        slept += 1;
        if (slept > 50) {
          throw new Error(
            'конвейер ушёл в ожидание: предупреждение тарифа снова прочитано как отказ',
          );
        }
        return Promise.resolve();
      },
    });

    expect(results.map((entry) => entry.outcome)).toEqual(['COMPLETED', 'COMPLETED']);
    expect(statuses()).toEqual({ '1': 'COMPLETED', '4': 'COMPLETED' });
    expect(readBoard(database, PROJECT)?.status).toBe('COMPLETED');

    const feed = logger.tail(PROJECT, 300).map((line) => line.message);
    expect(
      feed.some((line) => line.includes('Тариф предупреждает') && line.includes('seven_day')),
      'предупреждение сказано — молчать о конце окна тоже нельзя',
    ).toBe(true);
    expect(
      feed.some((line) => line.includes('Новые исполнители не запускаются')),
      'но остановкой оно не объявлялось',
    ).toBe(false);
  }, 30_000);

  it('второй проход по тому же проекту не заводится — водитель один', async () => {
    writeTree([task('1', ['lib/a.js'])]);

    const release = new Map<string, () => void>();
    const engine = createFakeEngine({
      onStart: ({ name }) => {
        if (!name.startsWith('delivery-executor-')) return observerStubOutcome(name) ?? {};
        const taskId = name.replace('delivery-executor-', '');
        writeReport(taskId);
        return {
          until: new Promise<void>((resolve) => {
            release.set(taskId, resolve);
          }),
        };
      },
    });

    const deps = {
      database,
      engine,
      logger,
      credential: { kind: 'ANTHROPIC_API_KEY' as const, value: 'x' },
      judgeChain: coherentJudgeChain(),
      maxExecutors: 1,
    };

    const first = driveProject(PROJECT, projectDirectory, deps);
    await waitFor(() => release.size === 1);

    const second = await driveProject(PROJECT, projectDirectory, deps);
    expect(second, 'нажатие поверх идущего конвейера не заводит второго').toEqual([]);

    for (const stop of release.values()) stop();
    expect(await first).toHaveLength(1);

    const feed = logger.tail(PROJECT, 200).map((line) => line.message);
    expect(feed.some((line) => line.includes('уже идёт в этом процессе'))).toBe(true);
  }, 30_000);
});

/**
 * Снятие блокировки возвращает конвейер в строй само (А-42 п.3).
 *
 * Тот же класс, что «без нажатий»: человек уже принял решение — прочитал `BLOCKED_*.md`, сделал, что
 * там просили, и удалил файл. Второе действие после этого — дефект, а не безопасность. Само снятие
 * остаётся человеческим: файл в кейсе удаляет кейс, а не конвейер.
 */
describe('снятая блокировка не требует второго нажатия (А-42 п.3)', () => {
  /** Исполнитель, который блокируется, пока на диске стоит отметка сценария. */
  function blockingEngine(blockUntilLifted: { on: boolean }): FakeEngine {
    return createFakeEngine({
      onStart: ({ name }) => {
        if (!name.startsWith('delivery-executor-')) return observerStubOutcome(name) ?? {};
        const taskId = name.replace('delivery-executor-', '');

        if (taskId === '1' && blockUntilLifted.on) {
          writeFileSync(
            blockedPath(projectDirectory, taskId),
            '# BLOCKED: task_1\n\nнужен человек\n',
            'utf8',
          );
          return {};
        }

        writeReport(taskId);
        return {};
      },
    });
  }

  it('идущий проход берёт разблокированную задачу сам — защёлки в переменной нет', async () => {
    writeTree([task('1', ['lib/a.js']), task('2', ['lib/b.js'])]);

    const blocking = { on: true };
    const engine = blockingEngine(blocking);

    /* Первый проход: задача 1 блокируется, задача 2 доигрывает, конвейер честно встаёт. */
    await driveProject(PROJECT, projectDirectory, {
      database,
      engine,
      logger,
      credential: { kind: 'ANTHROPIC_API_KEY', value: 'x' },
      judgeChain: coherentJudgeChain(),
      maxExecutors: 1,
    });

    expect(statuses()['1']).toBe('BLOCKED');
    expect(statusOnDisk('1')).toBe('BLOCKED');

    /* Человек снимает блокировку: файл удалён, статус починен вотчером — здесь его роль играет кейс. */
    blocking.on = false;
    rmSync(blockedPath(projectDirectory, '1'), { force: true });
    setTaskStatusOnDisk(projectDirectory, '1', 'PENDING');
    database
      .prepare("UPDATE tasks SET status = 'PENDING' WHERE project_id = ? AND task_id = ?")
      .run(PROJECT, '1');

    const resumed = await driveProject(PROJECT, projectDirectory, {
      database,
      engine,
      logger,
      credential: { kind: 'ANTHROPIC_API_KEY', value: 'x' },
      judgeChain: coherentJudgeChain(),
      maxExecutors: 1,
    });

    expect(resumed.map((entry) => entry.outcome)).toContain('COMPLETED');
    expect(statuses()).toEqual({ '1': 'COMPLETED', '2': 'COMPLETED' });
  }, 30_000);

  it('resumeAfterUnblock ведёт проект, когда живого прохода нет, и молчит, когда есть', async () => {
    writeTree([task('1', ['lib/a.js'])]);

    const engine = createFakeEngine({
      onStart: ({ name }) => {
        if (!name.startsWith('delivery-executor-')) return observerStubOutcome(name) ?? {};
        writeReport(name.replace('delivery-executor-', ''));
        return {};
      },
    });

    const deps = {
      database,
      engine,
      logger,
      credential: { kind: 'ANTHROPIC_API_KEY' as const, value: 'x' },
      judgeChain: coherentJudgeChain(),
      maxExecutors: 1,
    };

    resumeAfterUnblock(PROJECT, projectDirectory, deps);
    await waitFor(() => statuses()['1'] === 'COMPLETED');
    expect(statuses()['1']).toBe('COMPLETED');
  }, 30_000);
});

/** Waits for a condition the pipeline reaches on its own, without a fixed sleep. */
async function waitFor(condition: () => boolean, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error('условие не наступило за отведённое время');
}

/**
 * Суд качества — СТАДИЯ, и вершинная строка стоит на нём (А-44 п.2).
 *
 * До этой правки `visual-judge.ts` был мёртвым кодом, а «Проект завершён: принято задач N» —
 * утверждением о ЗАДАЧАХ, выданным за утверждение о ЗАДУМКЕ. Продукт с 74 мёртвыми ссылками из 86 и
 * тостом «Демо-версия, функция недоступна» проходил его целиком: ни одна из трёх прежних осей не
 * открывала продукт.
 */
describe('вершинный критерий стоит на суде качества (А-44 п.2)', () => {
  /** Демон, у которого всё зелено, а проба продукта отвечает тем, что диктует случай. */
  function engineWhereProbeSays(probe: StartOutcome): FakeEngine {
    return createFakeEngine({
      onStart: ({ name }) => {
        if (name === 'quality-probe') return probe;
        if (name.startsWith('delivery-executor-')) {
          writeReport(name.replace('delivery-executor-', ''));
          return {};
        }
        return observerStubOutcome(name) ?? {};
      },
    });
  }

  const drive = (engine: FakeEngine) =>
    driveProject(PROJECT, projectDirectory, {
      database,
      engine,
      logger,
      credential: { kind: 'ANTHROPIC_API_KEY', value: 'x' },
      judgeChain: coherentJudgeChain(),
      maxExecutors: 1,
    });

  it('зелёная доска: проект завершён, и вердикт стоит в той же строке', async () => {
    writeTree([task('1', ['lib/a.js'])]);

    const results = await drive(engineWhereProbeSays(probeStubOutcome('quality-probe') ?? {}));

    expect(results.map((entry) => entry.outcome)).toEqual(['COMPLETED']);
    expect(readBoard(database, PROJECT)?.status).toBe('COMPLETED');

    const feed = logger.tail(PROJECT, 300).map((line) => line.message);
    expect(feed.some((line) => line.includes('Проект завершён'))).toBe(true);
    /* Вердикт входит в вершинную строку ДОСЛОВНО — не пересказом и не галочкой. */
    expect(feed.some((line) => line.includes('Итог: зелено по всем четырём осям'))).toBe(true);
  }, 30_000);

  it('РЕГРЕССИЯ: красная ось не даёт сказать «завершён», хотя все задачи приняты', async () => {
    writeTree([task('1', ['lib/a.js'])]);

    /* Тот самый тост из продукта заказчика — абсолютный запрет, красная ось безусловно. */
    const stubbed = JSON.parse(String((probeStubOutcome('quality-probe')?.stdout ?? [])[1])) as {
      operability: { elements: { alert: string }[] };
    };
    stubbed.operability.elements = stubbed.operability.elements.map((element) => ({
      ...element,
      alert: 'Демо-версия, функция недоступна',
    }));

    const results = await drive(
      engineWhereProbeSays({ exitCode: 0, stdout: [PROBE_RESULT, JSON.stringify(stubbed)] }),
    );

    /* Задача принята честно: приёмка — про задачу, суд — про задумку, и это разные утверждения. */
    expect(results.map((entry) => entry.outcome)).toEqual(['COMPLETED']);
    expect(statuses()).toEqual({ '1': 'COMPLETED' });

    expect(readBoard(database, PROJECT)?.status).not.toBe('COMPLETED');

    const feed = logger.tail(PROJECT, 300).map((line) => line.message);
    expect(feed.some((line) => line.includes('Проект НЕ завершён'))).toBe(true);
    expect(feed.some((line) => line.includes('Заглушка объявлена интерфейсом'))).toBe(true);
    expect(feed.some((line) => line.includes('Проект завершён:'))).toBe(false);
  }, 30_000);

  it('несостоявшийся суд «завершён» тоже не даёт: не судили — не подтвердили', async () => {
    writeTree([task('1', ['lib/a.js'])]);

    const results = await drive(engineWhereProbeSays({ exitCode: 70, stdout: ['проба упала'] }));

    expect(results.map((entry) => entry.outcome)).toEqual(['COMPLETED']);
    expect(readBoard(database, PROJECT)?.status).not.toBe('COMPLETED');

    const feed = logger.tail(PROJECT, 300).map((line) => line.message);
    expect(feed.some((line) => line.includes('Суд качества НЕ СОСТОЯЛСЯ'))).toBe(true);
  }, 30_000);
});
