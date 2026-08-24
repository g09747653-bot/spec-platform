import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

import { readBoard } from '../db/board.ts';
import { HANDOFF, HandoffTask, taskFileName } from '../intake/handoff.ts';

/**
 * Пять инвариантов стенда (А-40 п.3), каждый — на переходе состояния.
 *
 * Не «тесты продукта» и не проверки качества: это утверждения о ТРУБЕ И СОСТОЯНИИ, то есть ровно о
 * том классе, где за один живой раунд нашлось три скрытых дефекта (D-324, D-325, D-326). Каждый из
 * пяти назван не потому, что красив, а потому, что уже ломался или ломался бы молча:
 *
 * 1. **доска равна диску** — D-325 в чистом виде: индекс жил своей жизнью и объявил «принято 3 из 5»
 *    при пяти PENDING на диске;
 * 2. **проект не видит строк чужого** — D-324/D-325: второй проект перехватывал чужие строки;
 * 3. **«принято» невозможно без контейнера** — лживая галочка: COMPLETED, за которым не стоит
 *    приёмочный контейнер, это отчёт без работы;
 * 4. **перезаход даёт тот же план** — D-326: возобновление роняло цельный план обратно в нарезку;
 * 5. **счётчик доски равен числу файлов задач** — самый дешёвый детектор всего перечисленного:
 *    доска, показавшая ноль при шести заданиях на диске, была первым симптомом D-324.
 *
 * Спрашивают их дёшево и часто — на каждом переходе, а не в конце: дефект, найденный на переходе,
 * называет момент; дефект, найденный в конце, называет только факт.
 */

export interface InvariantViolation {
  /** Имя инварианта — им же он назван в рапорте. */
  invariant: string;
  projectId: string;
  /** Момент, на котором инвариант спросили: «до прогона», «после задачи WA03», … */
  at: string;
  detail: string;
}

/** Улики контейнеров: какие имена поднимались, чтобы спросить «а был ли контейнер». */
export interface ContainerLog {
  names: readonly string[];
}

/** Отпечаток плана: то, что обязано пережить перезаход без изменений. */
export interface PlanFingerprint {
  milestones: string[];
  tasks: { taskId: string; milestoneId: string; dependsOn: string[] }[];
}

export interface InvariantContext {
  database: DatabaseSync;
  projectId: string;
  projectDirectory: string;
  /** Момент, на котором инварианты спрашивают. */
  at: string;
  containers: ContainerLog;
  /** План, снятый раньше — против него сверяется инвариант перезахода. */
  planBefore?: PlanFingerprint | null;
}

export function taskFiles(tasksDirectory: string): string[] {
  if (!existsSync(tasksDirectory)) return [];

  return readdirSync(tasksDirectory)
    .filter((name) => name.startsWith('task_') && name.endsWith('.json'))
    .sort();
}

/** Отпечаток берётся С ДИСКА: диск — источник правды, и перезаход поднимается именно с него. */
export function planFingerprint(projectDirectory: string): PlanFingerprint {
  const directory = join(projectDirectory, HANDOFF.tasks);
  const tasks = taskFiles(directory)
    .map((name) => HandoffTask.parse(JSON.parse(readFileSync(join(directory, name), 'utf8'))))
    .map((task) => ({
      taskId: task.taskId,
      milestoneId: task.milestoneId,
      dependsOn: [...task.dependsOn].sort(),
    }))
    .sort((left, right) => left.taskId.localeCompare(right.taskId));

  const milestonesPath = join(projectDirectory, HANDOFF.milestones);
  const milestones = existsSync(milestonesPath)
    ? (
        JSON.parse(readFileSync(milestonesPath, 'utf8')) as {
          milestones: { milestoneId: string }[];
        }
      ).milestones
        .map((milestone) => milestone.milestoneId)
        .sort()
    : [];

  return { milestones, tasks };
}

