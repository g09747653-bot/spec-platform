import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

import type { DockerEngine } from '../docker/engine.ts';
import type { ExecutorCredential } from '../executor/credential.ts';
import { runExecutor, type ExecutorRun } from '../executor/run.ts';
import { acceptTask, type AcceptanceVerdict } from '../gate/accept.ts';
import { blockedPath } from '../gate/blocked.ts';
import { eventBus } from '../events/bus.ts';
import {
  disagreesAboutOwner,
  readReport,
  recordDecision,
  type ExecutorReport,
} from '../gate/report.ts';
import { detectAndRewrite } from '../gate/tech-stack.ts';
import { frozenMsFor } from '../orchestrator/freeze.ts';
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

/**
 * `RETURNED` is the controller's verdict and nothing else (task 161).
 *
 * It sits apart from `FAILED` because it means something different: the code was **not judged**. A
 * red suite is a statement about the product and freezes the pipeline (task 160); a red formatter is
 * a draft that is not ready to be judged, and the honest response is to hand it back to the executor
 * with the findings, exactly as a reviewer hands back a pull request over style.
 */
export type CycleOutcome = 'COMPLETED' | 'FAILED' | 'BLOCKED' | 'RETURNED';

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
  /** The one credential handed to the executor container — API key or subscription token. */
  credential: ExecutorCredential;
  /** The executor's own command. Absent means the real Claude Code; present is the stub path. */
  executorCommand?: readonly string[];
  executorTimeoutMs?: number;
  acceptanceTimeoutMs?: number;
  /** One test command's own limit inside the acceptance run (task 174) — see `gate/accept.ts`. */
  acceptanceTestTimeoutMs?: number;
  model?: string | undefined;
  /** The plan's budget signal, forwarded from the executor's stream as it arrives (task 159). */
  onRateLimit?: (signal: {
    status?: string | undefined;
    window?: string | undefined;
    resetsAt?: number | undefined;
  }) => void;
}

export interface CycleRequest {
  projectId: string;
  taskId: string;
  /** `<WORKSPACE_ROOT_PATH>/<projectId>` — the same directory the intake wrote into. */
  projectDirectory: string;
}

/**
 * The status the task carries — to disk first, to the index after, then onto the bus.
 *
 * The third step is what makes the board live. Without it the dashboard's tree is whatever the
 * server rendered when the page loaded: the feed moves and the plan sits frozen, which is a
 * dashboard that tells an operator less the longer they watch it. The gate walk found this by
 * waiting forever on a status that had already changed.
 */
function setStatus(
  database: DatabaseSync,
  projectDirectory: string,
  projectId: string,
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
  eventBus().publish({ type: 'task-status', projectId, taskId, status });
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

  setStatus(database, projectDirectory, projectId, taskId, 'IN_PROGRESS');
  say('Задача передана исполнителю.');

  /*
   * The assignment, read **off the disk** before the executor starts (task 174). The disk is the
   * source of truth, and `iterationTimeoutSec` is a mark an operator may have put there by hand —
   * a per-task ceiling outranks whatever the run was configured with, because the point of the
   * mark is precisely to except one heavy task from the general rule.
   */
  const assignment = HandoffTask.parse(
    JSON.parse(readFileSync(join(projectDirectory, HANDOFF.tasks, taskFileName(taskId)), 'utf8')),
  );
  const iterationTimeoutMs =
    assignment.iterationTimeoutSec === undefined
      ? deps.executorTimeoutMs
      : assignment.iterationTimeoutSec * 1_000;

  if (assignment.iterationTimeoutSec !== undefined) {
    say(`Задание несёт собственный потолок итерации: ${String(assignment.iterationTimeoutSec)} с.`);
  }

  // 2. The executor.
  const executor = await runExecutor(
    {
      taskId,
      projectId,
      workspacePath: projectDirectory,
      taskFile: `/workspace/${HANDOFF.tasks.replaceAll('\\', '/')}/${taskFileName(taskId)}`,
      credential: deps.credential,
      ...(deps.executorCommand === undefined ? {} : { command: deps.executorCommand }),
      ...(deps.model === undefined ? {} : { model: deps.model }),
    },
    {
      engine,
      ...(iterationTimeoutMs === undefined ? {} : { timeoutMs: iterationTimeoutMs }),
      ...(deps.onRateLimit === undefined ? {} : { onRateLimit: deps.onRateLimit }),
      /* The ceiling measures work: time the pipeline spends frozen is not this task's (task 160). */
      frozenMs: () => frozenMsFor(projectId),
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

  /*
   * How long the iteration took, said out loud (task 163).
   *
   * This line is where the ceiling's data comes from: the M16а gate collected the distribution of
   * live iterations out of `agent_logs` by exactly this sentence, and the 900-second default of
   * task 174 is 3× the p90 it measured. The feed keeps writing every duration so the next decision
   * about the ceiling is also made on numbers rather than on two samples.
   */
  say(
    `Итерация исполнителя: ${(executor.durationMs / 1000).toFixed(1)} с, исход ${executor.outcome}.`,
    executor.outcome === 'TIMEOUT' ? 'WARN' : 'INFO',
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
    if (disagreesAboutOwner(read.report, { projectId, taskId })) {
      /*
       * A report that names a different task or project. Said out loud and then ignored as identity:
       * the orchestrator started this task and knows which it is (see `recordDecision`).
       */
      say(
        `Отчёт называет себя задачей ${read.report.taskId} проекта ${read.report.projectId} — ` +
          'запись идёт под теми, кого запускал оркестратор.',
        'WARN',
      );
    }

    recorded = recordDecision(database, read.report, { projectId, taskId });
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
    setStatus(database, projectDirectory, projectId, taskId, 'BLOCKED');
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
    setStatus(database, projectDirectory, projectId, taskId, 'FAILED');
    const reason =
      'Исполнитель не уложился в отведённое время итерации (время заморозки не в счёт).';
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
    ...(deps.acceptanceTestTimeoutMs === undefined
      ? {}
      : { testTimeoutMs: deps.acceptanceTestTimeoutMs }),
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
  if (acceptance.returnedByController) {
    /*
     * Back to `PENDING`, which is the executor's queue: the scheduler will pick it up again, with
     * the findings already in the feed the next executor's operator is reading. The status is not
     * `FAILED`, because nothing failed — the tests never ran.
     */
    setStatus(database, projectDirectory, projectId, taskId, 'PENDING');
    say(acceptance.reason, 'WARN');
    for (const finding of acceptance.controller?.findings ?? []) {
      logger.write({
        projectId,
        taskId,
        agentRole: 'CONTROLLER',
        logLevel: 'WARN',
        message: `${finding.label}: ${finding.output.split('\n').slice(0, 12).join('\n')}`,
      });
    }

    return {
      taskId,
      outcome: 'RETURNED',
      reported,
      executor,
      acceptance,
      reason: acceptance.reason,
      decisionId: recorded,
      techStackRewritten: rewritten,
    };
  }

  const outcome: CycleOutcome = acceptance.accepted ? 'COMPLETED' : 'FAILED';
  setStatus(database, projectDirectory, projectId, taskId, outcome);
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
