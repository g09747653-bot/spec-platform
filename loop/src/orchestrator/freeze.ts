import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

import { z } from 'zod';

import type { DockerEngine } from '../docker/engine.ts';
import { eventBus } from '../events/bus.ts';
import { executorContainerName } from '../executor/run.ts';
import { setTaskStatusOnDisk } from '../gate/blocked.ts';
import type { HandoffTaskStatus } from '../intake/handoff.ts';

/**
 * «Красный CI» — the whole orchestration stops, on disk (task 160; бандл A0 Task 3.2).
 *
 * One red acceptance verdict freezes everything: the containers are **paused, not killed**, every
 * task in flight is written `PAUSED` to disk and to the index, and no new executor starts. The
 * argument for pausing rather than killing is the operator's time — a container three minutes into
 * an iteration holds work that a kill throws away, and the reason the pipeline stopped is usually
 * one line in one file. `docker pause` keeps that work alive while a person reads the feed.
 *
 * **The freeze lives on disk, because that is what makes it survive.** The marker below is written
 * before anything else, so a `SIGKILL` half a second later still comes back to a frozen pipeline,
 * and a frozen pipeline **never resumes itself** — not on a boot, not on a `start-loop`, not on a
 * timer. The only way on is `retry`, which is a person deciding. That is the whole safety property
 * of «красный CI»: a loop that could un-freeze itself would eventually un-freeze itself over a red
 * test at three in the morning.
 *
 * The file is a record and not a switch — deleting it by hand leaves the containers paused, which
 * would be a worse state than the one it describes — and it says so, in the file, to the person most
 * likely to try.
 */

/** `handoff/FROZEN.md` — beside the plan it freezes. */
export const FROZEN_FILE = join('handoff', 'FROZEN.md');

export function frozenPath(projectDirectory: string): string {
  return join(projectDirectory, FROZEN_FILE);
}

const PausedTask = z.object({
  taskId: z.string(),
  /** What it was doing when the pipeline stopped — what `retry` puts back. */
  previousStatus: z.string(),
});

export const FreezeRecord = z.object({
  projectId: z.string(),
  at: z.string(),
  /** The task whose verdict froze the pipeline. */
  taskId: z.string(),
  /** One sentence: which check said no. */
  reason: z.string(),
  paused: z.array(PausedTask),
});

export type FreezeRecord = z.infer<typeof FreezeRecord>;

/** The machine half of the marker, fenced inside the prose so both readers get what they need. */
const FENCE = /```json\s*([\s\S]*?)```/;

export function renderFrozenFile(record: FreezeRecord): string {
  return [
    '# КОНВЕЙЕР ЗАМОРОЖЕН',
    '',
    `* **Причина:** ${record.reason}`,
    `* **Задача:** ${record.taskId}`,
    `* **Время:** ${record.at}`,
    `* **Заморожено задач:** ${String(record.paused.length)}`,
    '',
    '## Что происходит',
    '',
    'Контейнеры исполнителей приостановлены (`docker pause`), их работа цела. Новые исполнители не',
    'запускаются. Пока этот файл здесь, конвейер не возобновится сам — ни после перезапуска сервера,',
    'ни по команде `start-loop`.',
    '',
    '## Как продолжить',
    '',
    'Нажмите «Возобновить» на дашборде — или `POST /api/orchestrator/retry`. Возобновление снимает',
    'паузу с контейнеров, возвращает задачам их прежние статусы и перепроверяет красную задачу',
    'заново.',
    '',
    '**Удалять этот файл руками не нужно и не помогает:** он описание, а не выключатель. Без',
    '«Возобновить» контейнеры останутся на паузе, и конвейер пойдёт дальше мимо них.',
    '',
    '```json',
    JSON.stringify(record, null, 2),
    '```',
    '',
  ].join('\n');
}

export function readFreeze(projectDirectory: string): FreezeRecord | null {
  const path = frozenPath(projectDirectory);
  if (!existsSync(path)) return null;

  const fenced = FENCE.exec(readFileSync(path, 'utf8'));
  if (fenced?.[1] === undefined) return null;

  try {
    return FreezeRecord.parse(JSON.parse(fenced[1]));
  } catch {
    /*
     * A marker whose machine half is unreadable still froze the pipeline, and the safe reading of an
     * unreadable freeze is that it holds: `isFrozen` asks the filesystem, not this parser. What is
     * lost is only the list of statuses to restore, which `retry` then rebuilds from the index.
     */
    return null;
  }
}

/** Whether the pipeline is frozen. The file's presence is the answer — never its contents. */
export function isFrozen(projectDirectory: string): boolean {
  return existsSync(frozenPath(projectDirectory));
}

export interface FreezeRequest {
  projectId: string;
  projectDirectory: string;
  /** The task whose verdict froze everything. */
  taskId: string;
  reason: string;
  /** Tasks with a live executor at this moment, and the status each was carrying. */
  inFlight: readonly { taskId: string; previousStatus: HandoffTaskStatus }[];
  at?: string;
}

/**
 * Freezes the pipeline: marker first, statuses second, containers third.
 *
 * The order is the recovery argument. The marker is what a restart reads, so it is written before
 * anything that could fail; the statuses follow the loop's usual disk-then-index rule; the pause of
 * the containers comes last because it is the only step that talks to a daemon, and a daemon that
 * refuses must not leave a pipeline that believes it is running.
 *
 * Pausing is best-effort **per container** and deliberately so: a container that has already exited
 * cannot be paused, and one that is missing was reaped. Neither is a reason to leave the other nine
 * running.
 */
