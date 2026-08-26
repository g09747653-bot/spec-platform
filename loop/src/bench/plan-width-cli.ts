import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { readBundle } from '../intake/validate.ts';
import type { BundleTask } from '../intake/validate.ts';

import { measureWidth, type WidthMeasurement } from './plan-width.ts';

/**
 * Замер ШИРИНЫ ПЛАНА на настоящих бандлах (А-51 п.4).
 *
 * `node src/bench/plan-width-cli.ts [--limit=10] [--out=путь] [--bundle=имя:путь ...]`
 *
 * **Что он отвечает.** «Какой ширины веху планирование строит САМО?» — вопрос, который замер А-44
 * обошёл, взяв бандл, собранный руками как лучший возможный случай. Здесь берутся бандлы, которые
 * контур получил в жизни: широкий — машинный экспорт платформы по настоящей задумке гейта M16а,
 * плоский — машинный экспорт гейта M14а, синтетический — тот самый эталон А-44, для сравнения.
 *
 * **Почему без Docker и без провайдеров.** Ширина — свойство ПЛАНА, а не исполнения. Нарезка вех и
 * раздача слотов суть чистый код (`milestones.ts`, `schedule.ts`), и прогнать его по готовому
 * `tasks.json` можно за миллисекунды. Час стены и живые контейнеры прибавили бы к ответу
 * длительности задач — то есть ровно тот шум, из-за которого вопрос о ширине и остаётся открытым.
 *
 * **Чего числа НЕ значат.** Ускорение здесь измерено в ТАКТАХ при одинаковых задачах, а не в
 * секундах живого прогона. Это потолок, который форма плана ставит исполнителям, и он честно выше
 * живого: живой прогон платит накладные, которых у такта нет.
 */

interface Named {
  label: string;
  path: string;
}

function argOf(name: string, fallback: number): number {
  const raw = process.argv.find((entry) => entry.startsWith(`--${name}=`))?.split('=')[1];
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function pathArg(name: string, fallback: string): string {
  return process.argv.find((entry) => entry.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
}

/** Бандлы по умолчанию — те, что контур получал в жизни, плюс эталон А-44 для сравнения. */
const DEFAULT_BUNDLES: Named[] = [
  {
    label: 'M16а: настоящая задумка, план написала платформа',
    path: '../artifacts/gate-M16a/source-bundle-wide/bundle',
  },
  {
    label: 'M14а: настоящая задумка, плоские идентификаторы',
    path: '../artifacts/gate-M14a/machine-bundle/bundle',
  },
];

function bundlesFromArgv(): Named[] {
  const named = process.argv
    .filter((entry) => entry.startsWith('--bundle='))
    .map((entry) => entry.slice('--bundle='.length))
    .map((entry) => {
      const split = entry.indexOf(':');
      return split === -1
        ? { label: entry, path: entry }
        : { label: entry.slice(0, split), path: entry.slice(split + 1) };
    });

  return named.length > 0 ? named : DEFAULT_BUNDLES;
}

/**
 * Синтетический эталон А-44, воспроизведённый здесь по своей же форме.
 *
 * Он не лежит бандлом на диске — его пишет замер параллельности перед прогоном. Воспроизводим по
 * тем же правилам: одна фаза `1.N`, свой файл у каждой задачи, ни одной зависимости.
 */
function syntheticA44(count: number): BundleTask[] {
  return Array.from({ length: count }, (_, index) => ({
    taskId: `1.${String(index + 1)}`,
    title: `Модуль ${String(index + 1)}`,
    description: 'Независимая утилита в своём файле.',
    dependsOn: [] as string[],
    metadata: { expectedArtifacts: [] },
  }));
}

/**
 * Какие файлы правит задача — по её собственному тексту.
 *
 * Бандл `filesToEdit` не несёт: его предлагает модель при написании задания (`assignments.ts`), и
 * планировщик держит по очереди задачи с пересекающимися файлами. Здесь берётся консервативная
 * оценка «файлов не назвал никто»: она даёт ВЕРХНЮЮ границу ширины, и это надо помнить, читая
 * число. Правило файлов может её только уменьшить.
 */
const noFiles = (): readonly string[] => [];

const share = (value: number): string => `${(value * 100).toFixed(1)}%`;

function render(measurements: WidthMeasurement[], limit: number): string {
  const block = (measurement: WidthMeasurement): string[] => [
    `### ${measurement.label}`,
    '',
    `- задач: ${String(measurement.shape.tasks)}; из них заявили зависимости: ${String(measurement.shape.withDependencies)}`,
    `- нарезка: **${measurement.shape.strategy}**, вех ${String(measurement.shape.milestones.length)}`,
    `- ширина вех: ${measurement.shape.milestones.map((milestone) => String(milestone.tasks)).join(' / ')}`,
    `- **самая широкая веха: ${String(measurement.shape.widest)}**; средняя ширина ${measurement.shape.averageWidth.toFixed(2)}`,
    `- при потолке ${String(measurement.wide.limit)}: тактов ${String(measurement.wide.ticks)}, ` +
      `средняя одновременность ${measurement.wide.averageConcurrency.toFixed(2)}, пик ${String(measurement.wide.peak)}`,
    `- при потолке 1: тактов ${String(measurement.narrow.ticks)}`,
    `- **ускорение по тактам: ${measurement.speedup.toFixed(2)}×** из идеальных ${String(measurement.ideal)}× ` +
      `(доля идеала ${share(measurement.shareOfIdeal)})`,
    '',
  ];

  return [
    '## Ширина плана — что ставит потолок после исполнителей (А-51 п.4)',
    '',
    'Вопрос: **какой ширины веху планирование строит САМО, из настоящей задумки?** Замер А-44 брал',
    'бандл, собранный руками как лучший возможный случай, и потому на этот вопрос не отвечал.',
    '',
    'Считается ФОРМА ПЛАНА и только она: нарезка вех — настоящая (`milestones.ts`), раздача слотов —',
    'настоящая (`schedule.ts`), задачи одинаковой длительности в один такт. Числа не предсказывают',
    'стену живого прогона: они называют ПОТОЛОК, который форма плана ставит исполнителям.',
    '',
    `Потолок исполнителей в замере: ${String(limit)}.`,
    '',
    ...measurements.flatMap(block),
  ].join('\n');
}

const limit = argOf('limit', 10);
const out = resolve(pathArg('out', '../.specs/handoff/PLAN-WIDTH.md'));

const measurements: WidthMeasurement[] = [];

for (const bundle of bundlesFromArgv()) {
  const directory = resolve(bundle.path);
  if (!existsSync(directory)) {
    console.log(`[пропуск] ${bundle.label}: ${directory} не существует`);
    continue;
  }

  const read = readBundle(directory);
  measurements.push(
    measureWidth({
      label: `${bundle.label} (${String(read.tasks.length)} задач)`,
      tasks: read.tasks,
      filesOf: noFiles,
      limit,
      scope: 'bench',
    }),
  );
}

measurements.push(
  measureWidth({
    label: 'А-44: синтетический эталон, собранный руками (10 задач)',
    tasks: syntheticA44(10),
    filesOf: noFiles,
    limit,
    scope: 'bench',
  }),
);

const report = render(measurements, limit);

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${report}\n`, 'utf8');
writeFileSync(
  join(dirname(out), 'PLAN-WIDTH.json'),
  `${JSON.stringify(measurements, null, 2)}\n`,
  'utf8',
);

console.log(report);
console.log(`\nОтчёт записан: ${out}`);
