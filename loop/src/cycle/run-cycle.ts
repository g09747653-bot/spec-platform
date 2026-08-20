import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

import type { DockerEngine } from '../docker/engine.ts';
import { runExecutor, type ExecutorRun } from '../executor/run.ts';
import { acceptTask, type AcceptanceVerdict } from '../gate/accept.ts';
import { blockedPath } from '../gate/blocked.ts';
import { readReport, recordDecision, type ExecutorReport } from '../gate/report.ts';
import { detectAndRewrite } from '../gate/tech-stack.ts';
import { HANDOFF, HandoffTask, taskFileName } from '../intake/handoff.ts';
import type { Logger } from '../observability/log.ts';

/**
 * One task, from `PENDING` to a verdict (task 157).
 *
 * The order is the design, and every step of it exists because the one before it cannot be trusted
 * to have told the truth:
 *
 * 1. **detect and rewrite** the stack, so the gate judges against what the project *is* rather than
 *    what the intake guessed before any code existed;
 * 2. **run the executor** in its container, streaming its output into the feed as it happens;
 * 3. **read its report** — information, recorded and shown, deciding nothing;
 * 4. **run the acceptance** in a fresh clean container over a copy of the code;
 * 5. **write the verdict** to disk first and to the database after.
 *
 * `COMPLETED` is written by step 5 and only when step 4 said so. An executor that reports `SUCCESS`
 * over a red codebase moves nothing — that is the case the whole two-phase design exists for, and
 * it has its own test.
 */

export type CycleOutcome = 'COMPLETED' | 'FAILED' | 'BLOCKED';

export interface CycleResult {
  taskId: string;
  outcome: CycleOutcome;
  /** What the executor claimed. Null when it left no readable report. */
  reported: ExecutorReport | null;
  executor: ExecutorRun;
  /** Null when the cycle never reached acceptance (the executor blocked, or timed out). */
  acceptance: AcceptanceVerdict | null;
  reason: string;
  decisionId: string | null;
  techStackRewritten: boolean;
}

export interface CycleDeps {
  database: DatabaseSync;
  engine: DockerEngine;
  logger: Logger;
  anthropicApiKey: string;
  /** The executor's own command. Absent means the real Claude Code; present is the stub path. */
  executorCommand?: readonly string[];
  executorTimeoutMs?: number;
  acceptanceTimeoutMs?: number;
  model?: string | undefined;
}

export interface CycleRequest {
  projectId: string;
  taskId: string;
  /** `<WORKSPACE_ROOT_PATH>/<projectId>` — the same directory the intake wrote into. */
  projectDirectory: string;
}

/** The status the task carries, written to disk first and to the index after. */
function setStatus(
  database: DatabaseSync,
  projectDirectory: string,
  taskId: string,
  status: HandoffTask['status'],
): void {
  const path = join(projectDirectory, HANDOFF.tasks, taskFileName(taskId));

  if (existsSync(path)) {
    const task = HandoffTask.parse(JSON.parse(readFileSync(path, 'utf8')));
    writeFileSync(
      path,
      `${JSON.stringify(HandoffTask.parse({ ...task, status }), null, 2)}\n`,
      'utf8',
    );
  }

  database.prepare('UPDATE tasks SET status = ? WHERE task_id = ?').run(status, taskId);
}

