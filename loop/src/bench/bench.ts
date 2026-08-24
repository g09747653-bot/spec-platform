import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

import { readBoard, summarise } from '../db/board.ts';
import type { DockerEngine } from '../docker/engine.ts';
import { eventBus } from '../events/bus.ts';
import { HANDOFF, HandoffTask, importHandoff, taskFileName } from '../intake/handoff.ts';
import type { SlicedMilestone } from '../intake/milestones.ts';
import { createLogger } from '../observability/log.ts';
import { driveProject, recoverFromDisk } from '../orchestrator/orchestrator.ts';

import {
  checkInvariants,
  planFingerprint,
  type InvariantViolation,
  type PlanFingerprint,
} from './invariants.ts';
import { createStubExecutorEngine, type StubTaskOutcome } from './stub-executor.ts';

/**
 * Стенд контура (А-40 п.3): труба и состояние — по-настоящему, контейнер — заглушкой.
 *
 * **Что это НЕ.** Не фреймворк тестирования и не замена живому раунду. Честная граница пользы
 * названа заранее (А-40 п.4): стенд ловит класс «труба и состояние» — идентичность строк, семантику
 * перезахода, управляющий поток, расхождение доски с диском — и НЕ ловит класс «столкновение с
 * реальностью»: глаза вне контейнера, симлинки, потолки времени, словарь консольного шума, нехватку
 * материала, качество продукта. Всё, из-за чего отклонялась приёмка, живёт во втором классе.
 *
 * **Обязательная живая смок-задача.** Заглушка сама может врать (А-40 п.5а) — разойдётся с живым
 * исполнителем, и стенд будет зелёным при сломанной работе. Единственное лечение — один настоящий
 * контейнер в каждом прогоне стенда: `runLadder` принимает `smoke` и без него честно печатает, что
 * прогон неполон.
 */

export interface BenchProjectSpec {
  projectId: string;
  /** Сколько задач и как они разложены по вехам: `[2, 1, 3]` — три вехи цепочкой. */
  milestoneSizes: readonly number[];
  /** Исход задачи у заглушки. По умолчанию все зелёные. */
  outcomeOf?: (taskId: string) => StubTaskOutcome;
  /** Идентификаторы задач без области проекта — так проверяется столкновение двух проектов. */
  unscopedIds?: boolean;
}

export interface BenchRun {
  projectId: string;
  tasks: number;
  milestones: number;
  /** Сколько раз пришлось звать конвейер снаружи. Один — «сам дошёл»; больше — нажатия. */
  externalDrives: number;
  /** Проход не вернулся за отведённое стенду время — стояние, названное стоянием. */
  stalled: boolean;
  accepted: number;
  /** Итог доски: сколько задач в каком статусе. */
  summary: Record<string, number>;
  violations: InvariantViolation[];
  /** Имена всех поднятых контейнеров — улика для инварианта «принято без контейнера». */
  containers: string[];
  durationMs: number;
}

/** Идентификаторы задач и вех стенда: с областью проекта — как их выдаёт интейк после D-324/D-325. */
export function benchTaskId(projectId: string, index: number, unscoped = false): string {
  const number = String(index + 1).padStart(2, '0');
  return unscoped ? `BT${number}` : `BT_${projectId}_${number}`;
}

export function benchMilestoneId(projectId: string, index: number, unscoped = false): string {
  const number = String(index + 1).padStart(2, '0');
  return unscoped ? `ms_${number}` : `ms_${projectId}_${number}`;
}

export interface BenchTree {
  projectDirectory: string;
  milestones: SlicedMilestone[];
  tasks: HandoffTask[];
}

/**
 * Дерево проекта на диске — настоящее: `milestones.json`, `task_*.json`, `handoff/reports/`.
 *
 * Вехи выстроены цепочкой (`ms_02` ждёт `ms_01`, и так далее), потому что именно эта форма и есть
 * предмет п.1: вторая веха разблокируется завершением первой.
 */
