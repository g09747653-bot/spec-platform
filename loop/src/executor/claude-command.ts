/**
 * The command that runs Claude Code inside an executor container (task 155).
 *
 * The A0 bundle guessed at this — it names `claude --yes` and `CI=true` as examples — and neither
 * exists. The flags below are the documented ones (Claude Code CLI reference and «Run Claude Code
 * programmatically», read at implementation time), and each is here for a stated reason:
 *
 * - **`--bare`** is the mode the documentation recommends for scripted and SDK calls. It skips
 *   discovery of hooks, plugins, MCP servers, auto memory and `CLAUDE.md` — which is exactly right
 *   for an executor: the same result on every machine, and nothing in the *task's own workspace*
 *   gets to configure the agent that is about to edit it. A repository containing a hostile
 *   `.claude/settings.json` is a case this mode removes rather than mitigates.
 * - **`-p`** is print mode: run once, print, exit. Exit code 0 on success, non-zero on failure, so
 *   the wrapper can branch on the container's exit status instead of parsing prose.
 * - **`--permission-mode acceptEdits` with an explicit `--allowedTools`** rather than
 *   `bypassPermissions`: an executor must write files and run the project's build and tests, and
 *   those are the tools listed. `bypassPermissions` would grant the same power while saying less
 *   about it — the container is the sandbox either way, so the tighter spelling costs nothing.
 * - **`--output-format stream-json --verbose`** because the wrapper streams the run into the log
 *   feed as it happens; `stream-json` requires `--verbose`, which the documentation states.
 * - **`--max-turns`** bounds the agentic loop from the inside, beneath the wrapper's wall-clock
 *   timeout. Two bounds, because they fail differently: turns catch a model going in circles
 *   cheaply, the clock catches a process that has stopped making progress at all.
 *
 * **Authentication needs no interactive step.** In bare mode Claude Code never reads OAuth
 * credentials or the system keychain — it reads `ANTHROPIC_API_KEY` from the environment, which is
 * the one variable the wrapper passes in. The operational stop the milestone's brief allowed for
 * (a login the customer would have to perform inside a container) is therefore not needed.
 */

export interface ClaudeCommandOptions {
  /** Where the assignment sits inside the container — under the mounted workspace. */
  taskFile: string;
  /** Bounds the agentic loop from inside the CLI. */
  maxTurns?: number;
  /** A model alias or full name. Absent means the CLI's own default. */
  model?: string | undefined;
}

/** The tools an executor is allowed to reach for, and nothing beyond them. */
export const EXECUTOR_TOOLS = ['Bash', 'Read', 'Edit', 'Write', 'Glob', 'Grep'] as const;

export const DEFAULT_MAX_TURNS = 60;

/**
 * The prompt.
 *
 * It points at the assignment rather than inlining it: the file is on disk inside the mounted
 * workspace, it is the same file the orchestrator wrote and will later re-read, and a copy of it in
 * the prompt would be a second version of the task that can disagree with the first.
 */
export function executorPrompt(taskFile: string): string {
  return [
    `Прочитай файл задания ${taskFile} — это твоё задание целиком.`,
    '',
    'Выполни его в текущей рабочей директории: внеси правки в файлы, перечисленные в filesToEdit,',
    'напиши тесты и прогони их. Работай самостоятельно и не задавай вопросов — ответить некому.',
    '',
    'Когда закончишь, запиши отчёт в handoff/reports/report_<taskId>.json по схеме отчёта:',
    'reportId, taskId, projectId, executorId, status (SUCCESS | FAILED | BLOCKED),',
    'testsRun {total, passed, failed}, errors (массив строк), и — если принимал решение,',
    'о котором стоит знать архитектору — decisionTitle и rationale.',
    '',
    'Если задача невыполнима, поставь status BLOCKED, объясни причину в blockReason и создай',
    'в корне рабочей директории файл BLOCKED_<taskId>.md с описанием того, что требуется от человека.',
  ].join('\n');
}

export function claudeCommand(options: ClaudeCommandOptions): string[] {
  return [
    'claude',
    '--bare',
    '-p',
    executorPrompt(options.taskFile),
    '--output-format',
    'stream-json',
    '--verbose',
    '--permission-mode',
    'acceptEdits',
    '--allowedTools',
    EXECUTOR_TOOLS.join(','),
    '--max-turns',
    String(options.maxTurns ?? DEFAULT_MAX_TURNS),
    ...(options.model === undefined ? [] : ['--model', options.model]),
  ];
}
