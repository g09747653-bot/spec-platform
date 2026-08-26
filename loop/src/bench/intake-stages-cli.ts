import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

import { getEnv, providerCredentials, roleConfiguration } from '../config/env.ts';
import { openMigratedDatabase } from '../db/migrate.ts';
import { DEFAULT_INTAKE_CONCURRENCY } from '../intake/fan-out.ts';
import { intakeBundle, type IntakeStageSpan } from '../intake/intake.ts';
import { readBundle } from '../intake/validate.ts';
import type { Chain } from '../llm/chain.ts';
import { createRoleChain } from '../llm/roles.ts';
import { createLogger } from '../observability/log.ts';

/**
 * Разбивка стены интейка ПО СТАДИЯМ (А-51 п.3; живой режим — А-52 п.2).
 *
 * `node src/bench/intake-stages-cli.ts [--bundle=путь] [--latency=9098] [--wide=5] [--out=путь]`
 * `node --env-file-if-exists=.env src/bench/intake-stages-cli.ts --live [--wide=5] [--out=путь]`
 *
 * **Почему замер стоит перед правкой, а не после.** Мандат требует распараллелить планирование, но
 * «интейк 127,4 с» — одно число за шестью разными работами, и ускорять вслепую значит гадать, какая
 * из них этих секунд стоит. Здесь стадии разложены поимённо, и видно, что стоит распараллеливания,
 * а что — шум.
 *
 * **Что здесь настоящее и что подставлено.** Настоящее: весь интейк целиком — исследователь, класс
 * задумки, суждение о выполнимости, суждение об объёме, нарезка вех, написание заданий, запись
 * дерева, индексация. Подставлена ровно одна вещь: ЗАДЕРЖКА модельного звена. Она берётся не с
 * потолка, а из живого замера А-44: широкий прогон дал `intakeMs = 127369` при 14 модельных
 * вызовах на бандле из десяти задач, то есть **9098 мс на вызов**. Это и есть умолчание `--latency`.
 *
 * **`--live` (А-52 п.2) убирает и её.** Цепочки берутся из окружения контура — те же роли, тот же
 * порядок провайдеров, что у прода (`LOOP_PROVIDER_ORDER`), — и каждый вызов стоит настоящего хода
 * настоящего звена. Это подтверждение симуляции живьём: тот же бандл, тот же код, те же два потолка
 * веера; расхождение двух отчётов — это и есть цена подставленной задержки, названная числом.
 *
 * **Чего числа НЕ значат.** Они не предсказывают живой интейк на другом бандле и другой цепочке:
 * задержка настоящего звена гуляет с длиной промпта и с загрузкой провайдера. Они называют ДРУГОЕ,
 * и это как раз спрошенное: какая доля стены интейка приходится на какую стадию и что из этого
 * забирает веер.
 */

