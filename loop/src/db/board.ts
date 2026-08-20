import type { DatabaseSync } from 'node:sqlite';

import { z } from 'zod';

/**
 * What the dashboard reads (task 153).
 *
 * One project, its milestones in order, their tasks in order, and the counts an operator scans for.
 * Read-only and parsed at the boundary; nothing here writes, because the dashboard watches the loop
 * rather than driving it.
 */

export const PROJECT_STATUSES = ['ACTIVE', 'PAUSED', 'COMPLETED', 'FAILED'] as const;
export const MILESTONE_STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED'] as const;
export const TASK_STATUSES = [
  'PENDING',
  'IN_PROGRESS',
  'COMPLETED',
  'FAILED',
  'BLOCKED',
  'PAUSED',
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];
export type TaskStatus = (typeof TASK_STATUSES)[number];

const ProjectRow = z.object({
  project_id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  status: z.enum(PROJECT_STATUSES),
  created_at: z.string(),
});

const MilestoneRow = z.object({
  milestone_id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  depends_on: z.string().nullable(),
  position: z.coerce.number().int(),
  status: z.enum(MILESTONE_STATUSES),
});

const TaskRow = z.object({
  task_id: z.string(),
  milestone_id: z.string(),
  title: z.string(),
  tech_stack: z.string(),
  depends_on: z.string().nullable(),
  position: z.coerce.number().int(),
  status: z.enum(TASK_STATUSES),
});

export interface BoardTask {
  taskId: string;
  milestoneId: string;
  title: string;
  techStack: string;
  dependsOn: string[];
  status: TaskStatus;
}

export interface BoardMilestone {
  milestoneId: string;
  title: string;
  description: string | null;
  dependsOn: string[];
  status: MilestoneStatus;
  tasks: BoardTask[];
}

export interface Board {
  projectId: string;
  title: string;
  description: string | null;
  status: ProjectStatus;
  createdAt: string;
  milestones: BoardMilestone[];
}

/** `depends_on` is a JSON array on disk. A column that cannot be read is an empty list, not a crash. */
function parseDependsOn(value: string | null): string[] {
  if (value === null || value.trim() === '') return [];

  try {
    return z.array(z.string()).parse(JSON.parse(value));
  } catch {
    return [];
  }
}

/** Every project the loop knows, newest first. The dashboard opens on the most recent one. */
export function listProjects(database: DatabaseSync): { projectId: string; title: string }[] {
  return database
    .prepare('SELECT project_id, title FROM projects ORDER BY created_at DESC, project_id')
    .all()
    .map((row) => {
      const parsed = z.object({ project_id: z.string(), title: z.string() }).parse(row);
      return { projectId: parsed.project_id, title: parsed.title };
    });
}

export function readBoard(database: DatabaseSync, projectId: string): Board | null {
  const projectRow = database
    .prepare(
      'SELECT project_id, title, description, status, created_at FROM projects WHERE project_id = ?',
    )
    .get(projectId);

  if (projectRow === undefined) return null;
  const project = ProjectRow.parse(projectRow);

  const milestones = database
    .prepare(
      `SELECT milestone_id, title, description, depends_on, position, status
       FROM milestones WHERE project_id = ? ORDER BY position, milestone_id`,
    )
    .all(projectId)
    .map((row) => MilestoneRow.parse(row));

  const tasks = database
    .prepare(
      `SELECT t.task_id, t.milestone_id, t.title, t.tech_stack, t.depends_on, t.position, t.status
       FROM tasks t
       JOIN milestones m ON m.milestone_id = t.milestone_id
       WHERE m.project_id = ?
       ORDER BY t.position, t.task_id`,
    )
    .all(projectId)
    .map((row) => TaskRow.parse(row));

  return {
    projectId: project.project_id,
    title: project.title,
    description: project.description,
    status: project.status,
    createdAt: project.created_at,
    milestones: milestones.map((milestone) => ({
      milestoneId: milestone.milestone_id,
      title: milestone.title,
      description: milestone.description,
      dependsOn: parseDependsOn(milestone.depends_on),
      status: milestone.status,
      tasks: tasks
        .filter((task) => task.milestone_id === milestone.milestone_id)
        .map((task) => ({
          taskId: task.task_id,
          milestoneId: task.milestone_id,
          title: task.title,
          techStack: task.tech_stack,
          dependsOn: parseDependsOn(task.depends_on),
          status: task.status,
        })),
    })),
  };
}

/** The counts the header shows: how much of the plan is done, and how much is stuck. */
export function summarise(board: Board): Record<TaskStatus, number> & { total: number } {
  const counts = Object.fromEntries(TASK_STATUSES.map((status) => [status, 0])) as Record<
    TaskStatus,
    number
  >;
  let total = 0;

  for (const milestone of board.milestones) {
    for (const task of milestone.tasks) {
      counts[task.status] += 1;
      total += 1;
    }
  }

  return { ...counts, total };
}
