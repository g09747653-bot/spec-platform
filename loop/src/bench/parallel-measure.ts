import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { CreateContainerSpec, DockerEngine } from '../docker/engine.ts';
import type { LogEvent } from '../events/bus.ts';
import type { Logger, LogWrite } from '../observability/log.ts';

/**
 * Замер СОБСТВЕННОЙ параллельности контура (А-44 п.5).
 *
 * **Вопрос, вокруг которого крутится половина смысловой задумки:** даёт ли параллельность
 * буквальный прирост. Отвечаем своим числом, а не чужой статьёй — и отвечаем на одном и том же
 * бандле, прогнанном дважды: при потолке в десять исполнителей и при потолке в одного.
 *
 * **Чего не хватало прежним замерам, нашим же словом** (`REPORT-M16A.md`): «чтобы измерить
 * пропускную способность, нужен бандл с вехой на 8–10 непересекающихся задач; текущий такого не
 * даёт». Широкий прогон дал пик 10 контейнеров, но на РАЗНЫХ вехах; узкий при том же потолке дал
 * среднюю одновременность 0,53 и 63,3% стены с нулём исполнителей — уперлось не в потолок, а в
 * форму плана. Поэтому бандл здесь строится специально: одна веха, десять задач, десять разных
 * файлов, ни одной зависимости.
 *
 * **Одновременность считается ТОЧНО, а не выборкой.** Каждый контейнер оставляет отрезок
 * «поднялся — кончился»; профиль одновременности есть развёртка этих отрезков, и среднее по нему —
 * интеграл, делённый на стену, а не среднее арифметическое случайных замеров. Опрос раз в четверть
 * секунды пропустил бы короткие всплески и посчитал бы длинные дважды.
 *
 * **Числа публикуются как есть и воротами не становятся.** Отрицательный результат — законный:
 * он честно закрывает направление.
 */

export type ContainerKind = 'executor' | 'acceptance' | 'probe' | 'other';

export interface ContainerSpan {
  name: string;
  kind: ContainerKind;
  /** Когда контур попросил контейнер. */
  createdAt: number;
  /** Когда контейнер поехал. Разница с `createdAt` — цена старта, и она в накладных. */
  startedAt: number | null;
  endedAt: number | null;
}

const KIND_OF: readonly { kind: ContainerKind; test: (name: string) => boolean }[] = [
  { kind: 'executor', test: (name) => name.startsWith('delivery-executor-') },
  { kind: 'probe', test: (name) => name.startsWith('quality-probe') },
  { kind: 'acceptance', test: (name) => name.startsWith('delivery-gate-') },
];

export function kindOf(name: string): ContainerKind {
  return KIND_OF.find((entry) => entry.test(name))?.kind ?? 'other';
}

/**
 * Обёртка движка, которая ничего не решает и всё записывает.
 *
 * Не «наблюдатель сбоку»: чтобы отрезок был честным, его концы обязаны совпадать с теми самыми
 * вызовами, которыми контур поднимает и хоронит контейнер. Поэтому это прокси поверх настоящего
 * движка, а не второй источник правды рядом с ним.
 */
export function instrumentEngine(
  engine: DockerEngine,
  now: () => number = Date.now,
): { engine: DockerEngine; spans: ContainerSpan[] } {
  const spans: ContainerSpan[] = [];
  const byId = new Map<string, ContainerSpan>();

  const close = (id: string): void => {
    const span = byId.get(id);
    if (span !== undefined && span.endedAt === null) span.endedAt = now();
  };

  const wrapped: DockerEngine = {
    ...engine,

    async createContainer(spec: CreateContainerSpec): Promise<string> {
      const createdAt = now();
      const id = await engine.createContainer(spec);
      const span: ContainerSpan = {
        name: spec.name,
        kind: kindOf(spec.name),
        createdAt,
        startedAt: null,
        endedAt: null,
      };
      spans.push(span);
      byId.set(id, span);
      return id;
    },

    async startContainer(id: string): Promise<void> {
      await engine.startContainer(id);
      const span = byId.get(id);
      if (span !== undefined) span.startedAt = now();
    },

    async waitContainer(id: string, signal?: AbortSignal): Promise<number> {
      try {
        return await engine.waitContainer(id, signal);
      } finally {
        close(id);
      }
    },

    async removeContainer(id: string, options?: { force?: boolean }): Promise<void> {
      close(id);
      await engine.removeContainer(id, options);
    },
  };

  return { engine: wrapped, spans };
}

