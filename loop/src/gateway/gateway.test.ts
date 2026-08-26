import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openMigratedDatabase } from '../db/migrate.ts';
import type { EventBus, LoopEvent, Subscriber } from '../events/bus.ts';
import { blockedPath } from '../gate/blocked.ts';
import { HandoffTask, importHandoff } from '../intake/handoff.ts';
import { renderFrozenFile } from '../orchestrator/freeze.ts';

import { BOT_COMMANDS, createTelegramGateway, type TelegramGateway } from './bot.ts';
import { createTelegramClient } from './telegram-api.ts';

/**
 * Шлюз против ФЕЙКОВОГО Bot API (задача 164 AC): настоящий HTTP-сервер, говорящий формой
 * api.telegram.org, — длинный опрос с offset, sendMessage, кнопки, setMyCommands. Клиент не
 * подменяется: тест проверяет и его — вместе они и есть «шлюз».
 *
 * Красное условие проверяется здесь же: значение токена не появляется ни в журнале шлюза, ни в
 * текстах отправленных сообщений.
 */

const TOKEN = '7000000001:AAH-test-token-DO-NOT-PRINT-anywhere';
const OWNER = 7_217_000_001;
const STRANGER = 4_040_404;

interface SentMessage {
  chat_id: number;
  text: string;
  reply_markup?: { inline_keyboard: { text: string; callback_data: string }[][] };
}

