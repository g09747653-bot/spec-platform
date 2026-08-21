import { existsSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

import { z } from 'zod';

import { executorCredential, getEnv } from '../../../../config/env.ts';
import { executorStubCommand, executorStubEnabled } from '../../../../config/harness.ts';
import { getDatabase } from '../../../../db/client.ts';
import { createDockerEngine } from '../../../../docker/engine.ts';
import { resolveEndpoint } from '../../../../docker/transport.ts';
import { createLogger } from '../../../../observability/log.ts';
import { isFrozen, liftFreeze, readFreeze } from '../../../../orchestrator/freeze.ts';
import {
  driveProject,
  livePipeline,
  readHandoffTree,
} from '../../../../orchestrator/orchestrator.ts';
import { withinWorkspace } from '../workspace.ts';

/**
 * `POST /api/orchestrator/retry` — the one way out of a freeze (task 160).
 *
 * A frozen pipeline never lifts itself; this endpoint is the person deciding that the red verdict
 * has been read. It does three things and says which: unpauses the containers whose iterations are
 * still being awaited, puts every frozen task back to the status it can honestly carry, and sends
 * the red task round again from the top.
 *
 * **Whether the iterations survived is not a guess.** `livePipeline` answers it: the process that
 * froze them either is still this one — in which case unpausing puts the very same containers back
 * on their feet with their work intact — or it is not, and their containers are reaped and their
 * tasks re-queued. Restoring `IN_PROGRESS` for an iteration nobody is reading would be a board that
 * shows work in hand that no process holds.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const Retry = z.object({
  /** A directory name under the workspace root, or an absolute path inside it. */
  projectDirectory: z.string().min(1),
});

export async function POST(request: Request): Promise<Response> {
  const parsed = Retry.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: z.prettifyError(parsed.error) }, { status: 400 });
  }

  const env = getEnv();
  /* Resolved before anything is compared: «inside the workspace» is a fact about real paths. */
  const root = resolve(env.WORKSPACE_ROOT_PATH);
  const requested = parsed.data.projectDirectory;
  const directory = resolve(isAbsolute(requested) ? requested : join(root, requested));

  if (!withinWorkspace(root, directory)) {
    return Response.json(
      { error: `рабочая директория должна лежать внутри WORKSPACE_ROOT_PATH (${root})` },
      { status: 400 },
    );
  }

  if (!existsSync(directory)) {
    return Response.json({ error: `нет каталога ${directory}` }, { status: 400 });
  }

  if (!isFrozen(directory)) {
    return Response.json({ error: 'конвейер не заморожен — возобновлять нечего' }, { status: 409 });
  }

  const record = readFreeze(directory);
  const projectId = record?.projectId ?? projectIdOfDirectory(directory);
  if (projectId === null) {
    return Response.json(
      { error: 'не удалось определить проект: в отметке заморозки нет идентификатора' },
      { status: 422 },
    );
  }

  const database = getDatabase();
  const logger = createLogger(database);
  const engine = createDockerEngine(
    resolveEndpoint(process.platform, {
      DOCKER_ENGINE_PIPE: env.DOCKER_ENGINE_PIPE,
      DOCKER_ENGINE_SOCKET: env.DOCKER_ENGINE_SOCKET,
    }),
  );

  const live = livePipeline(projectId);
  const lifted = await liftFreeze(database, engine, {
    projectId,
    projectDirectory: directory,
    stillAwaited: live?.running() ?? [],
  });

  logger.write({
    projectId,
    agentRole: 'ORCHESTRATOR',
    logLevel: 'INFO',
    message:
      'Заморозка снята оператором. ' +
      `Возобновлено с паузы: ${lifted.resumed.length === 0 ? '—' : lifted.resumed.join(', ')}. ` +
      `Отправлено на повторный прогон: ${lifted.requeued.length === 0 ? '—' : lifted.requeued.join(', ')}.`,
  });

  if (live === null && readHandoffTree(directory) === null) {
    logger.write({
      projectId,
      agentRole: 'ORCHESTRATOR',
      logLevel: 'WARN',
      message:
        `В каталоге ${directory} нет читаемого дерева handoff/ — заморозка снята, ` +
        'но запускать нечего. Проверьте каталог проекта и запустите конвейер заново.',
    });
  }

  /*
   * A pipeline that is still alive picks the plan up on its next pass — it has been waiting on the
   * marker. One that died with its process has to be started again, and the answer returns before it
   * does: the loop reports into the feed, never into a request somebody is holding open.
   *
   * **Only if there is a plan on disk to drive.** A directory whose `handoff/` tree is missing or
   * unreadable cannot be run: every task would fail on its own assignment file, and the first
   * failure would freeze the pipeline again — turning a resume into a fresh red verdict about
   * nothing. Lifting the freeze is still right (it is about containers and statuses, and those are
   * real); starting a doomed run is not.
   */
  const drivable = readHandoffTree(directory) !== null;

  if (live === null && drivable) {
    void driveProject(projectId, directory, {
      database,
      engine,
      logger,
      credential: executorCredential(env),
      maxExecutors: env.LOOP_MAX_EXECUTORS,
      acceptanceTestTimeoutMs: env.ACCEPTANCE_TEST_TIMEOUT_MS,
      ...(env.LOOP_ANTHROPIC_MODEL === undefined ? {} : { model: env.LOOP_ANTHROPIC_MODEL }),
      ...(executorStubEnabled() ? { executorCommand: executorStubCommand } : {}),
    }).catch((error: unknown) => {
      logger.write({
        projectId,
        agentRole: 'ORCHESTRATOR',
        logLevel: 'ERROR',
        message: `Конвейер остановлен ошибкой: ${error instanceof Error ? error.message : String(error)}`,
      });
    });
  }

  return Response.json({
    status: 'RESUMED',
    projectId,
    resumed: lifted.resumed,
    requeued: lifted.requeued,
    /** Whether the iterations were still in hand — the operator sees which kind of resume this was. */
    inProcess: live !== null,
    /** False when the directory holds no readable plan; the freeze is lifted and nothing is driven. */
    driving: live !== null || drivable,
  });
}

/** The project a directory holds, read from its `milestones.json` when the marker cannot say. */
function projectIdOfDirectory(directory: string): string | null {
  return readHandoffTree(directory)?.projectId ?? null;
}
