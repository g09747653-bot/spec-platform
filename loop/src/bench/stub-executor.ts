import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type { CreateContainerSpec } from '../docker/engine.ts';
import {
  createFakeEngine,
  type FakeEngine,
  type StartOutcome,
} from '../docker/testing/fake-engine.ts';
import { MANIFEST_MARKER } from '../gate/observe.ts';
import { HANDOFF } from '../intake/handoff.ts';
import { reportFileName } from '../gate/report.ts';

/**
 * Стенд контура: заглушка ровно на границе вызова контейнера (А-40 п.3).
 *
 * **Подменяется одна вещь и только она** — то, что делает контейнер. План, вехи, раздача, статусы,
 * перезаход, доска, лента и алерт работают по-настоящему, теми же модулями, что в живом прогоне;
 * заглушка стоит там, где стоял бы демон, и возвращает НАСТОЯЩУЮ ФОРМУ рапорта за миллисекунды.
 * Ради этого она пишет `handoff/reports/report_<taskId>.json` тем же именем и той же схемой, что
 * пишет живой исполнитель, — цикл читает её своим `readReport`, а не «знает», что перед ним стенд.
 *
 * **Главный риск затеи назван заранее (А-40 п.5а): заглушка сама может врать.** Разойдётся с живым
 * исполнителем — и стенд будет зелёным при сломанной работе, то есть лживая галочка заведёт себе
 * второй дом сразу после того, как первый снесли. Лечение единственное и обязательное — живая
 * смок-задача в каждом прогоне стенда (`bench.ts`, `smoke`): один настоящий контейнер, тем же
 * путём. Здесь этот риск удерживается ещё и тем, что заглушка НИЧЕГО не решает: она не говорит
 * «принято», не трогает статусы и не пишет вердиктов — только оставляет след контейнера.
 */

/** Что стаб-контейнер оставляет за собой на месте одной задачи. */
export type StubTaskOutcome = 'SUCCESS' | 'FAILED' | 'BLOCKED' | 'SILENT';

/**
 * Строка, которую живой исполнитель прислал в раунде А-37.1 — дословно, включая числа.
 *
 * Заглушка обязана печатать то же, что печатает настоящий исполнитель, иначе она проверяет
 * придуманный мир. Именно эта строка — предупреждение о 77% семидневного окна при РАЗРЕШЁННОМ
 * вызове — и была прочитана контуром как отказ, заперев старты на двое с половиной суток; стенд без
 * неё гонял бы конвейер, которого в природе не было. Она здесь не как декорация, а как щуп: рубеж
 * лестницы, на котором старты запираются, обязан стать красным.
 */
export const LIVE_RATE_LIMIT_WARNING = JSON.stringify({
  type: 'rate_limit_event',
  rate_limit_info: {
    status: 'allowed_warning',
    resetsAt: 1_787_734_800,
    rateLimitType: 'seven_day',
    utilization: 0.77,
    isUsingOverage: false,
    surpassedThreshold: 0.75,
  },
});

export interface StubExecutorOptions {
  /**
   * Исход конкретной задачи. По умолчанию — `SUCCESS`.
   *
   * `SILENT` — контейнер отработал и не оставил рапорта: это законный случай живого мира
   * (исполнитель упал, диск не успел), и стенд обязан уметь его показать.
   */
  outcomeOf?: (taskId: string) => StubTaskOutcome;
  /** Сколько «работает» контейнер. Ноль — самый быстрый прогон; ненулевое даёт наложение волн. */
  workMs?: (taskId: string) => number;
  /** Каждый поднятый контейнер, по имени и порядку — улика для инвариантов и лестницы. */
  onContainer?: (name: string) => void;
}

/**
 * Обратный перевод пути демона в хостовый.
 *
 * Прямой живёт в `docker/paths.ts` и переводит `C:\x` в `/c/x`; заглушке нужен обратный, потому что
 * она стоит НА МЕСТЕ контейнера и пишет туда, куда писал бы он, — в примонтированную директорию.
 * На Linux и в CI перевод тождественный, там и обратный тождественный.
 */