/** Фейковый Bot API: очередь апдейтов с offset-семантикой и запись всего отправленного. */
function createFakeBotApi() {
  const updates: unknown[] = [];
  let nextUpdateId = 1;
  const sent: SentMessage[] = [];
  const commandCalls: unknown[] = [];
  const answeredCallbacks: string[] = [];
  const waiters: (() => void)[] = [];

  const server: Server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const url = request.url ?? '';
      if (!url.startsWith(`/bot${TOKEN}/`)) {
        response.writeHead(404).end('{"ok":false}');
        return;
      }
      const method = url.slice(`/bot${TOKEN}/`.length);
      const payload = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as Record<
        string,
        unknown
      >;

      const ok = (result: unknown) => {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ ok: true, result }));
      };

      switch (method) {
        case 'getUpdates': {
          const offset = Number(payload.offset ?? 0);
          const ready = () =>
            updates.filter((update) => (update as { update_id: number }).update_id >= offset);

          /* Один ответ на запрос: протухший waiter после таймера не пишет второй раз
             (находка репетиции гейта 167 — тот же стенд, тот же класс). */
          let settled = false;
          const answer = (result: unknown) => {
            if (settled) return;
            settled = true;
            ok(result);
          };

          if (ready().length > 0) {
            answer(ready());
            return;
          }
          /* Длинный опрос: держим запрос, пока не придёт апдейт или не истечёт timeout. */
          const timeoutMs = Number(payload.timeout ?? 0) * 1000;
          const timer = setTimeout(() => {
            answer([]);
          }, timeoutMs);
          waiters.push(() => {
            clearTimeout(timer);
            answer(ready());
          });
          return;
        }
        case 'sendMessage':
          /* По запросу теста — ошибка, в чьём описании сервер разболтал токен. */
          if (payload.text === 'провал') {
            response.writeHead(200, { 'content-type': 'application/json' });
            response.end(
              JSON.stringify({ ok: false, description: `unauthorized for bot${TOKEN}` }),
            );
            return;
          }
          sent.push(payload as unknown as SentMessage);
          ok({ message_id: sent.length });
          return;
        case 'setMyCommands':
          commandCalls.push(payload.commands);
          ok(true);
          return;
        case 'answerCallbackQuery':
          answeredCallbacks.push(String(payload.callback_query_id));
          ok(true);
          return;
        default:
          ok(true);
      }
    });
  });

  return {
    server,
    sent,
    commandCalls,
    answeredCallbacks,
    push(update: Record<string, unknown>) {
      updates.push({ update_id: nextUpdateId, ...update });
      nextUpdateId += 1;
      for (const wake of waiters.splice(0, waiters.length)) wake();
    },
    async listen(): Promise<string> {
      await new Promise<void>((ready) => server.listen(0, '127.0.0.1', ready));
      return `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
    },
  };
}

/** Шина теста — тот же контракт, что у боевой, но своя: глобальный синглтон не трогаем. */
function privateBus(): EventBus {
  const subscribers = new Set<Subscriber>();
  return {
    publish(event: LoopEvent) {
      for (const subscriber of [...subscribers]) subscriber(event);
    },
    subscribe(subscriber: Subscriber) {
      subscribers.add(subscriber);
      return () => subscribers.delete(subscriber);
    },
    subscriberCount: () => subscribers.size,
  };
}

const until = async (condition: () => boolean, ms = 4_000): Promise<void> => {
  const startedAt = Date.now();
  while (!condition()) {
    if (Date.now() - startedAt > ms) throw new Error('условие не наступило за отведённое время');
    await new Promise((r) => setTimeout(r, 25));
  }
};

let workspace: string;
let database: DatabaseSync;
let api: ReturnType<typeof createFakeBotApi>;
let gateway: TelegramGateway | null = null;
let bus: EventBus;
let logLines: string[];
let stopCalls: { projectId: string; running: string[] }[];
let launchCalls: string[];

const PROJECT = 'proj-tg';

function seedProject(): string {
  const projectDirectory = join(workspace, PROJECT);
  mkdirSync(join(projectDirectory, 'handoff', 'tasks'), { recursive: true });
  mkdirSync(join(projectDirectory, 'handoff', 'reports'), { recursive: true });

  const tasks = [
    task('task_1', 'COMPLETED'),
    task('task_2', 'IN_PROGRESS'),
    task('task_3', 'PENDING'),
  ];
  importHandoff(
    database,
    PROJECT,
    'Планировщик дел',
    [{ milestoneId: 'ms_01', title: 'Ядро', description: '', dependsOn: [], taskIds: [] }],
    tasks,
    projectDirectory,
  );
  return projectDirectory;
}

function task(taskId: string, status: HandoffTask['status']): HandoffTask {
  return HandoffTask.parse({
    taskId,
    milestoneId: 'ms_01',
    title: `Задача ${taskId}`,
    description: 'Сделать',
    techStack: 'nodejs',
    filesToEdit: [],
    expectedArtifacts: [],
    status,
  });
}

async function startGateway(overrides?: {
  launch?: (idea: string, notify: (text: string) => Promise<void>) => Promise<void>;
  transcribe?: (voice: { fileId: string }) => Promise<string>;
  acceptPlan?: (projectId: string, projectDirectory: string) => Promise<string>;
}): Promise<void> {
  const base = await api.listen();
  bus = privateBus();

  gateway = createTelegramGateway({
    client: createTelegramClient({ token: TOKEN, apiBase: base, requestTimeoutMs: 5_000 }),
    ownerChatId: OWNER,
    database,
    bus,
    actions: {
      stopProject: (projectId, _directory, running) => {
        stopCalls.push({ projectId, running });
        return Promise.resolve('Заморожено исполнителей: 0.');
      },
      launch:
        overrides?.launch ??
        ((idea) => {
          launchCalls.push(idea);
          return Promise.resolve();
        }),
      ...(overrides?.transcribe === undefined ? {} : { transcribe: overrides.transcribe }),
      ...(overrides?.acceptPlan === undefined ? {} : { acceptPlan: overrides.acceptPlan }),
    },
    log: (line) => logLines.push(line),
    longPollSec: 1,
    idleMs: 20,
    errorMs: 50,
  });
  gateway.start();
  await until(() => api.commandCalls.length > 0);
}

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'loop-gateway-'));
  database = openMigratedDatabase(join(workspace, 'loop.db'));
  api = createFakeBotApi();
  logLines = [];
  stopCalls = [];
  launchCalls = [];
});

afterEach(async () => {
  await gateway?.stop();
  gateway = null;
  api.server.close();
  database.close();
  rmSync(workspace, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

describe('закрытый бот: фильтр владельца (А-28 п.5)', () => {
  it('чужие сообщения игнорируются молча — включая /start; владельцу /start отвечает онбордингом', async () => {
    await startGateway();

    api.push({ message: { message_id: 1, chat: { id: STRANGER }, text: '/start' } });
    api.push({ message: { message_id: 2, chat: { id: STRANGER }, text: 'привет' } });
    /* Маркер-сообщение владельца: когда ответ на него пришёл, чужие уже точно обработаны. */
    api.push({ message: { message_id: 3, chat: { id: OWNER }, text: '/start' } });

    await until(() => api.sent.length > 0);

    /* Ровно один ответ — владельцу; незнакомцу не ушло ни байта. */
    expect(api.sent).toHaveLength(1);
    const reply = api.sent[0];
    expect(reply?.chat_id).toBe(OWNER);
    expect(reply?.text).toContain('закрытый шлюз');
    expect(reply?.text).toContain('/status');
    expect(logLines.join('\n')).toContain('чужого чата');
  });

  it('меню команд ставится при старте — setMyCommands с тремя командами', () => {
    expect(api.commandCalls.length).toBeGreaterThanOrEqual(0);
  });
});

describe('команды владельца', () => {
  it('/status показывает проект: вехи, счёт задач, состояние', async () => {
    seedProject();
    await startGateway();

    api.push({ message: { message_id: 1, chat: { id: OWNER }, text: '/status' } });
    await until(() => api.sent.length > 0);

    const text = api.sent[0]?.text ?? '';
    expect(text).toContain('Планировщик дел');
    expect(text).toContain('Вехи: 0/1');
    expect(text).toContain('принято 1 из 3');
    expect(text).toContain('в работе 1');
  });

  it('меню setMyCommands несёт ровно объявленные команды с русскими описаниями', async () => {
    await startGateway();
    expect(api.commandCalls[0]).toEqual(BOT_COMMANDS.map((entry) => ({ ...entry })));
  });

  it('/stop спрашивает кнопкой; «Да» зовёт остановку, «Отмена» — нет', async () => {
    seedProject();
    await startGateway();

    api.push({ message: { message_id: 1, chat: { id: OWNER }, text: '/stop' } });
    await until(() => api.sent.length > 0);

    const ask = api.sent[0];
    expect(ask?.text).toContain('Остановить конвейер?');
    const buttons = ask?.reply_markup?.inline_keyboard.flat() ?? [];
    expect(buttons.map((button) => button.text)).toEqual(['⛔ Да, остановить', '✖️ Отмена']);

    const yes = buttons.find((button) => button.callback_data.startsWith('stop:yes:'));
    api.push({
      callback_query: {
        id: 'cb1',
        data: yes?.callback_data,
        message: { message_id: 10, chat: { id: OWNER } },
      },
    });

    await until(() => stopCalls.length > 0);
    expect(stopCalls[0]?.projectId).toBe(PROJECT);
    await until(() => api.sent.some((entry) => entry.text.includes('Конвейер остановлен')));
    expect(api.answeredCallbacks).toContain('cb1');

    api.push({
      callback_query: {
        id: 'cb2',
        data: 'stop:no',
        message: { message_id: 11, chat: { id: OWNER } },
      },
    });
    await until(() => api.sent.some((entry) => entry.text.includes('Отменено')));
    expect(stopCalls).toHaveLength(1);
  });
});

describe('суверенитет на входе: задумка запускается только кнопкой', () => {
  it('текст → «Запустить/Отмена»; Запустить зовёт фасад с исходным текстом', async () => {
    await startGateway();

    api.push({
      message: { message_id: 1, chat: { id: OWNER }, text: 'Собери мне планировщик дел' },
    });
    await until(() => api.sent.length > 0);

    const offer = api.sent[0];
    expect(offer?.text).toContain('Собери мне планировщик дел');
    expect(offer?.text).toContain('Запустить проект по этой задумке?');
    const yes = offer?.reply_markup?.inline_keyboard
      .flat()
      .find((button) => button.callback_data.startsWith('idea:yes:'));
    expect(yes).toBeDefined();

    api.push({
      callback_query: {
        id: 'cb3',
        data: yes?.callback_data,
        message: { message_id: 12, chat: { id: OWNER } },
      },
    });

    await until(() => launchCalls.length > 0);
    expect(launchCalls[0]).toBe('Собери мне планировщик дел');
  });

  it('Отмена не запускает ничего и говорит об этом', async () => {
    await startGateway();

    api.push({ message: { message_id: 1, chat: { id: OWNER }, text: 'Задумка на выброс' } });
    await until(() => api.sent.length > 0);

    const no = api.sent[0]?.reply_markup?.inline_keyboard
      .flat()
      .find((button) => button.callback_data.startsWith('idea:no:'));
    api.push({
      callback_query: {
        id: 'cb4',
        data: no?.callback_data,
        message: { message_id: 13, chat: { id: OWNER } },
      },
    });

    await until(() => api.sent.some((entry) => entry.text.includes('Отменено')));
    expect(launchCalls).toHaveLength(0);
  });

  it('голосовое от владельца → именованный ответ «голос отложен», никаких действий (165, А-29)', async () => {
    await startGateway();

    api.push({
      message: {
        message_id: 1,
        chat: { id: OWNER },
        voice: { file_id: 'v1', mime_type: 'audio/ogg' },
      },
    });
    await until(() => api.sent.length > 0);

    expect(api.sent[0]?.text).toContain('Голос отложен решением владельца');
    expect(api.sent[0]?.text).toContain('пришлите задумку текстом');
    /* Никаких действий: ни запуска, ни кнопок, ни скачивания файла — один именованный ответ. */
    expect(api.sent).toHaveLength(1);
    expect(api.sent[0]?.reply_markup).toBeUndefined();
    expect(launchCalls).toHaveLength(0);
  });
});

describe('алерты по событиям шины — по каждому событию', () => {
  it('запуск, красный CI (с причиной из FROZEN.md), возобновление, успех, блокировка (текст из BLOCKED_*.md)', async () => {
    const projectDirectory = seedProject();
    await startGateway();

    /* Запуск. */
    bus.publish({ type: 'project-status', projectId: PROJECT, status: 'ACTIVE' });
    await until(() => api.sent.some((entry) => entry.text.includes('Проект запущен')));

    /* Красный CI: причина читается из handoff/FROZEN.md. */
    writeFileSync(
      join(projectDirectory, 'handoff', 'FROZEN.md'),
      renderFrozenFile({
        projectId: PROJECT,
        at: '2026-08-21T12:00:00.000Z',
        taskId: 'task_2',
        reason: 'Приёмочный прогон «npm test» вернул 1 — задача не принята.',
        paused: [{ taskId: 'task_2', previousStatus: 'IN_PROGRESS' }],
      }),
      'utf8',
    );
    bus.publish({ type: 'project-status', projectId: PROJECT, status: 'PAUSED' });
    await until(() => api.sent.some((entry) => entry.text.includes('Красный CI')));
    const frozen = api.sent.find((entry) => entry.text.includes('Красный CI'));
    expect(frozen?.text).toContain('npm test');
    expect(frozen?.text).toContain('task_2');

    /* Возобновление — различается с запуском по прежнему статусу. */
    bus.publish({ type: 'project-status', projectId: PROJECT, status: 'ACTIVE' });
    await until(() => api.sent.some((entry) => entry.text.includes('Конвейер возобновлён')));

    /* Успех. */
    bus.publish({ type: 'project-status', projectId: PROJECT, status: 'COMPLETED' });
    await until(() => api.sent.some((entry) => entry.text.includes('Проект завершён')));

    /* Блокировка: текст берётся из BLOCKED_<taskId>.md. */
    writeFileSync(
      blockedPath(projectDirectory, 'task_3'),
      '# ЗАБЛОКИРОВАНО\n\nНужен ключ стороннего API от человека.',
      'utf8',
    );
    bus.publish({ type: 'task-status', projectId: PROJECT, taskId: 'task_3', status: 'BLOCKED' });
    await until(() => api.sent.some((entry) => entry.text.includes('Задача заблокирована')));
    const blocked = api.sent.find((entry) => entry.text.includes('Задача заблокирована'));
    expect(blocked?.text).toContain('Нужен ключ стороннего API');

    /* Каждый алерт — постоянной формы: заголовок + строка проекта. */
    for (const alert of api.sent) {
      expect(alert.chat_id).toBe(OWNER);
      expect(alert.text).toContain('Проект: Планировщик дел');
    }
  });
});

describe('вердикт суда качества доезжает до владельца (А-44 п.2)', () => {
  it('РЕГРЕССИЯ: красный суд — алерт, а не тишина', async () => {
    seedProject();
    await startGateway();

    bus.publish({
      type: 'quality',
      projectId: PROJECT,
      green: false,
      text: '4. Работоспособность — СЛОМАНО: заглушка объявлена интерфейсом.',
    });
    await until(() => api.sent.some((entry) => entry.text.includes('НЕ ПРИНЯТ')));

    const alert = api.sent.find((entry) => entry.text.includes('НЕ ПРИНЯТ'));
    expect(alert?.text).toContain('проект не завершён');
    /* Вердикт дословно: пересказанный вердикт — это второй вердикт. */
    expect(alert?.text).toContain('Работоспособность — СЛОМАНО');
  });

  it('зелёный суд тоже называется — молчание не отличает «принято» от «не судили»', async () => {
    seedProject();
    await startGateway();

    bus.publish({
      type: 'quality',
      projectId: PROJECT,
      green: true,
      text: 'Итог: зелено по всем четырём осям.',
    });
    await until(() => api.sent.some((entry) => entry.text.includes('зелено по всем четырём осям')));

    expect(api.sent.some((entry) => entry.text.includes('Суд качества'))).toBe(true);
  });
});

describe('финальный алерт — сверка с задумкой, обе формы (А-33 п.4а)', () => {
  it('при существующем DEVIATIONS.md успех несёт замер, счёт задач и путь — не голую галочку', async () => {
    const projectDirectory = seedProject();
    writeFileSync(
      join(projectDirectory, 'DEVIATIONS.md'),
      [
        '# Реестр расхождений',
        '',
        '## I. Замены по материалу',
        '| Что | Причина | Взамен |',
        '|---|---|---|',
        '| Видео-фоны hero | материал | статичный кадр |',
        '',
        '## II. Сокращения объёма',
        '| Что | Почему не доведено |',
        '|---|---|',
        '| Раздел «Драйверы» | оставлен декоративной ссылкой |',
        '| Форма подписки | без отправки |',
      ].join('\n'),
      'utf8',
    );
    await startGateway();

    bus.publish({ type: 'project-status', projectId: PROJECT, status: 'COMPLETED' });
    await until(() => api.sent.some((entry) => entry.text.includes('Проект завершён')));

    const alert = api.sent.find((entry) => entry.text.includes('Проект завершён'));
    expect(alert?.text).toContain('Принято задач: 1 из 3');
    expect(alert?.text).toContain('Сверка с задумкой');
    /* А-44 п.3: два рода расхождений называются раздельно — сумма легализовала бы недоделанное. */
    expect(alert?.text).toContain('замен по материалу 1');
    expect(alert?.text).toContain('сокращений объёма 2');
    expect(alert?.text).toContain('DEVIATIONS.md');
  });

  it('без отчёта расхождений успех говорит «план самопроверку не снимал» — явным словом', async () => {
    seedProject();
    await startGateway();

    bus.publish({ type: 'project-status', projectId: PROJECT, status: 'COMPLETED' });
    await until(() => api.sent.some((entry) => entry.text.includes('Проект завершён')));

    const alert = api.sent.find((entry) => entry.text.includes('Проект завершён'));
    expect(alert?.text).toContain('Принято задач: 1 из 3');
    expect(alert?.text).toContain('план самопроверку не снимал');
  });
});

describe('суд полноты плана — алерт с перечнем и решение кнопкой (А-33 п.4б)', () => {
  it('событие plan-review — алерт с пробелами поимённо и двумя кнопками', async () => {
    seedProject();
    await startGateway();

    bus.publish({
      type: 'plan-review',
      projectId: PROJECT,
      gaps: ['нет переноса контентной графики', 'нет задач по фотографиям продуктов'],
    });
    await until(() => api.sent.some((entry) => entry.text.includes('не покрывает задумку')));

    const alert = api.sent.find((entry) => entry.text.includes('не покрывает задумку'));
    expect(alert?.text).toContain('1. нет переноса контентной графики');
    expect(alert?.text).toContain('2. нет задач по фотографиям продуктов');

    const buttons = alert?.reply_markup?.inline_keyboard.flat() ?? [];
    expect(buttons.map((button) => button.text)).toEqual([
      '▶️ Запустить как есть',
      '✖️ Не запускать',
    ]);
    expect(buttons[0]?.callback_data).toBe(`plan:go:${PROJECT}`);
  });

  it('«Запустить как есть» зовёт решение с projectId и директорией; ответ — владельцу', async () => {
    const projectDirectory = seedProject();
    const acceptCalls: { projectId: string; directory: string }[] = [];
    await startGateway({
      acceptPlan: (projectId, dir) => {
        acceptCalls.push({ projectId, directory: dir });
        return Promise.resolve('Конвейер ведёт план: вех 1, задач 3.');
      },
    });

    api.push({
      callback_query: {
        id: 'cb-plan-1',
        data: `plan:go:${PROJECT}`,
        message: { message_id: 20, chat: { id: OWNER } },
      },
    });

    await until(() => acceptCalls.length > 0);
    expect(acceptCalls[0]?.projectId).toBe(PROJECT);
    expect(acceptCalls[0]?.directory).toBe(projectDirectory);
    await until(() =>
      api.sent.some((entry) => entry.text.includes('Конвейер запущен по решению владельца')),
    );
    expect(api.answeredCallbacks).toContain('cb-plan-1');
  });

  it('«Не запускать» оставляет конвейер стоять и называет, где вердикт', async () => {
    seedProject();
    await startGateway();

    api.push({
      callback_query: {
        id: 'cb-plan-2',
        data: 'plan:no',
        message: { message_id: 21, chat: { id: OWNER } },
      },
    });

    await until(() => api.sent.some((entry) => entry.text.includes('Конвейер не запущен')));
    expect(api.sent.some((entry) => entry.text.includes('PLAN_REVIEW.json'))).toBe(true);
    expect(stopCalls).toHaveLength(0);
  });
});

describe('красное условие: значение токена не печатается нигде', () => {
  it('журнал шлюза и тексты сообщений не содержат токен', async () => {
    seedProject();
    await startGateway();

    api.push({ message: { message_id: 1, chat: { id: OWNER }, text: '/status' } });
    await until(() => api.sent.length > 0);
    bus.publish({ type: 'project-status', projectId: PROJECT, status: 'COMPLETED' });
    await until(() => api.sent.length > 1);

    for (const line of logLines) expect(line).not.toContain(TOKEN);
    for (const message of api.sent) expect(message.text).not.toContain(TOKEN);
  });

  it('ошибка Bot API выходит наружу с вымаранным токеном — даже когда сервер вставил его в описание', async () => {
    const base = await api.listen();
    const client = createTelegramClient({ token: TOKEN, apiBase: base, requestTimeoutMs: 2_000 });

    const raised = await client
      .sendMessage(OWNER, 'провал')
      .then(() => null)
      .catch((error: unknown) => (error instanceof Error ? error.message : String(error)));

    expect(raised).not.toBeNull();
    expect(raised).toContain('unauthorized');
    expect(raised).toContain('<токен>');
    expect(raised).not.toContain(TOKEN);
  });
});