export async function runCycle(request: CycleRequest, deps: CycleDeps): Promise<CycleResult> {
  const { database, engine, logger } = deps;
  const { projectId, taskId, projectDirectory } = request;

  const say = (message: string, level: 'INFO' | 'WARN' | 'ERROR' = 'INFO') => {
    logger.write({ projectId, taskId, agentRole: 'ORCHESTRATOR', logLevel: level, message });
  };

  // 1. What is this project, actually — and write the answer back where the next reader will see it.
  const { commands, rewritten } = detectAndRewrite(projectDirectory, taskId);
  say(
    rewritten
      ? `Стек определён как ${commands.techStack}; задание на диске переписано (диск — источник правды).`
      : `Стек задания уже соответствует проекту (${commands.techStack}).`,
  );

  setStatus(database, projectDirectory, taskId, 'IN_PROGRESS');
  say('Задача передана исполнителю.');

  // 2. The executor.
  const executor = await runExecutor(
    {
      taskId,
      projectId,
      workspacePath: projectDirectory,
      taskFile: `/workspace/${HANDOFF.tasks.replaceAll('\\', '/')}/${taskFileName(taskId)}`,
      anthropicApiKey: deps.anthropicApiKey,
      ...(deps.executorCommand === undefined ? {} : { command: deps.executorCommand }),
      ...(deps.model === undefined ? {} : { model: deps.model }),
    },
    {
      engine,
      ...(deps.executorTimeoutMs === undefined ? {} : { timeoutMs: deps.executorTimeoutMs }),
      onLine: (line) => {
        logger.write({
          projectId,
          taskId,
          agentRole: 'EXECUTOR',
          logLevel: line.level,
          message: line.text,
        });
      },
    },
  );

  // 3. What it claims — recorded, shown, and deciding nothing.
  const read = readReport(projectDirectory, taskId);
  const reported = read.ok ? read.report : null;
  let recorded: string | null = null;

  if (read.ok) {
    say(
      `Отчёт исполнителя: ${read.report.status}` +
        (read.report.testsRun === undefined
          ? '.'
          : ` (тестов ${String(read.report.testsRun.total)}, упало ${String(read.report.testsRun.failed)}).`) +
        ' Это информация для ленты — решает независимый перепрогон.',
    );
    recorded = recordDecision(database, read.report);
    if (recorded !== null) say(`Обоснование исполнителя записано решением ${recorded}.`);
  } else if (read.reason === 'missing') {
    say('Исполнитель не оставил отчёта.', 'WARN');
  } else {
    say(`Отчёт исполнителя нечитаем: ${read.detail}`, 'WARN');
  }

  // A block is the executor's one legitimate way to stop, and it needs no acceptance run.
  const blocked =
    existsSync(blockedPath(projectDirectory, taskId)) || reported?.status === 'BLOCKED';

  if (blocked) {
    setStatus(database, projectDirectory, taskId, 'BLOCKED');
    const reason =
      reported?.blockReason ??
      'Исполнитель сообщил о непреодолимом препятствии. Ожидание действий человека.';
    say(`Задача заблокирована: ${reason}`, 'WARN');

    return {
      taskId,
      outcome: 'BLOCKED',
      reported,
      executor,
      acceptance: null,
      reason,
      decisionId: recorded,
      techStackRewritten: rewritten,
    };
  }

  if (executor.outcome === 'TIMEOUT') {
    setStatus(database, projectDirectory, taskId, 'FAILED');
    const reason = 'Исполнитель не уложился в отведённое время итерации.';
    say(reason, 'ERROR');

    return {
      taskId,
      outcome: 'FAILED',
      reported,
      executor,
      acceptance: null,
      reason,
      decisionId: recorded,
      techStackRewritten: rewritten,
    };
  }

  // 4. The gate. A fresh container, a copy of the code, and no knowledge of what the executor said.
  say('Приёмка: свежий чистый контейнер, копия кодовой базы, независимый прогон.');

  const task = HandoffTask.parse(
    JSON.parse(readFileSync(join(projectDirectory, HANDOFF.tasks, taskFileName(taskId)), 'utf8')),
  );

  const acceptance = await acceptTask(task, commands, projectDirectory, {
    engine,
    ...(deps.acceptanceTimeoutMs === undefined ? {} : { timeoutMs: deps.acceptanceTimeoutMs }),
    onLine: (line) => {
      logger.write({
        projectId,
        taskId,
        agentRole: 'CONTROLLER',
        logLevel: line.stream === 'stderr' ? 'WARN' : 'INFO',
        message: line.text,
      });
    },
  });

  // 5. The verdict.
  const outcome: CycleOutcome = acceptance.accepted ? 'COMPLETED' : 'FAILED';
  setStatus(database, projectDirectory, taskId, outcome);
  say(acceptance.reason, acceptance.accepted ? 'INFO' : 'ERROR');

  if (!acceptance.accepted && reported?.status === 'SUCCESS') {
    say(
      'Исполнитель отчитался SUCCESS, чистый контейнер — красный. Решает контейнер: задача НЕ принята.',
      'ERROR',
    );
  }

  return {
    taskId,
    outcome,
    reported,
    executor,
    acceptance,
    reason: acceptance.reason,
    decisionId: recorded,
    techStackRewritten: rewritten,
  };
}
