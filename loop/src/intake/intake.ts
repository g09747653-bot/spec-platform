import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

import type { Chain } from '../llm/chain.ts';
import type { Logger } from '../observability/log.ts';

import { buildAssignment } from './assignments.ts';
import {
  HANDOFF,
  importHandoff,
  readTaskFile,
  taskFileName,
  writeHandoff,
  type HandoffTask,
  type TechStack,
} from './handoff.ts';
import { describeSlice, sliceMilestones } from './milestones.ts';
import { readBundle, type Bundle } from './validate.ts';

/**
 * Taking a bundle in and turning it into a runnable plan (task 156).
 *
 * The whole movement in one function, in the order that makes it recoverable: validate, slice
 * (code, not model), write the assignments to disk, then index them in the database. Disk before
 * database, always — a database row referring to an assignment nobody wrote is a plan the loop
 * cannot recover from, while an assignment on disk that the database has not seen yet is repaired
 * by the next import.
 */

export class IntakeRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IntakeRefused';
  }
}

export interface IntakeRequest {
  /** `<WORKSPACE_ROOT_PATH>/<projectId>` — where `bundle/` sits and `handoff/` will. */
  projectDirectory: string;
  projectTitle?: string;
  techStack?: TechStack;
  /**
   * Throw the handoff tree away and write it again from scratch (task 172).
   *
   * The operator's explicit act, never a resume's side effect: it costs a model call per task and it
   * replaces the brief every executor is working from. Refused outright while any task is in
   * progress or frozen — rewriting the assignment under a running container is how a report comes
   * back describing work nobody asked for.
   */
  regenerate?: boolean;
}

export interface IntakeDeps {
  database: DatabaseSync;
  logger: Logger;
  /** Absent means «no provider configured»; the assignments are then written deterministically. */
  chain: Chain | null;
}

export interface IntakeResult {
  projectId: string;
  bundleId: string;
  strategy: 'dependencies' | 'phases';
  milestones: number;
  tasks: HandoffTask[];
  /** How many assignments the model wrote, and how many fell back to the bundle's own text. */
  writtenByModel: number;
  /** Assignments already on disk, kept verbatim and never sent to a model (task 172). */
  keptFromDisk: number;
  /** True when this intake threw the previous tree away first. */
  regenerated: boolean;
  degradations: string[];
}

/** Marker files the tech-stack guess reads. The gate's own detection (task 157) refines it. */
function guessTechStack(projectDirectory: string): TechStack {
  const has = (name: string) => existsSync(join(projectDirectory, name));

  if (has('package.json')) return 'nodejs';
  if (has('requirements.txt') || has('pyproject.toml')) return 'python';
  if (has('go.mod')) return 'go';
  if (has('Cargo.toml')) return 'rust';
  return 'generic';
}

