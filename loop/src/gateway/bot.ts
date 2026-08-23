import { existsSync, readFileSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';

import { listProjects, readBoard, type Board } from '../db/board.ts';
import type { EventBus, LoopEvent } from '../events/bus.ts';
import { blockedPath } from '../gate/blocked.ts';
import { readFreeze } from '../orchestrator/freeze.ts';
import { livePipeline } from '../orchestrator/orchestrator.ts';
import { findSelfCheckReport, verificationLine } from '../orchestrator/self-check.ts';

import type { TelegramClient, TelegramUpdate } from './telegram-api.ts';

/**
 * Telegram-шлюз контура (задача 164; А-28 п.4–5).
 *
 * **Закрытый бот.** Обрабатываются сообщения РОВНО одного чата — `TELEGRAM_OWNER_CHAT_ID`; всё
 * прочее игнорируется молча, включая `/start`: бот, который отвечает незнакомцу хотя бы отказом,
 * уже рассказал, что он существует и жив. Молчание — не грубость, а поверхность атаки размером
 * ноль (А-28 п.5).
 *
 * **Полноценный интерфейс, не голый чат** (А-28 п.4): меню команд (`setMyCommands`), русский
 * онбординг `/start`, `/status` с вехами и состоянием конвейера, `/stop` с подтверждением кнопкой
 * (суверенитет — остановить автономный контур можно из кармана), inline-кнопки подтверждений и
 * структурированные сообщения постоянной формы: заголовок с пиктограммой, строка проекта, тело.
 *
 * **Суверенитет на входе.** Текст задумки — решение владельца: прежде каких-либо действий бот
 * показывает, что понял, и ждёт кнопку «Запустить»; «Отмена» не оставляет следов. Тот же контракт
 * достаётся распознанной речи (задача 165): распознанный текст — это решение владельца, а не
 * догадка бота (дух P2).
 *
 * Сам запуск (`launch`) и транскрибация (`transcribe`) — инъецируемые швы: их подключают задачи
 * 166 и 165. Неподключённый шов отвечает именованно, не молчит, — опциональность M17а.
 */

export interface GatewayActions {
  /**
   * Останавливает конвейер проекта (замораживает). Возвращает строку для ответа владельцу.
   * Продакшен-обвязка строит её поверх `freezePipeline`; тест подставляет шпиона.
   */
  stopProject(projectId: string, projectDirectory: string, running: string[]): Promise<string>;
  /** Фасад задачи 166: подтверждённая задумка → платформа → бандл → контур. */
  launch?: ((idea: string, notify: (text: string) => Promise<void>) => Promise<void>) | undefined;
  /** Зонд/транскрибация задачи 165: голосовое → текст. */
  transcribe?: ((voice: { fileId: string; mimeType?: string }) => Promise<string>) | undefined;
  /**
   * Решение владельца по пробелам суда полноты (А-33 п.4б): «запустить как есть». Продакшен-
   * обвязка зовёт собственный start-loop с acceptPlan; возвращает строку для ответа владельцу.
   */
  acceptPlan?: ((projectId: string, projectDirectory: string) => Promise<string>) | undefined;
}

export interface GatewayDeps {
  client: TelegramClient;
  ownerChatId: number;
  database: DatabaseSync;
  bus: EventBus;
  actions: GatewayActions;
  /** Журнал шлюза — консоль процесса, не лента проектов: шлюз живёт над проектами. */
  log: (line: string, level?: 'INFO' | 'WARN' | 'ERROR') => void;
  longPollSec?: number;
  /** Пауза после пустой пачки и после ошибки опроса — в тестах маленькая. */
  idleMs?: number;
  errorMs?: number;
}

export interface TelegramGateway {
  start(): void;
  stop(): Promise<void>;
  /** Живо ли долгое ожидание — для честного статуса в логе и тестах. */
  polling(): boolean;
}

/** Команды меню — ровно те, что умеет обработчик, и с русскими описаниями. */
export const BOT_COMMANDS = [
  { command: 'start', description: 'Что умеет бот и как прислать задумку' },
  { command: 'status', description: 'Текущий проект: вехи, задачи, конвейер' },
  { command: 'stop', description: 'Остановить конвейер (с подтверждением)' },
] as const;

const ONBOARDING = [
  '👋 Это закрытый шлюз автономного контура доставки.',
  '',
  'Пришлите ЗАДУМКУ ПРОЕКТА текстом. Я покажу, что понял, и спрошу кнопкой, запускать ли:',
  'платформа развернёт задумку в спецификацию, контур соберёт проект и прогонит тесты, а сюда',
  'придут алерты о каждом шаге. (Голосовые отложены решением владельца — только текст.)',
  '',
  'Команды:',
  '/status — текущий проект: вехи, задачи, состояние конвейера',
  '/stop — остановить конвейер (спрошу подтверждение)',
].join('\n');

/** Постоянная форма сообщения: заголовок, строка проекта, тело. */
function alertText(head: string, project: string | null, body: string): string {
  return [
    head,
    ...(project === null ? [] : [`Проект: ${project}`]),
    ...(body === '' ? [] : ['', body]),
  ].join('\n');
}

const trimTo = (text: string, limit: number): string =>
  text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;

export function createTelegramGateway(deps: GatewayDeps): TelegramGateway {
  const { client, ownerChatId, database, bus, actions, log } = deps;
  const longPollSec = deps.longPollSec ?? 25;
  const idleMs = deps.idleMs ?? 300;
  const errorMs = deps.errorMs ?? 3_000;

  /* Флаги в объекте, не в let: сужение типов TS не переживает await-гонку двух замыканий. */
  const state = { running: false, pollAlive: false };
  let unsubscribe: (() => void) | null = null;
  let abortPoll: AbortController | null = null;

  /** Задумки, ждущие кнопки. Ключ — короткий номер в callback_data (там всего 64 байта). */
  const pendingIdeas = new Map<string, string>();
  let nextIdeaId = 1;

  /** Последний увиденный статус проекта — различает «запущен» и «возобновлён». */
  const lastStatus = new Map<string, string>();

  const send = async (text: string, buttons?: { text: string; callback_data: string }[][]) => {
    try {
      await client.sendMessage(ownerChatId, text, buttons === undefined ? {} : { buttons });
    } catch (error) {
      log(
        `отправка в Telegram не удалась: ${error instanceof Error ? error.message : String(error)}`,
        'ERROR',
      );
    }
  };

  const projectLabel = (projectId: string): string => {
    const board = readBoard(database, projectId);
    return board === null ? projectId : `${board.title} (${projectId.slice(0, 8)})`;
  };

  const projectDirectory = (projectId: string): string | null =>
    readBoard(database, projectId)?.workspaceDir ?? null;

  /* ---------------------------------------------------------------- алерты по событиям шины */

  const onEvent = (event: LoopEvent): void => {
    if (event.type === 'project-status') {
      const previous = lastStatus.get(event.projectId);
      lastStatus.set(event.projectId, event.status);

      if (event.status === 'ACTIVE') {
        void send(
          alertText(
            previous === 'PAUSED' ? '▶️ Конвейер возобновлён' : '🚀 Проект запущен',
            projectLabel(event.projectId),
            previous === 'PAUSED'
              ? 'Замороженные исполнители продолжают, красная задача уйдёт на повторный прогон.'
              : 'Автономный контур начал работу. Алерты о блокировках, красном CI и успехе придут сюда.',
          ),
        );
      }

      if (event.status === 'PAUSED') {
        const directory = projectDirectory(event.projectId);
        const freeze = directory === null ? null : readFreeze(directory);
        void send(
          alertText(
            '⛔ Красный CI — конвейер заморожен',
            projectLabel(event.projectId),
            freeze === null
              ? 'Причина в handoff/FROZEN.md рядом с планом; продолжение — только «Возобновить».'
              : `Задача ${freeze.taskId}: ${trimTo(freeze.reason, 700)}\n\nИсполнителей на паузе: ${String(freeze.paused.length)}. Продолжение — только «Возобновить» (дашборд или /retry).`,
          ),
        );
      }

      if (event.status === 'COMPLETED') {
        /*
         * Вершинный критерий (А-33 п.4а): успех обязан нести сверку с задумкой, когда конвейер ею
         * располагает, — число принятых задач, главный замер самопроверки и путь к отчёту
         * расхождений. Голая галочка при существующем DEVIATIONS.md — дефект: финальная приёмка
         * Программы А прочла её как «продукт готов», пока в той же директории лежал реестр
         * расхождений на 125 КБ, снятый самим же конвейером.
         */
        const board = readBoard(database, event.projectId);
        const tasks = board?.milestones.flatMap((milestone) => milestone.tasks) ?? [];
        const accepted = tasks.filter((task) => task.status === 'COMPLETED').length;
        const counted =
          board === null
            ? 'Все задачи приняты независимым перепрогоном.'
            : `Принято задач: ${String(accepted)} из ${String(tasks.length)} независимым перепрогоном.`;

        const directory = projectDirectory(event.projectId);
        void send(
          alertText(
            '✅ Проект завершён',
            projectLabel(event.projectId),
            `${counted}\n${verificationLine(directory === null ? null : findSelfCheckReport(directory))}\n\nГотовый продукт — в рабочей директории проекта${directory === null ? '' : `: ${directory}`}.`,
          ),
        );
      }
      return;
    }

    if (event.type === 'plan-review') {
      /*
       * Суд полноты остановил запуск (А-33 п.4б): перечень — поимённо, решение — за владельцем.
       * Кнопка «Запустить как есть» намеренно не одноразовая: она несёт projectId, а не номер из
       * pendingIdeas, — решение по плану можно принять и завтра, пережив рестарт процесса.
       */
      const gaps = event.gaps.map((gap, index) => `${String(index + 1)}. ${gap}`).join('\n');
      void send(
        alertText(
          '⚖️ План не покрывает задумку — конвейер не запущен',
          projectLabel(event.projectId),
          `Суд полноты плана нашёл пробелы:\n${trimTo(gaps, 2500)}\n\nЗапустить как есть — пробелы останутся named-строками; дополнить — пришлите задумку заново.`,
        ),
        [
          [
            { text: '▶️ Запустить как есть', callback_data: `plan:go:${event.projectId}` },
            { text: '✖️ Не запускать', callback_data: 'plan:no' },
          ],
        ],
      );
      return;
    }

    if (event.type === 'task-status' && event.status === 'BLOCKED') {
      const directory = projectDirectory(event.projectId);
      const path = directory === null ? null : blockedPath(directory, event.taskId);
      const text = path !== null && existsSync(path) ? readFileSync(path, 'utf8') : null;

      void send(
        alertText(
          '🚧 Задача заблокирована',
          projectLabel(event.projectId),
          text === null
            ? `Задача ${event.taskId} требует действий человека (BLOCKED_${event.taskId}.md).`
            : trimTo(text, 1500),
        ),
      );
    }
  };

  /* ---------------------------------------------------------------- команды и кнопки владельца */

  const offerLaunch = async (idea: string, heard: string): Promise<void> => {
    const id = String(nextIdeaId);
    nextIdeaId += 1;
    pendingIdeas.set(id, idea);

    await send(`${heard}\n\n«${trimTo(idea, 800)}»\n\nЗапустить проект по этой задумке?`, [
      [
        { text: '🚀 Запустить', callback_data: `idea:yes:${id}` },
        { text: '✖️ Отмена', callback_data: `idea:no:${id}` },
      ],
    ]);
  };

  const statusReport = (): string => {
    const projects = listProjects(database);
    if (projects.length === 0) {
      return 'Проектов пока нет. Пришлите задумку текстом.';
    }

    const sections = projects.slice(0, 3).map((entry) => {
      const board = readBoard(database, entry.projectId);
      if (board === null) return `${entry.title}: не читается`;
      return renderBoard(board);
    });

    return sections.join('\n\n');
  };

  const renderBoard = (board: Board): string => {
    const marks: Record<string, string> = {
      ACTIVE: '▶️',
      PAUSED: '⛔',
      COMPLETED: '✅',
      FAILED: '🔴',
    };

    const tasks = board.milestones.flatMap((milestone) => milestone.tasks);
    const count = (status: string) => tasks.filter((task) => task.status === status).length;
    const milestonesDone = board.milestones.filter((m) => m.status === 'COMPLETED').length;
    const live = livePipeline(board.projectId);
    const runningTasks = live?.running() ?? [];

    const lines = [
      `${marks[board.status] ?? '·'} ${board.title} (${board.projectId.slice(0, 8)}) — ${board.status}`,
      `Вехи: ${String(milestonesDone)}/${String(board.milestones.length)} · Задачи: принято ${String(count('COMPLETED'))} из ${String(tasks.length)}`,
      `в работе ${String(count('IN_PROGRESS'))}, ждут ${String(count('PENDING'))}, красных ${String(count('FAILED'))}, заблокировано ${String(count('BLOCKED'))}, на паузе ${String(count('PAUSED'))}`,
    ];

    if (runningTasks.length > 0) lines.push(`Конвейер жив: ${runningTasks.join(', ')}`);

    if (board.status === 'PAUSED' && board.workspaceDir !== null) {
      const freeze = readFreeze(board.workspaceDir);
      if (freeze !== null) lines.push(`Заморожен: ${trimTo(freeze.reason, 300)}`);
    }

    return lines.join('\n');
  };

  const handleCommand = async (text: string): Promise<void> => {
    const command = text.trim().split(/[\s@]/, 1)[0] ?? '';

    switch (command) {
      case '/start':
        await send(ONBOARDING);
        return;

      case '/status':
        await send(statusReport());
        return;

      case '/stop': {
        const candidates = listProjects(database)
          .map((entry) => readBoard(database, entry.projectId))
          .filter((board): board is Board => board !== null)
          .filter((board) => board.status === 'ACTIVE' || livePipeline(board.projectId) !== null);

        if (candidates.length === 0) {
          await send('Работающего конвейера нет — останавливать нечего.');
          return;
        }

        const target = candidates[0];
        if (target === undefined) return;
        await send(
          alertText(
            '⏸ Остановить конвейер?',
            `${target.title} (${target.projectId.slice(0, 8)})`,
            'Исполнители будут заморожены (docker pause), работа цела; продолжение — «Возобновить».',
          ),
          [
            [
              { text: '⛔ Да, остановить', callback_data: `stop:yes:${target.projectId}` },
              { text: '✖️ Отмена', callback_data: 'stop:no' },
            ],
          ],
        );
        return;
      }

      default:
        await send('Не знаю такой команды. /start — что я умею; /status; /stop.');
    }
  };

  const handleMessage = async (message: NonNullable<TelegramUpdate['message']>): Promise<void> => {
    const text = message.text?.trim() ?? '';

    if (text.startsWith('/')) {
      await handleCommand(text);
      return;
    }

    if (message.voice !== undefined) {
      if (actions.transcribe === undefined) {
        await send(
          'Голос отложен решением владельца (А-29) — пришлите задумку текстом. ' +
            'Подключение транскрибации — по отдельному решению; зонд формата уже пройден.',
        );
        return;
      }

      await send('🎙 Распознаю голосовое…');
      try {
        const recognised = await actions.transcribe({
          fileId: message.voice.file_id,
          ...(message.voice.mime_type === undefined ? {} : { mimeType: message.voice.mime_type }),
        });
        await offerLaunch(recognised, '🎙 Распознано (проверьте текст — решение за вами):');
      } catch (error) {
        await send(
          `Транскрибация не удалась: ${error instanceof Error ? trimTo(error.message, 300) : 'ошибка'}. Пришлите задумку текстом.`,
        );
      }
      return;
    }

    if (text === '') return;

    if (actions.launch === undefined) {
      await send(
        'Задумку понял, но фасад запуска ещё не подключён (задача 166). Пока доступны /status и /stop.',
      );
      return;
    }

    await offerLaunch(text, '📝 Задумка получена:');
  };

  const handleCallback = async (
    callback: NonNullable<TelegramUpdate['callback_query']>,
  ): Promise<void> => {
    const data = callback.data ?? '';
    /* Кнопка живёт в сообщении бота; но чат под ней обязан быть чатом владельца. */
    if (callback.message !== undefined && callback.message.chat.id !== ownerChatId) return;

    if (data.startsWith('idea:')) {
      const [, verdict, id] = data.split(':');
      const idea = pendingIdeas.get(id ?? '');
      pendingIdeas.delete(id ?? '');
      await client.answerCallbackQuery(callback.id).catch(() => undefined);

      if (verdict !== 'yes') {
        await send('Отменено. Задумка никуда не пошла.');
        return;
      }
      if (idea === undefined) {
        await send('Эта кнопка уже отработала или устарела. Пришлите задумку заново.');
        return;
      }
      if (actions.launch === undefined) {
        await send('Фасад запуска ещё не подключён (задача 166).');
        return;
      }

      await send('🚀 Принято. Запускаю: платформа → бандл → контур. Алерты будут здесь.');
      try {
        await actions.launch(idea, (text) => send(text));
      } catch (error) {
        await send(
          `Запуск не удался: ${error instanceof Error ? trimTo(error.message, 400) : 'ошибка'}`,
        );
      }
      return;
    }

    if (data.startsWith('plan:')) {
      await client.answerCallbackQuery(callback.id).catch(() => undefined);

      if (!data.startsWith('plan:go:')) {
        await send(
          'Конвейер не запущен — план и вердикт суда остаются на диске (handoff/PLAN_REVIEW.json). ' +
            'Дополнить — пришлите задумку заново; запустить как есть можно кнопкой под алертом суда.',
        );
        return;
      }

      const projectId = data.slice('plan:go:'.length);
      const directory = projectDirectory(projectId);
      if (directory === null) {
        await send('Проект не найден или у него нет рабочей директории.');
        return;
      }
      if (actions.acceptPlan === undefined) {
        await send('Продолжение из чата не подключено (нет acceptPlan).');
        return;
      }

      await send(
        '▶️ Принято: запускаю конвейер с названными пробелами — они остаются в вердикте суда.',
      );
      try {
        const outcome = await actions.acceptPlan(projectId, directory);
        await send(
          alertText('🔁 Конвейер запущен по решению владельца', projectLabel(projectId), outcome),
        );
      } catch (error) {
        await send(
          `Запуск не удался: ${error instanceof Error ? trimTo(error.message, 400) : 'ошибка'}`,
        );
      }
      return;
    }

    if (data.startsWith('stop:')) {
      await client.answerCallbackQuery(callback.id).catch(() => undefined);

      if (!data.startsWith('stop:yes:')) {
        await send('Отменено — конвейер работает дальше.');
        return;
      }

      const projectId = data.slice('stop:yes:'.length);
      const directory = projectDirectory(projectId);
      if (directory === null) {
        await send('Проект не найден или у него нет рабочей директории.');
        return;
      }

      const live = livePipeline(projectId);
      try {
        const outcome = await actions.stopProject(projectId, directory, live?.running() ?? []);
        await send(alertText('⏸ Конвейер остановлен', projectLabel(projectId), outcome));
      } catch (error) {
        await send(
          `Остановка не удалась: ${error instanceof Error ? trimTo(error.message, 400) : 'ошибка'}`,
        );
      }
    }
  };

  const handleUpdate = async (update: TelegramUpdate): Promise<void> => {
    if (update.message !== undefined) {
      /* Закрытый бот: чужие сообщения — молча, включая /start (А-28 п.5). */
      if (update.message.chat.id !== ownerChatId) {
        log(`сообщение из чужого чата ${String(update.message.chat.id)} проигнорировано молча`);
        return;
      }
      await handleMessage(update.message);
      return;
    }

    if (update.callback_query !== undefined) {
      await handleCallback(update.callback_query);
    }
  };

  /* ---------------------------------------------------------------- длинный опрос */

  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  const pollLoop = async (): Promise<void> => {
    state.pollAlive = true;
    /* Предикат-функция, не свойство: сужение TS держит `state.running` истинным через await. */
    const alive = () => state.running;
    let offset = 0;

    while (alive()) {
      try {
        abortPoll = new AbortController();
        const updates = await client.getUpdates(offset, longPollSec, abortPoll.signal);

        for (const update of updates) {
          offset = Math.max(offset, update.update_id + 1);
          try {
            await handleUpdate(update);
          } catch (error) {
            /* Ядовитый апдейт стоит строки в журнале, не мёртвой петли: offset уже сдвинут. */
            log(
              `апдейт ${String(update.update_id)} не обработан: ${error instanceof Error ? error.message : String(error)}`,
              'ERROR',
            );
          }
        }

        if (updates.length === 0 && alive()) await sleep(idleMs);
      } catch (error) {
        if (!alive()) break;
        log(
          `опрос Telegram упал: ${error instanceof Error ? error.message : String(error)} — повтор через ${String(errorMs)} мс`,
          'WARN',
        );
        await sleep(errorMs);
      }
    }

    state.pollAlive = false;
  };

  return {
    start() {
      if (state.running) return;
      state.running = true;

      unsubscribe = bus.subscribe(onEvent);
      void client.setMyCommands(BOT_COMMANDS).catch((error: unknown) => {
        log(
          `setMyCommands не удался: ${error instanceof Error ? error.message : String(error)}`,
          'WARN',
        );
      });

      void pollLoop();
      log(
        `Telegram-шлюз запущен: чат владельца ${String(ownerChatId)}, long poll ${String(longPollSec)} с`,
      );
    },

    async stop() {
      state.running = false;
      unsubscribe?.();
      unsubscribe = null;
      abortPoll?.abort();

      /* Дожидаемся конца петли, чтобы тест не оставил живого таймера. */
      for (let waited = 0; state.pollAlive && waited < 5_000; waited += 50) {
        await sleep(50);
      }
      log('Telegram-шлюз остановлен');
    },

    polling: () => state.pollAlive,
  };
}
