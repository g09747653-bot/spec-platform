import { mkdirSync, writeFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { dirname, join, resolve } from 'node:path';

import { unzipSync } from 'fflate';
import { z } from 'zod';

import { writeSeed } from '../intake/plan-review.ts';

/**
 * Фасад: задумка → платформа → бандл → контур (задача 166; бандл A0 Task 4.3; А-20 п.3в).
 *
 * **Только существующие поверхности.** Фасад — это клиент четырёх штатных эндпоинтов, и ни одной
 * новой строки ни в платформе, ни в оркестраторе: `POST /api/projects` (проект+сессия+драйвер
 * одним вызовом — так платформа и работает из браузера), тики `POST …/autonomous/step` (ровно то,
 * что делает страница сессии), `GET …/export/machine` (контракт двух приложений задачи 150) и
 * собственный `POST /api/orchestrator/start-loop`. Не хватает поверхности — стоп и вопрос, не
 * новый эндпоинт.
 *
 * **Каждое звено — именованный таймаут и именованный алерт; молчания нет.** Отказ любого звена
 * останавливает фасад одним сообщением, называющим звено и причину; успех каждого звена — своя
 * строка в TG. Ошибки звеньев НЕ пробрасываются наружу: фасад сам и есть обработчик — наружу
 * уходит только неожиданное (ошибка программирования), которую поймает последний рубеж бота.
 *
 * **Транспорт — `node:http`, не fetch** (D-305): интейк 33 модельных заданий честно молчит ~16
 * минут, а undici убивает тихое тело на 300-й секунде. Пределы здесь свои и названы по звеньям.
 */

export interface FacadeTimeouts {
  createMs: number;
  stepMs: number;
  driveTotalMs: number;
  exportMs: number;
  startLoopMs: number;
}

/** Пределы звеньев, по одному на вызов. Числа — из замеров M16а/M17а, названы, не разбросаны. */
export const FACADE_TIMEOUTS: FacadeTimeouts = {
  /** Создание проекта; авто-методология может позвать модель. */
  createMs: 180_000,
  /** Один шаг драйвера; шаг с генерацией документа через мост — минуты (замер пробы 175: 85 с). */
  stepMs: 900_000,
  /** Вся спецификация целиком; прогулки M13п — 37–50 минут, потолок с запасом. */
  driveTotalMs: 3 * 3_600_000,
  exportMs: 120_000,
  /** Интейк с моделью молчит минуты (D-305: ~16 мин на 33 задания). */
  startLoopMs: 45 * 60_000,
};

export interface FacadeConfig {
  /** Платформа локального профиля, например http://127.0.0.1:3000. */
  platformBase: string;
  /** Сам контур (его же процесс), например http://127.0.0.1:3100. */
  loopBase: string;
  /** Куда класть новый проект; start-loop сверит, что путь внутри. */
  workspaceRoot: string;
  timeouts?: Partial<FacadeTimeouts>;
  /** Часы и пауза — подменяемы тестами. */
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export interface FacadeDeps {
  /** Алерт владельцу в TG. Ошибка отправки — не ошибка фасада (бот сам журналирует). */
  notify: (text: string) => Promise<void>;
  log: (line: string, level?: 'INFO' | 'WARN' | 'ERROR') => void;
}

const CreateReply = z.object({ projectId: z.string().min(1), sessionId: z.string().min(1) });

const StepReply = z.object({
  kind: z.string(),
  moved: z.boolean(),
  done: z.boolean(),
  stopReason: z.string().nullable(),
  steps: z.number().int(),
});

const StartLoopReply = z
  .object({
    projectId: z.string(),
    milestones: z.number().int(),
    tasks: z.number().int(),
    /** `PLAN_GAPS` — суд полноты остановил запуск (А-33 п.4б); прочее — конвейер поехал. */
    status: z.string().optional(),
    planGaps: z.array(z.string()).optional(),
  })
  .loose();

interface HttpAnswer {
  status: number;
  body: Buffer;
}

/**
 * Один HTTP-вызов с именованным пределом. `node:http` — см. шапку модуля. Экспортирован: обвязка
 * шлюза зовёт им собственный start-loop (кнопка «Запустить как есть»), чтобы канон D-305 жил в
 * одном месте, а не копией.
 */
export function httpCall(
  method: 'GET' | 'POST',
  url: string,
  payload: unknown,
  timeoutMs: number,
  linkName: string,
): Promise<HttpAnswer> {
  return new Promise((resolvePromise, reject) => {
    const body = payload === undefined ? null : Buffer.from(JSON.stringify(payload), 'utf8');

    const request = httpRequest(
      url,
      {
        method,
        headers: {
          accept: 'application/json',
          ...(body === null
            ? {}
            : { 'content-type': 'application/json', 'content-length': body.length }),
        },
      },
      (response) => {
        const pieces: Buffer[] = [];
        response.on('data', (piece: Buffer) => pieces.push(piece));
        response.on('end', () => {
          resolvePromise({ status: response.statusCode ?? 0, body: Buffer.concat(pieces) });
        });
      },
    );

    /* Свой таймер, не `timeout` сокета: молчание живого звена — не бездействие соединения. */
    const timer = setTimeout(() => {
      request.destroy(
        new Error(
          `звено «${linkName}» молчит дольше предела ${String(Math.round(timeoutMs / 1000))} с`,
        ),
      );
    }, timeoutMs);

    request.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    request.on('close', () => {
      clearTimeout(timer);
    });

    if (body !== null) request.write(body);
    request.end();
  });
}

/** Отказ звена: имя, причина — и это ВСЯ диагностика, которую фасад показывает владельцу. */
export class LinkFailed extends Error {
  readonly link: string;

  constructor(link: string, detail: string) {
    super(detail);
    this.name = 'LinkFailed';
    this.link = link;
  }
}

const failed = (link: string, answer: HttpAnswer): LinkFailed =>
  new LinkFailed(
    link,
    `ответ ${String(answer.status)}: ${answer.body.toString('utf8').slice(0, 200)}`,
  );

/** Каталог нового проекта: читаемая метка времени — и никакой чужой семантики в имени. */
export function workspaceDirectoryName(now: number): string {
  const at = new Date(now);
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `tg-${String(at.getFullYear())}${pad(at.getMonth() + 1)}${pad(at.getDate())}` +
    `-${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}`
  );
}

/**
 * Пустая выжимка при полновесном источнике — именованная причина отказа звена; null — бандл цел
 * (D-316). Полновесность меряется источниками из того же архива: constitution/architecture в нём
 * лежат дословно, и если ОНИ непусты, спецификация состоялась — нулевая выжимка тогда означает
 * нераспознанную форму, а не пустую сессию. У requirements красна только пустота ОБЕИХ групп:
 * методология может честно не иметь нефункциональной секции (speckit и не имеет).
 */
export function emptyExtracts(entries: Record<string, Uint8Array>): string | null {
  const text = (name: string) => {
    const content = entries[name];
    return content === undefined ? '' : Buffer.from(content).toString('utf8').trim();
  };

  const sourcesBytes =
    text('bundle/constitution.md').length + text('bundle/architecture.md').length;
  if (sourcesBytes === 0) return null;

  const rows = (name: string, pick: (parsed: unknown) => number[]): number[] | null => {
    try {
      return pick(JSON.parse(text(name)));
    } catch {
      return null;
    }
  };

  const tasks = rows('bundle/tasks.json', (parsed) => [
    (parsed as { tasks?: unknown[] }).tasks?.length ?? 0,
  ]);
  if (tasks !== null && tasks[0] === 0) {
    return (
      'выжимка bundle/tasks.json пуста (ноль задач) при полновесных источниках — ' +
      'маппинг не распознал форму tasks-документа; конвейер не запускался'
    );
  }

  const requirements = rows('bundle/requirements.json', (parsed) => [
    (parsed as { functionalRequirements?: unknown[] }).functionalRequirements?.length ?? 0,
    (parsed as { nonFunctionalRequirements?: unknown[] }).nonFunctionalRequirements?.length ?? 0,
  ]);
  if (requirements !== null && requirements[0] === 0 && requirements[1] === 0) {
    return (
      'выжимка bundle/requirements.json пуста (ни одного требования) при полновесных источниках — ' +
      'маппинг не распознал форму requirements-документа; конвейер не запускался'
    );
  }

  return null;
}

export interface FacadeOutcome {
  ok: boolean;
  /** Какое звено остановило путь; null при успехе. */
  failedLink: string | null;
  projectId?: string;
  sessionId?: string;
  steps?: number;
  projectDirectory?: string;
}

/**
 * Весь путь задумки. Возвращает исход, не бросает на отказах звеньев: каждый отказ уже
 * доложен владельцу именованным алертом к моменту возврата.
 */
export async function runFacade(
  idea: string,
  config: FacadeConfig,
  deps: FacadeDeps,
): Promise<FacadeOutcome> {
  const now = config.now ?? Date.now;
  const sleep = config.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const limits = { ...FACADE_TIMEOUTS, ...config.timeouts };
  const { notify, log } = deps;

  const fail = async (link: string, detail: string): Promise<FacadeOutcome> => {
    log(`фасад: звено «${link}» отказало: ${detail}`, 'ERROR');
    await notify(
      `⚠️ Звено «${link}» отказало\n${detail}\n\nПуть остановлен на этом звене — ничего дальше не запускалось.`,
    );
    return { ok: false, failedLink: link };
  };

  /* ------------------------------------------------- 1. платформа: проект + сессия + драйвер */
  let projectId: string;
  let sessionId: string;
  try {
    const created = await httpCall(
      'POST',
      `${config.platformBase}/api/projects`,
      { prompt: idea, autonomous: true },
      limits.createMs,
      'платформа/создание проекта',
    );
    if (created.status !== 201) throw failed('платформа/создание проекта', created);

    const parsed = CreateReply.parse(JSON.parse(created.body.toString('utf8')));
    projectId = parsed.projectId;
    sessionId = parsed.sessionId;
  } catch (error) {
    return fail(
      'платформа/создание проекта',
      error instanceof Error ? error.message : String(error),
    );
  }

  log(`фасад: проект ${projectId}, сессия ${sessionId} — драйвер платформы запущен`);
  await notify(
    `🏗 Платформа приняла задумку\nПроект ${projectId.slice(0, 8)}, сессия ${sessionId.slice(0, 8)}. Автономная разработка спецификации началась — это займёт десятки минут.`,
  );

  /* ------------------------------------------------- 2. тики драйвера до конца спецификации */
  const driveStartedAt = now();
  let steps = 0;
  let lastReportedAt = driveStartedAt;

  for (;;) {
    if (now() - driveStartedAt > limits.driveTotalMs) {
      return fail(
        'платформа/драйвер',
        `спецификация не завершилась за общий предел ${String(Math.round(limits.driveTotalMs / 60_000))} мин (шагов ${String(steps)})`,
      );
    }

    let report: z.infer<typeof StepReply>;
    try {
      const answer = await httpCall(
        'POST',
        `${config.platformBase}/api/sessions/${sessionId}/autonomous/step`,
        {},
        limits.stepMs,
        'платформа/шаг драйвера',
      );

      /* 409 — гонка тика (вторая вкладка у человека); здесь — просто повторить чуть позже. */
      if (answer.status === 409) {
        await sleep(1_500);
        continue;
      }
      if (answer.status !== 200) throw failed('платформа/шаг драйвера', answer);

      report = StepReply.parse(JSON.parse(answer.body.toString('utf8')));
    } catch (error) {
      return fail('платформа/шаг драйвера', error instanceof Error ? error.message : String(error));
    }

    steps = Math.max(steps, report.steps);

    if (report.done) {
      if (report.stopReason !== 'completed' && report.stopReason !== null) {
        return fail(
          'платформа/драйвер',
          `драйвер остановился с причиной «${report.stopReason}» на шаге ${String(steps)} — спецификация не доведена`,
        );
      }
      break;
    }

    /* Прогресс без спама: не чаще раза в пять минут, и только когда есть что сказать. */
    if (now() - lastReportedAt >= 300_000) {
      lastReportedAt = now();
      await notify(
        `⏳ Спецификация в работе: шагов ${String(steps)}, прошло ${String(Math.round((now() - driveStartedAt) / 60_000))} мин.`,
      );
    }

    await sleep(500);
  }

  const driveMinutes = Math.round((now() - driveStartedAt) / 60_000);
  log(`фасад: спецификация готова за ${String(steps)} шагов (${String(driveMinutes)} мин)`);
  await notify(
    `📗 Спецификация готова\nШагов драйвера: ${String(steps)}, время: ${String(driveMinutes)} мин. Забираю машинный бандл.`,
  );

  /* ------------------------------------------------- 3. машинный бандл → workspace-каталог */
  let projectDirectory: string;
  try {
    const exported = await httpCall(
      'GET',
      `${config.platformBase}/api/projects/${projectId}/export/machine`,
      undefined,
      limits.exportMs,
      'платформа/машинный экспорт',
    );
    if (exported.status !== 200) throw failed('платформа/машинный экспорт', exported);

    const entries = unzipSync(new Uint8Array(exported.body));
    const names = Object.keys(entries);
    if (names.length === 0) throw new Error('в ZIP экспорта нет ни одного файла');

    projectDirectory = resolve(config.workspaceRoot, workspaceDirectoryName(now()));
    for (const [name, content] of Object.entries(entries)) {
      if (name.endsWith('/')) continue;
      const target = join(projectDirectory, name);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, Buffer.from(content));
    }

    /*
     * Задумка — на диск рядом с бандлом (А-33 п.4б): суд полноты плана на интейке судит план
     * ПРОТИВ НЕЁ, и файл — единственная форма, которая переживает рестарты и перезаборы. Фасад —
     * единственное звено, которое держит её дословно в руках.
     */
    writeSeed(projectDirectory, idea);

    /*
     * Смок выжимок ДО алерта «Бандл получен» (D-316; вердикт fix-раунда п.3). Финальная приёмка
     * заказчика заплатила 58 минут генерации, чтобы узнать от интейка про ноль задач, — а пустые
     * requirements проскочили бы и его. Ранний отказ по обеим выжимкам: полновесные источники при
     * нулевой выжимке — это маппинг, не распознавший форму документов, и звено обязано назвать
     * это немедленно, своим именем.
     */
    const empty = emptyExtracts(entries);
    if (empty !== null) throw new Error(empty);

    log(`фасад: бандл из ${String(names.length)} файлов распакован в ${projectDirectory}`);
    await notify(
      `📦 Бандл получен\nФайлов: ${String(names.length)}, ${String(Math.round(exported.body.length / 1024))} КБ → ${projectDirectory}`,
    );
  } catch (error) {
    return fail(
      'платформа/машинный экспорт',
      error instanceof Error ? error.message : String(error),
    );
  }

  /* ------------------------------------------------- 4. контур: интейк и конвейер */
  try {
    const started = await httpCall(
      'POST',
      `${config.loopBase}/api/orchestrator/start-loop`,
      { projectDirectory, projectTitle: idea.slice(0, 60) },
      limits.startLoopMs,
      'контур/start-loop',
    );
    if (started.status !== 200) throw failed('контур/start-loop', started);

    const plan = StartLoopReply.parse(JSON.parse(started.body.toString('utf8')));

    /*
     * Суд полноты остановил запуск (А-33 п.4б) — это не отказ звена, а машина, работающая как
     * задумано: перечень пробелов и кнопка решения уже ушли отдельным алертом шлюза по событию
     * шины. Фасад лишь называет исход пути, не выдавая «исполнители в работе» за правду.
     */
    if (plan.status === 'PLAN_GAPS') {
      const gaps = plan.planGaps ?? [];
      log(`фасад: суд полноты остановил запуск — пробелов ${String(gaps.length)}`);
      await notify(
        `⚖️ Суд полноты плана остановил запуск\nПлан (вех: ${String(plan.milestones)}, задач: ${String(plan.tasks)}) не покрывает задумку — пробелов: ${String(gaps.length)}. Перечень и кнопка решения — в алерте суда выше; конвейер не запущен.`,
      );
      return { ok: true, failedLink: null, projectId, sessionId, steps, projectDirectory };
    }

    log(`фасад: контур принял план — вех ${String(plan.milestones)}, задач ${String(plan.tasks)}`);
    await notify(
      `🔁 Контур принял план\nВех: ${String(plan.milestones)}, задач: ${String(plan.tasks)}. Исполнители в работе — дальше алерты конвейера: блокировки, красный CI, успех.`,
    );
  } catch (error) {
    return fail('контур/start-loop', error instanceof Error ? error.message : String(error));
  }

  return { ok: true, failedLink: null, projectId, sessionId, steps, projectDirectory };
}
