import type { ExecutorCredentialKind } from './credential.ts';

/**
 * The command that runs Claude Code inside an executor container (task 155; амендмент А-23).
 *
 * The A0 bundle guessed at this — it names `claude --yes` and `CI=true` as examples — and neither
 * exists. The flags below are the documented ones (Claude Code CLI reference and «Run Claude Code
 * programmatically»), and each is here for a stated reason:
 *
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
 * **The isolation flags depend on the credential, and that is not a preference.**
 *
 * `--bare` is the strongest isolation the CLI offers — it skips hooks, plugins, MCP discovery, auto
 * memory and `CLAUDE.md`, so nothing in the *task's own workspace* configures the agent about to
 * edit it (D-255). It also, by its own documented design, authenticates **strictly** through
 * `ANTHROPIC_API_KEY`: «OAuth and keychain are never read». Handed a subscription token, a bare run
 * does not degrade — it stops, printing «Not logged in · Please run /login» (measured, twice: on
 * the host and inside this image).
 *
 * So the subscription path rebuilds that isolation explicitly, and the two flags were measured one
 * at a time against a workspace carrying a hostile `CLAUDE.md`, a hooks-bearing
 * `.claude/settings.json` and an `.mcp.json` that writes a marker file when spawned:
 *
 * | run | CLAUDE.md read | hooks fired | MCP server spawned |
 * |---|---|---|---|
 * | no isolation flags | yes | yes | yes |
 * | `--strict-mcp-config` alone | **yes** | **yes** | no |
 * | `--setting-sources ''` alone | no | no | no |
 * | both (this command) | no | no | no |
 *
 * `--setting-sources ''` is therefore what closes the channel: with no setting source loaded, there
 * is no project settings file to carry hooks and no project memory to carry instructions.
 * `--strict-mcp-config` is kept beside it because the two forbid by different mechanisms — one
 * declines to *load a source*, the other declines to *trust MCP configuration from anywhere but the
 * flag* — and an executor is exactly the place to spend a redundant flag on a channel that would
 * otherwise be an unattended agent talking to a server the edited repository chose.
 *
 * What the subscription path does **not** get back is bare mode's smaller tool registry: a non-bare
 * run registers the full set and relies on `--allowedTools` to gate it. That is a named difference,
 * not a silent one — the container remains the sandbox, and the permission layer is what stands
 * between the run and any tool outside the list.
 */

export interface ClaudeCommandOptions {
  /** Where the assignment sits inside the container — under the mounted workspace. */
  taskFile: string;
  /** Which credential the container was handed — it decides the isolation flags. */
  credentialKind: ExecutorCredentialKind;
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
    'Если существует handoff/RESEARCH.md — прочитай его: это снимок рабочей директории, сделанный',
    'исследователем контура (дерево, манифесты, зависимости). Он описывает, что в проекте уже есть.',
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

/**
 * What replaces `--bare` when the credential is a subscription token.
 *
 * An empty `--setting-sources` means «load none of user, project, local» — the CLI's own vocabulary
 * for the sources, spelled as the absence of all three rather than as a list of what to skip.
 */
export const SUBSCRIPTION_ISOLATION = ['--setting-sources', '', '--strict-mcp-config'] as const;

export function claudeCommand(options: ClaudeCommandOptions): string[] {
  const isolation =
    options.credentialKind === 'ANTHROPIC_API_KEY' ? ['--bare'] : [...SUBSCRIPTION_ISOLATION];

  return [
    'claude',
    ...isolation,
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
