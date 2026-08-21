import { getDatabase } from '../db/client.ts';
import { createDockerEngine } from '../docker/engine.ts';
import { resolveEndpoint } from '../docker/transport.ts';
import { eventBus } from '../events/bus.ts';
import { freezePipeline } from '../orchestrator/freeze.ts';
import type { LoopEnv } from '../config/env.ts';

import { createTelegramGateway, type TelegramGateway } from './bot.ts';
import { createTelegramClient } from './telegram-api.ts';

/**
 * Боевая обвязка шлюза (задача 164): собирается из env на загрузке процесса.
 *
 * **Опциональность именованная, не молчаливая**: без пары `TELEGRAM_BOT_TOKEN` +
 * `TELEGRAM_OWNER_CHAT_ID` контур работает ровно как вчера, а в консоль уходит одна строка о том,
 * ЧТО выключено и ЧЕМ включается. Одна переменная из двух — тоже строка, называющая недостающую.
 *
 * Синглтон на `globalThis` — по той же причине, что шина: Next перезагружает модули в dev, и
 * второй экземпляр был бы вторым опросом одного бота (Telegram отвечает 409 второму getUpdates).
 */

const KEY = Symbol.for('spec-platform.loop.telegram-gateway');

interface Holder {
  [KEY]?: TelegramGateway;
}

export function startGatewayFromEnv(
  env: LoopEnv,
  log: (line: string) => void,
): TelegramGateway | null {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_OWNER_CHAT_ID;

  if (token === undefined && chatId === undefined) {
    log(
      '[loop] Telegram-шлюз выключен: TELEGRAM_BOT_TOKEN и TELEGRAM_OWNER_CHAT_ID не заданы (loop/.env).',
    );
    return null;
  }
  if (token === undefined || chatId === undefined) {
    log(
      `[loop] Telegram-шлюз выключен: не задана ${token === undefined ? 'TELEGRAM_BOT_TOKEN' : 'TELEGRAM_OWNER_CHAT_ID'} — нужна пара (loop/.env).`,
    );
    return null;
  }

  const ownerChatId = Number(chatId);
  if (!Number.isInteger(ownerChatId)) {
    log(`[loop] Telegram-шлюз выключен: TELEGRAM_OWNER_CHAT_ID «${chatId}» — не число.`);
    return null;
  }

  const holder = globalThis as unknown as Holder;
  if (holder[KEY] !== undefined) return holder[KEY];

  const gateway = createTelegramGateway({
    client: createTelegramClient({ token }),
    ownerChatId,
    database: getDatabase(),
    bus: eventBus(),
    actions: {
      async stopProject(projectId, projectDirectory, running) {
        const engine = createDockerEngine(
          resolveEndpoint(process.platform, {
            ...(env.DOCKER_ENGINE_PIPE === undefined
              ? {}
              : { DOCKER_ENGINE_PIPE: env.DOCKER_ENGINE_PIPE }),
            ...(env.DOCKER_ENGINE_SOCKET === undefined
              ? {}
              : { DOCKER_ENGINE_SOCKET: env.DOCKER_ENGINE_SOCKET }),
          }),
        );

        const record = await freezePipeline(getDatabase(), engine, {
          projectId,
          projectDirectory,
          taskId: '—',
          reason: 'Остановлено владельцем из Telegram (/stop).',
          inFlight: running.map((taskId) => ({ taskId, previousStatus: 'IN_PROGRESS' as const })),
        });

        return `Заморожено исполнителей: ${String(record.paused.length)}. Продолжение — «Возобновить» на дашборде.`;
      },
      /* launch и transcribe подключают задачи 166 и 165; до того шлюз отвечает именованно. */
    },
    log: (line, level) => {
      log(`[loop][tg${level === undefined || level === 'INFO' ? '' : ` ${level}`}] ${line}`);
    },
  });

  holder[KEY] = gateway;
  gateway.start();
  return gateway;
}
