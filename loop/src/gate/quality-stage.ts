import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { z } from 'zod';

import type { DockerEngine } from '../docker/engine.ts';
import { readLogFrames } from '../docker/log-frames.ts';
import { bindMount } from '../docker/paths.ts';
import type { Chain } from '../llm/chain.ts';
import type { LlmImage } from '../llm/types.ts';

import { ACCEPTANCE_IMAGES } from './accept.ts';
import { resolveCapabilityImage } from './capability-image.ts';
import { entryFactsFromObservation, HREF_PATTERN, judgeEntryPoint } from './entry-point.ts';
import { readLedger } from './measurement.ts';
import { buildProbeScript, PROBE_RESULT, type ProbeOptions } from './product-probe.ts';
import {
  assembleBoard,
  judgeLiveness,
  judgeOperability,
  MOTION_SIGNAL_PATTERNS,
  renderQualityBoard,
  reviewCoherence,
  type InteractiveProbe,
  type LivenessProbe,
  type QualityBoard,
  type Shot,
} from './visual-judge.ts';

/**
 * Суд качества — СТАДИЕЙ КОНВЕЙЕРА, последней перед вершинным критерием (А-44 п.2).
 *
 * **Чем он был.** `visual-judge.ts` в проде был мёртвым кодом: его импортировал только собственный
 * тест, а суд все раунды выносил операторский скрипт снаружи. Значит, мера успеха контуром была
 * неприменима вообще — и вершинный критерий, считающий принятые задачи, считал ЗАДАЧИ, а не
 * задумку. Продукт, у которого 74 из 86 ссылок ведут в никуда, проходил его целиком.
 *
 * **Чем он стал.** Стадией: конвейер, принявший все задачи, открывает продукт браузером, ПОЛЬЗУЕТСЯ
 * им и выносит доску четырёх осей. Вердикт входит в вершинную строку дословно, и «проект завершён»
 * при любой красной оси невозможно.
 *
 * **Разделение труда — прежнее (P1).** Улики собирает контейнер (`product-probe.ts`), связность
 * судит модель, которая ВИДИТ, а живость, вход и работоспособность выносит КОД чистыми функциями.
 * Модель здесь отвечает ровно на один вопрос — «одна ли это вещь»; всё остальное решается по
 * уликам, потому что улику можно перечитать, а мнение нельзя.
 */

export const QUALITY_FILE = join('handoff', 'QUALITY.json');

/** `quality-probe[-<projectId>]` — имя пробы этого проекта и ничьё больше. */
export function probeContainerName(projectId?: string): string {
  const scope = (projectId ?? '').replace(/[^A-Za-z0-9_.-]/g, '');
  return scope === '' ? 'quality-probe' : `quality-probe-${scope}`;
}

/** Проба поднимает браузер и обходит десятки элементов: её потолок — свой, не приёмочный. */
export const PROBE_TIMEOUT_MS = 15 * 60_000;

const ProbeShot = z.object({ label: z.string(), mediaType: z.string(), base64: z.string() });

const ProbePayload = z.object({
  ok: z.literal(true),
  entry: z.object({
    files: z.array(z.string()),
    hrefs: z.record(z.string(), z.array(z.string())),
    packageJson: z.string().nullable(),
  }),
  entryUsed: z.string(),
  shots: z.array(ProbeShot),
  liveness: z.array(
    z.object({
      kind: z.enum(['hover', 'reveal', 'motion']),
      name: z.string(),
      moved: z.boolean(),
      detail: z.string(),
    }),
  ),
  operability: z.object({
    total: z.number().int().nonnegative(),
    /** Проба уперлась в свой потолок — улика, а не вывод из чисел (А-51 п.5). */
    capped: z.boolean().default(false),
    elements: z.array(
      z.object({
        label: z.string(),
        tag: z.string(),
        href: z.string().nullable(),
        inChrome: z.boolean(),
        /** Сколько одинаковых элементов представляет улика. Старая проба их не считала. */
        duplicates: z.number().int().positive().default(1),
        /** Разрешается ли якорь в существующее место страницы; `null` — ссылка не якорь. */
        anchorResolves: z.boolean().nullable().default(null),
        hoverChanged: z.boolean(),
        clicked: z.boolean(),
        navigated: z.boolean(),
        changed: z.boolean(),
        revealedText: z.string(),
        overlapPairs: z.number().int().nonnegative(),
        emptyPanel: z.boolean(),
        stuckOpen: z.boolean(),
        alert: z.string(),
        error: z.string().nullable(),
      }),
    ),
    pageText: z.string(),
    notes: z.array(z.string()),
  }),
  sources: z.array(z.object({ file: z.string(), signals: z.array(z.string()), text: z.string() })),
});

