import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

import { z } from 'zod';

import { runCycle, type CycleResult } from '../cycle/run-cycle.ts';
import type { DockerEngine } from '../docker/engine.ts';
import { eventBus } from '../events/bus.ts';
import {
  HANDOFF,
  HandoffTask,
  importHandoff,
  MilestonesFile,
  taskFileName,
} from '../intake/handoff.ts';
import type { Logger } from '../observability/log.ts';

/**
 * The orchestrator, living in the dashboard's server process (task 157/158).
 *
 * Two responsibilities, and the second is what makes the first survivable:
 *
 * - **driving** — pick the next task whose milestone is reachable, run its cycle, repeat;
 * - **recovering** — on every boot, rebuild the index from the `handoff/` tree on disk and return
 *   any task the dead process had in flight to `PENDING`.
 *
 * The recovery is not a nicety. An orchestrator that is `SIGKILL`ed mid-cycle leaves a task marked
 * `IN_PROGRESS` and a container that nobody is watching; on the next boot, the disk still holds the
 * whole plan, and the one thing the database says that is no longer true is that somebody is
 * working on that task. Repairing exactly that, from the disk, is what «the disk is the source of
 * truth and the database is an index» buys.
 *
 * The full Step-0 recovery — foreign keys, milestones, a lost `techStack` — is M16а's task 162.
 * What is here is what M15а needs: one cycle, resumable.
 */

export interface OrchestratorDeps {
  database: DatabaseSync;
  engine: DockerEngine;
  logger: Logger;
  anthropicApiKey: string;
  /**
   * Present only for a rehearsal: what the executor container runs instead of Claude Code.
   *
   * A factory rather than a fixed argv, because the scripted executor has to write a report for
   * *this* task — and the orchestrator, not the caller, is what knows which task is next.
   */
  executorCommand?: (taskId: string, projectId: string) => readonly string[];
  executorTimeoutMs?: number;
  acceptanceTimeoutMs?: number;
  model?: string | undefined;
}

export interface RecoveredProject {
  projectId: string;
  projectDirectory: string;
  milestones: number;
  tasks: number;
  /** Tasks the dead process had in flight, returned to `PENDING` by this boot. */
  resumed: string[];
}

/** Reads a project's whole handoff tree back off disk. Missing or unreadable files are skipped. */
export function readHandoffTree(projectDirectory: string): {
  milestones: MilestonesFile['milestones'];
  projectId: string;
  tasks: HandoffTask[];
} | null {
  const milestonesPath = join(projectDirectory, HANDOFF.milestones);
  if (!existsSync(milestonesPath)) return null;

  let file: MilestonesFile;
  try {
    file = MilestonesFile.parse(JSON.parse(readFileSync(milestonesPath, 'utf8')));
  } catch {
    return null;
  }

  const tasksDirectory = join(projectDirectory, HANDOFF.tasks);
  const tasks: HandoffTask[] = [];

  for (const name of readdirSync(tasksDirectory)) {
    if (!name.startsWith('task_') || !name.endsWith('.json')) continue;

    try {
      tasks.push(HandoffTask.parse(JSON.parse(readFileSync(join(tasksDirectory, name), 'utf8'))));
    } catch {
      /*
       * One unreadable assignment must not cost the whole plan. It is skipped and stays skipped —
       * the operator sees the task missing from the board, which is louder than a silent default.
       */
    }
  }

  return { milestones: file.milestones, projectId: file.projectId, tasks };
}

/**
 * Rebuilds the database from every project directory under the workspace root.
 *
 * Called at boot, before the first request is served. Deleting the SQLite file entirely is a
 * supported thing to do: everything comes back from `handoff/`.
 */
