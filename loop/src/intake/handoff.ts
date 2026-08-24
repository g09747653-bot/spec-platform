import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
  /**
   * The iteration ceiling for **this** task, in seconds (task 174; А-26 §2).
   *
   * Optional and additive — the compatibility contract of D-223: every assignment written before
   * this field existed parses exactly as it did. Absent means the default ceiling
   * (`ITERATION_TIMEOUT_MS`); present, it is the mark an assignment architect or an operator puts
   * on a task known to be heavy. Bounded above because the ceiling is a back stop, and a field
   * that could push it out indefinitely would repeal the one property the wrapper exists for —
   * a wall clock the container cannot argue with.
   */
  iterationTimeoutSec: z.number().int().positive().max(7_200).optional(),
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

    writeFileSync(path, serialize(mergeWithDisk(readTaskFile(path), task)), 'utf8');
    return path;
  });

  return { projectDirectory, milestonesPath, taskPaths };
}

/** The assignment already on disk, or null when it is new or unreadable. */
export function readTaskFile(path: string): HandoffTask | null {
  if (!existsSync(path)) return null;

  try {
    return HandoffTask.parse(JSON.parse(readFileSync(path, 'utf8')));
  } catch {
    return null;
  }
}

/**
 * **A re-intake refreshes the plan; it never rewrites the work** (task 172; расширение D-261).
 *
 * Intake is deliberately idempotent — it runs again on every resume — and the question is what
 * «idempotent» means for a file an executor may already be working from. The answer splits the
 * assignment along the line `assignments.ts` already draws between what is *decided* and what is
 * *written*:
 *
 * - **Written** — `title`, `description`, `filesToEdit`, the two test commands, and the `techStack`
 *   the gate may have corrected on disk. Kept exactly as they stand. A resume that re-asked the
 *   model would replace the brief an executor is holding with whatever the model says this minute —
 *   or, once a free tier is spent, with the deterministic fallback, which is a *worse* assignment
 *   than the one already there. D-261 closed this for `status`; the prose is the same defect wearing
 *   a longer word.
 * - **Decided** — `milestoneId`, `dependsOn`, `expectedArtifacts`, and `status`. Refreshed from the
 *   new plan, because the slicing is code and the bundle may legitimately have re-sliced; `status`
 *   is the one exception in the other direction and always comes off the disk (D-261).
 *
 * A field the disk does not carry is *filled in* rather than left empty — an assignment that gained
 * a unit-test command since the last intake gets it.
 *
 * Rewriting the prose on purpose is still possible and is a different act: it wipes the whole tree
 * and starts over (`regenerate` on the intake), which refuses while a task is in progress.
 */
export function mergeWithDisk(existing: HandoffTask | null, fresh: HandoffTask): HandoffTask {
  if (existing === null) return HandoffTask.parse(fresh);

  return HandoffTask.parse({
    ...fresh,
    title: existing.title,
    description: existing.description,
    filesToEdit: existing.filesToEdit,
    techStack: existing.techStack,
    status: existing.status,
    ...(existing.unitTestCmd === undefined ? {} : { unitTestCmd: existing.unitTestCmd }),
    ...(existing.e2eTestCmd === undefined ? {} : { e2eTestCmd: existing.e2eTestCmd }),
    /* An operator's mark on a heavy task survives a re-intake for the same reason the prose does. */
    ...(existing.iterationTimeoutSec === undefined
      ? {}
      : { iterationTimeoutSec: existing.iterationTimeoutSec }),
  });
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
  /** Where this project's files are. Recorded so the dashboard can name it back (task 160). */
  workspaceDir?: string,
): void {
  database.exec('BEGIN');

  try {
    // Step 0 — the project row, before anything that references it.
    database
      .prepare(
        `INSERT INTO projects (project_id, title, description, status, workspace_dir)
         VALUES (?, ?, ?, 'ACTIVE', ?)
         ON CONFLICT (project_id) DO UPDATE SET
           title = excluded.title,
           /* A directory the caller did not name must not erase the one already recorded. */
           workspace_dir = COALESCE(excluded.workspace_dir, projects.workspace_dir)`,
      )
      .run(
        projectId,
        projectTitle,
        'Импортирован из машинного бандла Spec Platform',
        workspaceDir ?? null,
      );

    // Step 1 — the milestones.
    /*
     * Конфликт разрешается по СОСТАВНОМУ ключу (А-38 п.3): веха принадлежит проекту, и одинаковый
     * `ms_01` двух проектов — две разные вехи, а не одна переписанная (D-324).
     */
    const milestone = database.prepare(
      `INSERT INTO milestones (milestone_id, project_id, title, description, depends_on, position, status)
       VALUES (?, ?, ?, ?, ?, ?, 'PENDING')
       ON CONFLICT (project_id, milestone_id) DO UPDATE SET
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
    /*
     * То же и для задач, и здесь это стоило дороже (D-325): `ON CONFLICT` намеренно не трогает
     * `status` — статус живёт на диске (D-261), — поэтому перехваченная строка отдавала новому плану
     * ЧУЖОЙ статус. Составной ключ снимает саму возможность перехвата.
     */
    const task = database.prepare(
      `INSERT INTO tasks (project_id, task_id, milestone_id, title, description, tech_stack,
                          files_to_edit, unit_test_cmd, e2e_test_cmd, expected_artifacts,
                          depends_on, position, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (project_id, task_id) DO UPDATE SET
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
        projectId,
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