export type ProbePayload = z.infer<typeof ProbePayload>;

/**
 * Отказ пробы — с машинным признаком, а не с разбором её же фразы.
 *
 * `unjudgeable: true` проба ставит ровно в одном случае: в работе нет ни одной страницы, которую
 * можно открыть. Это и есть тот механический признак, по которому КОД (а не модель) решает, что
 * продукт не судим этим судом (вердикт §10.1).
 */
const ProbeRefusal = z.object({
  ok: z.literal(false),
  reason: z.string(),
  unjudgeable: z.boolean().optional(),
});

export type QualityOutcome =
  | { status: 'judged'; board: QualityBoard; text: string; entry: string }
  /** Суд не состоялся — с причиной. «Не судили» зелёным не бывает и молчанием тоже. */
  | { status: 'skipped'; reason: string }
  /**
   * Продукт НЕ СУДИМ этим судом — законный исход по образцу «не проверяемо приёмкой»
   * (А-51, вердикт §10.1).
   *
   * **Отличие от `skipped` существенно и потому названо отдельно.** `skipped` — отказ СУДА:
   * браузера нет, проба упала, улики не разобрались; чинить надо контур. `unjudgeable` — свойство
   * ПРОДУКТА: открывать нечего, потому что в работе нет запускаемой точки входа с интерфейсом.
   * Первое означает «мы не смогли посмотреть» и «завершён» не даёт; второе означает «смотреть
   * нечем по построению», считается долгом и оставляет строку карты «судья для невизуального»
   * открытой.
   *
   * **Решает КОД по механическому признаку.** Признак — ответ пробы изнутри контейнера: есть ли в
   * работе хоть одна страница, которую браузер может открыть. Модель не вправе объявить свой
   * продукт несудимым: её об этом никто не спрашивает.
   */
  | { status: 'unjudgeable'; reason: string };

export interface QualityStageDeps {
  engine: DockerEngine;
  /** Цепочка судьи. `null` — связность не судится, и доска это скажет. */
  chain: Chain | null;
  onLine?: (line: { stream: 'stdout' | 'stderr'; text: string }) => void;
  timeoutMs?: number;
  /** Потолок пробы — переопределяется кейсом, чтобы случай доказывал границу, а не ждал её. */
  probeLimit?: number;
}

/**
 * Одна проба продукта, одним контейнером, над рабочей директорией, смонтированной ТОЛЬКО НА ЧТЕНИЕ.
 *
 * Копии здесь нет намеренно, в отличие от приёмки: проба ничего не пишет — ни файла, ни установки,
 * — а всё, что она нашла, уезжает её собственным stdout. Наблюдение не имеет права быть тем, что
 * изменило наблюдаемое (`observe.ts`), и read-only монтирование делает это свойством, а не обещанием.
 */
