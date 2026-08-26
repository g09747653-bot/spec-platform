import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createFakeEngine,
  type FakeEngine,
  type StartOutcome,
} from '../docker/testing/fake-engine.ts';
import { HandoffTask, Measurement } from '../intake/handoff.ts';

import { acceptTask } from './accept.ts';
import { ACCEPTANCE_BROWSER_IMAGE } from './capability-image.ts';
import {
  judgeConvergence,
  measurementKey,
  measurementShell,
  MEASUREMENT_ABSENT,
  MEASUREMENT_FAILED,
  MEASUREMENT_RECORD,
  numberAt,
  readMeasurementOutput,
  readMeasurements,
  recordMeasurement,
  recordUnverifiable,
} from './measurement.ts';

/**
 * Замер прогоняет ПРИЁМКА (А-44 п.1).
 *
 * Две регрессии названы вердиктом дословно и стоят ниже поимённо:
 *
 * - **подложенный отчёт чужого авторства не проходит** — отчёт исполнителя сносится до старта, и
 *   замер, который не написал свой, краснеет;
 * - **замер, который не смог прогнаться, краснеет, а не молчит** — `|| true`, глотавший «браузера
 *   в образе нет», исчез, и глотать теперь нечего.
 *
 * Третья, не названная в вердикте, но та, из-за которой всё началось: **сходимость сравнивает своё
 * число с прошлым СВОИМ**. Живой прогон дал «52.5925435555148 (было 52.5925435555148)» — сравнение
 * значения с самим собой, потому что память сходимости писал исполнитель. Теперь она живёт на
 * стороне контура, и подложить в неё число из рабочей директории нельзя.
 */

const MEASUREMENT = Measurement.parse({
  cmd: 'node tools/visual-diff/compare.js',
  recordPath: 'tools/visual-diff/report.json',
  divergenceKey: 'summary.diffPercent',
  capability: 'none',
});

const TASK = HandoffTask.parse({
  taskId: 'WA05',
  milestoneId: 'ms_01',
  title: 'Полировка',
  description: 'Сверь с эталоном и исправь расхождения.',
  techStack: 'nodejs',
  filesToEdit: [],
  expectedArtifacts: [],
  status: 'IN_PROGRESS',
  measurement: MEASUREMENT,
});

/** Наблюдатель отвечает «это node-проект без тестового скрипта»: запускать приёмке нечего, кроме замера. */
const BARE_NODE: StartOutcome = {
  exitCode: 0,
  stdout: ['./package.json', '__LOOP_OBSERVE_MANIFEST__', '{"scripts":{}}'],
};

let workspace: string;

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'loop-measure-'));
});

