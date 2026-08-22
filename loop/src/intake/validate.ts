import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import Ajv, { type ErrorObject, type ValidateFunction } from 'ajv';

import requirementsSchema from '../../../fixtures/spec-bundle/requirements_schema.json' with { type: 'json' };
import tasksSchema from '../../../fixtures/spec-bundle/tasks_schema.json' with { type: 'json' };

/**
 * Validating an incoming bundle (task 156).
 *
 * **The schemas are imported, not copied** — the very files `fixtures/spec-bundle/` holds, which are
 * the same files the platform's machine export is validated against (task 150; А-20). One contract,
 * two consumers, and a drift on either side is a red test on both. A second copy inside this package
 * would make the contract a coincidence.
 *
 * An AJV rejection prints the **path** of the offending value, because the operator reading it is
 * looking at a 200-KB JSON file and «должно быть строкой» without a path is not a diagnosis.
 */

export const BUNDLE_FILES = Object.freeze({
  constitution: 'constitution.md',
  architecture: 'architecture.md',
  requirements: 'requirements.json',
  tasks: 'tasks.json',
} as const);

export interface BundleTask {
  taskId: string;
  title: string;
  description: string;
  techStack?: string;
  dependsOn: string[];
  metadata: { expectedArtifacts: unknown[] };
}

export interface RequirementsDocument {
  bundleId: string;
  functionalRequirements: { id: string; title: string; description: string }[];
  nonFunctionalRequirements: { id: string; category: string; description: string }[];
}

export interface TasksDocument {
  bundleId: string;
  projectId: string;
  tasks: BundleTask[];
}

export interface Bundle {
  bundleId: string;
  projectId: string;
  constitution: string;
  architecture: string;
  requirements: RequirementsDocument;
  tasks: BundleTask[];
}

export class BundleRejected extends Error {
  readonly issues: readonly string[];

  constructor(file: string, issues: readonly string[]) {
    super(`Бандл отвергнут (${file}):\n${issues.map((issue) => `  - ${issue}`).join('\n')}`);
    this.name = 'BundleRejected';
    this.issues = issues;
  }
}

const ajv = new Ajv({ allErrors: true, strict: false });

/*
 * Typed compilations, so a passing validation *narrows* rather than licensing a cast. `as` on a
 * value the schema just approved would still be an unchecked cast — and AJV already offers the
 * guard, so taking it costs nothing.
 */
const validateRequirements: ValidateFunction<RequirementsDocument> =
  ajv.compile<RequirementsDocument>(requirementsSchema);
const validateTasks: ValidateFunction<TasksDocument> = ajv.compile<TasksDocument>(tasksSchema);

/** `/tasks/3/dependsOn/0: must be string` — the path first, because that is what is looked up. */
function render(errors: readonly ErrorObject[] | null | undefined): string[] {
  return (errors ?? []).map((error) => {
    const path = error.instancePath === '' ? '/' : error.instancePath;
    return `${path}: ${error.message ?? 'не соответствует схеме'}`;
  });
}

function readJson(directory: string, file: string): unknown {
  let raw: string;

  try {
    raw = readFileSync(join(directory, file), 'utf8');
  } catch {
    throw new BundleRejected(file, [`/: файла нет в каталоге бандла (${directory})`]);
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new BundleRejected(file, [`/: не разбирается как JSON — ${String(error)}`]);
  }
}

function readText(directory: string, file: string): string {
  try {
    return readFileSync(join(directory, file), 'utf8');
  } catch {
    throw new BundleRejected(file, [`/: файла нет в каталоге бандла (${directory})`]);
  }
}

/**
 * Reads and validates a `bundle/` directory.
 *
 * Both markdown files are required as well as both JSON ones: a bundle without its constitution is
 * a bundle the executor cannot be told what it is building, and discovering that at task three is
 * worse than discovering it at intake.
 */
export function readBundle(directory: string): Bundle {
  const constitution = readText(directory, BUNDLE_FILES.constitution);
  const architecture = readText(directory, BUNDLE_FILES.architecture);

  const requirements = readJson(directory, BUNDLE_FILES.requirements);
  if (!validateRequirements(requirements)) {
    throw new BundleRejected(BUNDLE_FILES.requirements, render(validateRequirements.errors));
  }

  const tasks = readJson(directory, BUNDLE_FILES.tasks);
  if (!validateTasks(tasks)) {
    throw new BundleRejected(BUNDLE_FILES.tasks, render(validateTasks.errors));
  }

  /*
   * Schema-valid and empty is the M14а gate's own finding, from the other side of this contract: a
   * `tasks.json` with zero tasks passed AJV and handed the loop nothing to do. The export grew a red
   * condition for it; so does the intake, because a contract needs a guard at both ends.
   */
  if (tasks.tasks.length === 0) {
    throw new BundleRejected(BUNDLE_FILES.tasks, [
      '/tasks: ноль задач — схеме соответствует, но исполнять нечего',
    ]);
  }

  /*
   * То же красное условие на requirements (D-316): при финальной приёмке Программы А пустые
   * требования проскочили молча — интейк отверг только задачи, и дефект маппинга был виден лишь
   * наполовину. Красна пустота ОБЕИХ групп сразу: методология вправе честно не иметь
   * нефункциональной секции (speckit и не имеет), но спецификация без единого требования — это не
   * спецификация, а нераспознанная форма.
   */
  if (
    requirements.functionalRequirements.length === 0 &&
    requirements.nonFunctionalRequirements.length === 0
  ) {
    throw new BundleRejected(BUNDLE_FILES.requirements, [
      '/functionalRequirements: ни одного требования — схеме соответствует, но строить не по чему',
    ]);
  }

  return {
    bundleId: tasks.bundleId,
    projectId: tasks.projectId,
    constitution,
    architecture,
    requirements,
    tasks: tasks.tasks,
  };
}
