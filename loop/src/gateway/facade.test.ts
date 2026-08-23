import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { zipSync } from 'fflate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runFacade, workspaceDirectoryName, type FacadeTimeouts } from './facade.ts';

/**
 * Фасад против стабов звеньев (задача 166 AC): фиктивная платформа с настоящей HTTP-поверхностью
 * (создание, тики шага, машинный экспорт настоящим ZIP) и фиктивный start-loop контура. Проверяются
 * оба контракта фасада: путь целиком при живых звеньях — и именованный алерт на отказ КАЖДОГО
 * звена, после которого дальше ничего не запускалось.
 */

interface StepScript {
  status?: number;
  body?: unknown;
  hangMs?: number;
}

function buildPlatform(steps: StepScript[]) {
  const calls: string[] = [];
  let exportStatus = 200;
  let stepIndex = 0;

  /* Полновесный бандл: смок фасада (D-316) режет пустые выжимки, и счастливый путь обязан их нести. */
  let bundleZip = zipSync({
    'bundle/constitution.md': new TextEncoder().encode('# Конституция\n\nПравила.'),
    'bundle/architecture.md': new TextEncoder().encode('# Архитектура\n\nМодули.'),
    'bundle/requirements.json': new TextEncoder().encode(
      JSON.stringify({ functionalRequirements: [{ id: 'FR-1' }], nonFunctionalRequirements: [] }),
    ),
    'bundle/tasks.json': new TextEncoder().encode(
      JSON.stringify({ tasks: [{ taskId: '1', title: 'Задача' }] }),
    ),
  });

  const server: Server = createServer((request, response) => {
    const url = request.url ?? '';
    calls.push(`${request.method ?? ''} ${url}`);

    if (request.method === 'POST' && url === '/api/projects') {
      response.writeHead(201, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ projectId: 'proj-facade-1', sessionId: 'sess-facade-1' }));
      return;
    }

    if (request.method === 'POST' && url.endsWith('/autonomous/step')) {
      const script = steps[Math.min(stepIndex, steps.length - 1)] ?? {};
      stepIndex += 1;

      const answer = () => {
        response.writeHead(script.status ?? 200, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify(
            script.body ?? {
              kind: 'ask-round',
              moved: true,
              done: false,
              stopReason: null,
              steps: stepIndex,
            },
          ),
        );
      };

      if (script.hangMs === undefined) answer();
      else setTimeout(answer, script.hangMs);
      return;
    }

    if (request.method === 'GET' && url.endsWith('/export/machine')) {
      if (exportStatus !== 200) {
        response.writeHead(exportStatus, { 'content-type': 'application/json' });
        response.end('{"error":"EXPORT_BROKEN"}');
        return;
      }
      response.writeHead(200, { 'content-type': 'application/zip' });
      response.end(Buffer.from(bundleZip));
      return;
    }

    response.writeHead(404).end();
  });

  return {
    server,
    calls,
    setExportStatus(status: number) {
      exportStatus = status;
    },
    /** Экспорт отдаёт бандл со схемо-валидными, но ПУСТЫМИ выжимками — сырьё кейса D-316. */
    emptyExtractsBundle() {
      bundleZip = zipSync({
        'bundle/constitution.md': new TextEncoder().encode('# Конституция\n\nПравила.'),
        'bundle/architecture.md': new TextEncoder().encode('# Архитектура\n\nМодули.'),
        'bundle/requirements.json': new TextEncoder().encode(
          JSON.stringify({ functionalRequirements: [], nonFunctionalRequirements: [] }),
        ),
        'bundle/tasks.json': new TextEncoder().encode(JSON.stringify({ tasks: [] })),
      });
    },
    async listen(): Promise<string> {
      await new Promise<void>((ready) => server.listen(0, '127.0.0.1', ready));
      return `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
    },
  };
}

function buildLoop(reply?: Record<string, unknown>) {
  const bodies: unknown[] = [];
  const server: Server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      bodies.push(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify(reply ?? { projectId: 'loop-proj', milestones: 3, tasks: 12 }),
      );
    });
  });

  return {
    server,
    bodies,
    async listen(): Promise<string> {
      await new Promise<void>((ready) => server.listen(0, '127.0.0.1', ready));
      return `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
    },
  };
}

const done = (steps: number): StepScript => ({
  body: { kind: 'stop', moved: false, done: true, stopReason: 'completed', steps },
});

