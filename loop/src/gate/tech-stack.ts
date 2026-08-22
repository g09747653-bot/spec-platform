import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { HANDOFF, HandoffTask, taskFileName, type TechStack } from '../intake/handoff.ts';

/**
 * Detecting the project's stack, and writing the answer back to disk (task 157).
 *
 * The A0 solution's algorithm, unchanged: marker files decide, in a fixed order. What changed with
 * D-314 is **whose eyes collect the facts**. The detection itself is a pure function over an
 * observation (`detectStackFromObservation`); the acceptance gate feeds it a listing taken from
 * inside a container (`gate/observe.ts`), because the live M17а gate measured a long-lived host
 * process being persistently blind to files a container had written through the bind mount —
 * `go.mod` existed, fresh processes saw it, and the loop's own `existsSync` answered false for ten
 * minutes straight, so the gate judged yesterday's world. The host-eyed collector below survives
 * for exactly one caller: boot-time recovery, which runs in a fresh process (the measured blindness
 * belongs to long-lived ones) and repairs an assignment's lost field rather than judging a verdict.
 */

export interface DetectedStack {
  techStack: TechStack;
  unitTestCmd: string;
  e2eTestCmd: string;
}

/**
 * The facts a detection consumes: paths of the project's two top levels (every marker file lives no
 * deeper than `tests/e2e`), and the manifest's text when `package.json` is among them. Who collected
 * them — a container's `find` or a fresh process's `existsSync` — is the caller's statement about
 * whose eyes are trustworthy in its context.
 */
export interface StackObservation {
  paths: ReadonlySet<string>;
  packageJson: string | null;
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
export function detectStackFromObservation(observation: StackObservation): DetectedStack {
  const { paths } = observation;

  if (paths.has('package.json')) {
    const scripts = manifestScripts(observation.packageJson ?? '');

    return {
      techStack: 'nodejs',
      unitTestCmd: scripts.has('test') ? 'npm test' : '',
      e2eTestCmd: scripts.has('test:e2e') ? 'npm run test:e2e' : '',
    };
  }
  if (paths.has('requirements.txt') || paths.has('pyproject.toml')) {
    return {
      techStack: 'python',
      unitTestCmd: 'pytest',
      e2eTestCmd: paths.has('tests/e2e') ? 'pytest tests/e2e' : '',
    };
  }
  if (paths.has('go.mod')) {
    return { techStack: 'go', unitTestCmd: 'go test ./...', e2eTestCmd: '' };
  }
  if (paths.has('Cargo.toml')) {
    return { techStack: 'rust', unitTestCmd: 'cargo test', e2eTestCmd: '' };
  }

  // No marker at all: the gate refuses unless the assignment names its own commands.
  return { techStack: 'generic', unitTestCmd: '', e2eTestCmd: '' };
}

/**
 * Host-eyed detection — **boot-time recovery only** (task 162; `readHandoffTree`).
 *
 * Recovery runs in a process that has just started, and the D-314 blindness was measured on
 * long-lived ones: fresh probes saw the container's files without trouble. It also repairs a lost
 * `techStack` field rather than deciding an acceptance, so a stale answer costs a label, not a
 * verdict. The cycle itself must not call this — the gate observes from inside a container
 * (`gate/observe.ts`) at the moment it judges.
 */
export function detectTechStack(workspacePath: string): DetectedStack {
  const paths = new Set<string>();
  for (const marker of [
    'package.json',
    'requirements.txt',
    'pyproject.toml',
    'go.mod',
    'Cargo.toml',
    join('tests', 'e2e'),
  ]) {
    if (existsSync(join(workspacePath, marker))) paths.add(marker.replaceAll('\\', '/'));
  }

  let packageJson: string | null = null;
  if (paths.has('package.json')) {
    try {
      packageJson = readFileSync(join(workspacePath, 'package.json'), 'utf8');
    } catch {
      packageJson = null;
    }
  }

  return detectStackFromObservation({ paths, packageJson });
}

/** The script names a manifest's text defines. An unreadable manifest defines none. */
function manifestScripts(text: string): Set<string> {
  try {
    const parsed: unknown = JSON.parse(text);

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
 * Writes what the gate actually judged against into the assignment on disk.
 *
 * The disk is the source of truth: a later reader — the executor of a retry, a recovery after a
 * crash, the operator opening the file — must see the stack the verdict was reached under rather
 * than the guess the intake made before the code existed. Called by the cycle right after the
 * acceptance observed the stack with container eyes (D-314): the observation is the gate's, the
 * bookkeeping is the cycle's.
 */
export function rewriteAssignment(
  projectDirectory: string,
  taskId: string,
  commands: ResolvedCommands,
): boolean {
  const path = join(projectDirectory, HANDOFF.tasks, taskFileName(taskId));
  const task = HandoffTask.parse(JSON.parse(readFileSync(path, 'utf8')));

  const updated: HandoffTask = {
    ...task,
    techStack: commands.techStack,
    ...(commands.unitTestCmd === '' ? {} : { unitTestCmd: commands.unitTestCmd }),
    ...(commands.e2eTestCmd === '' ? {} : { e2eTestCmd: commands.e2eTestCmd }),
  };

  if (JSON.stringify(task) === JSON.stringify(updated)) return false;

  writeFileSync(path, `${JSON.stringify(HandoffTask.parse(updated), null, 2)}\n`, 'utf8');
  return true;
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
