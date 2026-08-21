/**
 * The loop's boot (task 158).
 *
 * Two things happen before the first request is served, and the order is the whole point: the
 * configuration is parsed (so a hole in `.env` costs a restart, not a night), and the database is
 * rebuilt from the `handoff/` tree on disk.
 *
 * **The recovery is what makes `SIGKILL` survivable.** A process killed mid-cycle leaves a task
 * marked `IN_PROGRESS` and nobody working on it; this boot reads the plan back off disk, notices
 * that claim is about a process which no longer exists, and returns the task to `PENDING`. The
 * operator sees the run continue; nothing about the plan had to be kept in memory to survive.
 */
export async function register(): Promise<void> {
  /* eslint-disable-next-line no-restricted-properties --
   * `NEXT_RUNTIME` is the framework naming the bundle this module was loaded into, not
   * configuration. The recovery needs `node:sqlite` and the filesystem, which the edge bundle has
   * no place for. */
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const [
    { getEnv },
    { getDatabase },
    { createLogger },
    { recoverFromDisk },
    { startGatewayFromEnv },
    { ensureBlockWatcher },
    { eventBus },
  ] = await Promise.all([
    import('./config/env.ts'),
    import('./db/client.ts'),
    import('./observability/log.ts'),
    import('./orchestrator/orchestrator.ts'),
    import('./gateway/start-gateway.ts'),
    import('./gate/blocked.ts'),
    import('./events/bus.ts'),
  ]);

  const env = getEnv();

  try {
    const database = getDatabase();
    const logger = createLogger(database);
    const recovered = recoverFromDisk(database, env.WORKSPACE_ROOT_PATH, logger);

    for (const project of recovered) {
      console.log(
        `[loop] восстановлен проект ${project.projectId}: вех ${String(project.milestones)}, ` +
          `задач ${String(project.tasks)}` +
          (project.resumed.length === 0 ? '' : `, возобновлено ${project.resumed.join(', ')}`),
      );

      /*
       * The block watcher, armed per recovered project (task 167's finding): the BLOCKED file
       * promises «контур увидит удаление» — this is where the seeing is wired in. The unblock
       * repairs the status; restarting the pipeline stays the operator's start-loop.
       */
      ensureBlockWatcher(database, project.projectDirectory, (taskId) => {
        logger.write({
          projectId: project.projectId,
          taskId,
          agentRole: 'ORCHESTRATOR',
          logLevel: 'WARN',
          message:
            `Блокировка задачи ${taskId} снята оператором (файл удалён) — задача снова PENDING. ` +
            'Запустите конвейер снова (start-loop), чтобы продолжить.',
        });
        eventBus().publish({
          type: 'task-status',
          projectId: project.projectId,
          taskId,
          status: 'PENDING',
        });
      });
    }
  } catch (error) {
    /*
     * A recovery that fails must not stop the dashboard from starting: the operator needs the page
     * most when something is wrong, and this failure is exactly the kind of thing they need to see
     * reported rather than inferred from a server that will not boot.
     */
    console.error('[loop] восстановление с диска не удалось', error);
  }

  try {
    /*
     * The Telegram gateway, after the recovery (task 164): its /status must read the restored
     * board, not an empty database. Optional and named — without the token pair the loop runs
     * exactly as it did yesterday, and the console says which variable would turn it on.
     */
    startGatewayFromEnv(env, (line) => {
      console.log(line);
    });
  } catch (error) {
    console.error('[loop] Telegram-шлюз не запустился', error);
  }
}