export function writeBenchTree(workspaceRoot: string, spec: BenchProjectSpec): BenchTree {
  const projectDirectory = join(workspaceRoot, spec.projectId);
  mkdirSync(join(projectDirectory, HANDOFF.tasks), { recursive: true });
  mkdirSync(join(projectDirectory, HANDOFF.reports), { recursive: true });

  /* Проект на nodejs, чтобы наблюдение приёмки и задание сходились и задание не переписывалось. */
  writeFileSync(
    join(projectDirectory, 'package.json'),
    `${JSON.stringify({ name: spec.projectId, private: true, scripts: { test: 'node -e 0' } }, null, 2)}\n`,
    'utf8',
  );

  const milestones: SlicedMilestone[] = [];
  const tasks: HandoffTask[] = [];
  let index = 0;

  for (const [position, size] of spec.milestoneSizes.entries()) {
    const milestoneId = benchMilestoneId(spec.projectId, position, spec.unscopedIds);
    const taskIds: string[] = [];

    for (let inside = 0; inside < size; inside += 1) {
      const taskId = benchTaskId(spec.projectId, index, spec.unscopedIds);
      index += 1;
      taskIds.push(taskId);

      tasks.push(
        HandoffTask.parse({
          taskId,
          milestoneId,
          title: `Задача ${taskId}`,
          description: 'Стенд контура: задача существует ради перехода состояния.',
          techStack: 'nodejs',
          /* Разные файлы: столкновений по файлам стенд не изучает, их изучает schedule.test.ts. */
          filesToEdit: [`src/${taskId}.js`],
          dependsOn: [],
          unitTestCmd: 'npm test',
          expectedArtifacts: [],
          status: 'PENDING',
        }),
      );
    }

    milestones.push({
      milestoneId,
      title: `Веха ${String(position + 1)}`,
      description: 'Стенд контура',
      dependsOn:
        position === 0 ? [] : [benchMilestoneId(spec.projectId, position - 1, spec.unscopedIds)],
      taskIds,
    });
  }

  writeFileSync(
    join(projectDirectory, HANDOFF.milestones),
    `${JSON.stringify(
      {
        projectId: spec.projectId,
        milestones: milestones.map(({ taskIds: _ignored, ...rest }) => rest),
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  for (const task of tasks) {
    writeFileSync(
      join(projectDirectory, HANDOFF.tasks, taskFileName(task.taskId)),
      `${JSON.stringify(task, null, 2)}\n`,
      'utf8',
    );
  }

  return { projectDirectory, milestones, tasks };
}

export interface BenchDeps {
  database: DatabaseSync;
  workspaceRoot: string;
  /** Живой демон для смок-задачи; заглушка — по умолчанию. */
  engine?: DockerEngine;
  maxExecutors?: number;
  /**
   * Сколько стенд ждёт возврата конвейера, прежде чем назвать стояние стоянием.
   *
   * Заглушка отвечает за миллисекунды, поэтому проход, не вернувшийся за минуту, не «долгий» — он
   * СТОИТ. Различать это обязательно: раунд А-37.1 стоял, а не заканчивался, и именно поэтому в
   * ленте не было ни строки об остановке — стенд, который просто повис бы вместе с ним, повторил бы
   * ту же немоту вместо того, чтобы её назвать.
   */
  stallMs?: number;
}

/**
 * Один щуп лестницы: поставить проект, погнать конвейер, спросить инварианты на каждом переходе.
 *
 * **`externalDrives` — главное число щупа.** Конвейер зовётся ОДИН раз; если после его возврата на
 * доске остались задачи, которые могут идти, стенд честно зовёт его снова и увеличивает счётчик.
 * Единица означает «доска дошла до конца сама», всё большее — ровно те нажатия, из-за которых
 * человек оказывался в середине контура.
 */
export async function runProbe(spec: BenchProjectSpec, deps: BenchDeps): Promise<BenchRun> {
  const started = Date.now();
  const { database, workspaceRoot } = deps;
  const logger = createLogger(database);

  const tree = writeBenchTree(workspaceRoot, spec);
  importHandoff(
    database,
    spec.projectId,
    `Стенд ${spec.projectId}`,
    tree.milestones,
    tree.tasks,
    tree.projectDirectory,
  );

  const containers: string[] = [];
  const engine =
    deps.engine ??
    createStubExecutorEngine({
      ...(spec.outcomeOf === undefined ? {} : { outcomeOf: spec.outcomeOf }),
      onContainer: (name) => containers.push(name),
    });

  const planBefore = planFingerprint(tree.projectDirectory);
  const violations: InvariantViolation[] = [];
  const ask = (at: string): void => {
    violations.push(
      ...checkInvariants({
        database,
        projectId: spec.projectId,
        projectDirectory: tree.projectDirectory,
        at,
        containers: { names: containers },
        planBefore,
      }),
    );
  };

  ask('до прогона');

  /* Инварианты на каждом переходе состояния задачи — не в конце (см. invariants.ts). */
  const unsubscribe = eventBus().subscribe((event) => {
    if (event.type !== 'task-status' || event.projectId !== spec.projectId) return;
    if (event.status === 'IN_PROGRESS') return;
    ask(`после перехода ${event.taskId} → ${event.status}`);
  });

  const stallMs = deps.stallMs ?? 60_000;
  let externalDrives = 0;
  let stalled = false;

  try {
    for (;;) {
      externalDrives += 1;

      const settled = await Promise.race([
        driveProject(spec.projectId, tree.projectDirectory, {
          database,
          engine,
          logger,
          credential: { kind: 'ANTHROPIC_API_KEY', value: 'стенд-контура-не-учётка' },
          ...(deps.maxExecutors === undefined ? {} : { maxExecutors: deps.maxExecutors }),
        }).then(() => 'вернулся' as const),
        new Promise<'стоит'>((resolve) => {
          const timer = setTimeout(() => {
            resolve('стоит');
          }, stallMs);
          timer.unref();
        }),
      ]);

      if (settled === 'стоит') {
        stalled = true;
        violations.push({
          invariant: 'проход не стоит молча',
          projectId: spec.projectId,
          at: `после ${String(stallMs)} мс прохода №${String(externalDrives)}`,
          detail:
            'конвейер не вернулся и не сказал, чем он занят: при заглушке, отвечающей за ' +
            'миллисекунды, это стояние, а не работа',
        });
        break;
      }

      ask(`после возврата конвейера №${String(externalDrives)}`);
      if (!hasRunnableWork(database, spec.projectId)) break;
      /* Двенадцать — потолок щупа, а не рабочий предел: он ловит петлю, а не считает нажатия. */
      if (externalDrives >= 12) break;
    }
  } finally {
    unsubscribe();
  }

  const board = readBoard(database, spec.projectId);
  const summary: Record<string, number> = board === null ? {} : summarise(board);

  return {
    projectId: spec.projectId,
    tasks: tree.tasks.length,
    milestones: tree.milestones.length,
    externalDrives,
    stalled,
    accepted: summary.COMPLETED ?? 0,
    summary,
    violations,
    containers,
    durationMs: Date.now() - started,
  };
}

/**
 * Есть ли ещё что гнать: задача в PENDING, чья веха достижима.
 *
 * Читается из индекса тем же вопросом, каким его задаёт планировщик, — стенд не изобретает второй
 * ответ на «что может идти сейчас», он спрашивает у контура и смотрит, дошёл ли тот сам.
 */
function hasRunnableWork(database: DatabaseSync, projectId: string): boolean {
  const board = readBoard(database, projectId);
  if (board === null) return false;

  const completed = new Set(
    board.milestones.filter((m) => m.status === 'COMPLETED').map((m) => m.milestoneId),
  );

  return board.milestones.some(
    (milestone) =>
      milestone.dependsOn.every((id) => completed.has(id)) &&
      milestone.tasks.some((task) => task.status === 'PENDING'),
  );
}

/** Перезаход: поднять состояние с диска тем же путём, каким его поднимает бут сервера. */
export function reenter(database: DatabaseSync, workspaceRoot: string): PlanFingerprint[] {
  const recovered = recoverFromDisk(database, workspaceRoot);
  return recovered.map((project) => planFingerprint(project.projectDirectory));
}
