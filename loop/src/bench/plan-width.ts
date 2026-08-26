import {
  schedule,
  type HeldReason,
  type SchedulePlan,
  type ScheduleTask,
} from '../orchestrator/schedule.ts';
import { sliceMilestones, type SliceStrategy } from '../intake/milestones.ts';
import type { BundleTask } from '../intake/validate.ts';

/**
 * Ширина плана — замер того, что ставит потолок ПОСЛЕ исполнителей (А-51 п.4).
 *
 * **Вопрос, который А-44 обошёл, а не закрыл.** Тот замер брал бандл, собранный руками как лучший
 * возможный случай — одна веха, десять задач, десять файлов, ноль зависимостей, — и честно измерил
 * «умеет ли конвейер занять десять слотов, если дать ему ГОТОВУЮ широкую веху». Умеет: пик 10.
 * Не измерено было другое: **умеет ли планирование САМО породить такую веху из настоящей задумки.**
 *
 * **Что меряет этот модуль и, главное, чего он НЕ меряет.** Он меряет ФОРМУ ПЛАНА: сколько задач
 * лежит в каждой вехе, сколько из них настоящий планировщик пустит в слоты одновременно, какова
 * средняя одновременность по интегралу, какова доля мёртвой стены и во сколько раз потолок N
 * быстрее потолка 1. Всё это — свойства плана, и они вычислимы точно, без Docker, без провайдеров
 * и без часа стены.
 *
 * Он НЕ меряет длительность настоящей работы: она держится постоянной по построению. Это не
 * упрощение ради удобства, а условие вопроса — при переменной длительности «ширина плана» была бы
 * неотделима от «повезло ли задачам оказаться разной длины». Число отсюда есть ПОТОЛОК, который
 * форма плана ставит исполнителям, а не предсказание стены живого прогона.
 *
 * **Планировщик берётся настоящий.** `schedule()` — тот самый, что раздаёт слоты в проде, со всеми
 * тремя своими правилами (веха недостижима, зависимость не закрыта, файлы пересекаются). Вторая
 * копия его логики здесь измеряла бы нашу копию, а не наш конвейер.
 */

/** Одна веха как её нарезал код, и сколько задач в ней лежит. */
export interface MilestoneWidth {
  milestoneId: string;
  title: string;
  tasks: number;
}

export interface PlanShape {
  strategy: SliceStrategy;
  tasks: number;
  milestones: MilestoneWidth[];
  /** Самая широкая веха: столько слотов план вообще способен занять. */
  widest: number;
  /** Средняя ширина вехи — то, чем план живёт, а не чем хвастается. */
  averageWidth: number;
  /** Сколько задач бандла заявили хоть одну зависимость: от этого зависит стратегия нарезки. */
  withDependencies: number;
}

/** Форма плана из задач бандла — нарезкой КОДА, той же, что в проде. */
export function planShape(tasks: readonly BundleTask[], scope?: string): PlanShape {
  const sliced = sliceMilestones(tasks, scope);
  if (!sliced.ok) throw new Error(`нарезка отказала: ${sliced.reason}`);

  const milestones = sliced.milestones.map((milestone) => ({
    milestoneId: milestone.milestoneId,
    title: milestone.title,
    tasks: milestone.taskIds.length,
  }));

  const total = milestones.reduce((sum, milestone) => sum + milestone.tasks, 0);

  return {
    strategy: sliced.strategy,
    tasks: total,
    milestones,
    widest: milestones.reduce((peak, milestone) => Math.max(peak, milestone.tasks), 0),
    averageWidth: milestones.length === 0 ? 0 : total / milestones.length,
    withDependencies: tasks.filter((task) => task.dependsOn.length > 0).length,
  };
}

export interface WalkOutcome {
  limit: number;
  /** Тактов до конца плана. Такт — одна задача одного исполнителя. */
  ticks: number;
  /** Интеграл одновременности, делённый на стену — то же определение, что у замера А-44. */
  averageConcurrency: number;
  peak: number;
  /** Доля тактов, на которых не работал НИ ОДИН исполнитель. */
  zeroShare: number;
  /** Сколько раз планировщик отказал готовой задаче и почему — по его же именам причин. */
  held: Record<HeldReason, number>;
}

const NO_HOLDS: Record<HeldReason, number> = Object.freeze({
  milestone: 0,
  files: 0,
  dependency: 0,
  ceiling: 0,
});

/**
 * Прогон плана НАСТОЯЩИМ планировщиком при заданном потолке — дискретная развёртка.
 *
 * Каждая задача занимает ровно один такт. Такт устроен как проход конвейера: спросить планировщик,
 * что можно начать; начать; досчитать такт; всё начатое кончилось. Это и есть модель «одинаковой
 * работы», при которой видна ФОРМА плана и ничего кроме неё.
 *
 * Тупик — именованная ошибка, а не бесконечный цикл: план, по которому нельзя дойти до конца, есть
 * дефект нарезки, и молчать о нём здесь так же нельзя, как в проде.
 */
