import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openMigratedDatabase } from '../db/migrate.ts';
import { createDockerEngine } from '../docker/engine.ts';
import { resolveEndpoint } from '../docker/transport.ts';

import { runProbe, type BenchProjectSpec, type BenchRun } from './bench.ts';
import type { InvariantViolation } from './invariants.ts';

/**
 * Лестница щупов стенда и обязательная живая смок-задача (А-40 п.3).
 *
 * `node src/bench/bench-cli.ts [--smoke-only] [--no-smoke] [--stall-ms=N]`
 *
 * Выход машинный: JSON на stdout и код возврата. Ненулевой код означает ровно три вещи — нарушен
 * инвариант, конвейеру понадобился внешний ход, или живая смок-задача не состоялась. Третье
 * приравнено к первым двум СОЗНАТЕЛЬНО: стенд без смока — это стенд, о котором нельзя сказать, что
 * заглушка не разошлась с настоящим исполнителем, а зелёный отчёт при таком незнании и есть та
 * лживая галочка, которую мы только что похоронили в конвейере (А-40 п.5а).
 *
 * `--no-smoke` существует и печатает `smoke: "ПРОПУЩЕН"` с ненулевым кодом: пропустить можно,
 * промолчать об этом — нельзя.
 */

/** Лестница: 1 → 6 → 20 → 50 → два проекта одновременно. */
const LADDER: { name: string; spec: BenchProjectSpec }[] = [
  { name: '1 задача', spec: { projectId: 'ladder1', milestoneSizes: [1] } },
  /* Форма живого раунда А-37.1: шесть задач, пять вех, первая веха о двух задачах. */
  { name: '6 задач, 5 вех', spec: { projectId: 'ladder6', milestoneSizes: [2, 1, 1, 1, 1] } },
  { name: '20 задач, 5 вех', spec: { projectId: 'ladder20', milestoneSizes: [4, 4, 4, 4, 4] } },
  {
    name: '50 задач, 10 вех',
    spec: { projectId: 'ladder50', milestoneSizes: [5, 5, 5, 5, 5, 5, 5, 5, 5, 5] },
  },
];

/** Два проекта с ОДИНАКОВЫМИ идентификаторами задач — щуп составного ключа (А-38 п.3). */
const TWINS: BenchProjectSpec[] = [
  { projectId: 'twinA', milestoneSizes: [3, 3], unscopedIds: true },
  { projectId: 'twinB', milestoneSizes: [2, 2], unscopedIds: true },
];

interface RungResult {
  name: string;
  tasks: number;
  milestones: number;
  accepted: number;
  externalDrives: number;
  stalled: boolean;
  containers: number;
  durationMs: number;
  violations: InvariantViolation[];
}

const rungOf = (name: string, run: BenchRun): RungResult => ({
  name,
  tasks: run.tasks,
  milestones: run.milestones,
  accepted: run.accepted,
  externalDrives: run.externalDrives,
  stalled: run.stalled,
  containers: run.containers.length,
  durationMs: run.durationMs,
  violations: run.violations,
});

async function runLadder(
  workspaceRoot: string,
  databasePath: string,
  stallMs: number,
): Promise<RungResult[]> {
  const database = openMigratedDatabase(databasePath);
  const rungs: RungResult[] = [];

  try {
    for (const rung of LADDER) {
      rungs.push(
        rungOf(rung.name, await runProbe(rung.spec, { database, workspaceRoot, stallMs })),
      );
    }

    /* «Одновременно» здесь буквально: оба конвейера идут по одной базе в одно время. */
    const twins = await Promise.all(
      TWINS.map((spec) => runProbe(spec, { database, workspaceRoot, stallMs })),
    );

    const [lead] = twins;
    if (lead === undefined) throw new Error('щуп двух проектов не дал ни одного результата');

    rungs.push(
      rungOf(`два проекта одновременно (${TWINS.map((t) => t.projectId).join(' + ')})`, {
        ...lead,
        tasks: twins.reduce((sum, run) => sum + run.tasks, 0),
        milestones: twins.reduce((sum, run) => sum + run.milestones, 0),
        accepted: twins.reduce((sum, run) => sum + run.accepted, 0),
        externalDrives: Math.max(...twins.map((run) => run.externalDrives)),
        stalled: twins.some((run) => run.stalled),
        containers: twins.flatMap((run) => run.containers),
        violations: twins.flatMap((run) => run.violations),
        durationMs: Math.max(...twins.map((run) => run.durationMs)),
      }),
    );
  } finally {
    database.close();
  }

  return rungs;
}