export async function freezePipeline(
  database: DatabaseSync,
  engine: DockerEngine,
  request: FreezeRequest,
): Promise<FreezeRecord> {
  const record: FreezeRecord = {
    projectId: request.projectId,
    at: request.at ?? new Date().toISOString(),
    taskId: request.taskId,
    reason: request.reason,
    paused: request.inFlight.map((task) => ({
      taskId: task.taskId,
      previousStatus: task.previousStatus,
    })),
  };

  writeFileSync(frozenPath(request.projectDirectory), renderFrozenFile(record), 'utf8');

  for (const task of request.inFlight) {
    setTaskStatusOnDisk(request.projectDirectory, task.taskId, 'PAUSED');
    database.prepare('UPDATE tasks SET status = ? WHERE task_id = ?').run('PAUSED', task.taskId);
    eventBus().publish({
      type: 'task-status',
      projectId: request.projectId,
      taskId: task.taskId,
      status: 'PAUSED',
    });
  }

  markProject(database, request.projectId, 'PAUSED');

  await Promise.all(
    request.inFlight.map(async (task) => {
      const name = executorContainerName(task.taskId);
      const id = await engine.findByName(name).catch(() => null);
      if (id === null) return;

      await engine.pauseContainer(id).catch(() => undefined);
    }),
  );

  return record;
}

/**
 * Lifts the freeze: containers first, then statuses, then the marker (task 160).
 *
 * The mirror image of the order above, for the mirror reason. The marker is deleted **last**, so a
 * crash anywhere in the middle leaves a pipeline that is still frozen — the state a person can
 * retry from — rather than one that believes it was resumed and left half its containers paused.
 *
 * `resumable` says whether the process that froze this pipeline is still the one running: when it
 * is, unpausing puts the very same iterations back on their feet and their previous statuses are
 * true again. When it is not — the server was restarted while frozen — those iterations have no
 * reader left, so their containers are reaped and their tasks go back to `PENDING` to be run again
 * from the top. Restoring `IN_PROGRESS` there would mark a task as being worked on by nobody.
 */
export async function liftFreeze(
  database: DatabaseSync,
  engine: DockerEngine,
  input: {
    projectId: string;
    projectDirectory: string;
    /** Tasks the live pipeline is still awaiting, if any process is. */
    stillAwaited: readonly string[];
    /** The red task, re-checked from the top whatever else happens. */
    recheck?: string | undefined;
  },
): Promise<{ resumed: string[]; requeued: string[] }> {
  const record = readFreeze(input.projectDirectory);
  const frozen = record?.paused ?? tasksInStatus(database, input.projectId, 'PAUSED');

  const resumed: string[] = [];
  const requeued: string[] = [];

  for (const task of frozen) {
    const live = input.stillAwaited.includes(task.taskId);
    const name = executorContainerName(task.taskId);
    const id = await engine.findByName(name).catch(() => null);

    if (live) {
      if (id !== null) await engine.unpauseContainer(id).catch(() => undefined);
      resumed.push(task.taskId);
    } else {
      /* Nobody is reading this container's output any more; the iteration starts again cleanly. */
      if (id !== null) await engine.removeContainer(id, { force: true }).catch(() => undefined);
      requeued.push(task.taskId);
    }

    const status: HandoffTaskStatus = live ? (task.previousStatus as HandoffTaskStatus) : 'PENDING';

    setTaskStatusOnDisk(input.projectDirectory, task.taskId, status);
    database.prepare('UPDATE tasks SET status = ? WHERE task_id = ?').run(status, task.taskId);
    eventBus().publish({
      type: 'task-status',
      projectId: input.projectId,
      taskId: task.taskId,
      status,
    });
  }

  const recheck = input.recheck ?? record?.taskId;
  if (recheck !== undefined && !resumed.includes(recheck)) {
    setTaskStatusOnDisk(input.projectDirectory, recheck, 'PENDING');
    database.prepare('UPDATE tasks SET status = ? WHERE task_id = ?').run('PENDING', recheck);
    eventBus().publish({
      type: 'task-status',
      projectId: input.projectId,
      taskId: recheck,
      status: 'PENDING',
    });
    if (!requeued.includes(recheck)) requeued.push(recheck);
  }

  markProject(database, input.projectId, 'ACTIVE');
  rmSync(frozenPath(input.projectDirectory), { force: true });

  return { resumed, requeued };
}

/** The project row's own status, and the dashboard told about it in the same breath. */
export function markProject(
  database: DatabaseSync,
  projectId: string,
  status: 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'FAILED',
): void {
  database.prepare('UPDATE projects SET status = ? WHERE project_id = ?').run(status, projectId);
  eventBus().publish({ type: 'project-status', projectId, status });
}

/** Tasks of a project in one status — the fallback when the marker's machine half is unreadable. */
function tasksInStatus(
  database: DatabaseSync,
  projectId: string,
  status: string,
): { taskId: string; previousStatus: string }[] {
  return database
    .prepare(
      `SELECT t.task_id FROM tasks t JOIN milestones m ON m.milestone_id = t.milestone_id
       WHERE m.project_id = ? AND t.status = ?`,
    )
    .all(projectId, status)
    .map((row) => ({
      taskId: z.object({ task_id: z.string() }).parse(row).task_id,
      previousStatus: 'PENDING',
    }));
}