export function walkPlan(plan: SchedulePlan, limit: number): WalkOutcome {
  const status = new Map(plan.tasks.map((task) => [task.taskId, task.status]));
  const milestoneStatus = new Map(plan.milestones.map((m) => [m.milestoneId, m.status]));
  const held: Record<HeldReason, number> = { ...NO_HOLDS };

  let ticks = 0;
  let busy = 0;
  let peak = 0;
  let idle = 0;

  const remaining = (): number =>
    [...status.values()].filter((value) => value !== 'COMPLETED').length;

  while (remaining() > 0) {
    const snapshot: SchedulePlan = {
      milestones: plan.milestones.map((milestone) => ({
        ...milestone,
        status: milestoneStatus.get(milestone.milestoneId) ?? 'PENDING',
      })),
      tasks: plan.tasks.map((task) => ({
        ...task,
        status: status.get(task.taskId) ?? 'PENDING',
      })),
    };

    const decision = schedule({ plan: snapshot, running: [], limit });

    for (const entry of decision.held) held[entry.reason] += 1;

    if (decision.start.length === 0) {
      throw new Error(
        `план встал: осталось ${String(remaining())} задач, а планировщик не отдал ни одной — ` +
          'это дефект нарезки, а не свойство ширины',
      );
    }

    ticks += 1;
    busy += decision.start.length;
    peak = Math.max(peak, decision.start.length);
    if (decision.start.length === 0) idle += 1;

    for (const task of decision.start) status.set(task.taskId, 'COMPLETED');

    /* Веха закрывается, когда закрыты все её задачи: тот же закон, что у прода. */
    for (const milestone of plan.milestones) {
      const own = plan.tasks.filter((task) => task.milestoneId === milestone.milestoneId);
      if (own.length > 0 && own.every((task) => status.get(task.taskId) === 'COMPLETED')) {
        milestoneStatus.set(milestone.milestoneId, 'COMPLETED');
      }
    }
  }

  return {
    limit,
    ticks,
    averageConcurrency: ticks === 0 ? 0 : busy / ticks,
    peak,
    zeroShare: ticks === 0 ? 0 : idle / ticks,
    held,
  };
}

/** План в форме, которую понимает планировщик: та же, что строит индекс из вех и заданий. */
export function planOf(
  tasks: readonly BundleTask[],
  filesOf: (task: BundleTask) => readonly string[],
  scope?: string,
): SchedulePlan {
  const sliced = sliceMilestones(tasks, scope);
  if (!sliced.ok) throw new Error(`нарезка отказала: ${sliced.reason}`);

  const milestoneOf = new Map<string, string>();
  for (const milestone of sliced.milestones) {
    for (const taskId of milestone.taskIds) milestoneOf.set(taskId, milestone.milestoneId);
  }

  const scheduleTasks: ScheduleTask[] = tasks.map((task, position) => ({
    taskId: task.taskId,
    milestoneId: milestoneOf.get(task.taskId) ?? '',
    status: 'PENDING',
    position,
    filesToEdit: filesOf(task),
    dependsOn: task.dependsOn,
  }));

  return {
    milestones: sliced.milestones.map((milestone, position) => ({
      milestoneId: milestone.milestoneId,
      status: 'PENDING',
      position,
      dependsOn: milestone.dependsOn,
    })),
    tasks: scheduleTasks,
  };
}

export interface WidthMeasurement {
  label: string;
  shape: PlanShape;
  wide: WalkOutcome;
  narrow: WalkOutcome;
  /** Во сколько раз потолок N быстрее потолка 1 — по тактам, а не по секундам. */
  speedup: number;
  /** Идеал при этом потолке и доля его, взятая планом. */
  ideal: number;
  shareOfIdeal: number;
}

export function measureWidth(args: {
  label: string;
  tasks: readonly BundleTask[];
  filesOf: (task: BundleTask) => readonly string[];
  limit: number;
  scope?: string;
}): WidthMeasurement {
  const plan = planOf(args.tasks, args.filesOf, args.scope);
  const wide = walkPlan(plan, args.limit);
  const narrow = walkPlan(plan, 1);

  return {
    label: args.label,
    shape: planShape(args.tasks, args.scope),
    wide,
    narrow,
    speedup: wide.ticks === 0 ? 0 : narrow.ticks / wide.ticks,
    ideal: args.limit,
    shareOfIdeal: args.limit === 0 ? 0 : narrow.ticks / wide.ticks / args.limit,
  };
}
