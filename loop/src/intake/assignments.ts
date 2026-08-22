import { z } from 'zod';

import type { Chain } from '../llm/chain.ts';

import { HandoffTask, type TechStack } from './handoff.ts';
import type { SlicedMilestone } from './milestones.ts';
import type { BundleTask } from './validate.ts';

/**
 * Turning a bundle task into an executable assignment (task 156).
 *
 * **What is decided and what is written are different jobs.** The identity of the task, which
 * milestone it belongs to, what it waits for, its status — all decided by code above this file. What
 * the model contributes is prose an executor can act on and a *suggestion* of which files it will
 * touch. If the model is unreachable, the assignment is still written, from the bundle's own text:
 * a loop that cannot start because a provider is down would be a loop with the model in its control
 * path, which is exactly what D-229 forbids.
 *
 * `filesToEdit` is required by the contract and is never guessed into existence: the model's
 * suggestion when there is one, paths mined out of the task's own description when there is not,
 * and an honest empty list when the description names none.
 */

/**
 * What the model is asked to add.
 *
 * **`null` means absent, and is accepted as such.** The live gate walk found this: asked for an
 * assignment with no end-to-end suite, Gemini answered `"e2eTestCmd": null` — which is the honest
 * answer to the question — and a schema that took only `undefined` rejected the whole object. The
 * cost was not the missing field: it was that the *description* went with it, and three assignments
 * out of nineteen fell back to the bundle's own prose for the sake of a key the model had correctly
 * left empty. A `null` in a place a model was told it may omit is not a malformed answer.
 */
const Enrichment = z.object({
  description: z.string().min(1),
  filesToEdit: z.array(z.string()),
  unitTestCmd: z.string().nullish().transform(nullToUndefined),
  e2eTestCmd: z.string().nullish().transform(nullToUndefined),
  /**
   * The architect's mark on a task known to be heavy (task 174) — same bounds as the task schema.
   * `null` is «no mark», by the same measured lesson as the commands above; an out-of-range number
   * is also read as no mark rather than costing the whole assignment its description.
   */
  iterationTimeoutSec: z
    .number()
    .int()
    .positive()
    .max(7_200)
    .nullish()
    .catch(undefined)
    .transform((value) => value ?? undefined),
});

/** An empty string is as absent as `null`: a command nobody can run is not a command. */
function nullToUndefined(value: string | null | undefined): string | undefined {
  return value === null || value === undefined || value.trim() === '' ? undefined : value;
}

type Enrichment = z.infer<typeof Enrichment>;

const SYSTEM = [
  'Ты — архитектор автономного контура доставки. По записи задачи из спецификационного бандла ты',
  'пишешь ЗАДАНИЕ для агента-исполнителя, который будет работать один, в контейнере, без права',
  'задать вопрос. Отвечай ТОЛЬКО JSON-объектом, без пояснений и без обрамляющих кавычек кода.',
].join(' ');

