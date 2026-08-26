import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';

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
  CONVERGENCE_PATIENCE,
  judgeConvergence,
  LEDGER_DIRECTORY,
  ledgerPath,
  measurementKey,
  measurementShell,
  MEASUREMENT_ABSENT,
  MEASUREMENT_FAILED,
  MEASUREMENT_RECORD,
  numberAt,
  readLedger,
  readMeasurementOutput,
  recordMeasurement,
  recordStall,
  recordUnverifiable,
  stampLedger,
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
    /* Книга живёт СНАРУЖИ рабочей директории — значит и убирается отдельно от неё (А-51 п.1). */
    rmSync(ledgerPath(workspace), { force: true, maxRetries: 5, retryDelay: 50 });
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

/**
 * Шелл замера, исполненный НАСТОЯЩИМ POSIX-шеллом (А-51 п.1).
 *
 * **Почему прежней регрессии было мало.** Кейс «подложенный отчёт чужого авторства не проходит»
 * клал файл НЕ в `recordPath`, а движок был захардкожен вернуть `exitCode: 65` — то есть тест
 * утверждал имя исхода, которое сам же и назначил, и шелл в нём не исполнялся ни разу. Такой тест
 * не сторожит: подмени порядок строк в `measurementShell` — он останется зелёным.
 *
 * Здесь шелл исполняется как есть, в настоящей временной директории, и подложенный отчёт лежит
 * ИМЕННО там, куда смотрит замер. Docker не нужен: `sh` — не контейнер.
 */