/**
 * Все пять, разом, на одном переходе. Пустой список — инварианты держатся.
 *
 * Возвращает нарушения, а не бросает: стенд обязан ДОВЕСТИ прогон и назвать всё, что разошлось, —
 * ровно как конвейер доводит прогон при красном самозамере (D-323).
 */
export function checkInvariants(context: InvariantContext): InvariantViolation[] {
  const { database, projectId, projectDirectory, at } = context;
  const violations: InvariantViolation[] = [];
  const say = (invariant: string, detail: string): void => {
    violations.push({ invariant, projectId, at, detail });
  };

  const board = readBoard(database, projectId);
  const boardTasks = (board?.milestones ?? []).flatMap((milestone) => milestone.tasks);
  const tasksDirectory = join(projectDirectory, HANDOFF.tasks);
  const files = taskFiles(tasksDirectory);

  /* 1. Доска равна диску — статус в статус, по каждой задаче. */
  const onDisk = new Map<string, string>();
  for (const name of files) {
    try {
      const task = HandoffTask.parse(JSON.parse(readFileSync(join(tasksDirectory, name), 'utf8')));
      onDisk.set(task.taskId, task.status);
    } catch {
      say('доска равна диску', `задание ${name} нечитаемо — сверить статус не с чем`);
    }
  }

  for (const task of boardTasks) {
    const disk = onDisk.get(task.taskId);
    if (disk === undefined) {
      say('доска равна диску', `на доске есть ${task.taskId}, на диске такого задания нет`);
      continue;
    }
    if (disk !== task.status) {
      say('доска равна диску', `${task.taskId}: доска «${task.status}», диск «${disk}»`);
    }
  }

  const onBoard = new Set(boardTasks.map((task) => task.taskId));
  const missing = [...onDisk.keys()].filter((taskId) => !onBoard.has(taskId));
  if (missing.length > 0) {
    say('доска равна диску', `на диске есть задания, которых нет на доске: ${missing.join(', ')}`);
  }

  /* 2. Проект не видит строк чужого проекта. */
  const foreign = database
    .prepare('SELECT task_id FROM tasks WHERE project_id = ?')
    .all(projectId)
    .map((row) => (row as { task_id: string }).task_id)
    .filter((taskId) => !onDisk.has(taskId));

  if (foreign.length > 0) {
    say(
      'проект не видит чужих строк',
      `в индексе проекта строки без задания на его диске: ${foreign.join(', ')}`,
    );
  }

  /* 3. «Принято» невозможно без контейнера — за каждым COMPLETED стоит приёмочный контейнер. */
  for (const task of boardTasks) {
    if (task.status !== 'COMPLETED') continue;

    const judged = context.containers.names.some((name) =>
      name.startsWith(`delivery-gate-${task.taskId}-`),
    );

    if (!judged) {
      say(
        '«принято» невозможно без контейнера',
        `${task.taskId} принята, но контейнера delivery-gate-${task.taskId}-* не поднималось`,
      );
    }
  }

  /* 4. Перезаход даёт тот же план. */
  if (context.planBefore != null) {
    const now = planFingerprint(projectDirectory);
    if (JSON.stringify(now) !== JSON.stringify(context.planBefore)) {
      say(
        'перезаход даёт тот же план',
        `план разошёлся: было вех ${String(context.planBefore.milestones.length)}, задач ` +
          `${String(context.planBefore.tasks.length)}; стало вех ${String(now.milestones.length)}, ` +
          `задач ${String(now.tasks.length)}`,
      );
    }
  }

  /* 5. Счётчик доски равен числу файлов задач. */
  if (boardTasks.length !== files.length) {
    say(
      'счётчик доски равен числу файлов',
      `на доске ${String(boardTasks.length)}, файлов заданий ${String(files.length)}`,
    );
  }

  return violations;
}

/** Файл задания на диске — для стенда, который его пишет и перечитывает. */
export function taskPath(projectDirectory: string, taskId: string): string {
  return join(projectDirectory, HANDOFF.tasks, taskFileName(taskId));
}
