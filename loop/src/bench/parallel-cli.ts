import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  executorCredential,
  getEnv,
  providerCredentials,
  roleConfiguration,
} from '../config/env.ts';
import { executorStubEnabled } from '../config/harness.ts';
import { openMigratedDatabase } from '../db/migrate.ts';
import { createDockerEngine } from '../docker/engine.ts';
import { resolveEndpoint } from '../docker/transport.ts';
import { ensureExecutorImage } from '../executor/image.ts';
import { intakeBundle } from '../intake/intake.ts';
import { createRoleChain } from '../llm/roles.ts';
import { createLogger } from '../observability/log.ts';
import { driveProject } from '../orchestrator/orchestrator.ts';
import type { CycleResult } from '../cycle/run-cycle.ts';

import {
  busyOf,
  concurrencyProfile,
  instrumentEngine,
  instrumentLogger,
  rehearsalExecutorCommand,
  startupCost,
  writeParallelBundle,
  type ContainerSpan,
  type TariffObservation,
} from './parallel-measure.ts';

/**
 * Замер собственной параллельности: один бандл, два прогона (А-44 п.5).
 *
 * `node src/bench/parallel-cli.ts [--tasks=10] [--wide=10] [--narrow=1] [--out=путь]`
 *
 * Прогоняется ОДИН И ТОТ ЖЕ бандл дважды — при потолке в десять исполнителей и при потолке в
 * одного, — и печатаются числа, которых у нас не было: средняя одновременность, доля стены с нулём
 * исполнителей, стена обоих прогонов, фактическое ускорение, поведение тарифа и, отдельной строкой,
 * накладные вне исполнения. Числа публикуются как есть; воротами они не становятся.
 *
 * Каждый прогон живёт в своей рабочей директории и в своей базе: перезаход тем же projectId молча
 * встаёт на статусах прошлого прогона, и «второй прогон того же бандла» тогда измерял бы не второй
 * прогон.
 */

interface RunOutcome {
  label: string;
  projectId: string;
  maxExecutors: number;
  intakeMs: number;
  pipelineMs: number;
  totalMs: number;
  tasks: number;
  accepted: number;
  failed: number;
  executor: ReturnType<typeof concurrencyProfile>;
  acceptance: ReturnType<typeof concurrencyProfile>;
  acceptanceBusyMs: number;
  probeBusyMs: number;
  startup: ReturnType<typeof startupCost>;
  tariff: TariffObservation;
  spans: ContainerSpan[];
}