describe('шелл замера исполняется по-настоящему', () => {
  /**
   * POSIX-шелл хоста. На Windows он приезжает с Git; отсутствие названо, а не проглочено.
   *
   * Корень установки Git ищется ПОДЪЁМОМ от найденного `git.exe`, а не вычитанием двух уровней:
   * `where git` на этой машине отдаёт `…\\Git\\mingw64\\bin\\git.exe`, а `sh.exe` лежит в
   * `…\\Git\\bin`. Разница в один уровень — и «шелла нет» вместо шелла, который есть.
   */
  function posixShell(): string {
    if (process.platform !== 'win32') return '/bin/sh';

    const roots: string[] = [];

    try {
      const git = execFileSync('where', ['git'], { encoding: 'utf8' }).split(/\r?\n/)[0] ?? '';
      for (let cursor = dirname(git), depth = 0; depth < 5; depth += 1) {
        roots.push(cursor);
        const parent = dirname(cursor);
        if (parent === cursor) break;
        cursor = parent;
      }
    } catch {
      // Git не на пути — остаются обычные места установки ниже.
    }

    /* Обычные места установки — на случай, когда `git` не на пути вовсе. */
    roots.push('C:\\Program Files\\Git', 'C:\\Program Files (x86)\\Git');

    for (const root of roots) {
      for (const candidate of [join(root, 'bin', 'sh.exe'), join(root, 'usr', 'bin', 'sh.exe')]) {
        if (existsSync(candidate)) return candidate;
      }
    }

    throw new Error(
      'POSIX-шелла на этой машине не нашлось (ни /bin/sh, ни sh.exe из Git for Windows). ' +
        'Регрессия шелла замера НЕ ПРОПУСКАЕТСЯ: сторож, который молча не сторожит, — не сторож.',
    );
  }

  /** Прогоняет шелл замера в `cwd` и отдаёт код возврата и вывод — как их видел бы контейнер. */
  function run(cwd: string, measurement = MEASUREMENT): { code: number; output: string } {
    /* Шелл ищется ДО try: «шелла нет» — не исход замера, а отсутствие условий для суждения. */
    const shell = posixShell();

    try {
      const output = execFileSync(shell, ['-c', measurementShell(measurement)], {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      return { code: 0, output };
    } catch (error) {
      const failure = error as { status?: number; stdout?: string; stderr?: string };
      return {
        code: failure.status ?? -1,
        output: `${failure.stdout ?? ''}${failure.stderr ?? ''}`,
      };
    }
  }

  const TOUCHES_NOTHING = Measurement.parse({ ...MEASUREMENT, cmd: 'true' });
  const WRITES_REPORT = Measurement.parse({
    ...MEASUREMENT,
    cmd: `mkdir -p tools/visual-diff && printf '%s' '{"summary":{"diffPercent":3.5}}' > tools/visual-diff/report.json`,
  });
  /* Живой случай, дословно: «browserType.launch: Executable doesn't exist» — команды нет в образе. */
  const CANNOT_RUN = Measurement.parse({ ...MEASUREMENT, cmd: 'no-such-binary-for-measurement' });
  /* Команда, которая зовёт встроенный `exit`: она не «падает», она ЗАВЕРШАЕТ шелл. */
  const EXITS_ITSELF = Measurement.parse({ ...MEASUREMENT, cmd: 'exit 7' });

  it('РЕГРЕССИЯ: отчёт, подложенный ИМЕННО в recordPath, шелла не переживает', () => {
    mkdirSync(join(workspace, 'tools', 'visual-diff'), { recursive: true });
    writeFileSync(
      join(workspace, 'tools', 'visual-diff', 'report.json'),
      JSON.stringify({ summary: { diffPercent: 0 } }),
      'utf8',
    );

    const { code, output } = run(workspace, TOUCHES_NOTHING);

    /* `rm -f` снёс чужой отчёт, замер своего не написал — «отчёта нет», код 65. */
    expect(code).toBe(65);
    expect(output).toContain(MEASUREMENT_ABSENT);
    expect(output).not.toContain('diffPercent');
    expect(readMeasurementOutput(output, code, TOUCHES_NOTHING)).toMatchObject({
      status: 'failed',
    });
  });

  it('замер, написавший СВОЙ отчёт, проходит — и число берётся из него', () => {
    const { code, output } = run(workspace, WRITES_REPORT);

    expect(code).toBe(0);
    expect(output).toContain(MEASUREMENT_RECORD);
    expect(readMeasurementOutput(output, code, WRITES_REPORT)).toMatchObject({
      status: 'read',
      value: 3.5,
    });
  });

  it('замер, который не смог прогнаться, краснеет кодом 64 — глотать нечем', () => {
    const { code, output } = run(workspace, CANNOT_RUN);

    expect(code).toBe(64);
    expect(output).toContain(MEASUREMENT_FAILED);
    expect(readMeasurementOutput(output, code, CANNOT_RUN)).toMatchObject({ status: 'failed' });
  });

  it('команда со встроенным exit минует метку — но КРАСНЫМ остаётся, и это тоже проверено', () => {
    /*
     * Найдено исполнением настоящего шелла (А-51): `{ …; }` — группировка, а не подоболочка, и
     * встроенный `exit` внутри неё завершает ВЕСЬ шелл, не дав сработать ветке `||`. Метка
     * `MEASUREMENT_FAILED` тогда не печатается.
     *
     * Чинить группировку подоболочкой мы не стали: `( … )` не сохранила бы `cd` команды плана, а
     * `recordPath` читается после неё тем же шеллом — лечение оказалось бы дороже болезни.
     * Гарантия при этом ЦЕЛА и закреплена здесь: исход всё равно красный, просто причина названа
     * кодом возврата, а не меткой. Тихого прохода нет ни в одном из двух путей.
     */
    const { code, output } = run(workspace, EXITS_ITSELF);

    expect(code).toBe(7);
    expect(output).not.toContain(MEASUREMENT_FAILED);
    expect(readMeasurementOutput(output, code, EXITS_ITSELF)).toMatchObject({
      status: 'failed',
      reason: 'замерочный контейнер вернул 7',
    });
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
    expect(judgeConvergence(null, 99)).toMatchObject({ converged: true, exhausted: false });
  });

  it('не выросло — сошлось; выросло — названо', () => {
    expect(judgeConvergence(10, 10)).toMatchObject({ converged: true, exhausted: false });
    expect(judgeConvergence(10, 9.5)).toMatchObject({ converged: true, exhausted: false });
    expect(judgeConvergence(10, 10.5)).toMatchObject({ converged: false });
  });

  it('РЕГРЕССИЯ (§10.2): после названного числа заходов без улучшения задача ПРИНИМАЕТСЯ', () => {
    /* Предпоследний заход ещё держит: предохранитель — не отмена сходимости, а её потолок. */
    expect(judgeConvergence(10, 10.5, CONVERGENCE_PATIENCE - 2)).toMatchObject({
      converged: false,
      exhausted: false,
    });

    const exhausted = judgeConvergence(10, 10.5, CONVERGENCE_PATIENCE - 1);

    expect(exhausted).toMatchObject({ converged: true, exhausted: true });
    expect(exhausted.reason).toContain('Сходимость достигнута исчерпанием');
    /* Число публикуется как есть — исчерпание не прячет, что стало хуже. */
    expect(exhausted.reason).toContain('стало 10.5');
  });

  it('заход без улучшения копится в книге, а принятая работа обнуляет счёт', () => {
    const key = measurementKey(MEASUREMENT);

    recordStall(workspace, { key, taskId: 'WA05', at: 'вчера' });
    recordStall(workspace, { key, taskId: 'WA05', at: 'сегодня' });

    const read = readLedger(workspace);
    expect(read.status).toBe('read');
    expect(read.status === 'read' ? read.ledger.stalls[key]?.count : null).toBe(2);

    recordMeasurement(workspace, {
      key,
      value: 1,
      taskId: 'WA05',
      image: 'node:24-bookworm-slim',
      at: 'сегодня',
    });

    const after = readLedger(workspace);
    expect(after.status === 'read' ? after.ledger.stalls[key] : 'нет книги').toBeUndefined();
  });

  it('ключ цепочки — замер, а не задача: полировка №2 сравнивается с полировкой №1', () => {
    expect(measurementKey(MEASUREMENT)).toBe('tools/visual-diff/report.json#summary.diffPercent');
  });

  it('РЕГРЕССИЯ (А-51 п.1): книга лежит СНАРУЖИ рабочей директории — исполнителю туда не дотянуться', () => {
    recordMeasurement(workspace, {
      key: measurementKey(MEASUREMENT),
      value: 42,
      taskId: 'WA04',
      image: 'node:24-bookworm-slim',
      at: '2026-08-25T00:00:00.000Z',
    });

    const path = ledgerPath(workspace);
    const read = readLedger(workspace);

    expect(
      read.status === 'read' ? read.ledger.measured[measurementKey(MEASUREMENT)]?.value : null,
    ).toBe(42);
    expect(readFileSync(path, 'utf8')).toContain('42');

    /*
     * Главное утверждение регрессии, и оно про МЕХАНИЗМ, а не про нрав: исполнительский контейнер
     * монтирует рабочую директорию как `/workspace` НА ЗАПИСЬ, и всё, что внутри неё, ему
     * доступно. Книга внутри быть не должна ни под каким именем.
     */
    expect(relative(resolve(workspace), path).startsWith('..')).toBe(true);
    expect(existsSync(join(workspace, 'handoff', 'MEASUREMENTS.json'))).toBe(false);
    expect(basename(dirname(path))).toBe(LEDGER_DIRECTORY);
  });

  it('РЕГРЕССИЯ (А-51 п.1): НЕЧИТАЕМАЯ книга краснит задачу, а не проходит молча', async () => {
    mkdirSync(dirname(ledgerPath(workspace)), { recursive: true });
    writeFileSync(ledgerPath(workspace), 'это не JSON, это порча', 'utf8');

    /* Чтение книги называет порчу своим словом, а не «прошлого числа нет». */
    expect(readLedger(workspace).status).toBe('unreadable');

    const verdict = await acceptTask(TASK, workspace, {
      engine: engineWhereMeasureSays(reported(0)),
    });

    expect(verdict.accepted).toBe(false);
    expect(verdict.measurement).toMatchObject({ status: 'failed' });
    expect(verdict.reason).toContain('книга замеров контура');
  });

  it('РЕГРЕССИЯ (А-51 п.1): запись поверх испорченной книги ЗАПРЕЩЕНА — прошлое не стирается', () => {
    mkdirSync(dirname(ledgerPath(workspace)), { recursive: true });
    writeFileSync(ledgerPath(workspace), '{ битый', 'utf8');

    const write = recordMeasurement(workspace, {
      key: measurementKey(MEASUREMENT),
      value: 1,
      taskId: 'WA05',
      image: 'node:24-bookworm-slim',
      at: 'сегодня',
    });

    expect(write.ok).toBe(false);
    /* Файл остался тем же: свежая книга поверх испорченной и была бы стиранием базовой линии. */
    expect(readFileSync(ledgerPath(workspace), 'utf8')).toBe('{ битый');
  });

  it('клеймо владельца: чужая книга заводится заново, своя — продолжается', () => {
    recordMeasurement(workspace, {
      key: measurementKey(MEASUREMENT),
      value: 7,
      taskId: 'WA04',
      image: 'node:24-bookworm-slim',
      at: 'вчера',
    });

    expect(stampLedger(workspace, { projectId: 'p1', bundleId: 'b1' }).status).toBe('stamped');
    expect(stampLedger(workspace, { projectId: 'p1', bundleId: 'b1' }).status).toBe('kept');

    /* Прошлое число пережило собственное клеймо. */
    const kept = readLedger(workspace);
    expect(
      kept.status === 'read' ? kept.ledger.measured[measurementKey(MEASUREMENT)]?.value : null,
    ).toBe(7);

    const reset = stampLedger(workspace, { projectId: 'p1', bundleId: 'b2' });
    expect(reset).toMatchObject({ status: 'reset', dropped: 1 });

    const after = readLedger(workspace);
    expect(after.status === 'read' ? after.ledger.measured : null).toEqual({});
  });

  it('«не проверяемо приёмкой» записывается по задаче и не двоится', () => {
    recordUnverifiable(workspace, { taskId: 'WA05', reason: 'нет браузера', at: 'вчера' });
    recordUnverifiable(workspace, { taskId: 'WA05', reason: 'нет браузера', at: 'сегодня' });

    const read = readLedger(workspace);
    expect(read.status === 'read' ? read.ledger.unverifiable : null).toEqual([
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
