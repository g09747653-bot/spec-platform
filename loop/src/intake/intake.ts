import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

import type { Chain } from '../llm/chain.ts';
import type { Logger } from '../observability/log.ts';

import { buildAssignment } from './assignments.ts';
import {
  HANDOFF,
  importHandoff,
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
      `INSERT INTO projects (project_id, title, description, status) VALUES (?, ?, ?, 'ACTIVE')
       ON CONFLICT (project_id) DO UPDATE SET title = excluded.title`,
    )
    .run(
      projectId,
      request.projectTitle ?? projectId,
      'Импортирован из машинного бандла Spec Platform',
    );

  const say = (message: string, level: 'INFO' | 'WARN' | 'ERROR' = 'INFO') => {
    logger.write({ projectId, agentRole: 'ARCHITECT', logLevel: level, message });
  };

  say(`Принят бандл ${bundle.bundleId}: задач ${String(bundle.tasks.length)}.`);

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

  for (const task of bundle.tasks) {
    const milestone = milestoneOf.get(task.taskId);
    if (milestone === undefined) {
      throw new IntakeRefused(
        `задача ${task.taskId} не попала ни в одну веху — это дефект нарезки`,
      );
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

  mkdirSync(join(request.projectDirectory, HANDOFF.reports), { recursive: true });
  writeHandoff(request.projectDirectory, slice.milestones, tasks, projectId);

  importHandoff(database, projectId, request.projectTitle ?? projectId, slice.milestones, tasks);

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
    degradations,
  };
}