export function hostPathOfBind(bind: string): string | null {
  const source = bind.split(':')[0] ?? '';
  if (source === '') return null;

  const drive = /^\/([a-zA-Z])\//.exec(source);
  if (drive === null) return source;

  return `${(drive[1] ?? '').toUpperCase()}:${source.slice(2).replaceAll('/', '\\')}`;
}

/** Директория, примонтированная контейнеру как `/workspace`. */
function workspaceOf(spec: CreateContainerSpec): string | null {
  const bind = (spec.binds ?? []).find((entry) => entry.includes(':/workspace'));
  return bind === undefined ? null : hostPathOfBind(bind);
}

const REPORT_OF = /^delivery-executor-(.+)$/;

function writeStubReport(workspace: string, taskId: string, outcome: StubTaskOutcome): void {
  const path = join(workspace, HANDOFF.reports, reportFileName(taskId));
  mkdirSync(dirname(path), { recursive: true });

  const failed = outcome === 'FAILED';
  writeFileSync(
    path,
    `${JSON.stringify(
      {
        reportId: `r-bench-${taskId}`,
        taskId,
        /* Проект стаб знает из задания на диске не больше живого исполнителя — из своего рапорта. */
        projectId: 'bench',
        executorId: 'executor_bench_stub',
        status: outcome === 'BLOCKED' ? 'BLOCKED' : failed ? 'FAILED' : 'SUCCESS',
        testsRun: { total: 1, passed: failed ? 0 : 1, failed: failed ? 1 : 0 },
        errors: failed ? ['стенд: задача помечена красной сценарием прогона'] : [],
        ...(outcome === 'BLOCKED'
          ? { blockReason: 'стенд: задача помечена заблокированной сценарием прогона' }
          : {}),
        decisionTitle: 'Стенд контура: содержательной правки не требуется',
        rationale:
          'Заглушка стоит на границе вызова контейнера и проверяет трубу и состояние, а не работу.',
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
}

/**
 * Демон, отвечающий за миллисекунды всем контейнерам одного цикла.
 *
 * Имена — те же, что у живого пути: `delivery-executor-<taskId>` у исполнителя и
 * `delivery-gate-<taskId>-{copy,observe,style,unit,e2e,artifact-N,snapshot-*}` у приёмки. Отвечает
 * заглушка по имени, а не по «знанию сценария», — потому что именно так её видит демон.
 */
export function createStubExecutorEngine(options: StubExecutorOptions = {}): FakeEngine {
  const outcomeOf = options.outcomeOf ?? ((): StubTaskOutcome => 'SUCCESS');
  const workMs = options.workMs ?? ((): number => 0);

  return createFakeEngine({
    onStart: ({ name, spec }): StartOutcome => {
      options.onContainer?.(name);

      /* Наблюдение копии контейнерными глазами (D-314) — nodejs с одним тест-скриптом. */
      if (name.endsWith('-observe')) {
        return {
          exitCode: 0,
          stdout: ['./package.json', MANIFEST_MARKER, '{"scripts":{"test":"node -e 0"}}'],
        };
      }
      /* Снимки «до» и «после» повторной итерации: различаются, то есть «правки были». */
      if (name.endsWith('-snapshot-before'))
        return { exitCode: 0, stdout: ['f 1 100.0 ./package.json'] };
      if (name.endsWith('-snapshot-after'))
        return { exitCode: 0, stdout: ['f 2 200.0 ./package.json'] };

      const executor = REPORT_OF.exec(name);
      if (executor === null) {
        /* Копия, стиль, тесты, артефакты — зелёные: стенд судит трубу, а не продукт. */
        return { exitCode: 0 };
      }

      const taskId = executor[1] ?? '';
      const outcome = outcomeOf(taskId);
      const workspace = workspaceOf(spec);

      if (workspace !== null && outcome !== 'SILENT') writeStubReport(workspace, taskId, outcome);

      const held = workMs(taskId);
      return {
        exitCode: 0,
        stdout: [LIVE_RATE_LIMIT_WARNING, `стенд: исполнитель ${taskId} отработал (${outcome})`],
        ...(held > 0 ? { until: new Promise<void>((resolve) => setTimeout(resolve, held)) } : {}),
      };
    },
  });
}