function argOf(name: string, fallback: number): number {
  const raw = process.argv.find((entry) => entry.startsWith(`--${name}=`))?.split('=')[1];
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function pathArg(name: string, fallback: string): string {
  return process.argv.find((entry) => entry.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
}

/** Замеренная средняя задержка модельного вызова: 127369 мс / 14 вызовов широкого прогона А-44. */
const A44_LATENCY_MS = 9098;

/** Живой режим: настоящие цепочки вместо подставленной задержки (А-52 п.2). */
const live = process.argv.includes('--live');

const bundlePath = resolve(pathArg('bundle', '../artifacts/gate-M14a/machine-bundle/bundle'));
const latency = argOf('latency', A44_LATENCY_MS);
const wide = argOf('wide', DEFAULT_INTAKE_CONCURRENCY);
const out = resolve(
  pathArg(
    'out',
    live ? '../.specs/handoff/INTAKE-STAGES-LIVE.md' : '../.specs/handoff/INTAKE-STAGES.md',
  ),
);

/**
 * Звено с замеренной задержкой и осмысленными ответами.
 *
 * Отвечать «как попало» здесь нельзя: неразобранный ответ уводит стадию в деградацию, и замер
 * померил бы скелет кода вместо работы модели. Ответы даются по порядку вопросов интейка — тот же
 * порядок, что закреплён его регрессиями.
 */
function latencyChain(titles: readonly string[]): Chain {
  let call = 0;

  return {
    /*
     * Звено обязано ЧИСЛИТЬСЯ, а не только отвечать: исследователь спрашивает модель лишь при
     * непустом перечне провайдеров (`researcher.ts`), и с пустым его стадия вышла бы бесплатной —
     * то есть замер потерял бы первый вопрос интейка и сдвинул бы все остальные ответы на один.
     */
    providers: [
      {
        id: 'claude-cli',
        model: 'замер-стадий',
        supportsImages: false,
        generate: () => Promise.resolve(''),
      },
    ],
    generate: async () => {
      const index = call;
      call += 1;

      await new Promise((resolve_) => setTimeout(resolve_, latency));

      if (index === 0) {
        /* Исследователь: его ответ — свободная проза, разбирать нечего. */
        return { text: 'Рабочая директория пуста, кроме бандла.', provider: 'claude-cli' as const };
      }
      if (index === 1) {
        return {
          text: '{"artifactClass":"system","reason":"сервис"}',
          provider: 'claude-cli' as const,
        };
      }
      if (index === 2) {
        return {
          text: JSON.stringify({ reproducible: ['всё по задумке'], outOfReach: [] }),
          provider: 'claude-cli' as const,
        };
      }
      if (index === 3) {
        return {
          text: JSON.stringify({
            items: titles.map((title) => ({
              title,
              units: 1,
              necessity: 'основное',
              why: 'ядро задумки',
            })),
          }),
          provider: 'claude-cli' as const,
        };
      }

      return {
        text: JSON.stringify({
          description: 'Сделай по записи задачи.',
          filesToEdit: [],
          unitTestCmd: 'node -e 0',
        }),
        provider: 'claude-cli' as const,
      };
    },
  };
}

interface Run {
  concurrency: number;
  totalMs: number;
  stages: IntakeStageSpan[];
  tasks: number;
  writtenByModel: number;
}

async function measure(concurrency: number): Promise<Run> {
  const root = mkdtempSync(join(tmpdir(), 'loop-stages-'));
  const projectDirectory = join(root, 'project');
  mkdirSync(projectDirectory, { recursive: true });
  cpSync(bundlePath, join(projectDirectory, 'bundle'), { recursive: true });
  writeFileSync(
    join(projectDirectory, 'SEED.md'),
    'Собери сервис из независимых частей — задумка системного класса.',
    'utf8',
  );

  const database = openMigratedDatabase(join(root, 'loop.db'));
  const titles = readBundle(join(projectDirectory, 'bundle')).tasks.map((task) => task.title);

  /*
   * Симуляция: одно звено на все роли — как в проде, когда роли отдельно не настроены
   * (`createRoleChain` падает на общий порядок). Счётчик вызовов при этом общий, и порядок ответов
   * совпадает с порядком вопросов интейка: исследователь, класс, выполнимость, объём, задания.
   *
   * Живой режим (А-52 п.2): цепочки из окружения контура, ролями, как их собирает прод. Пустая
   * цепочка архитектора — именованный отказ, а не бесплатная стадия: замер с неответившим звеном
   * мерил бы скелет кода вместо работы модели (урок А-51, строка карты 10б).
   */
  let chain: Chain;
  let researchChain: Chain;

  if (live) {
    const env = getEnv();
    const roles = roleConfiguration(env);
    const credentials = providerCredentials(env);
    const architect = createRoleChain(roles, 'architect', credentials);
    const researcher = createRoleChain(roles, 'researcher', credentials);

    if (architect.providers.length === 0) {
      throw new Error(
        'живой замер невозможен: цепочка архитектора пуста — настройте провайдеров в loop/.env',
      );
    }

    chain = architect;
    researchChain = researcher.providers.length === 0 ? architect : researcher;
  } else {
    chain = latencyChain(titles);
    researchChain = chain;
  }

  const startedAt = Date.now();
  const intake = await intakeBundle(
    { projectDirectory, projectTitle: 'Замер стадий' },
    {
      database,
      logger: createLogger(database),
      chain,
      researchChain,
      concurrency,
    },
  );
  const totalMs = Date.now() - startedAt;

  database.close();
  rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  rmSync(join(dirname(resolve(projectDirectory)), '.loop-ledger'), {
    recursive: true,
    force: true,
  });

  return {
    concurrency,
    totalMs,
    stages: intake.stages,
    tasks: intake.tasks.length,
    writtenByModel: intake.writtenByModel,
  };
}

const seconds = (ms: number): string => (ms / 1000).toFixed(1);

function table(run: Run): string[] {
  return [
    `### Потолок веера: ${String(run.concurrency)}`,
    '',
    `- задач в плане: ${String(run.tasks)}; заданий написала модель: ${String(run.writtenByModel)}`,
    `- стена интейка: **${seconds(run.totalMs)} с**`,
    '',
    '| стадия | стена | доля | модельных вызовов |',
    '|---|---|---|---|',
    ...run.stages.map((span) => {
      const ms = span.endedAt - span.startedAt;
      const percent = run.totalMs === 0 ? 0 : (ms / run.totalMs) * 100;
      return `| ${span.stage} | ${seconds(ms)} с | ${percent.toFixed(1)}% | ${String(span.calls)} |`;
    }),
    `| **интейк целиком** | **${seconds(run.totalMs)} с** | 100% | **${String(run.stages.reduce((sum, span) => sum + span.calls, 0))}** |`,
    '',
  ];
}

const sequential = await measure(1);
const parallel = await measure(wide);

const preamble = live
  ? [
      '## Живой прогон интейка по стадиям (А-52 п.2)',
      '',
      `Бандл: \`${bundlePath}\`. Задержки не подставлены: каждый вызов — настоящий ход настоящей`,
      'цепочки контура (`LOOP_PROVIDER_ORDER`), ролями, как их собирает прод. Тот же бандл, тот же',
      'код и те же два потолка веера, что у симуляции выше, — расхождение двух отчётов и есть цена',
      'подставленной задержки звена.',
      '',
    ]
  : [
      '## Разбивка интейка по стадиям и цена веера (А-51 п.3)',
      '',
      `Бандл: \`${bundlePath}\`. Задержка модельного звена: **${String(latency)} мс на вызов** —`,
      'не выдумана, а взята из живого замера А-44 (`intakeMs = 127369` при 14 вызовах широкого прогона).',
      '',
      'Настоящее здесь всё, кроме задержки звена: те же стадии, тот же порядок, тот же код. Числа не',
      'предсказывают живой интейк на другой цепочке — они называют, какая доля стены на какой стадии',
      'лежит и что из этого забирает веер.',
      '',
    ];

const report = [
  ...preamble,
  ...table(sequential),
  ...table(parallel),
  '### Итог',
  '',
  `- стена интейка: ${seconds(sequential.totalMs)} с → ${seconds(parallel.totalMs)} с`,
  `- **ускорение интейка: ${(sequential.totalMs / Math.max(parallel.totalMs, 1)).toFixed(2)}×**`,
  ...(() => {
    const before = sequential.stages.find((span) => span.stage === 'задания');
    const after = parallel.stages.find((span) => span.stage === 'задания');
    if (before === undefined || after === undefined) return [];
    const beforeMs = before.endedAt - before.startedAt;
    const afterMs = after.endedAt - after.startedAt;
    return [
      `- стадия заданий: ${seconds(beforeMs)} с → ${seconds(afterMs)} с ` +
        `(**${(beforeMs / Math.max(afterMs, 1)).toFixed(2)}×**) — именно она и параллелится`,
      `- остальные стадии не тронуты: они последовательны по существу (класс нужен плану, ` +
        'выполнимость и объём нужны условиям), и веер им не положен',
    ];
  })(),
  '',
].join('\n');

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${report}\n`, 'utf8');
writeFileSync(
  out.replace(/\.md$/, '.json'),
  `${JSON.stringify(
    { sequential, parallel, ...(live ? { live } : { latency }), bundlePath },
    null,
    2,
  )}\n`,
  'utf8',
);

console.log(report);
console.log(`Отчёт записан: ${out}`);
