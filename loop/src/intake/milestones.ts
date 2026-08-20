/**
 * Slicing a bundle's tasks into milestones (task 156).
 *
 * **The code decides the order, never the model** — the mirror of D-229, and the milestone's brief
 * states it as law. What the model may do is write the *texts* of the assignments; which task waits
 * for which is a topological fact about the plan, and a fact is not something to ask a model for.
 *
 * Two strategies, and which one applies is decided by the bundle, not chosen:
 *
 * - **dependencies** — the plan states them, so the layout is the plan's own. Kahn's algorithm by
 *   layers: layer 0 is everything that waits for nothing, layer *k* is everything whose whole
 *   dependency set sits in the layers before it. Tasks inside a layer are independent of each
 *   other by construction, which is exactly what M16а's parallel scheduler needs.
 * - **phases** — the plan states none, which the M14а gate produced for real: sixteen honest tasks
 *   with `dependsOn: []` throughout. Falling back to «everything is parallel» would be a lie about
 *   a plan that is obviously sequential, so the fallback is the source's own phase order, read off
 *   the identifier (`1.1`, `1.2`, `2.1` → phases 1, 2), and each phase waits for the one before it.
 *   Conservative on purpose: a wrong «must wait» costs time, a wrong «may run now» costs a build.
 *
 * A cycle is a **named error**, never a hang: the loop would otherwise sit forever on a plan that
 * cannot be walked, at three in the morning, with nobody watching.
 */

export interface SliceableTask {
  taskId: string;
  dependsOn: readonly string[];
}

export interface SlicedMilestone {
  milestoneId: string;
  title: string;
  description: string;
  dependsOn: string[];
  taskIds: string[];
}

export type SliceStrategy = 'dependencies' | 'phases';

export type SliceResult =
  | { ok: true; strategy: SliceStrategy; milestones: SlicedMilestone[] }
  | { ok: false; reason: 'empty' }
  | { ok: false; reason: 'cycle'; tasks: string[] }
  | { ok: false; reason: 'dangling'; taskId: string; missing: string }
  | { ok: false; reason: 'duplicate'; taskId: string };

/** `ms_01`, `ms_02`, … — zero-padded so a lexical sort is the execution order. */
export function milestoneId(index: number): string {
  return `ms_${String(index + 1).padStart(2, '0')}`;
}

/** `1.1` → `1`; `task_3.2` → `task_3`; a dotless id is its own phase. */
export function phaseOf(taskId: string): string {
  const dot = taskId.indexOf('.');
  return dot === -1 ? taskId : taskId.slice(0, dot);
}

export function sliceMilestones(tasks: readonly SliceableTask[]): SliceResult {
  if (tasks.length === 0) return { ok: false, reason: 'empty' };

  const seen = new Set<string>();
  for (const task of tasks) {
    if (seen.has(task.taskId)) return { ok: false, reason: 'duplicate', taskId: task.taskId };
    seen.add(task.taskId);
  }

  const stated = tasks.some((task) => task.dependsOn.length > 0);

  return stated ? byDependencies(tasks, seen) : byPhases(tasks);
}

function byDependencies(tasks: readonly SliceableTask[], known: ReadonlySet<string>): SliceResult {
  for (const task of tasks) {
    for (const dependency of task.dependsOn) {
      if (!known.has(dependency)) {
        return { ok: false, reason: 'dangling', taskId: task.taskId, missing: dependency };
      }
    }
  }

  const placed = new Set<string>();
  const remaining = [...tasks];
  const layers: string[][] = [];

  while (remaining.length > 0) {
    const layer = remaining.filter((task) =>
      task.dependsOn.every((dependency) => placed.has(dependency)),
    );

    /*
     * Nothing could be placed, and every remaining task is waiting on another remaining task. That
     * is a cycle, and it is reported with the tasks caught in it rather than as a stalled pipeline.
     */
    if (layer.length === 0) {
      return { ok: false, reason: 'cycle', tasks: remaining.map((task) => task.taskId) };
    }

    layers.push(layer.map((task) => task.taskId));
    for (const task of layer) placed.add(task.taskId);
    remaining.splice(0, remaining.length, ...remaining.filter((task) => !placed.has(task.taskId)));
  }

  return { ok: true, strategy: 'dependencies', milestones: asMilestones(layers, 'Веха') };
}

function byPhases(tasks: readonly SliceableTask[]): SliceResult {
  const order: string[] = [];
  const grouped = new Map<string, string[]>();

  for (const task of tasks) {
    const phase = phaseOf(task.taskId);
    const bucket = grouped.get(phase);

    if (bucket === undefined) {
      order.push(phase);
      grouped.set(phase, [task.taskId]);
    } else {
      bucket.push(task.taskId);
    }
  }

  return {
    ok: true,
    strategy: 'phases',
    milestones: asMilestones(
      order.map((phase) => grouped.get(phase) ?? []),
      'Фаза',
      order,
    ),
  };
}

function asMilestones(
  groups: readonly string[][],
  label: string,
  names: readonly string[] = [],
): SlicedMilestone[] {
  return groups.map((taskIds, index) => ({
    milestoneId: milestoneId(index),
    title: `${label} ${names[index] ?? String(index + 1)}`,
    description:
      index === 0
        ? `Задач в вехе: ${String(taskIds.length)}. Начальная веха — ничего не ждёт.`
        : `Задач в вехе: ${String(taskIds.length)}. Ждёт завершения ${milestoneId(index - 1)}.`,
    dependsOn: index === 0 ? [] : [milestoneId(index - 1)],
    taskIds: [...taskIds],
  }));
}

/** A sentence for the log feed and for the report — what was decided and on what basis. */
export function describeSlice(result: SliceResult): string {
  if (!result.ok) {
    switch (result.reason) {
      case 'empty':
        return 'В бандле нет ни одной задачи — резать нечего.';
      case 'cycle':
        return `Цикл в зависимостях задач: ${result.tasks.join(', ')}. Конвейер не запущен.`;
      case 'dangling':
        return `Задача ${result.taskId} ждёт задачу ${result.missing}, которой в бандле нет.`;
      case 'duplicate':
        return `Идентификатор задачи ${result.taskId} встречается дважды.`;
    }
  }

  const tasks = result.milestones.reduce((sum, milestone) => sum + milestone.taskIds.length, 0);

  return result.strategy === 'dependencies'
    ? `Вехи нарезаны по зависимостям: ${String(result.milestones.length)} вех, ${String(tasks)} задач.`
    : `Зависимости в бандле не указаны — вехи нарезаны по фазам источника (консервативно, последовательно): ${String(result.milestones.length)} вех, ${String(tasks)} задач.`;
}