export interface ConcurrencyProfile {
  /** Средняя одновременность: интеграл занятости, делённый на стену. */
  average: number;
  peak: number;
  /** Доля стены, на которой не работало НИ ОДНОГО контейнера этого рода. */
  zeroShare: number;
  zeroMs: number;
  /** Контейнеро-миллисекунды — сколько работы вообще было сделано. */
  busyMs: number;
  wallMs: number;
}

/**
 * Профиль одновременности — ЧИСТАЯ функция над отрезками (P1: считает код, не глаз).
 *
 * Развёртка событий: `+1` на подъёме, `−1` на смерти, интеграл между соседними событиями. Отрезок
 * без конца (контейнер, переживший прогон) закрывается концом окна — иначе он тянул бы среднее
 * вверх бесконечно.
 */
export function concurrencyProfile(
  spans: readonly ContainerSpan[],
  kind: ContainerKind,
  window: { from: number; to: number },
): ConcurrencyProfile {
  const wallMs = Math.max(window.to - window.from, 0);
  const events: { at: number; delta: number }[] = [];

  for (const span of spans) {
    if (span.kind !== kind || span.startedAt === null) continue;

    const from = Math.max(span.startedAt, window.from);
    const to = Math.min(span.endedAt ?? window.to, window.to);
    if (to <= from) continue;

    events.push({ at: from, delta: 1 }, { at: to, delta: -1 });
  }

  if (wallMs === 0) {
    return { average: 0, peak: 0, zeroShare: 1, zeroMs: 0, busyMs: 0, wallMs: 0 };
  }

  events.sort((left, right) => left.at - right.at || left.delta - right.delta);

  let live = 0;
  let peak = 0;
  let busyMs = 0;
  let zeroMs = 0;
  let cursor = window.from;

  for (const event of events) {
    const span = event.at - cursor;
    if (span > 0) {
      busyMs += live * span;
      if (live === 0) zeroMs += span;
      cursor = event.at;
    }
    live += event.delta;
    peak = Math.max(peak, live);
  }

  if (cursor < window.to) {
    const tail = window.to - cursor;
    busyMs += live * tail;
    if (live === 0) zeroMs += tail;
  }

  return {
    average: busyMs / wallMs,
    peak,
    zeroShare: zeroMs / wallMs,
    zeroMs,
    busyMs,
    wallMs,
  };
}

/** Сумма отрезков одного рода — контейнеро-миллисекунды, без учёта наложений. */
export function busyOf(spans: readonly ContainerSpan[], kind: ContainerKind, to: number): number {
  return spans
    .filter((span) => span.kind === kind && span.startedAt !== null)
    .reduce((total, span) => total + ((span.endedAt ?? to) - (span.startedAt ?? to)), 0);
}

/** Цена подъёма контейнеров: сколько их было и сколько заняло «попросил → поехал». */
export function startupCost(spans: readonly ContainerSpan[]): {
  containers: number;
  totalMs: number;
  averageMs: number;
} {
  const started = spans.filter((span) => span.startedAt !== null);
  const totalMs = started.reduce((total, span) => total + ((span.startedAt ?? 0) - span.createdAt), 0);

  return {
    containers: spans.length,
    totalMs,
    averageMs: started.length === 0 ? 0 : totalMs / started.length,
  };
}

/* ─────────────────────────── тариф ─────────────────────────── */

export interface TariffObservation {
  /** Сколько строк о тарифе прошло через ленту за прогон. */
  lines: number;
  /** Какие статусы в них назывались и сколько раз каждый. */
  statuses: Record<string, number>;
  /** Все ли строки говорят «разрешено». Ложь означает, что окно закрывалось. */
  allAllowed: boolean;
}