let workspaceRoot: string;
let alerts: string[];
let servers: Server[];

beforeEach(() => {
  workspaceRoot = mkdtempSync(join(tmpdir(), 'loop-facade-'));
  alerts = [];
  servers = [];
});

afterEach(() => {
  for (const server of servers) server.close();
  rmSync(workspaceRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

const deps = () => ({
  notify: (text: string) => {
    alerts.push(text);
    return Promise.resolve();
  },
  log: () => undefined,
});

const fastSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, Math.min(ms, 5)));

async function run(
  platform: ReturnType<typeof buildPlatform>,
  loop: ReturnType<typeof buildLoop>,
  timeouts?: Partial<FacadeTimeouts>,
) {
  servers.push(platform.server, loop.server);
  const [platformBase, loopBase] = await Promise.all([platform.listen(), loop.listen()]);

  return runFacade(
    'Собери консольный планировщик дел',
    {
      platformBase,
      loopBase,
      workspaceRoot,
      sleep: fastSleep,
      ...(timeouts === undefined ? {} : { timeouts }),
    },
    deps(),
  );
}

describe('фасад целиком: задумка → платформа → бандл → контур (task 166)', () => {
  it('проходит путь и оставляет бандл на диске, а контуру — каталог внутри workspace', async () => {
    const platform = buildPlatform([
      {},
      { body: { kind: 'generate', moved: true, done: false, stopReason: null, steps: 2 } },
      done(3),
    ]);
    const loop = buildLoop();

    const outcome = await run(platform, loop);

    expect(outcome.ok).toBe(true);
    expect(outcome.failedLink).toBeNull();
    expect(outcome.steps).toBe(3);

    /* Бандл лежит в новом каталоге workspace, структурой bundle/. */
    const directory = outcome.projectDirectory ?? '';
    expect(directory.startsWith(workspaceRoot)).toBe(true);
    expect(readFileSync(join(directory, 'bundle', 'constitution.md'), 'utf8')).toContain(
      'Конституция',
    );
    expect(existsSync(join(directory, 'bundle', 'tasks.json'))).toBe(true);

    /* Контур позван ровно этим каталогом и заголовком из задумки. */
    expect(loop.bodies).toHaveLength(1);
    expect(loop.bodies[0]).toMatchObject({
      projectDirectory: directory,
      projectTitle: 'Собери консольный планировщик дел',
    });

    /* Задумка — дословно на диске рядом с бандлом: по ней суд полноты судит план (А-33 п.4б). */
    expect(readFileSync(join(directory, 'SEED.md'), 'utf8').trim()).toBe(
      'Собери консольный планировщик дел',
    );

    /* Каждое звено доложилось владельцу; молчания нет. */
    const feed = alerts.join('\n---\n');
    expect(feed).toContain('Платформа приняла задумку');
    expect(feed).toContain('Спецификация готова');
    expect(feed).toContain('Бандл получен');
    expect(feed).toContain('Контур принял план');
    expect(feed).toContain('Вех: 3, задач: 12');
  });

  it('PLAN_GAPS от start-loop — суд остановил запуск: фасад называет исход, не «исполнители в работе»', async () => {
    const platform = buildPlatform([done(2)]);
    const loop = buildLoop({
      status: 'PLAN_GAPS',
      projectId: 'loop-proj',
      milestones: 3,
      tasks: 12,
      planGaps: ['нет переноса контентной графики'],
    });

    const outcome = await run(platform, loop);

    /* Машина работает как задумана — путь цел, звено не отказывало. */
    expect(outcome.ok).toBe(true);
    expect(outcome.failedLink).toBeNull();

    const feed = alerts.join('\n---\n');
    expect(feed).toContain('Суд полноты плана остановил запуск');
    expect(feed).toContain('пробелов: 1');
    expect(feed).not.toContain('Исполнители в работе');
  });

  it('409 на тике — гонка, не отказ: повтор доводит путь до конца', async () => {
    const platform = buildPlatform([{ status: 409, body: {} }, {}, done(2)]);
    const loop = buildLoop();

    const outcome = await run(platform, loop);

    expect(outcome.ok).toBe(true);
    expect(platform.calls.filter((line) => line.includes('/autonomous/step'))).toHaveLength(3);
  });
});

describe('отказ любого звена — именованный алерт, дальше ничего не запускалось', () => {
  it('драйвер остановился не completed → алерт с причиной, экспорт не звался', async () => {
    const platform = buildPlatform([
      {},
      { body: { kind: 'stop', moved: false, done: true, stopReason: 'stalled', steps: 2 } },
    ]);
    const loop = buildLoop();

    const outcome = await run(platform, loop);

    expect(outcome.ok).toBe(false);
    expect(outcome.failedLink).toBe('платформа/драйвер');
    expect(alerts.join('\n')).toContain('stalled');
    expect(platform.calls.some((line) => line.includes('/export/machine'))).toBe(false);
    expect(loop.bodies).toHaveLength(0);
  });

  it('экспорт отвечает 500 → алерт называет звено, start-loop не зван', async () => {
    const platform = buildPlatform([done(1)]);
    platform.setExportStatus(500);
    const loop = buildLoop();

    const outcome = await run(platform, loop);

    expect(outcome.ok).toBe(false);
    expect(outcome.failedLink).toBe('платформа/машинный экспорт');
    expect(alerts.join('\n')).toContain('машинный экспорт');
    expect(alerts.join('\n')).toContain('EXPORT_BROKEN');
    expect(loop.bodies).toHaveLength(0);
  });

  it('пустые выжимки при полновесных источниках — именованный отказ ДО «Бандл получен», контур не зван (D-316)', async () => {
    /* Слепок финальной приёмки Программы А: 58 минут спецификации, полновесные constitution и
       architecture — и схемо-валидные пустышки вместо requirements.json/tasks.json, потому что
       маппинг не знал форму документов методологии. Отказ обязан прозвучать сразу после экспорта,
       своим именем, а не через 400 интейка после ещё девяти минут. */
    const platform = buildPlatform([done(5)]);
    platform.emptyExtractsBundle();
    const loop = buildLoop();

    const outcome = await run(platform, loop);

    expect(outcome.ok).toBe(false);
    expect(outcome.failedLink).toBe('платформа/машинный экспорт');
    expect(alerts.join('\n')).toContain('выжимка bundle/tasks.json пуста');
    expect(alerts.join('\n')).toContain('маппинг не распознал форму');
    expect(alerts.join('\n')).not.toContain('Бандл получен');
    expect(loop.bodies).toHaveLength(0);
  });

  it('молчащее звено убивается ИМЕНОВАННЫМ пределом, не висит', async () => {
    const platform = buildPlatform([{ hangMs: 3_000 }]);
    const loop = buildLoop();

    const outcome = await run(platform, loop, { stepMs: 250 });

    expect(outcome.ok).toBe(false);
    expect(outcome.failedLink).toBe('платформа/шаг драйвера');
    expect(alerts.join('\n')).toContain('молчит дольше предела');
  });

  it('спецификация, не уложившаяся в общий предел, — именованная остановка, не вечный цикл', async () => {
    const platform = buildPlatform([{}]);
    const loop = buildLoop();

    const outcome = await run(platform, loop, { driveTotalMs: 400 });

    expect(outcome.ok).toBe(false);
    expect(outcome.failedLink).toBe('платформа/драйвер');
    expect(alerts.join('\n')).toContain('не завершилась за общий предел');
  });

  it('создание проекта отвечает не 201 → именованный отказ первого звена', async () => {
    const platform = buildPlatform([]);
    /* Ломаем создание: сервер платформы с одним лишь 404 на всё. */
    const broken = createServer((_request, response) => response.writeHead(503).end('нет мест'));
    servers.push(broken, platform.server);
    await new Promise<void>((ready) => broken.listen(0, '127.0.0.1', ready));
    const loop = buildLoop();
    servers.push(loop.server);

    const outcome = await runFacade(
      'задумка',
      {
        platformBase: `http://127.0.0.1:${String((broken.address() as AddressInfo).port)}`,
        loopBase: await loop.listen(),
        workspaceRoot,
        sleep: fastSleep,
      },
      deps(),
    );

    expect(outcome.ok).toBe(false);
    expect(outcome.failedLink).toBe('платформа/создание проекта');
    expect(alerts.join('\n')).toContain('создание проекта');
    expect(loop.bodies).toHaveLength(0);
  });
});

describe('каталог проекта', () => {
  it('имя каталога — читаемая метка времени, без чужой семантики', () => {
    expect(workspaceDirectoryName(new Date('2026-08-21T19:05:07').getTime())).toBe(
      'tg-20260821-190507',
    );
  });
});