afterEach(() => {
  try {
    rmSync(workspace, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  } catch {
    // Уборка — не утверждение.
  }
});

/** Стенд приёмки, где замерочный контейнер отвечает тем, что диктует случай. */
function engineWhereMeasureSays(measure: StartOutcome): FakeEngine {
  return createFakeEngine({
    onStart: ({ name }) => {
      if (name.endsWith('-observe')) return BARE_NODE;
      if (name.endsWith('-measure')) return measure;
      return { exitCode: 0 };
    },
  });
}

const reported = (value: number): StartOutcome => ({
  exitCode: 0,
  stdout: [MEASUREMENT_RECORD, JSON.stringify({ summary: { diffPercent: value } })],
});

describe('строка прогона замера', () => {
  it('сносит чужой отчёт ПЕРВЫМ действием — подложить его приёмке нельзя', () => {
    const shell = measurementShell(MEASUREMENT);

    expect(shell.split('\n')[0]).toBe(`rm -f 'tools/visual-diff/report.json'`);
  });

  it('`|| true` исчез: код возврата замера больше не глотается', () => {
    expect(measurementShell(MEASUREMENT)).not.toContain('|| true');
  });

  it('команда плана группируется: цепочка через && не разбирается наизнанку', () => {
    const shell = measurementShell(
      Measurement.parse({ ...MEASUREMENT, cmd: 'npm run build && node measure.js' }),
    );

    expect(shell).toContain('{ npm run build && node measure.js; } ||');
  });

  it('отчёт печатается контейнером — приёмка не читает его хостовыми глазами', () => {
    const shell = measurementShell(MEASUREMENT);

    expect(shell).toContain(MEASUREMENT_RECORD);
    expect(shell).toContain(`cat 'tools/visual-diff/report.json'`);
  });
});

describe('разбор вывода замера', () => {
  it('не прогнался — названный отказ, а не тишина', () => {
    const reading = readMeasurementOutput(MEASUREMENT_FAILED, 64, MEASUREMENT);

    expect(reading).toEqual({
      status: 'failed',
      reason: 'замер «node tools/visual-diff/compare.js» не прогнался в приёмочном контейнере',
    });
  });

  it('прогнался и ничего не записал — тоже отказ, и другой', () => {
    expect(readMeasurementOutput(MEASUREMENT_ABSENT, 65, MEASUREMENT).status).toBe('failed');
    expect(readMeasurementOutput(MEASUREMENT_ABSENT, 65, MEASUREMENT)).toMatchObject({
      reason: expect.stringContaining('отчёта tools/visual-diff/report.json не написал') as string,
    });
  });

  it('записал не число по ключу — отказ по ключу, а не тихий пропуск', () => {
    const reading = readMeasurementOutput(
      `${MEASUREMENT_RECORD}\n${JSON.stringify({ summary: { diffPercent: 'много' } })}`,
      0,
      MEASUREMENT,
    );

    expect(reading).toMatchObject({ status: 'failed' });
  });

  it('записал число — оно и есть замер', () => {
    expect(
      readMeasurementOutput(
        `шум сборки\n${MEASUREMENT_RECORD}\n${JSON.stringify({ summary: { diffPercent: 12.5 } })}`,
        0,
        MEASUREMENT,
      ),
    ).toMatchObject({ status: 'read', value: 12.5 });
  });

  it('число по ключу через точку, и нечисло числом не считается', () => {
    expect(numberAt({ a: { b: 3 } }, 'a.b')).toBe(3);
    expect(numberAt({ a: { b: Number.NaN } }, 'a.b')).toBeNull();
    expect(numberAt({ a: 1 }, 'a.b')).toBeNull();
  });
});

describe('сходимость — своё число против прошлого своего', () => {
  it('первый замер цепочки сравнивать не с чем', () => {
    expect(judgeConvergence(null, 99)).toEqual({ converged: true });
  });

  it('не выросло — сошлось; выросло — названо', () => {
    expect(judgeConvergence(10, 10)).toEqual({ converged: true });
    expect(judgeConvergence(10, 9.5)).toEqual({ converged: true });
    expect(judgeConvergence(10, 10.5)).toMatchObject({ converged: false });
  });

  it('ключ цепочки — замер, а не задача: полировка №2 сравнивается с полировкой №1', () => {
    expect(measurementKey(MEASUREMENT)).toBe('tools/visual-diff/report.json#summary.diffPercent');
  });

  it('книга замеров живёт у контура и переживает удаление копии', () => {
    recordMeasurement(workspace, {
      key: measurementKey(MEASUREMENT),
      value: 42,
      taskId: 'WA04',
      image: 'node:24-bookworm-slim',
      at: '2026-08-25T00:00:00.000Z',
    });

    expect(readMeasurements(workspace).measured[measurementKey(MEASUREMENT)]?.value).toBe(42);
    expect(readFileSync(join(workspace, 'handoff', 'MEASUREMENTS.json'), 'utf8')).toContain('42');
  });

  it('«не проверяемо приёмкой» записывается по задаче и не двоится', () => {
    recordUnverifiable(workspace, { taskId: 'WA05', reason: 'нет браузера', at: 'вчера' });
    recordUnverifiable(workspace, { taskId: 'WA05', reason: 'нет браузера', at: 'сегодня' });

    expect(readMeasurements(workspace).unverifiable).toEqual([
      { taskId: 'WA05', reason: 'нет браузера', at: 'сегодня' },
    ]);
  });
});

describe('приёмка прогоняет замер сама', () => {
  it('РЕГРЕССИЯ: подложенный отчёт чужого авторства не проходит', async () => {
    /* Отчёт исполнителя лежит в рабочей директории и попадает в копию — как и было на прогоне. */
    writeFileSync(join(workspace, 'planted.json'), JSON.stringify({ summary: { diffPercent: 0 } }));

    const verdict = await acceptTask(TASK, workspace, {
      /* Замер не переписал отчёт: контейнер отвечает тем, что печатает строка после `rm -f`. */
      engine: engineWhereMeasureSays({ exitCode: 65, stdout: [MEASUREMENT_ABSENT] }),
    });

    expect(verdict.accepted).toBe(false);
    expect(verdict.measurement).toMatchObject({ status: 'failed' });
    expect(verdict.reason).toContain('Замер приёмки не состоялся');
  });

  it('РЕГРЕССИЯ: замер, который не смог прогнаться, краснеет, а не молчит', async () => {
    const verdict = await acceptTask(TASK, workspace, {
      /* Ровно живой случай: `browserType.launch: Executable doesn't exist`. */
      engine: engineWhereMeasureSays({
        exitCode: 64,
        stdout: [`browserType.launch: Executable doesn't exist`, MEASUREMENT_FAILED],
      }),
    });

    expect(verdict.accepted).toBe(false);
    expect(verdict.reason).toContain('не прогнался в приёмочном контейнере');
  });

  it('число прочитано своим прогоном и опубликовано, воротами не став', async () => {
    const verdict = await acceptTask(TASK, workspace, {
      engine: engineWhereMeasureSays(reported(52.59)),
    });

    expect(verdict.accepted).toBe(true);
    expect(verdict.measurement).toMatchObject({ status: 'measured', value: 52.59, previous: null });
    expect(verdict.reason).toContain('52.59');
    expect(verdict.reason).toContain('воротами оно не бывает');
  });

  it('сходимость берёт прошлое число ИЗ КНИГИ КОНТУРА, а не из рабочей директории', async () => {
    /* Число исполнителя в рабочей директории — то самое, которым приёмка себя обманывала. */
    writeFileSync(join(workspace, '.loop-convergence.json'), JSON.stringify({ value: 999 }));
    recordMeasurement(workspace, {
      key: measurementKey(MEASUREMENT),
      value: 10,
      taskId: 'WA04',
      image: 'node:24-bookworm-slim',
      at: '2026-08-25T00:00:00.000Z',
    });

    const verdict = await acceptTask(TASK, workspace, {
      engine: engineWhereMeasureSays(reported(11)),
    });

    expect(verdict.accepted).toBe(false);
    expect(verdict.measurement).toMatchObject({ previous: 10, converged: false });
    expect(verdict.reason).toContain('расхождение выросло');
  });

  it('замер требует браузера — приёмка берёт свой образ с браузером', async () => {
    const engine = engineWhereMeasureSays(reported(1));
    const browsing = HandoffTask.parse({
      ...TASK,
      measurement: { ...MEASUREMENT, capability: 'browser' },
    });

    const verdict = await acceptTask(browsing, workspace, { engine });

    expect(verdict.measurement).toMatchObject({ image: ACCEPTANCE_BROWSER_IMAGE });
    expect(engine.byName('delivery-gate-WA05-measure')[0]?.spec.image).toBe(
      ACCEPTANCE_BROWSER_IMAGE,
    );
  });

  it('приёмка физически не может — говорит это вслух и уходит суду, а не проходит молча', async () => {
    const engine = engineWhereMeasureSays(reported(1));
    const blind: FakeEngine = {
      ...engine,
      hasImage: () => Promise.resolve(false),
      buildImage: () => Promise.reject(new Error('нет сети до реестра')),
    };

    const verdict = await acceptTask(
      HandoffTask.parse({ ...TASK, measurement: { ...MEASUREMENT, capability: 'browser' } }),
      workspace,
      { engine: blind },
    );

    expect(verdict.measurement).toMatchObject({ status: 'unverifiable' });
    expect(verdict.measurement).toMatchObject({
      reason: expect.stringContaining('не проверяемо приёмкой') as string,
    });
    /* Не красное — но и не тихое: причина стоит в вердикте, который читает лента. */
    expect(verdict.accepted).toBe(true);
    expect(verdict.reason).toContain('НЕ ПРОВЕРЯЛСЯ приёмкой');
    expect(verdict.reason).toContain('суду качества');
  });

  it('задание без замера ничего о замере не утверждает', async () => {
    const plain = HandoffTask.parse({
      ...TASK,
      measurement: undefined,
      unitTestCmd: 'node -e 0',
    });

    const verdict = await acceptTask(plain, workspace, {
      engine: engineWhereMeasureSays({ exitCode: 0 }),
    });

    expect(verdict.measurement).toBeNull();
  });
});