async function runProbe(
  engine: DockerEngine,
  image: string,
  workspacePath: string,
  name: string,
  script: string,
  deps: QualityStageDeps,
): Promise<{ ok: true; output: string } | { ok: false; reason: string }> {
  try {
    const stale = await engine.findByName(name);
    if (stale !== null) await engine.removeContainer(stale, { force: true });

    const id = await engine.createContainer({
      name,
      image,
      cmd: ['node', '-e', script],
      binds: [bindMount(workspacePath, '/workspace', 'ro')],
      workingDir: '/workspace',
      env: {},
      /* Продукт судится тем, что лежит на диске. Сеть дала бы ему чужие шрифты и чужие картинки. */
      networkDisabled: true,
    });

    const collected: string[] = [];

    try {
      await engine.startContainer(id);

      const draining = (async () => {
        try {
          for await (const line of readLogFrames(await engine.attachLogs(id, { follow: true }))) {
            collected.push(line.text);
            if (line.stream === 'stderr') deps.onLine?.({ stream: 'stderr', text: line.text });
          }
        } catch {
          // Оборванный хвост лога решает не больше, чем код возврата ниже.
        }
      })();

      const abort = new AbortController();
      const timer = setTimeout(() => {
        abort.abort();
      }, deps.timeoutMs ?? PROBE_TIMEOUT_MS);
      timer.unref();

      let exitCode: number | null;
      try {
        exitCode = await engine.waitContainer(id, abort.signal);
      } catch {
        await engine.stopContainer(id, 0).catch(() => undefined);
        exitCode = null;
      } finally {
        clearTimeout(timer);
      }

      await draining;

      if (exitCode !== 0) {
        return {
          ok: false,
          reason:
            exitCode === null
              ? 'проба продукта не уложилась в отведённое время'
              : `проба продукта вернула ${String(exitCode)}: ${collected.slice(-6).join(' ')}`,
        };
      }

      return { ok: true, output: collected.join('\n') };
    } finally {
      await engine.removeContainer(id, { force: true }).catch(() => undefined);
    }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

/** Вырезает из вывода контейнера склеенный JSON пробы — чистая функция над текстом. */
export function extractProbePayload(output: string): unknown {
  const marker = output.indexOf(PROBE_RESULT);
  if (marker === -1) return null;

  const body = output
    .slice(marker + PROBE_RESULT.length)
    .split('\n')
    .join('')
    .trim();

  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

/** Улики пробы в тот вид, в котором их читают чистые функции суда. */
function shotsOf(payload: ProbePayload): { shots: Shot[]; images: LlmImage[] } {
  return {
    /* `path` кадру не нужен и не выдумывается: он приехал байтами, а не файлом на диске. */
    shots: payload.shots.map((shot) => ({ label: shot.label, path: shot.label })),
    images: payload.shots.map((shot) => ({
      mediaType: shot.mediaType,
      data: shot.base64,
      label: shot.label,
    })),
  };
}

export function readQuality(projectDirectory: string): QualityBoard | null {
  const path = join(projectDirectory, QUALITY_FILE);
  if (!existsSync(path)) return null;

  try {
    return JSON.parse(readFileSync(path, 'utf8')) as QualityBoard;
  } catch {
    return null;
  }
}

/**
 * Стадия целиком: образ → проба → четыре оси → доска на диск.
 *
 * Идемпотентности по диску здесь НЕТ намеренно, в отличие от суждения о выполнимости: суд судит
 * продукт, а продукт меняется. Прошлая доска — история, а не ответ, и каждый заход судит заново.
 */
export async function judgeProduct(
  args: { projectDirectory: string; seed: string | null; projectId?: string },
  deps: QualityStageDeps,
): Promise<QualityOutcome> {
  const capability = await resolveCapabilityImage(
    deps.engine,
    'browser',
    ACCEPTANCE_IMAGES.generic,
    (message) => {
      deps.onLine?.({ stream: 'stdout', text: message });
    },
  );

  if (!capability.ok) {
    return { status: 'skipped', reason: `суду нечем открыть продукт: ${capability.reason}` };
  }

  const probeOptions: ProbeOptions = {
    entry: '',
    signals: MOTION_SIGNAL_PATTERNS.map((signal) => ({
      name: signal.name,
      source: signal.pattern.source,
      flags: signal.pattern.flags.replace('g', ''),
    })),
    hrefPattern: { source: HREF_PATTERN.source, flags: HREF_PATTERN.flags },
    ...(deps.probeLimit === undefined ? {} : { limit: deps.probeLimit }),
  };

  const run = await runProbe(
    deps.engine,
    capability.image,
    args.projectDirectory,
    /*
     * Имя пробы несёт проект: `findByName` сносит одноимённый контейнер перед стартом, и общее имя
     * означало бы, что суд одного проекта убивает пробу другого. Тот же довод, что у составного
     * ключа доски (D-324).
     */
    probeContainerName(args.projectId),
    buildProbeScript(probeOptions),
    deps,
  );

  if (!run.ok) return { status: 'skipped', reason: run.reason };

  const raw = extractProbePayload(run.output);
  const refused = ProbeRefusal.safeParse(raw);
  if (refused.success) {
    return refused.data.unjudgeable === true
      ? { status: 'unjudgeable', reason: refused.data.reason }
      : { status: 'skipped', reason: refused.data.reason };
  }

  const parsed = ProbePayload.safeParse(raw);
  if (!parsed.success) {
    return {
      status: 'skipped',
      reason: `улики пробы не разобраны: ${z.prettifyError(parsed.error)}`,
    };
  }

  const payload = parsed.data;

  /* Ось I — связность. Судит модель, которая ВИДИТ; её отсутствие названо, а не проглочено. */
  const { shots, images } = shotsOf(payload);
  const coherence =
    deps.chain === null
      ? ({ status: 'skipped', reason: 'провайдер роли судьи не настроен' } as const)
      : await reviewCoherence({
          seed: args.seed ?? '(задумка в рабочей директории не найдена)',
          shots,
          images,
          chain: deps.chain,
        });

  /* Ось II — живость. Вердикт выносит код по поведенческим уликам (А-35 п.2б). */
  const probes: LivenessProbe[] = payload.liveness.map((probe) => ({
    kind: probe.kind,
    name: probe.name,
    moved: probe.moved,
    detail: probe.detail,
  }));
  const signals = [...new Set(payload.sources.flatMap((source) => source.signals))];
  const liveness = judgeLiveness({ probes, signals });

  /* Ось III — вход. Факты собраны контейнером, вердикт — прежняя чистая функция. */
  const entry = judgeEntryPoint(entryFactsFromObservation(payload.entry));

  /* Ось IV — работоспособность. Тоже код: определение сломанного есть решение. */
  const elements: InteractiveProbe[] = payload.operability.elements;
  const operability = judgeOperability({
    total: payload.operability.total,
    capped: payload.operability.capped,
    probes: elements,
    pageText: payload.operability.pageText,
    sources: payload.sources.map((source) => ({ file: source.file, text: source.text })),
    notes: payload.operability.notes,
  });

  /*
   * Книга контура — источник строки «не проверено приёмкой». Нечитаемая книга здесь не «пустой
   * список»: суд обязан сказать, что этой части ответа у него нет (А-51 п.1).
   */
  const ledger = readLedger(args.projectDirectory);

  const board = assembleBoard({
    coherence,
    liveness,
    evidence: { probes, signals },
    entry,
    operability,
    unverified:
      ledger.status === 'unreadable'
        ? []
        : ledger.ledger.unverifiable.map((entryRow) => ({
            taskId: entryRow.taskId,
            reason: entryRow.reason,
          })),
    debts:
      ledger.status === 'unreadable'
        ? [{ what: 'список «не проверено приёмкой»', why: ledger.reason }]
        : [],
  });

  const text = renderQualityBoard(board);

  mkdirSync(join(args.projectDirectory, 'handoff'), { recursive: true });
  writeFileSync(
    join(args.projectDirectory, QUALITY_FILE),
    `${JSON.stringify({ ...board, entryUsed: payload.entryUsed, at: new Date().toISOString() }, null, 2)}\n`,
    'utf8',
  );

  for (const note of payload.operability.notes) {
    deps.onLine?.({ stream: 'stdout', text: `Проба: ${note}` });
  }

  return { status: 'judged', board, text, entry: payload.entryUsed };
}

/**
 * Строка вершинного критерия — вердикт суда ДОСЛОВНО (А-44 п.2, исправлено А-51 п.4).
 *
 * «Проект завершён» при любой красной оси невозможно: не смягчено, не сокращено, не пересказано.
 * Несостоявшийся суд — тоже не «завершён»: суд, который не состоялся, ничего не подтвердил.
 *
 * **Исходов четыре, и вершинная строка обязана назвать тот, который случился.** До А-51 их было
 * два: зелено и «но суд качества красный», причём вторая фраза зашивалась В ОБЕ незелёные ветки —
 * то есть несостоявшийся суд объявлялся владельцу красным судом. Это неправда о продукте: «мы
 * посмотрели и плохо» и «мы не смогли посмотреть» — разные новости, и лечатся они разным.
 * `kind` здесь и есть то, чем эти исходы различает читатель строки.
 */
export type QualityLineKind = 'green' | 'red' | 'not-held' | 'unjudgeable';

export function qualityLine(outcome: QualityOutcome | null): {
  /** Можно ли сказать «проект завершён». Долг завершению не мешает, красная ось — мешает. */
  complete: boolean;
  kind: QualityLineKind;
  text: string;
} {
  if (outcome === null) {
    return {
      complete: false,
      kind: 'not-held',
      text: 'Суд качества не проводился — сказать «проект завершён» не на чем.',
    };
  }
  if (outcome.status === 'skipped') {
    return {
      complete: false,
      kind: 'not-held',
      text: `Суд качества НЕ СОСТОЯЛСЯ: ${outcome.reason}. «Завершён» не говорится по несостоявшемуся суду.`,
    };
  }
  if (outcome.status === 'unjudgeable') {
    /*
     * Долг, а не отказ (вердикт §10.1). Образец — «не проверяемо приёмкой»: приёмка, которая не
     * могла проверить, задачу не блокировала, а записывала долг и называла его вслух. Здесь то же
     * самое одним уровнем выше: продукт без интерфейса не судим судом с глазами, и держать из-за
     * этого проект в ACTIVE значило бы наказывать невизуальную работу за то, что она невизуальна.
     */
    return {
      complete: true,
      kind: 'unjudgeable',
      text:
        `Суд качества НЕ СУДИЛ: продукт не судим этим судом — ${outcome.reason}. ` +
        'Судьи для невизуальной работы у контура нет; исход записан ДОЛГОМ, а не зелёной галочкой, ' +
        'и «продукт хорош» отсюда не следует — следует «этим судом он не проверен».',
    };
  }

  return {
    complete: outcome.board.green,
    kind: outcome.board.green ? 'green' : 'red',
    text: outcome.text,
  };
}
