import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

import { z } from 'zod';

import type { SlicedMilestone } from './milestones.ts';

/**
 * The handoff tree on disk, and the index of it in SQLite (task 156).
 *
 * **The disk is the source of truth and the database is an index of it** — the milestone's brief
 * states this as the thing that distinguishes the loop from «a script with a database». Everything
 * written here can be read back and re-imported; deleting the SQLite file loses nothing but speed.
 * That is also why the import order below is A0's three steps and not one convenient upsert: the
 * project row before the milestones, the milestones before the tasks, so a rebuilt database never
 * meets `FOREIGN KEY constraint failed`.
 */

export const HANDOFF = Object.freeze({
  tasks: join('handoff', 'tasks'),
  reports: join('handoff', 'reports'),
  milestones: join('handoff', 'tasks', 'milestones.json'),
} as const);

export const TECH_STACKS = ['nodejs', 'python', 'go', 'rust', 'generic'] as const;
export type TechStack = (typeof TECH_STACKS)[number];

export const HANDOFF_TASK_STATUSES = [
  'PENDING',
  'IN_PROGRESS',
  'COMPLETED',
  'FAILED',
  'BLOCKED',
  'PAUSED',
] as const;

export type HandoffTaskStatus = (typeof HANDOFF_TASK_STATUSES)[number];

export const ExpectedArtifact = z.object({
  path: z.string(),
  validationCmd: z.string(),
  validationArgs: z.array(z.string()),
  successRegex: z.string(),
});

/**
 * A handoff assignment, exactly the shape of A0's `task_schema.json`.
 *
 * Declared as a Zod schema rather than an interface because it is written to disk and read back by
 * a different process later — including after a crash, from a file an executor may have rewritten.
 * Parsing it on the way back in is the only way «the disk is the source of truth» is safe.
 */
export const HandoffTask = z.object({
  taskId: z.string().min(1),
  milestoneId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  techStack: z.enum(TECH_STACKS),
  /** Required by the contract — present always, even when the intake could only guess it empty. */
  filesToEdit: z.array(z.string()),
  /**
   * The dependencies the bundle stated, carried onto the assignment.
   *
   * An addition to A0's `task_schema.json`, which records dependencies only between milestones. It
   * is here because the disk is the source of truth: a database rebuilt from `handoff/` has to come
   * back with the plan's ordering argument intact, and a field that lives only in SQLite is a field
   * the recovery loses. Additive, so a reader of the A0 schema is unaffected.
   */
  dependsOn: z.array(z.string()).default([]),
  unitTestCmd: z.string().optional(),
  e2eTestCmd: z.string().optional(),
  expectedArtifacts: z.array(ExpectedArtifact),
  status: z.enum(HANDOFF_TASK_STATUSES),
});

export type HandoffTask = z.infer<typeof HandoffTask>;

export const MilestonesFile = z.object({
  projectId: z.string().min(1),
  milestones: z.array(
    z.object({
      milestoneId: z.string().min(1),
      title: z.string().min(1),
      description: z.string(),
      dependsOn: z.array(z.string()),
    }),
  ),
});

export type MilestonesFile = z.infer<typeof MilestonesFile>;

/** `task_<taskId>.json` — the name the executor is pointed at and the watcher looks for. */
export function taskFileName(taskId: string): string {
  return `task_${taskId}.json`;
}