/** Paths as they appear in prose: backticked, quoted, or bare with a slash and an extension. */
const PATH_IN_PROSE = /`([^`\n]*\/[^`\n]*)`|(?<![\w/])([\w.-]+\/[\w./-]+\.[a-z]{1,6})(?![\w/])/gi;

/** The conservative fallback for `filesToEdit`: what the task's own description already names. */
export function pathsMentionedIn(text: string): string[] {
  const found = new Set<string>();

  for (const match of text.matchAll(PATH_IN_PROSE)) {
    const path = (match[1] ?? match[2] ?? '').trim();
    if (path !== '' && !path.endsWith('/')) found.add(path.replace(/^\.\//, ''));
  }

  return [...found];
}

export interface AssignmentContext {
  /** The bundle's architecture document, trimmed — what the executor is building inside. */
  architecture: string;
  techStack: TechStack;
  /**
   * The researcher's report on the workspace as it actually stands (task 161).
   *
   * Empty on a greenfield intake, and that is the honest value — there is nothing there yet. From
   * the second intake onwards it is what stops the architect proposing a layout the project has
   * already contradicted: the bundle describes what was planned, this describes what exists.
   */
  research?: string;
}

function prompt(task: BundleTask, context: AssignmentContext): string {
  return [
    'Архитектура проекта (сокращённо):',
    context.architecture.slice(0, 4000),
    '',
    `Стек проекта: ${context.techStack}.`,
    '',
    ...(context.research === undefined || context.research.trim() === ''
      ? []
      : ['Отчёт исследователя о рабочей директории:', context.research, '']),
    'Запись задачи из бандла:',
    JSON.stringify(
      { taskId: task.taskId, title: task.title, description: task.description },
      null,
      2,
    ),
    '',
    'Верни JSON вида:',
    '{',
    '  "description": "что именно сделать, по шагам, в повелительном наклонении",',
    '  "filesToEdit": ["путь/от/корня/рабочей/директории.ts"],',
    '  "unitTestCmd": "команда модульных тестов, если применима",',
    '  "e2eTestCmd": "команда сквозных тестов, если применима",',
    '  "iterationTimeoutSec": null',
    '}',
    '',
    'filesToEdit — предложение, а не догадка: перечисляй только те файлы, которые следуют из',
    'записи задачи и архитектуры. Если файлы не выводятся, верни пустой массив.',
    'Команды тестов — POSIX sh: приёмка исполняет их через `sh -c` в Linux-контейнере, поэтому',
    'никаких конструкций PowerShell или cmd — они честно валятся кодом 2 (урок прогона Б, задача 176).',
    'unitTestCmd ОБЯЗАТЕЛЕН: задание без единой команды приёмка отвергает («нечего запускать»),',
    'и задача краснеет, не будучи судимой. Если у задачи нет собственных тестов — назови честную',
    'POSIX-проверку её результата: команду сборки, `node --check файл.js`, `test -f путь` по',
    'создаваемым файлам. Проверка должна проходить в чистом контейнере после честного выполнения',
    'задачи и падать без него (урок финальной приёмки: 15 заданий «если применимо» из 41 остались',
    'без команд, и конвейер замёрз волной отказов).',
    'iterationTimeoutSec — почти всегда null: у исполнителя и так есть просторный потолок времени.',
    'Ставь число секунд (не больше 7200) только для задачи, заведомо необычно тяжёлой — например,',
    'генерация большого корпуса или долгая сборка, названная в самой записи задачи.',
  ].join('\n');
}

/** A model that wrapped its JSON in a fence, or in a sentence, has still answered. */
function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const candidate = (fenced?.[1] ?? text).trim();

  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end <= start) return null;

  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

export interface AssignmentResult {
  task: HandoffTask;
  /** Which provider wrote the prose, or `null` when the deterministic fallback did. */
  writtenBy: string | null;
  /** Present when the model could not be used — a named degradation, not a silent one. */
  degradedBecause?: string;
}

export async function buildAssignment(
  task: BundleTask,
  milestone: SlicedMilestone,
  context: AssignmentContext,
  chain: Chain | null,
): Promise<AssignmentResult> {
  const artifacts = Array.isArray(task.metadata.expectedArtifacts)
    ? task.metadata.expectedArtifacts
    : [];

  const fallback: Enrichment = {
    description: task.description.trim() === '' ? task.title : task.description,
    filesToEdit: pathsMentionedIn(`${task.title}\n${task.description}`),
    unitTestCmd: undefined,
    e2eTestCmd: undefined,
    iterationTimeoutSec: undefined,
  };

  let enrichment = fallback;
  let writtenBy: string | null = null;
  let degradedBecause: string | undefined;

  if (chain !== null) {
    try {
      const answer = await chain.generate({ system: SYSTEM, prompt: prompt(task, context) });
      const parsed = Enrichment.safeParse(extractJson(answer.text));

      if (parsed.success) {
        enrichment = parsed.data;
        writtenBy = answer.provider;
      } else {
        degradedBecause = `ответ модели не разобран: ${z.prettifyError(parsed.error)}`;
      }
    } catch (error) {
      degradedBecause = error instanceof Error ? error.message : String(error);
    }
  } else {
    degradedBecause = 'провайдер не настроен';
  }

  const parsedTask = HandoffTask.parse({
    taskId: task.taskId,
    milestoneId: milestone.milestoneId,
    title: task.title,
    description: enrichment.description,
    techStack: context.techStack,
    filesToEdit: enrichment.filesToEdit,
    dependsOn: task.dependsOn,
    ...(enrichment.unitTestCmd === undefined ? {} : { unitTestCmd: enrichment.unitTestCmd }),
    ...(enrichment.e2eTestCmd === undefined ? {} : { e2eTestCmd: enrichment.e2eTestCmd }),
    ...(enrichment.iterationTimeoutSec === undefined
      ? {}
      : { iterationTimeoutSec: enrichment.iterationTimeoutSec }),
    expectedArtifacts: artifacts,
    status: 'PENDING',
  });

  return {
    task: parsedTask,
    writtenBy,
    ...(degradedBecause === undefined ? {} : { degradedBecause }),
  };
}