const TARIFF_LINE = /rate.?limit|тариф|окно подписки/i;
const STATUS_IN_LINE = /"status"\s*:\s*"([a-z_]+)"|\b(allowed_warning|allowed|rejected)\b/gi;

/**
 * Обёртка ленты, считающая строки тарифа.
 *
 * Считаются СТРОКИ, а не переходы состояния: вопрос заказчика — «сколько раз тариф вообще подал
 * голос и все ли разы разрешил», а оркестратор о неизменившемся состоянии молчит намеренно (А-38
 * п.1) и поэтому его собственных строк для ответа мало.
 */
export function instrumentLogger(logger: Logger): { logger: Logger; tariff: TariffObservation } {
  const tariff: TariffObservation = { lines: 0, statuses: {}, allAllowed: true };

  return {
    tariff,
    logger: {
      ...logger,
      write(line: LogWrite): LogEvent {
        if (TARIFF_LINE.test(line.message)) {
          tariff.lines += 1;
          for (const match of line.message.matchAll(STATUS_IN_LINE)) {
            const status = (match[1] ?? match[2] ?? '').toLowerCase();
            if (status === '') continue;
            tariff.statuses[status] = (tariff.statuses[status] ?? 0) + 1;
            if (status === 'rejected') tariff.allAllowed = false;
          }
        }
        return logger.write(line);
      },
    },
  };
}

/* ─────────────────────────── бандл под замер ─────────────────────────── */

/**
 * Бандл, у которого есть веха из 8–10 ДЕЙСТВИТЕЛЬНО непересекающихся задач.
 *
 * «Непересекающихся» здесь означает ровно то, что решает планировщик: разные `filesToEdit` и ни
 * одной зависимости. Идентификаторы вида `1.N` кладут все задачи в ОДНУ фазу — а значит, в одну
 * веху (нарезка по фазам, `milestones.ts`), и именно этого не давал ни один прежний бандл.
 *
 * Задумка описывает СИСТЕМУ, а не связный визуальный артефакт: цельно-артефактная ветка свела бы
 * план к восьми долям с одним владельцем целого, выстроенным в строгую цепь, — то есть уничтожила
 * бы предмет замера.
 */
