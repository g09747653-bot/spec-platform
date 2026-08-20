import type { DockerEngine } from '../docker/engine.ts';
import type { TechStack } from '../intake/handoff.ts';

import { runInCleanCopy, type CleanRunDeps } from './clean-run.ts';

/**
 * The controller: style before substance (task 161; бандл A0 Task 3.3).
 *
 * It runs **after** an executor reports `SUCCESS` and **before** the acceptance suite, and the order
 * is the whole of its value. A formatter or a linter answers in seconds; the acceptance run copies
 * the workspace into a fresh container and runs the project's tests, which on a real project is
 * minutes. Sending a task back for a missing semicolon after paying for the suite is paying twice
 * for an answer the cheap check already had.
 *
 * **A red check returns the task to the executor without running the tests at all.** Not a failure,
 * not a freeze: the assignment goes round again with the findings in the feed, because that is what
 * a person reviewing a pull request does with a formatting complaint. «Красный CI» (task 160) is
 * about a *verdict* — the code does not work — and this is about a draft that is not ready to be
 * judged yet.
 *
 * The commands per stack are the bundle's, and they are **skipped when the project does not define
 * them**, for the reason `tech-stack.ts` learned the hard way: a guessed command that a project has
 * no script for exits non-zero, and a gate that refuses a task over a linter the plan never promised
 * is a gate reporting on itself.
 */

export interface ControllerCheck {
  /** What the feed calls it: `eslint`, `black`, `go vet`. */
  label: string;
  /** Answers «is this tool here at all?». Its failure is a skip, never a finding. */
  probe: string;
  /** The check itself, run from the workspace root in the clean copy. */
  command: string;
}

/**
 * The checks per stack, as the A0 bundle names them — each behind a probe.
 *
 * **The probe is the whole design of this table.** A linter that is not installed exits non-zero and
 * says something about an executable, which is indistinguishable from a linter that ran and found
 * fault — and the first version of this file read `npx`'s «could not determine executable to run» as
 * a style violation, so every project without ESLint was returned to its executor forever. The
 * project's own toolchain decides what is checked: a tool the project does not have is not a finding
 * about the project, exactly as `tech-stack.ts` refuses to guess a test command a project never
 * declared.
 */
export const CONTROLLER_CHECKS: Record<TechStack, ControllerCheck[]> = {
  nodejs: [
    {
      label: 'eslint',
      probe: 'npx --no-install eslint --version',
      command: 'npx --no-install eslint .',
    },
    {
      label: 'prettier',
      probe: 'npx --no-install prettier --version',
      command: 'npx --no-install prettier --check .',
    },
  ],
  python: [
    { label: 'flake8', probe: 'flake8 --version', command: 'flake8 .' },
    { label: 'black', probe: 'black --version', command: 'black --check .' },
  ],
  go: [
    { label: 'gofmt', probe: 'command -v gofmt', command: 'test -z "$(gofmt -l .)"' },
    { label: 'go vet', probe: 'command -v go', command: 'go vet ./...' },
  ],
  rust: [
    { label: 'cargo fmt', probe: 'cargo fmt --version', command: 'cargo fmt --check' },
    {
      label: 'cargo clippy',
      probe: 'cargo clippy --version',
      command: 'cargo clippy -- -D warnings',
    },
  ],
  /* Nothing is known about the toolchain, so nothing is claimed about its style. */
  generic: [],
};

/**
 * The shell line a check actually runs: probe first, and `127` if the probe says no.
 *
 * One command rather than two container runs, because the answer to «is it installed?» is only
 * useful in the same shell that would have run it — a probe in one container and a check in another
 * is two claims about two environments.
 */
export function checkCommand(check: ControllerCheck): string {
  return `{ ${check.probe}; } >/dev/null 2>&1 || exit 127
${check.command}`;
}

export interface ControllerFinding {
  label: string;
  exitCode: number | null;
  /** What the tool said, trimmed to what a feed line can carry. */
  output: string;
}

export interface ControllerVerdict {
  /** True when every check that ran was green — and when none ran at all. */
  clean: boolean;
  ran: string[];
  /** Checks whose tool is not installed in this project: reported, never held against it. */
  skipped: string[];
  findings: ControllerFinding[];
  reason: string;
}

/** The shell's own «command not found», which `checkCommand` re-uses for «this tool is not here». */
const NOT_INSTALLED = 127;

/** How much of a tool's output a feed line carries before it stops being readable. */
const OUTPUT_LIMIT = 2_000;

export async function runController(
  techStack: TechStack,
  copyPath: string,
  image: string,
  containerPrefix: string,
  deps: CleanRunDeps & { engine: DockerEngine },
): Promise<ControllerVerdict> {
  const checks = CONTROLLER_CHECKS[techStack];

  if (checks.length === 0) {
    return {
      clean: true,
      ran: [],
      skipped: [],
      findings: [],
      reason: `Контролёр: для стека ${techStack} проверок стиля не объявлено.`,
    };
  }

  const ran: string[] = [];
  const skipped: string[] = [];
  const findings: ControllerFinding[] = [];

  for (const check of checks) {
    const run = await runInCleanCopy(
      deps.engine,
      image,
      copyPath,
      `${containerPrefix}-${check.label.replace(/[^a-z0-9]+/gi, '-')}`,
      checkCommand(check),
      deps,
    );

    if (run.exitCode === NOT_INSTALLED) {
      skipped.push(check.label);
      continue;
    }

    ran.push(check.label);

    if (run.exitCode !== 0) {
      findings.push({
        label: check.label,
        exitCode: run.exitCode,
        output: run.output.slice(0, OUTPUT_LIMIT),
      });
    }
  }

  if (findings.length === 0) {
    return {
      clean: true,
      ran,
      skipped,
      findings,
      reason:
        ran.length === 0
          ? 'Контролёр: инструментов стиля в проекте нет — проверять нечем.'
          : `Контролёр: ${ran.join(', ')} — чисто.`,
    };
  }

  return {
    clean: false,
    ran,
    skipped,
    findings,
    reason: `Контролёр вернул задачу исполнителю до тестов: ${findings
      .map((finding) => finding.label)
      .join(', ')} — красные. Приёмочные тесты не запускались.`,
  };
}