interface SmokeResult {
  ran: boolean;
  outcome: string;
  detail: string;
  durationMs: number;
}

/**
 * Живая смок-задача: один настоящий контейнер, тем же путём, что и всё остальное.
 *
 * Не «ещё один щуп». Это единственная проверка того, что заглушка не разошлась с реальностью — и
 * потому она гоняет НАСТОЯЩЕГО исполнителя (без `executorCommand`), настоящий демон и настоящую
 * приёмку. Задача выбрана самой маленькой, какая вообще бывает: один файл, одна проверка, — потому
 * что смок отвечает на вопрос «сходится ли форма», а не «умеет ли модель».
 */
async function runSmoke(workspaceRoot: string, databasePath: string): Promise<SmokeResult> {
  const started = Date.now();
  const { getEnv, executorCredential } = await import('../config/env.ts');
  const { createLogger } = await import('../observability/log.ts');
  const { driveProject } = await import('../orchestrator/orchestrator.ts');
  const { writeBenchTree } = await import('./bench.ts');
  const { importHandoff } = await import('../intake/handoff.ts');
  const { readBoard } = await import('../db/board.ts');

  let env;
  try {
    env = getEnv();
  } catch (error) {
    return {
      ran: false,
      outcome: 'НЕ СОСТОЯЛСЯ',
      detail: `конфигурация контура не читается: ${error instanceof Error ? error.message : String(error)}`,
      durationMs: Date.now() - started,
    };
  }

  const engine = createDockerEngine(
    resolveEndpoint(process.platform, {
      DOCKER_ENGINE_PIPE: env.DOCKER_ENGINE_PIPE,
      DOCKER_ENGINE_SOCKET: env.DOCKER_ENGINE_SOCKET,
    }),
  );

  if (!(await engine.ping().catch(() => false))) {
    return {
      ran: false,
      outcome: 'НЕ СОСТОЯЛСЯ',
      detail: `демон не отвечает на ${engine.endpoint.display}`,
      durationMs: Date.now() - started,
    };
  }

  const database = openMigratedDatabase(databasePath);
  const logger = createLogger(database);
  const projectId = 'smoke';

  try {
    const tree = writeBenchTree(workspaceRoot, { projectId, milestoneSizes: [1] });
    const [seed] = tree.tasks;
    if (seed === undefined) throw new Error('дерево смок-задачи пустое');

    /*
     * Задание переписывается под живого исполнителя: настоящая, но крошечная работа — и проверка,
     * которая до неё красная, а после зелёная. Так смок отвечает на «сходится ли форма рапорта и
     * приёмки», ничего не выдумывая про качество.
     */
    const brief = {
      ...seed,
      title: 'Живая смок-задача стенда',
      description:
        'Создай в корне рабочей директории файл `SMOKE.md` с одной строкой: `bench smoke ok`. ' +
        'Больше ничего не меняй. Затем оставь отчёт исполнителя, как велит инструкция.',
      filesToEdit: ['SMOKE.md'],
      unitTestCmd: 'test -f SMOKE.md',
      iterationTimeoutSec: 600,
    };

    writeFileSync(
      join(tree.projectDirectory, 'handoff', 'tasks', `task_${seed.taskId}.json`),
      `${JSON.stringify(brief, null, 2)}\n`,
      'utf8',
    );

    importHandoff(
      database,
      projectId,
      'Смок стенда',
      tree.milestones,
      [brief],
      tree.projectDirectory,
    );

    await driveProject(projectId, tree.projectDirectory, {
      database,
      engine,
      logger,
      credential: executorCredential(env),
      maxExecutors: 1,
      ...(env.LOOP_ANTHROPIC_MODEL === undefined ? {} : { model: env.LOOP_ANTHROPIC_MODEL }),
    });

    const board = readBoard(database, projectId);
    const status = board?.milestones.flatMap((m) => m.tasks).at(0)?.status ?? 'НЕТ СТРОКИ';

    return {
      ran: true,
      outcome: status === 'COMPLETED' ? 'ПРИНЯТА' : `НЕ ПРИНЯТА (${status})`,
      detail: `${seed.taskId} в ${tree.projectDirectory}`,
      durationMs: Date.now() - started,
    };
  } catch (error) {
    return {
      ran: false,
      outcome: 'НЕ СОСТОЯЛСЯ',
      detail: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - started,
    };
  } finally {
    database.close();
  }
}