/** Stable bytes: sorted keys are not needed, but a trailing newline and two spaces are the house style. */
const serialize = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`;

export interface WrittenHandoff {
  projectDirectory: string;
  milestonesPath: string;
  taskPaths: string[];
}

/**
 * Writes the whole tree. Directories first, then `milestones.json`, then one file per task.
 *
 * Order matters here for the same reason it matters in the database: a `task_*.json` naming a
 * milestone that has not been written yet is a tree that cannot be recovered from.
 */
export function writeHandoff(
  projectDirectory: string,
  milestones: readonly SlicedMilestone[],
  tasks: readonly HandoffTask[],
  projectId: string,
): WrittenHandoff {
  mkdirSync(join(projectDirectory, HANDOFF.tasks), { recursive: true });
  mkdirSync(join(projectDirectory, HANDOFF.reports), { recursive: true });

  const milestonesPath = join(projectDirectory, HANDOFF.milestones);
  const file: MilestonesFile = {
    projectId,
    milestones: milestones.map((milestone) => ({
      milestoneId: milestone.milestoneId,
      title: milestone.title,
      description: milestone.description,
      dependsOn: milestone.dependsOn,
    })),
  };

  writeFileSync(milestonesPath, serialize(MilestonesFile.parse(file)), 'utf8');

  const taskPaths = tasks.map((task) => {
    const path = join(projectDirectory, HANDOFF.tasks, taskFileName(task.taskId));
    writeFileSync(path, serialize(HandoffTask.parse(task)), 'utf8');
    return path;
  });

  return { projectDirectory, milestonesPath, taskPaths };
}

/**
 * Imports the tree into SQLite — A0's Step 0, Step 1, Step 2, in that order.
 *
 * `INSERT … ON CONFLICT DO UPDATE` throughout, because this runs on every intake **and** on every
 * recovery, and the second one must be a no-op rather than a constraint violation.
 */
export function importHandoff(
  database: DatabaseSync,
  projectId: string,
  projectTitle: string,
  milestones: readonly SlicedMilestone[],
  tasks: readonly HandoffTask[],
): void {
  database.exec('BEGIN');

  try {
    // Step 0 — the project row, before anything that references it.
    database
      .prepare(
        `INSERT INTO projects (project_id, title, description, status)
         VALUES (?, ?, ?, 'ACTIVE')
         ON CONFLICT (project_id) DO UPDATE SET title = excluded.title`,
      )
      .run(projectId, projectTitle, 'Импортирован из машинного бандла Spec Platform');

    // Step 1 — the milestones.
    const milestone = database.prepare(
      `INSERT INTO milestones (milestone_id, project_id, title, description, depends_on, position, status)
       VALUES (?, ?, ?, ?, ?, ?, 'PENDING')
       ON CONFLICT (milestone_id) DO UPDATE SET
         title = excluded.title, description = excluded.description,
         depends_on = excluded.depends_on, position = excluded.position`,
    );

    for (const [position, entry] of milestones.entries()) {
      milestone.run(
        entry.milestoneId,
        projectId,
        entry.title,
        entry.description,
        JSON.stringify(entry.dependsOn),
        position,
      );
    }

    // Step 2 — the tasks, only once their milestones exist.
    const task = database.prepare(
      `INSERT INTO tasks (task_id, milestone_id, title, description, tech_stack, files_to_edit,
                          unit_test_cmd, e2e_test_cmd, expected_artifacts, depends_on, position, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (task_id) DO UPDATE SET
         milestone_id = excluded.milestone_id, title = excluded.title,
         description = excluded.description, tech_stack = excluded.tech_stack,
         files_to_edit = excluded.files_to_edit, unit_test_cmd = excluded.unit_test_cmd,
         e2e_test_cmd = excluded.e2e_test_cmd, expected_artifacts = excluded.expected_artifacts,
         depends_on = excluded.depends_on, position = excluded.position`,
    );

    const positionOf = new Map<string, number>();
    for (const entry of milestones) {
      for (const [index, taskId] of entry.taskIds.entries()) positionOf.set(taskId, index);
    }

    for (const entry of tasks) {
      task.run(
        entry.taskId,
        entry.milestoneId,
        entry.title,
        entry.description,
        entry.techStack,
        JSON.stringify(entry.filesToEdit),
        entry.unitTestCmd ?? null,
        entry.e2eTestCmd ?? null,
        JSON.stringify(entry.expectedArtifacts),
        JSON.stringify(entry.dependsOn),
        positionOf.get(entry.taskId) ?? 0,
        entry.status,
      );
    }

    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}
