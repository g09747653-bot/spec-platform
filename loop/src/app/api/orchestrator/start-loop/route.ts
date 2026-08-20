import { existsSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

import { z } from 'zod';

import { executorCredential, getEnv } from '../../../../config/env.ts';
import { executorStubCommand, executorStubEnabled } from '../../../../config/harness.ts';
import { getDatabase } from '../../../../db/client.ts';
import { createDockerEngine } from '../../../../docker/engine.ts';
import { resolveEndpoint } from '../../../../docker/transport.ts';
import { intakeBundle, IntakeRefused } from '../../../../intake/intake.ts';
import { createChain } from '../../../../llm/chain.ts';
import { createLogger } from '../../../../observability/log.ts';
import { driveProject } from '../../../../orchestrator/orchestrator.ts';
import { withinWorkspace } from '../workspace.ts';

/**
 * `POST /api/orchestrator/start-loop` — the one way in (task 158; бандл A0 §API).
 *
 * Takes a project directory holding a `bundle/`, runs the intake, and then **returns**. The
 * pipeline itself runs on in this process, reporting into the log feed; a request that waited for
 * it would be a request that times out on the first real project.
 *
 * The path is resolved **under `WORKSPACE_ROOT_PATH` and nowhere else**. The loop binds to the
 * loopback address and has one operator, but a local API that mounts an arbitrary host directory
 * into a container is a local API that can mount `C:\` — so the workspace root is the boundary and
 * it is enforced here rather than assumed.
 */
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const StartLoop = z.object({
  /** A directory name under the workspace root, or an absolute path inside it. */
  projectDirectory: z.string().min(1),
  projectTitle: z.string().min(1).optional(),
  /**
   * How many cycles this call may run before returning the pipeline to rest.
   *
   * The M15а gate asks for **one** cycle end to end, and an operator watching a first run of a new
   * plan wants the same: let one task through, look at what came out, then continue. Absent means
   * «until nothing is runnable», which is the ordinary autonomous case.
   */
  maxCycles: z.number().int().positive().max(1000).optional(),
  /**
   * Rewrite every assignment from scratch (task 172).
   *
   * **The confirmation is the value itself.** A boolean would be one keystroke away from a resume
   * that silently replaced the brief every executor is working from, and a `confirm: true` beside it
   * would be two fields nobody reads. Typing the phrase is the act of confirming; nothing else is
   * accepted, and the intake still refuses while any task is in progress or frozen.
   */
  regenerate: z.literal('rewrite-all-assignments').optional(),
});

export async function POST(request: Request): Promise<Response> {
  const parsed = StartLoop.safeParse(await request.json());
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

  if (!existsSync(join(directory, 'bundle'))) {
    return Response.json({ error: `в ${directory} нет каталога bundle/` }, { status: 400 });
  }

  const database = getDatabase();
  const logger = createLogger(database);
  const engine = createDockerEngine(
    resolveEndpoint(process.platform, {
      DOCKER_ENGINE_PIPE: env.DOCKER_ENGINE_PIPE,
      DOCKER_ENGINE_SOCKET: env.DOCKER_ENGINE_SOCKET,
    }),
  );

  /*
   * The chain that writes handoff prose and the credential that runs executors are different
   * things, and on a subscription-only machine they are deliberately not the same vendor: the
   * Anthropic *SDK* provider needs a metered key, and there is none. A chain left with no reachable
   * provider is not a failure — the intake then writes assignments deterministically from the
   * bundle's own text and says so, which is the degradation D-229 designed for.
   */
  const chain = createChain({
    order: env.LOOP_PROVIDER_ORDER,
    ...(env.ANTHROPIC_API_KEY === undefined ? {} : { anthropicApiKey: env.ANTHROPIC_API_KEY }),
    anthropicModel: env.LOOP_ANTHROPIC_MODEL,
    openaiApiKey: env.OPENAI_API_KEY,
    openaiModel: env.LOOP_OPENAI_MODEL,
    googleApiKey: env.GOOGLE_GENERATIVE_AI_API_KEY,
    googleModel: env.LOOP_GOOGLE_MODEL,
    localApiBase: env.LOCAL_LLM_API_BASE,
    localModel: env.LOCAL_LLM_MODEL,
    timeoutMs: env.LOOP_LLM_TIMEOUT_MS,
  });

  let intake;
  try {
    intake = await intakeBundle(
      {
        projectDirectory: directory,
        ...(parsed.data.projectTitle === undefined
          ? {}
          : { projectTitle: parsed.data.projectTitle }),
        ...(parsed.data.regenerate === undefined ? {} : { regenerate: true }),
      },
      { database, logger, chain: chain.providers.length === 0 ? null : chain },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json(
      { error: message },
      { status: error instanceof IntakeRefused ? 422 : 400 },
    );
  }

  /*
   * The pipeline runs on after the answer. Errors reach the feed rather than a caller who has
   * already been told the plan was accepted — which is what an autonomous loop means.
   */
  void driveProject(
    intake.projectId,
    directory,
    {
      database,
      engine,
      logger,
      credential: executorCredential(env),
      maxExecutors: env.LOOP_MAX_EXECUTORS,
      ...(env.LOOP_ANTHROPIC_MODEL === undefined ? {} : { model: env.LOOP_ANTHROPIC_MODEL }),
      ...(executorStubEnabled() ? { executorCommand: executorStubCommand } : {}),
    },
    parsed.data.maxCycles,
  ).catch((error: unknown) => {
    logger.write({
      projectId: intake.projectId,
      agentRole: 'ORCHESTRATOR',
      logLevel: 'ERROR',
      message: `Конвейер остановлен ошибкой: ${error instanceof Error ? error.message : String(error)}`,
    });
  });

  return Response.json({
    status: 'IN_PROGRESS',
    projectId: intake.projectId,
    bundleId: intake.bundleId,
    strategy: intake.strategy,
    milestones: intake.milestones,
    tasks: intake.tasks.length,
    writtenByModel: intake.writtenByModel,
    keptFromDisk: intake.keptFromDisk,
    regenerated: intake.regenerated,
    degradations: intake.degradations,
  });
}
