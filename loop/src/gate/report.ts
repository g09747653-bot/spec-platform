import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

import { z } from 'zod';

import { HANDOFF } from '../intake/handoff.ts';

/**
 * The executor's report (task 157; бандл A0 §Схема отчёта).
 *
 * **It is information for the feed, never a verdict.** The gate's decision comes from an
 * independent rerun in a clean container and from nowhere else — this file exists so the loop can
 * read what the executor *claims*, record the reasoning it offered, and put both in front of the
 * operator. A report saying `SUCCESS` moves nothing on its own.
 */

export const REPORT_STATUSES = ['SUCCESS', 'FAILED', 'BLOCKED'] as const;

export const ExecutorReport = z.object({
  reportId: z.string().min(1),
  taskId: z.string().min(1),
  projectId: z.string().min(1),
  executorId: z.string().min(1),
  status: z.enum(REPORT_STATUSES),
  testsRun: z
    .object({
      total: z.number().int().nonnegative(),
      passed: z.number().int().nonnegative(),
      failed: z.number().int().nonnegative(),
    })
    .optional(),
  errors: z.array(z.string()).optional(),
  blockReason: z.string().optional(),
  decisionId: z.string().optional(),
  decisionTitle: z.string().optional(),
  rationale: z.string().optional(),
});

export type ExecutorReport = z.infer<typeof ExecutorReport>;

export function reportFileName(taskId: string): string {
  return `report_${taskId}.json`;
}

export function reportPath(projectDirectory: string, taskId: string): string {
  return join(projectDirectory, HANDOFF.reports, reportFileName(taskId));
}

export type ReportRead =
  | { ok: true; report: ExecutorReport }
  | { ok: false; reason: 'missing' }
  | { ok: false; reason: 'malformed'; detail: string };

/**
 * Reads the report an executor left behind.
 *
 * A missing report is not the same failure as a malformed one, and the loop treats them
 * differently: the first says the executor never got that far, the second says it did and wrote
 * something nobody can read. Both are reported, neither throws — an unreadable report must not take
 * the pipeline down, because the gate does not need it to decide.
 */
export function readReport(projectDirectory: string, taskId: string): ReportRead {
  const path = reportPath(projectDirectory, taskId);
  if (!existsSync(path)) return { ok: false, reason: 'missing' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    return { ok: false, reason: 'malformed', detail: `не разбирается как JSON: ${String(error)}` };
  }

  const validated = ExecutorReport.safeParse(parsed);
  if (!validated.success) {
    return { ok: false, reason: 'malformed', detail: z.prettifyError(validated.error) };
  }

  return { ok: true, report: validated.data };
}

/**
 * Who this report is actually about — the orchestrator's own answer, not the report's.
 *
 * The loop knows which task it started and in which project; the report is a file a model wrote
 * inside a container. See `recordDecision`.
 */
export interface ReportOwner {
  projectId: string;
  taskId: string;
}

/**
 * The identifier a decision is stored under.
 *
 * A report may name one; when it does not, it is derived — MD5 of `taskId` and the decision's
 * title, hex, lower case, exactly as the A0 solution specifies. Derived rather than random because
 * the same decision re-read from the same report has to land on the same row: `INSERT OR REPLACE`
 * is only idempotent if the key is. The `taskId` in that hash is the **owner's**, for the same
 * reason the columns are.
 */
export function decisionId(report: ExecutorReport, owner: ReportOwner): string | null {
  if (report.decisionId !== undefined && report.decisionId.trim() !== '') return report.decisionId;
  if (report.decisionTitle === undefined || report.decisionTitle.trim() === '') return null;

  return createHash('md5')
    .update(`${owner.taskId}${report.decisionTitle}`, 'utf8')
    .digest('hex')
    .toLowerCase();
}

/** Whether the report agrees with the orchestrator about which task and project it belongs to. */
export function disagreesAboutOwner(report: ExecutorReport, owner: ReportOwner): boolean {
  return report.taskId !== owner.taskId || report.projectId !== owner.projectId;
}

/**
 * Records the executor's reasoning, if it offered any.
 *
 * The executor never touches SQLite — it is isolated from the database entirely (бандл A0
 * §Security). It writes its rationale into the report file, and the orchestrator on the host is
 * what puts it in the table. This function is that step, and nothing else in the loop writes
 * `agent_decisions`.
 *
 * **The identity comes from the owner, never from the report** (найдено живым гейтом 163). The two
 * id columns are foreign keys, and a live executor writing its own `projectId`/`taskId` is a model
 * filling in a field — on the gate's own run one of them wrote ids that belonged to nothing, the
 * insert raised `FOREIGN KEY constraint failed`, and the exception took the whole iteration down.
 * The report is *information* (that is this file's first sentence); the orchestrator is what knows
 * which task it started. Their disagreement is worth reporting to the operator and worth nothing as
 * authority.
 */
export function recordDecision(
  database: DatabaseSync,
  report: ExecutorReport,
  owner: ReportOwner,
): string | null {
  const id = decisionId(report, owner);
  if (id === null) return null;
  if (report.rationale === undefined || report.rationale.trim() === '') return null;

  database
    .prepare(
      `INSERT OR REPLACE INTO agent_decisions (decision_id, project_id, task_id, title, rationale)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(id, owner.projectId, owner.taskId, report.decisionTitle ?? owner.taskId, report.rationale);

  return id;
}