function argOf(name: string, fallback: number): number {
  /* eslint-disable-next-line no-restricted-properties -- CLI замера читает свою же командную строку. */
  const raw = process.argv.find((entry) => entry.startsWith(`--${name}=`))?.split('=')[1];
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function pathArg(name: string, fallback: string): string {
  /* eslint-disable-next-line no-restricted-properties -- см. выше. */
  return process.argv.find((entry) => entry.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
}

async function measure(args: {
  label: string;
  projectId: string;
  maxExecutors: number;
  root: string;
  tasks: number;
}): Promise<RunOutcome> {
  const env = getEnv();
  const projectDirectory = writeParallelBundle({
    root: args.root,
    projectId: args.projectId,
    bundleId: `parallel-${String(args.tasks)}`,
    tasks: args.tasks,
  });

  /* Своя база на прогон: чужие статусы прошлого захода — не второй прогон, а его отсутствие. */
  const database = openMigratedDatabase(join(args.root, `${args.projectId}.db`));
  const { logger, tariff } = instrumentLogger(createLogger(database));

  const real = createDockerEngine(
    resolveEndpoint(process.platform, {
      DOCKER_ENGINE_PIPE: env.DOCKER_ENGINE_PIPE,
      DOCKER_ENGINE_SOCKET: env.DOCKER_ENGINE_SOCKET,
    }),
  );
  const { engine, spans } = instrumentEngine(real);

  await ensureExecutorImage(real, (message) => {
    console.log(`[образ] ${message}`);
  });

  const roles = roleConfiguration(env);
  const credentials = providerCredentials(env);
  const architect = createRoleChain(roles, 'architect', credentials);
  const researcher = createRoleChain(roles, 'researcher', credentials);
  const judge = createRoleChain(roles, 'judge', credentials);

  const startedAt = Date.now();

  const intake = await intakeBundle(
    { projectDirectory, projectTitle: args.label },
    {
      database,
      logger,
      chain: architect.providers.length === 0 ? null : architect,
      researchChain: researcher.providers.length === 0 ? null : researcher,
    },
  );

  const afterIntake = Date.now();

  const results: CycleResult[] = await driveProject(intake.projectId, projectDirectory, {
    database,
    engine,
    logger,
    credential: executorCredential(env),
    maxExecutors: args.maxExecutors,
    acceptanceTestTimeoutMs: env.ACCEPTANCE_TEST_TIMEOUT_MS,
    researchChain: researcher.providers.length === 0 ? null : researcher,
    judgeChain: judge.providers.length === 0 ? null : judge,
    ...(env.LOOP_ANTHROPIC_MODEL === undefined ? {} : { model: env.LOOP_ANTHROPIC_MODEL }),
    /* Репетиция бухгалтерии замера: заглушка делает то же, что настоящий исполнитель этой задачи. */
    ...(executorStubEnabled() ? { executorCommand: rehearsalExecutorCommand } : {}),
  });

  const finishedAt = Date.now();
  const window = { from: afterIntake, to: finishedAt };

  database.close();

  return {
    label: args.label,
    projectId: intake.projectId,
    maxExecutors: args.maxExecutors,
    intakeMs: afterIntake - startedAt,
    pipelineMs: finishedAt - afterIntake,
    totalMs: finishedAt - startedAt,
    tasks: intake.tasks.length,
    accepted: results.filter((entry) => entry.outcome === 'COMPLETED').length,
    failed: results.filter((entry) => entry.outcome === 'FAILED').length,
    executor: concurrencyProfile(spans, 'executor', window),
    acceptance: concurrencyProfile(spans, 'acceptance', window),
    acceptanceBusyMs: busyOf(spans, 'acceptance', finishedAt),
    probeBusyMs: busyOf(spans, 'probe', finishedAt),
    startup: startupCost(spans),
    tariff,
    spans,
  };
}

const seconds = (ms: number): string => (ms / 1000).toFixed(1);
const percent = (share: number): string => (share * 100).toFixed(1);

function render(wide: RunOutcome, narrow: RunOutcome): string {
  const speedup = wide.pipelineMs === 0 ? 0 : narrow.pipelineMs / wide.pipelineMs;
  const ideal = wide.maxExecutors;

  const block = (run: RunOutcome): string[] => [
    `### ${run.label} (потолок ${String(run.maxExecutors)})`,
    '',
    `- задач: ${String(run.tasks)}; принято ${String(run.accepted)}, красных ${String(run.failed)}`,
    `- стена конвейера: ${seconds(run.pipelineMs)} с (интейк и планирование сверх того: ${seconds(run.intakeMs)} с)`,
    `- средняя одновременность исполнителей: ${run.executor.average.toFixed(2)}`,
    `- пик одновременности: ${String(run.executor.peak)}`,
    `- доля стены с НУЛЁМ исполнителей: ${percent(run.executor.zeroShare)}% (${seconds(run.executor.zeroMs)} с)`,
    `- полезная работа исполнителей: ${seconds(run.executor.busyMs)} контейнеро-секунд`,
    `- приёмка: ${seconds(run.acceptanceBusyMs)} контейнеро-секунд, средняя одновременность ${run.acceptance.average.toFixed(2)}`,
    `- суд качества: ${seconds(run.probeBusyMs)} контейнеро-секунд`,
    `- контейнеров поднято: ${String(run.startup.containers)}; суммарная задержка старта ${seconds(run.startup.totalMs)} с (в среднем ${run.startup.averageMs.toFixed(0)} мс)`,
    `- тариф: строк ${String(run.tariff.lines)}, статусы ${JSON.stringify(run.tariff.statuses)}, все разрешены: ${run.tariff.allAllowed ? 'да' : 'НЕТ'}`,
    '',
  ];

  /*
   * **Накладные вне исполнения считаются СТЕНОЙ, а не суммой контейнеро-секунд.**
   *
   * Репетиция №1 намерила, зачем: сумма «интейк + приёмка + суд + старты» дала 103,8% полной стены
   * — потому что приёмочные контейнеры идут ПАРАЛЛЕЛЬНО исполнительским и складывать их со
   * стеной нельзя. Вне исполнения находится ровно то время, когда не работает ни один исполнитель:
   * интейк целиком (исполнителей ещё нет) плюс мёртвая стена конвейера. Контейнеро-секунды
   * приёмки и суда остаются в отчёте — но как ОТВЕТ НА ВОПРОС «чем эта мёртвая стена занята»,
   * а не как её слагаемые.
   */
  const overheadOf = (run: RunOutcome): number => run.intakeMs + run.executor.zeroMs;

  return [
    '## Замер собственной параллельности (А-44 п.5)',
    '',
    `Бандл: одна веха, ${String(wide.tasks)} задач, ${String(wide.tasks)} разных файлов, ни одной зависимости.`,
    'Прогон один и тот же, потолок разный. Числа — свои, ворот из них не делается.',
    '',
    ...block(wide),
    ...block(narrow),
    '### Итог',
    '',
    ...(wide.accepted === wide.tasks && narrow.accepted === narrow.tasks
      ? []
      : [
          `**Прогоны НЕСРАВНИМЫ**: широкий принял ${String(wide.accepted)} из ${String(wide.tasks)}, ` +
            `узкий — ${String(narrow.accepted)} из ${String(narrow.tasks)}. Ускорение ниже посчитано ` +
            'по разной работе и числом не является.',
          '',
        ]),
    `- фактическое ускорение по стене конвейера: **${speedup.toFixed(2)}×** ` +
      `(${seconds(narrow.pipelineMs)} с → ${seconds(wide.pipelineMs)} с)`,
    `- идеальное при потолке ${String(ideal)}: ${String(ideal)}×; доля идеала: ${percent(speedup / ideal)}%`,
    `- средняя одновременность против потолка: ${wide.executor.average.toFixed(2)} из ${String(ideal)}`,
    '',
    '### Накладные вне исполнения — то, что не параллелится',
    '',
    'Стена, а не сумма контейнеро-секунд: приёмочные контейнеры идут параллельно исполнительским,',
    'и складывать их со стеной нельзя. Вне исполнения — время, когда не работает ни один исполнитель.',
    '',
    `| накладная | широкий прогон | узкий прогон |`,
    `|---|---|---|`,
    `| интейк и планирование (стена) | ${seconds(wide.intakeMs)} с | ${seconds(narrow.intakeMs)} с |`,
    `| мёртвая стена конвейера (нуль исполнителей) | ${seconds(wide.executor.zeroMs)} с | ${seconds(narrow.executor.zeroMs)} с |`,
    `| **всего вне исполнения (стена)** | **${seconds(overheadOf(wide))} с** | **${seconds(overheadOf(narrow))} с** |`,
    `| доля от полной стены | ${percent(overheadOf(wide) / wide.totalMs)}% | ${percent(overheadOf(narrow) / narrow.totalMs)}% |`,
    '',
    'Чем занята мёртвая стена — контейнеро-секунды, для атрибуции, не для сложения:',
    '',
    `| занятие | широкий прогон | узкий прогон |`,
    `|---|---|---|`,
    `| приёмка | ${seconds(wide.acceptanceBusyMs)} с | ${seconds(narrow.acceptanceBusyMs)} с |`,
    `| суд качества | ${seconds(wide.probeBusyMs)} с | ${seconds(narrow.probeBusyMs)} с |`,
    `| подъём контейнеров | ${seconds(wide.startup.totalMs)} с | ${seconds(narrow.startup.totalMs)} с |`,
    '',
  ].join('\n');
}

const root = resolve(pathArg('root', join(getEnv().WORKSPACE_ROOT_PATH, 'parallel-measure')));
const out = resolve(pathArg('out', join(root, 'PARALLEL.md')));
const tasks = Math.round(argOf('tasks', 10));

rmSync(root, { recursive: true, force: true });
mkdirSync(root, { recursive: true });

console.log(`Замер параллельности: ${String(tasks)} задач, рабочая директория ${root}`);

const wide = await measure({
  label: 'широкий прогон',
  projectId: 'par-wide',
  maxExecutors: Math.round(argOf('wide', 10)),
  root,
  tasks,
});

console.log(`Широкий прогон закончен: стена ${seconds(wide.pipelineMs)} с.`);

const narrow = await measure({
  label: 'узкий прогон',
  projectId: 'par-narrow',
  maxExecutors: Math.round(argOf('narrow', 1)),
  root,
  tasks,
});

console.log(`Узкий прогон закончен: стена ${seconds(narrow.pipelineMs)} с.`);

const report = render(wide, narrow);
writeFileSync(out, `${report}\n`, 'utf8');
writeFileSync(
  `${out}.json`,
  `${JSON.stringify({ wide, narrow }, null, 2)}\n`,
  'utf8',
);

console.log(report);
console.log(`\nОтчёт: ${out}`);
