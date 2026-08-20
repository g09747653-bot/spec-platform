import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { HANDOFF, HandoffTask, taskFileName, type TechStack } from '../intake/handoff.ts';

/**
 * Detecting the project's stack, and writing the answer back to disk (task 157).
 *
 * The A0 solution's algorithm, unchanged: marker files decide, in a fixed order. What this module
 * adds is the second half of the sentence — **the answer is written back into `task_*.json`
 * immediately**, because the disk is the source of truth. A detection that lived only in memory
 * would be re-derived after every restart, and a detection that lived only in SQLite would be lost
 * with the database. The next process to read the assignment reads the same answer this one did.
 */

export interface DetectedStack {
  techStack: TechStack;
  unitTestCmd: string;
  e2eTestCmd: string;
}

/**
 * Marker files, in the order A0 checks them.
 *
 * **A guessed command is only proposed when the project actually defines it**, and that is a
 * departure from A0's literal algorithm, made because the literal version fails: it proposes
 * `npm run test:e2e` for every Node project, and a project without that script answers with npm's
 * own non-zero exit — so the gate refuses a task for a suite the plan never promised. The first
 * end-to-end run of the cycle failed on exactly that, against a toy project with one test script.
 *
 * A *stated* command is a different matter and is never second-guessed (see `resolveCommands`): the
 * plan naming a command it does not have is a defect in the plan, and the gate should say so.
 */
export function detectTechStack(workspacePath: string): DetectedStack {
  const has = (name: string) => existsSync(join(workspacePath, name));

  if (has('package.json')) {
    const scripts = packageScripts(join(workspacePath, 'package.json'));

    return {
      techStack: 'nodejs',
      unitTestCmd: scripts.has('test') ? 'npm test' : '',
      e2eTestCmd: scripts.has('test:e2e') ? 'npm run test:e2e' : '',
    };
  }
  if (has('requirements.txt') || has('pyproject.toml')) {
    return {
      techStack: 'python',
      unitTestCmd: 'pytest',
      e2eTestCmd: has(join('tests', 'e2e')) ? 'pytest tests/e2e' : '',
    };
  }
  if (has('go.mod')) {
    return { techStack: 'go', unitTestCmd: 'go test ./...', e2eTestCmd: '' };
  }
  if (has('Cargo.toml')) {
    return { techStack: 'rust', unitTestCmd: 'cargo test', e2eTestCmd: '' };
  }

  // No marker at all: the gate refuses unless the assignment names its own commands.
  return { techStack: 'generic', unitTestCmd: '', e2eTestCmd: '' };
}

/** The script names a `package.json` defines. An unreadable manifest defines none. */
function packageScripts(path: string): Set<string> {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));

    if (typeof parsed === 'object' && parsed !== null && 'scripts' in parsed) {
      const { scripts } = parsed;
      if (typeof scripts === 'object' && scripts !== null) return new Set(Object.keys(scripts));
    }
  } catch {
    // A manifest nobody can read is a project that proposes no commands.
  }

  return new Set();
}

export interface ResolvedCommands {
  techStack: TechStack;
  unitTestCmd: string;
  e2eTestCmd: string;
  /** True when the assignment's own commands were kept rather than the detection's. */
  fromAssignment: boolean;
}

/**
 * The commands this task's acceptance will actually run.
 *
 * **The assignment wins.** A task that names its own commands has been told something the marker
 * files cannot know — a monorepo's sub-package, a non-standard runner — and overriding it with a
 * guess would be the loop deciding it knows the project better than its plan does.
 */
export function resolveCommands(
  task: Pick<HandoffTask, 'unitTestCmd' | 'e2eTestCmd' | 'techStack'>,
  detected: DetectedStack,
): ResolvedCommands {
  const stated = (task.unitTestCmd ?? '').trim() !== '' || (task.e2eTestCmd ?? '').trim() !== '';

  if (stated) {
    return {
      techStack: task.techStack,
      unitTestCmd: (task.unitTestCmd ?? '').trim(),
      e2eTestCmd: (task.e2eTestCmd ?? '').trim(),
      fromAssignment: true,
    };
  }

  return { ...detected, fromAssignment: false };
}

/**
 * Detects, writes the answer into the assignment on disk, and hands back what it decided.
 *
 * The rewrite is immediate and unconditional when it changes something: a later reader — the
 * executor of a retry, a recovery after a crash, the operator opening the file — sees the stack the
 * gate is actually judging against rather than the guess the intake made before the code existed.
 */
export function detectAndRewrite(
  projectDirectory: string,
  taskId: string,
): { commands: ResolvedCommands; rewritten: boolean } {
  const path = join(projectDirectory, HANDOFF.tasks, taskFileName(taskId));
  const task = HandoffTask.parse(JSON.parse(readFileSync(path, 'utf8')));

  const detected = detectTechStack(projectDirectory);
  const commands = resolveCommands(task, detected);

  const updated: HandoffTask = {
    ...task,
    techStack: commands.techStack,
    ...(commands.unitTestCmd === '' ? {} : { unitTestCmd: commands.unitTestCmd }),
    ...(commands.e2eTestCmd === '' ? {} : { e2eTestCmd: commands.e2eTestCmd }),
  };

  const before = JSON.stringify(task);
  const after = JSON.stringify(updated);

  if (before === after) return { commands, rewritten: false };

  writeFileSync(path, `${JSON.stringify(HandoffTask.parse(updated), null, 2)}\n`, 'utf8');
  return { commands, rewritten: true };
}

/**
 * The gate's refusal when there is nothing to run — named, so the feed says what to fix.
 *
 * The task's brief names the `generic` case, and it is the common one; but a Node project whose
 * `package.json` defines no test script is the same hole with a different label, and a gate that
 * accepted it would be a gate accepting a task nothing was run against. The refusal is therefore
 * about *nothing to run*, with the `generic` case still named in its own words.
 */
export function commandsRefusal(commands: ResolvedCommands): string | null {
  if (commands.unitTestCmd !== '' || commands.e2eTestCmd !== '') return null;

  const cause =
    commands.techStack === 'generic'
      ? 'Стек не определён (generic)'
      : `Проект (${commands.techStack}) не объявляет тестовых команд`;

  return (
    `${cause} и в задании не заданы ни unitTestCmd, ни e2eTestCmd — приёмке нечего запускать. ` +
    'Укажите команды в task_*.json или объявите их в проекте.'
  );
}
