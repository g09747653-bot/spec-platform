import { mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { z } from 'zod';

import { getEnv } from '../../../config/env.ts';
import { getDatabase } from '../../../db/client.ts';
import { AGENT_ROLES, LOG_LEVELS } from '../../../events/bus.ts';
import { harnessEnabled } from '../../../config/harness.ts';
import { createLogger } from '../../../observability/log.ts';
import { freezePipeline, frozenPath } from '../../../orchestrator/freeze.ts';

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

/**
 * Freezes (or unfreezes) the seeded project, so the browser can see the stop state (task 160).
 *
 * It calls the **production** `freezePipeline`, with a daemon that has no containers — the marker,
 * the statuses and the project row are written by the code that writes them in a real freeze, not by
 * a fixture that happens to produce a similar file. What the harness supplies is only the workspace
 * directory, because a browser cannot be trusted with a host path (see `workspace.ts`).
 */
const FreezeRequest = z.object({
  action: z.literal('freeze'),
  projectId: z.string().min(1),
  taskId: z.string().min(1),
  reason: z.string().min(1),
  paused: z.array(z.string()).default([]),
  /** `false` removes the marker, for the case that asserts the banner disappears. */
  frozen: z.boolean().default(true),
});

const HarnessRequest = z.discriminatedUnion('action', [SeedRequest, LogRequest, FreezeRequest]);

/** A daemon with nothing in it: the harness freezes a plan that never started a container. */
const NO_CONTAINERS = {
  findByName: () => Promise.resolve(null),
  pauseContainer: () => Promise.resolve(),
} as unknown as Parameters<typeof freezePipeline>[1];

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

    /* A seed starts unfrozen: a marker left by a previous case is that case's state, not this one's. */
    rmSync(frozenPath(resolve(getEnv().WORKSPACE_ROOT_PATH, body.projectId)), { force: true });

    for (const [index, milestone] of body.milestones.entries()) {
      database
        .prepare(
          `INSERT INTO milestones (milestone_id, project_id, title, depends_on, position, status)
           VALUES (?, ?, ?, ?, ?, 'PENDING')
           ON CONFLICT (project_id, milestone_id) DO UPDATE SET title = excluded.title`,
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
            `INSERT INTO tasks (project_id, task_id, milestone_id, title, description, tech_stack,
                                files_to_edit, expected_artifacts, depends_on, position, status)
             VALUES (?, ?, ?, ?, '', 'nodejs', '[]', '[]', ?, ?, 'PENDING')
             ON CONFLICT (project_id, task_id) DO UPDATE SET title = excluded.title`,
          )
          .run(
            body.projectId,
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

  if (body.action === 'freeze') {
    const directory = resolve(getEnv().WORKSPACE_ROOT_PATH, body.projectId);
    mkdirSync(join(directory, 'handoff', 'tasks'), { recursive: true });

    if (!body.frozen) {
      rmSync(frozenPath(directory), { force: true });
      database
        .prepare("UPDATE projects SET status = 'ACTIVE' WHERE project_id = ?")
        .run(body.projectId);

      return Response.json({ ok: true, frozen: false, directory });
    }

    database
      .prepare('UPDATE projects SET workspace_dir = ? WHERE project_id = ?')
      .run(directory, body.projectId);

    await freezePipeline(database, NO_CONTAINERS, {
      projectId: body.projectId,
      projectDirectory: directory,
      taskId: body.taskId,
      reason: body.reason,
      inFlight: body.paused.map((taskId) => ({ taskId, previousStatus: 'IN_PROGRESS' as const })),
    });

    return Response.json({ ok: true, frozen: true, directory });
  }

  const event = createLogger(database).write({
    projectId: body.projectId,
    agentRole: body.agentRole,
    logLevel: body.logLevel,
    message: body.message,
  });

  return Response.json({ ok: true, logId: event.logId });
}