export function writeParallelBundle(args: {
  root: string;
  projectId: string;
  bundleId: string;
  tasks: number;
}): string {
  const projectDirectory = join(args.root, args.projectId);
  const bundle = join(projectDirectory, 'bundle');
  mkdirSync(bundle, { recursive: true });

  const tasks = Array.from({ length: args.tasks }, (_, index) => {
    const number = String(index + 1).padStart(2, '0');
    const file = `src/mod_${number}.js`;

    return {
      taskId: `1.${String(index + 1)}`,
      title: `Модуль ${number}: независимая утилита`,
      description:
        `Создай файл ${file} — модуль CommonJS ровно такого вида:
` +
        `function mod${number}() { return 'mod-${number}'; }
` +
        `module.exports = mod${number};
` +
        `Ничего сверх этого в файле быть не должно. Проверка приёмки — ` +
        `node -e "const m = require('./${file}'); if (m() !== 'mod-${number}') process.exit(1)". ` +
        `Правь ТОЛЬКО файл ${file}: другие модули набора делают другие исполнители одновременно с ` +
        'тобой, и любая правка вне своего файла — столкновение. Своих тестов не пиши.',
      techStack: 'nodejs' as const,
      dependsOn: [],
      metadata: { expectedArtifacts: [] },
    };
  });

  writeFileSync(
    join(bundle, 'constitution.md'),
    [
      '# Конституция набора утилит',
      '',
      'Каждый модуль независим: он не читает и не правит соседей.',
      'Один модуль — один файл. Общих файлов у модулей нет.',
    ].join('\n'),
    'utf8',
  );

  writeFileSync(
    join(bundle, 'architecture.md'),
    [
      '# Архитектура',
      '',
      `Набор из ${String(args.tasks)} независимых модулей CommonJS в каталоге src/.`,
      'Модуль mod_NN.js экспортирует функцию modNN, возвращающую строку "mod-NN".',
      'Между модулями нет ни импортов, ни общих файлов: они собираются одновременно.',
    ].join('\n'),
    'utf8',
  );

  writeFileSync(
    join(bundle, 'requirements.json'),
    `${JSON.stringify(
      {
        bundleId: args.bundleId,
        functionalRequirements: [
          {
            id: 'FR-001',
            title: 'Независимые модули',
            description: `В src/ лежит ${String(args.tasks)} модулей, каждый со своей функцией.`,
          },
        ],
        nonFunctionalRequirements: [
          {
            id: 'NFR-001',
            category: 'изоляция',
            description: 'Модули не разделяют ни одного файла и собираются одновременно.',
          },
        ],
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  writeFileSync(
    join(bundle, 'tasks.json'),
    `${JSON.stringify({ bundleId: args.bundleId, projectId: args.projectId, tasks }, null, 2)}\n`,
    'utf8',
  );

  /* Задумка нужна, чтобы интейк прошёл ВСЕ свои стадии — иначе замер накладных был бы неполон. */
  writeFileSync(
    join(projectDirectory, 'SEED.md'),
    [
      `Собери набор из ${String(args.tasks)} независимых служебных модулей на Node.js.`,
      'Это не сайт и не страница: ни разметки, ни стилей, ни интерфейса — только модули в src/.',
      'Каждый модуль живёт в своём файле и ничего не знает о соседях.',
    ].join('\n'),
    'utf8',
  );

  writeFileSync(
    join(projectDirectory, 'package.json'),
    `${JSON.stringify({ name: args.projectId, private: true, version: '0.0.0' }, null, 2)}\n`,
    'utf8',
  );

  return projectDirectory;
}

/**
 * Репетиционный исполнитель замера — тот же приём, что у гейтовых прогулок (`GATE_STUB=1`).
 *
 * Бухгалтерия замера — непроверенный код, и репетировать её на живых контейнерах Claude значит
 * платить час прогона за опечатку. Но заглушка обязана делать РОВНО ТО, что делает настоящий
 * исполнитель этой задачи: создать свой файл и оставить отчёт. Заглушка, которая файла не создаёт,
 * репетирует не прогон, а заморозку на первой же красной приёмке.
 */
export function rehearsalExecutorCommand(taskId: string, projectId: string): string[] {
  const index = taskId.includes('.') ? taskId.slice(taskId.indexOf('.') + 1) : taskId;
  const number = index.padStart(2, '0');
  const file = `src/mod_${number}.js`;

  const report = {
    reportId: `r-par-${taskId}`,
    taskId,
    projectId,
    executorId: 'executor_rehearsal',
    status: 'SUCCESS',
    testsRun: { total: 1, passed: 1, failed: 0 },
  };

  const seconds = 6 + (taskId.length % 3) * 2;

  return [
    'sh',
    '-c',
    [
      `echo "репетиция ${taskId}: пишу ${file}"`,
      `sleep ${String(seconds)}`,
      'mkdir -p /workspace/src /workspace/handoff/reports',
      `cat > "/workspace/${file}" <<'MODULE'`,
      /*
       * Форма экспорта — ровно та, что названа в задании, плюс именованный псевдоним.
       * Репетиция №1 намерила, зачем: модель написала приёмке `require(…)()`, а заглушка отдала
       * объект — и узкий прогон замёрз на красной задаче, сделав два прогона несравнимыми.
       */
      `function mod${number}() { return 'mod-${number}'; }`,
      `module.exports = mod${number};`,
      `module.exports.mod${number} = mod${number};`,
      'MODULE',
      `cat > "/workspace/handoff/reports/report_${taskId}.json" <<'JSON'`,
      JSON.stringify(report, null, 2),
      'JSON',
      `echo "репетиция ${taskId}: готово"`,
    ].join('\n'),
  ];
}
