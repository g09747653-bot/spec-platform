/**
 * Which tasks may start right now (task 159; бандл A0 Task 3.1).
 *
 * A pure function over three facts — the plan, what is already running, and the ceiling — and
 * nothing else. No database handle, no clock, no daemon: the whole of «up to ten executors without
 * collisions» is decidable from rows, so it is decided here where a table of cases can prove it, and
 * the caller does the starting.
 *
 * Three rules, in the order they apply:
 *
 * 1. **Milestones by `dependsOn`.** A milestone may run when every milestone it names is
 *    `COMPLETED`. That is the whole of «строго по dependsOn» — two milestones that wait for nothing
 *    from each other are two milestones that may run together, and inventing a total order over them
 *    would be the scheduler adding a constraint the plan did not state. (The slicing produces a
 *    chain today, so in practice one milestone is open at a time; the rule is written for the plan,
 *    not for the slicer.)
 * 2. **No two executors in one file.** A task whose `filesToEdit` meets a running task's waits its
 *    turn. Same for two candidates of one batch: they are about to be running.
 * 3. **The ceiling.** `MAX_EXECUTORS` containers at once, and never more.
 *
 * A fourth rule is here that the A0 bundle does not name, and it is a safety net rather than a
 * feature: a task waits for the tasks its own `dependsOn` names. Under the `dependencies` slicing
 * those always sit in an earlier milestone and the rule never fires; under the `phases` fallback the
 * bundle stated no dependencies at all, so it never fires there either. It fires only for a plan
 * that puts a dependent pair inside one milestone — which the slicer should not do and, if it ever
 * does, must not cost the operator a race between two containers editing one feature.
 */

export interface ScheduleTask {
  taskId: string;
  milestoneId: string;
  status: string;
  /** Plan order within the milestone. */
  position: number;
  filesToEdit: readonly string[];
  dependsOn: readonly string[];
}

export interface ScheduleMilestone {
  milestoneId: string;
  status: string;
  /** Plan order within the project. */
  position: number;
  dependsOn: readonly string[];
}

export interface SchedulePlan {
  milestones: readonly ScheduleMilestone[];
  tasks: readonly ScheduleTask[];
}

export interface ScheduleInput {
  plan: SchedulePlan;
  /** Tasks with a live executor right now, by id. The caller owns this set. */
  running: readonly string[];
  /** `MAX_EXECUTORS`. */
  limit: number;
}

/** Why a task that is otherwise ready is not starting — the feed's word for a waiting queue. */
export type HeldReason = 'milestone' | 'files' | 'dependency' | 'ceiling';

export interface ScheduleResult {
  /** In plan order, at most `limit - running.length` of them. */
  start: ScheduleTask[];
  /** Every pending task that could not start, and the first rule that stopped it. */
  held: { taskId: string; reason: HeldReason }[];
}

/** The default ceiling of the bundle: ten executors, and the configuration may lower it. */
export const DEFAULT_MAX_EXECUTORS = 10;

const overlaps = (left: readonly string[], right: ReadonlySet<string>): boolean =>
  left.some((path) => right.has(path));

/**
 * The plan order: milestone position, then task position, then id.
 *
 * Total by construction — two tasks that share a position still order deterministically — because a
 * scheduler whose answer depends on row order is a scheduler whose answer is not reproducible from
 * the plan.
 */
function planOrder(plan: SchedulePlan): ScheduleTask[] {
  const milestonePosition = new Map(
    plan.milestones.map((milestone) => [milestone.milestoneId, milestone.position]),
  );

  return [...plan.tasks].sort((left, right) => {
    const byMilestone =
      (milestonePosition.get(left.milestoneId) ?? 0) -
      (milestonePosition.get(right.milestoneId) ?? 0);
    if (byMilestone !== 0) return byMilestone;
    if (left.position !== right.position) return left.position - right.position;

    return left.taskId.localeCompare(right.taskId);
  });
}

export function schedule(input: ScheduleInput): ScheduleResult {
  const { plan, running, limit } = input;

  const completedMilestones = new Set(
    plan.milestones.filter((m) => m.status === 'COMPLETED').map((m) => m.milestoneId),
  );
  const completedTasks = new Set(
    plan.tasks.filter((task) => task.status === 'COMPLETED').map((task) => task.taskId),
  );
  const byId = new Map(plan.tasks.map((task) => [task.taskId, task]));

  const reachable = new Set(
    plan.milestones
      .filter((milestone) => milestone.dependsOn.every((id) => completedMilestones.has(id)))
      .map((milestone) => milestone.milestoneId),
  );

  /* Files an executor is holding: the running tasks', plus every one this batch has just claimed. */
  const claimed = new Set<string>();
  for (const taskId of running) {
    for (const file of byId.get(taskId)?.filesToEdit ?? []) claimed.add(file);
  }

  const start: ScheduleTask[] = [];
  const held: ScheduleResult['held'] = [];
  let slots = Math.max(limit - running.length, 0);

  for (const task of planOrder(plan)) {
    if (task.status !== 'PENDING') continue;
    if (running.includes(task.taskId)) continue;

    if (!reachable.has(task.milestoneId)) {
      held.push({ taskId: task.taskId, reason: 'milestone' });
      continue;
    }

    if (!task.dependsOn.every((id) => completedTasks.has(id) || !byId.has(id))) {
      held.push({ taskId: task.taskId, reason: 'dependency' });
      continue;
    }

    if (overlaps(task.filesToEdit, claimed)) {
      held.push({ taskId: task.taskId, reason: 'files' });
      continue;
    }

    if (slots === 0) {
      held.push({ taskId: task.taskId, reason: 'ceiling' });
      continue;
    }

    start.push(task);
    slots -= 1;
    for (const file of task.filesToEdit) claimed.add(file);
  }

  return { start, held };
}