const argv = new Set(process.argv.slice(2));
const workspace = mkdtempSync(join(tmpdir(), 'loop-bench-run-'));
const workspaceRoot = join(workspace, 'projects');
mkdirSync(workspaceRoot, { recursive: true });

/** Потолок стояния щупа. Занижается только для замера самого стенда — по умолчанию минута. */
const stallMs = Number(
  [...argv].find((flag) => flag.startsWith('--stall-ms='))?.slice('--stall-ms='.length) ?? 60_000,
);

const rungs = argv.has('--smoke-only')
  ? []
  : await runLadder(workspaceRoot, join(workspace, 'ladder.db'), stallMs);

const smoke = argv.has('--no-smoke')
  ? {
      ran: false,
      outcome: 'ПРОПУЩЕН',
      detail: 'запрошено флагом --no-smoke; прогон стенда неполон по построению',
      durationMs: 0,
    }
  : await runSmoke(workspaceRoot, join(workspace, 'smoke.db'));

const violations = rungs.flatMap((rung) => rung.violations);
const pressed = rungs.filter((rung) => rung.externalDrives > 1 || rung.stalled);

const verdict = {
  rungs: rungs.map(({ violations: _ignored, ...rest }) => rest),
  violations,
  smoke,
  passed:
    violations.length === 0 && pressed.length === 0 && smoke.ran && smoke.outcome === 'ПРИНЯТА',
  /* Честная граница пользы стенда — печатается в каждом прогоне, а не живёт в чьей-то памяти. */
  doesNotCover: [
    'глаза вне контейнера, симлинки, устройство среды',
    'потолки времени живой итерации и словарь консольного шума',
    'нехватку материала и качество продукта — весь суд трёх осей',
  ],
};

console.log(JSON.stringify(verdict, null, 2));

if (!verdict.passed) {
  console.error(
    `СТЕНД КРАСНЫЙ: нарушений инвариантов ${String(violations.length)}, ` +
      `щупов с внешним ходом ${String(pressed.length)}, смок «${smoke.outcome}».`,
  );
}

try {
  rmSync(workspace, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
} catch {
  // Уборка временной директории — не вердикт стенда.
}

/*
 * Выход явный, а не по опустевшему циклу событий — и это следствие того же дефекта, что стенд ловит.
 *
 * Замер с ЗАПЕРТЫМИ стартами показал: щуп называет стояние за секунды, а брошенный проход остаётся
 * в процессе и спит своими таймерами — цикл событий не пустеет, и стенд, честно напечатав вердикт,
 * висел бы рядом со сломанным конвейером вместо того, чтобы вернуть код. `write` с колбэком, потому
 * что stdout в трубе флашится не синхронно, а вердикт стенда терять нельзя.
 */
process.stdout.write('', () => {
  process.exit(verdict.passed ? 0 : 1);
});