export async function intakeBundle(
  request: IntakeRequest,
  deps: IntakeDeps,
): Promise<IntakeResult> {
  const { database, logger, chain } = deps;

  const bundle: Bundle = readBundle(join(request.projectDirectory, 'bundle'));
  const projectId = bundle.projectId;

  /*
   * The project row exists before the first log line, because `agent_logs` has a foreign key to it
   * — and a loop whose first act is «report what I am doing» must be able to.
   */
  database
    .prepare(
      `INSERT INTO projects (project_id, title, description, status, workspace_dir)
       VALUES (?, ?, ?, 'ACTIVE', ?)
       ON CONFLICT (project_id) DO UPDATE SET
         title = excluded.title,
         workspace_dir = COALESCE(excluded.workspace_dir, projects.workspace_dir)`,
    )
    .run(
      projectId,
      request.projectTitle ?? projectId,
      'Импортирован из машинного бандла Spec Platform',
      /*
       * **Absolute, always** (task 160). The column is read back by an endpoint that resolves paths
       * against `WORKSPACE_ROOT_PATH`, so a relative value stored here would be joined to the root a
       * second time and point at a directory that does not exist. Whoever calls the intake may say
       * it either way; what is written down has one meaning.
       */
      resolve(request.projectDirectory),
    );

  const say = (message: string, level: 'INFO' | 'WARN' | 'ERROR' = 'INFO') => {
    logger.write({ projectId, agentRole: 'ARCHITECT', logLevel: level, message });
  };

  say(`Принят бандл ${bundle.bundleId}: задач ${String(bundle.tasks.length)}.`);

  if (request.regenerate === true) {
    const wiped = wipeHandoffTree(request.projectDirectory);
    say(
      `Полная перегенерация по явной команде оператора: снесено заданий ${String(wiped)}, ` +
        'отчёты удалены вместе с ними. Задания будут написаны заново.',
      'WARN',
    );
  }

  const slice = sliceMilestones(bundle.tasks);
  say(describeSlice(slice), slice.ok ? 'INFO' : 'ERROR');

  if (!slice.ok) throw new IntakeRefused(describeSlice(slice));

  const techStack = request.techStack ?? guessTechStack(request.projectDirectory);
  const milestoneOf = new Map<string, (typeof slice.milestones)[number]>();
  for (const milestone of slice.milestones) {
    for (const taskId of milestone.taskIds) milestoneOf.set(taskId, milestone);
  }

  const tasks: HandoffTask[] = [];
  const degradations: string[] = [];
  let writtenByModel = 0;
  let keptFromDisk = 0;

  for (const task of bundle.tasks) {
    const milestone = milestoneOf.get(task.taskId);
    if (milestone === undefined) {
      throw new IntakeRefused(
        `задача ${task.taskId} не попала ни в одну веху — это дефект нарезки`,
      );
    }

    /*
     * **An assignment that already exists is not written again** (task 172).
     *
     * Not merely because rewriting it costs a model call per task on every resume — though it does,
     * and the M15а gate spent a free tier discovering that — but because the file is what an executor
     * may already be working from. `writeHandoff` keeps its prose whatever arrives here; skipping the
     * call is the same rule applied one step earlier, where it also saves the money.
     */
    const onDisk = readTaskFile(
      join(request.projectDirectory, HANDOFF.tasks, taskFileName(task.taskId)),
    );

    if (onDisk !== null) {
      tasks.push(onDisk);
      keptFromDisk += 1;
      continue;
    }

    const built = await buildAssignment(
      task,
      milestone,
      { architecture: bundle.architecture, techStack },
      chain,
    );

    tasks.push(built.task);

    if (built.writtenBy === null) {
      const reason = built.degradedBecause ?? 'причина не названа';
      degradations.push(`${task.taskId}: ${reason}`);
      say(`Задание ${task.taskId} написано без модели (${reason}).`, 'WARN');
    } else {
      writtenByModel += 1;
      say(`Задание ${task.taskId} написано провайдером ${built.writtenBy}.`);
    }
  }

  if (keptFromDisk > 0) {
    say(
      `Заданий сохранено с диска без изменений: ${String(keptFromDisk)} — ` +
        'по ним исполнитель уже мог начать работу, и модель их не переписывает.',
    );
  }

  mkdirSync(join(request.projectDirectory, HANDOFF.reports), { recursive: true });
  writeHandoff(request.projectDirectory, slice.milestones, tasks, projectId);

  importHandoff(
    database,
    projectId,
    request.projectTitle ?? projectId,
    slice.milestones,
    tasks,
    resolve(request.projectDirectory),
  );

  say(
    `Handoff записан: вех ${String(slice.milestones.length)}, заданий ${String(tasks.length)}, ` +
      `стек ${techStack}. Диск — источник правды, база — индекс.`,
  );

  return {
    projectId,
    bundleId: bundle.bundleId,
    strategy: slice.strategy,
    milestones: slice.milestones.length,
    tasks,
    writtenByModel,
    keptFromDisk,
    regenerated: request.regenerate === true,
    degradations,
  };
}

/** Statuses that mean somebody is holding this task right now. */
const IN_HAND: readonly HandoffTask['status'][] = ['IN_PROGRESS', 'PAUSED'];

/**
 * Throws the handoff tree away, or refuses to (task 172).
 *
 * Refusal comes first and is absolute: an assignment rewritten under a running executor is a
 * container working from one brief while the orchestrator judges it against another. `PAUSED` counts
 * as in hand for the same reason — a frozen task is one somebody intends to resume (task 160).
 *
 * Reports go with the assignments. A report describes a brief; kept beside a regenerated one it
 * would describe a brief that no longer exists, which is worse than no report at all.
 */
function wipeHandoffTree(projectDirectory: string): number {
  const tasksDirectory = join(projectDirectory, HANDOFF.tasks);
  if (!existsSync(tasksDirectory)) return 0;

  const names = readdirSync(tasksDirectory).filter(
    (name) => name.startsWith('task_') && name.endsWith('.json'),
  );

  const held = names
    .map((name) => readTaskFile(join(tasksDirectory, name)))
    .filter((task): task is HandoffTask => task !== null && IN_HAND.includes(task.status));

  if (held.length > 0) {
    throw new IntakeRefused(
      'полная перегенерация отказана: в работе ' +
        `${String(held.length)} задач(и) — ${held.map((task) => task.taskId).join(', ')}. ` +
        'Дождитесь их завершения или снимите их вручную.',
    );
  }

  for (const name of names) rmSync(join(tasksDirectory, name), { force: true });
  rmSync(join(projectDirectory, HANDOFF.milestones), { force: true });
  rmSync(join(projectDirectory, HANDOFF.reports), { recursive: true, force: true });

  return names.length;
}