export function recoverFromDisk(
  database: DatabaseSync,
  workspaceRoot: string,
  logger?: Logger,
): RecoveredProject[] {
  if (!existsSync(workspaceRoot)) return [];

  const recovered: RecoveredProject[] = [];

  for (const entry of readdirSync(workspaceRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const projectDirectory = join(workspaceRoot, entry.name);
    const tree = readHandoffTree(projectDirectory);
    if (tree === null) continue;

    importHandoff(
      database,
      tree.projectId,
      entry.name,
      tree.milestones.map((milestone) => ({ ...milestone, taskIds: [] })),
      tree.tasks,
    );

    /*
     * Anything the dead process had in flight. `IN_PROGRESS` after a boot is a claim about a
     * process that no longer exists — the task is simply pending again, and its container, if one
     * outlived the orchestrator, is reaped by name the next time it is started.
     */
    const resumed = tree.tasks
      .filter((task) => task.status === 'IN_PROGRESS')
      .map((task) => task.taskId);

    for (const taskId of resumed) {
      database.prepare("UPDATE tasks SET status = 'PENDING' WHERE task_id = ?").run(taskId);
      setStatusOnDisk(projectDirectory, taskId, 'PENDING');
    }

    recovered.push({
      projectId: tree.projectId,
      projectDirectory,
      milestones: tree.milestones.length,
      tasks: tree.tasks.length,
      resumed,
    });

    logger?.write({
      projectId: tree.projectId,
      agentRole: 'ORCHESTRATOR',
      logLevel: resumed.length === 0 ? 'INFO' : 'WARN',
      message:
        `Состояние восстановлено с диска: вех ${String(tree.milestones.length)}, ` +
        `задач ${String(tree.tasks.length)}` +
        (resumed.length === 0
          ? '. Незавершённых итераций не было.'
          : `. Возобновлены после обрыва: ${resumed.join(', ')}.`),
    });
  }

  return recovered;
}

function setStatusOnDisk(
  projectDirectory: string,
  taskId: string,
  status: HandoffTask['status'],
): void {
  const path = join(projectDirectory, HANDOFF.tasks, taskFileName(taskId));
  if (!existsSync(path)) return;

  const task = HandoffTask.parse(JSON.parse(readFileSync(path, 'utf8')));

  writeFileSync(
    path,
    `${JSON.stringify(HandoffTask.parse({ ...task, status }), null, 2)}\n`,
    'utf8',
  );
}

const Row = z.object({ task_id: z.string(), milestone_id: z.string() });

/** A column that cannot be read is no dependencies — the same rule the dashboard's reader uses. */
function parseDependsOn(value: string | null): string[] {
  try {
    return z.array(z.string()).parse(JSON.parse(value ?? '[]'));
  } catch {
    return [];
  }
}

/**
 * The next task that may run: `PENDING`, and in a milestone whose dependencies are all complete.
 *
 * The milestone graph is what the slicing computed, so nothing here re-derives an order — it reads
 * the one the intake already decided and asks whether this milestone's turn has come.
 */
export function nextRunnableTask(
  database: DatabaseSync,
  projectId: string,
): { taskId: string; milestoneId: string } | null {
  const completedMilestones = new Set(
    database
      .prepare("SELECT milestone_id FROM milestones WHERE project_id = ? AND status = 'COMPLETED'")
      .all(projectId)
      .map((row) => z.object({ milestone_id: z.string() }).parse(row).milestone_id),
  );

  const dependencies = new Map<string, string[]>();
  for (const row of database
    .prepare('SELECT milestone_id, depends_on FROM milestones WHERE project_id = ?')
    .all(projectId)) {
    const parsed = z
      .object({ milestone_id: z.string(), depends_on: z.string().nullable() })
      .parse(row);

    dependencies.set(parsed.milestone_id, parseDependsOn(parsed.depends_on));
  }

  const rows = database
    .prepare(
      `SELECT t.task_id, t.milestone_id
       FROM tasks t JOIN milestones m ON m.milestone_id = t.milestone_id
       WHERE m.project_id = ? AND t.status = 'PENDING'
       ORDER BY m.position, t.position, t.task_id`,
    )
    .all(projectId)
    .map((row) => Row.parse(row));

  for (const row of rows) {
    const waiting = dependencies.get(row.milestone_id) ?? [];
    if (waiting.every((milestone) => completedMilestones.has(milestone))) {
      return { taskId: row.task_id, milestoneId: row.milestone_id };
    }
  }

  return null;
}

/** A milestone is complete when every task in it is. */
export function refreshMilestoneStatus(database: DatabaseSync, milestoneId: string): void {
  const counts = z
    .object({ total: z.coerce.number(), done: z.coerce.number(), running: z.coerce.number() })
    .parse(
      database
        .prepare(
          `SELECT count(*) AS total,
                  sum(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS done,
                  sum(CASE WHEN status IN ('IN_PROGRESS') THEN 1 ELSE 0 END) AS running
           FROM tasks WHERE milestone_id = ?`,
        )
        .get(milestoneId) ?? { total: 0, done: 0, running: 0 },
    );

  const status =
    counts.total > 0 && counts.done === counts.total
      ? 'COMPLETED'
      : counts.running > 0 || counts.done > 0
        ? 'IN_PROGRESS'
        : 'PENDING';

  database
    .prepare('UPDATE milestones SET status = ? WHERE milestone_id = ?')
    .run(status, milestoneId);

  const owner = database
    .prepare('SELECT project_id FROM milestones WHERE milestone_id = ?')
    .get(milestoneId);

  if (owner !== undefined) {
    eventBus().publish({
      type: 'milestone-status',
      projectId: z.object({ project_id: z.string() }).parse(owner).project_id,
      milestoneId,
      status,
    });
  }
}

/**
 * Runs cycles until nothing is runnable, or until `maxCycles` have run.
 *
 * `maxCycles` is a backstop, not a working limit — the same shape as the platform's autonomous
 * driver: a loop that cannot end is a defect, not a long run, and a reached ceiling is itself a
 * finding for the journal.
 */
export async function driveProject(
  projectId: string,
  projectDirectory: string,
  deps: OrchestratorDeps,
  maxCycles: number | undefined = 100,
): Promise<CycleResult[]> {
  const results: CycleResult[] = [];

  for (let cycles = 0; cycles < maxCycles; cycles += 1) {
    const next = nextRunnableTask(deps.database, projectId);
    if (next === null) break;

    const { executorCommand, ...rest } = deps;

    const result = await runCycle(
      { projectId, taskId: next.taskId, projectDirectory },
      {
        ...rest,
        ...(executorCommand === undefined
          ? {}
          : { executorCommand: executorCommand(next.taskId, projectId) }),
      },
    );
    results.push(result);
    refreshMilestoneStatus(deps.database, next.milestoneId);

    // A block or a failure stops the pipeline: the loop never walks past a red task (бандл A0).
    if (result.outcome !== 'COMPLETED') break;
  }

  return results;
}
