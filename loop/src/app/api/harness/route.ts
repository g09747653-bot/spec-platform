import { z } from 'zod';

import { getDatabase } from '../../../db/client.ts';
import { AGENT_ROLES, LOG_LEVELS } from '../../../events/bus.ts';
import { harnessEnabled } from '../../../config/harness.ts';
import { createLogger } from '../../../observability/log.ts';

/**
 * The end-to-end harness's way into this process (task 153).
 *
 * The claim the dashboard has to prove is «a line the orchestrator emits appears on an open page
 * without the page asking» — and the orchestrator lives *in this process*, so a browser test needs
 * something in this process to poke. Until the bundle intake exists (task 156) there is no
 * production route that writes a log line, so the harness gets its own.
 *
 * **It does not exist unless `LOOP_E2E` is set**, which is the same shape as the platform's
 * throwaway gate harness: a named, separate thing that a real deployment never has, rather than a
 * production endpoint with a check inside it. A request to it without the flag is answered 404 — not
 * 403, because a route that denies is a route that exists, and this one does not.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const SeedRequest = z.object({
  action: z.literal('seed'),
  projectId: z.string().min(1),
  title: z.string().min(1),
  milestones: z
    .array(
      z.object({
        milestoneId: z.string().min(1),
        title: z.string().min(1),
        dependsOn: z.array(z.string()).default([]),
        tasks: z
          .array(
            z.object({
              taskId: z.string().min(1),
              title: z.string().min(1),
              dependsOn: z.array(z.string()).default([]),
            }),
          )
          .default([]),
      }),
    )
    .default([]),
});

const LogRequest = z.object({
  action: z.literal('log'),
  projectId: z.string().min(1),
  message: z.string().min(1),
  agentRole: z.enum(AGENT_ROLES).default('ORCHESTRATOR'),
  logLevel: z.enum(LOG_LEVELS).default('INFO'),
});

const HarnessRequest = z.discriminatedUnion('action', [SeedRequest, LogRequest]);

export async function POST(request: Request): Promise<Response> {
  if (!harnessEnabled()) return new Response('нет такого маршрута', { status: 404 });

  const parsed = HarnessRequest.safeParse(await request.json());
  if (!parsed.success) {
    return Response.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  }

  const database = getDatabase();
  const body = parsed.data;

  if (body.action === 'seed') {
    /*
     * Seeding is a **fresh start**, and that is a correction the browser suite found: the harness
     * database outlives a run, so a second run inherited the first one's feed and «the line the
     * orchestrator just emitted» matched three elements. A case whose verdict depends on how many
     * times it has been run is not a case.
     */
    database.prepare('DELETE FROM projects WHERE project_id = ?').run(body.projectId);

    database
      .prepare(
        `INSERT INTO projects (project_id, title, status) VALUES (?, ?, 'ACTIVE')
         ON CONFLICT (project_id) DO UPDATE SET title = excluded.title`,
      )
      .run(body.projectId, body.title);

    for (const [index, milestone] of body.milestones.entries()) {
      database
        .prepare(
          `INSERT INTO milestones (milestone_id, project_id, title, depends_on, position, status)
           VALUES (?, ?, ?, ?, ?, 'PENDING')
           ON CONFLICT (milestone_id) DO UPDATE SET title = excluded.title`,
        )
        .run(
          milestone.milestoneId,
          body.projectId,
          milestone.title,
          JSON.stringify(milestone.dependsOn),
          index,
        );

      for (const [position, task] of milestone.tasks.entries()) {
        database
          .prepare(
            `INSERT INTO tasks (task_id, milestone_id, title, description, tech_stack,
                                files_to_edit, expected_artifacts, depends_on, position, status)
             VALUES (?, ?, ?, '', 'nodejs', '[]', '[]', ?, ?, 'PENDING')
             ON CONFLICT (task_id) DO UPDATE SET title = excluded.title`,
          )
          .run(
            task.taskId,
            milestone.milestoneId,
            task.title,
            JSON.stringify(task.dependsOn),
            position,
          );
      }
    }

    return Response.json({ ok: true });
  }

  const event = createLogger(database).write({
    projectId: body.projectId,
    agentRole: body.agentRole,
    logLevel: body.logLevel,
    message: body.message,
  });

  return Response.json({ ok: true, logId: event.logId });
}
