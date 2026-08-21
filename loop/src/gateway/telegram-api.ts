import { z } from 'zod';

/**
 * Клиент Telegram Bot API (задача 164; бандл A0 Task 4.1).
 *
 * Long polling, не webhook — сознательно: контур живёт на машине заказчика за NAT, входящего
 * адреса у него нет и не должно быть; исходящий `getUpdates` — единственная форма связи, которой
 * не нужен ни туннель, ни сертификат.
 *
 * **Значение токена не покидает этот модуль** (красное условие задачи). Токен стоит в пути URL —
 * так устроен сам Bot API, — поэтому ни один URL отсюда не логируется и не попадает в тексты
 * ошибок: ошибка называет МЕТОД и статус, а любое сообщение исключения, прежде чем выйти наружу,
 * прогоняется через вымарывание токена. Пояс и подтяжки, потому что цена промаха — учётка в ленте.
 */

const Envelope = z.object({
  ok: z.boolean(),
  result: z.unknown().optional(),
  description: z.string().optional(),
});

/** Ровно те поля апдейта, которые шлюз читает. Всё прочее Telegram может слать — оно отброшено. */
export const TelegramUpdate = z
  .object({
    update_id: z.number().int(),
    message: z
      .object({
        message_id: z.number().int(),
        chat: z.object({ id: z.number().int() }).loose(),
        text: z.string().optional(),
        voice: z
          .object({
            file_id: z.string(),
            duration: z.number().optional(),
            mime_type: z.string().optional(),
          })
          .loose()
          .optional(),
      })
      .loose()
      .optional(),
    callback_query: z
      .object({
        id: z.string(),
        data: z.string().optional(),
        message: z
          .object({
            message_id: z.number().int(),
            chat: z.object({ id: z.number().int() }).loose(),
          })
          .loose()
          .optional(),
      })
      .loose()
      .optional(),
  })
  .loose();

export type TelegramUpdate = z.infer<typeof TelegramUpdate>;

export interface InlineButton {
  text: string;
  callback_data: string;
}

export interface SendMessageExtra {
  /** Ряды inline-кнопок; отсутствие — обычное сообщение. */
  buttons?: InlineButton[][];
}

export interface BotCommand {
  command: string;
  description: string;
}

export interface TelegramClient {
  /** Длинный опрос: возвращается по событию или по истечении `timeoutSec`. */
  getUpdates(offset: number, timeoutSec: number, signal?: AbortSignal): Promise<TelegramUpdate[]>;
  sendMessage(chatId: number, text: string, extra?: SendMessageExtra): Promise<void>;
  answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void>;
  setMyCommands(commands: readonly BotCommand[]): Promise<void>;
  /** Путь файла на сервере Telegram — для скачивания голосовых (задача 165). */
  getFilePath(fileId: string): Promise<string>;
  /** Скачивает файл по пути из `getFilePath`. */
  downloadFile(filePath: string): Promise<Buffer>;
}

export interface TelegramClientOptions {
  token: string;
  /** Подменяется в тестах фейковым Bot API. Боевое умолчание — api.telegram.org. */
  apiBase?: string;
  /** Предел одного HTTP-вызова поверх серверного long-poll таймаута. */
  requestTimeoutMs?: number;
}

export function createTelegramClient(options: TelegramClientOptions): TelegramClient {
  const apiBase = (options.apiBase ?? 'https://api.telegram.org').replace(/\/$/, '');
  const token = options.token;
  const requestTimeoutMs = options.requestTimeoutMs ?? 90_000;

  /** Токен вымарывается из любого текста, который может уйти наружу. */
  const scrub = (text: string): string => text.split(token).join('<токен>');

  async function call(method: string, payload: unknown, signal?: AbortSignal): Promise<unknown> {
    const abort = new AbortController();
    const timer = setTimeout(() => {
      abort.abort();
    }, requestTimeoutMs);
    signal?.addEventListener('abort', () => {
      abort.abort();
    });

    try {
      const response = await fetch(`${apiBase}/bot${token}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: abort.signal,
      });

      const body: unknown = await response.json().catch(() => null);
      const parsed = Envelope.safeParse(body);

      if (!response.ok || !parsed.success || !parsed.data.ok) {
        const because = parsed.success ? (parsed.data.description ?? '') : 'ответ не разобран';
        throw new Error(
          `Telegram ${method} → ${String(response.status)}${because === '' ? '' : `: ${scrub(because)}`}`,
        );
      }

      return parsed.data.result;
    } catch (error) {
      /*
       * Ошибка транспорта может нести URL с токеном — наружу уходит вымаранная, и `cause`
       * СОЗНАТЕЛЬНО не прикрепляется: цепочка причин сохранила бы исходный текст с токеном, а
       * красное условие задачи сильнее удобства отладки.
       */
      if (error instanceof Error && error.message.includes(token)) {
        // eslint-disable-next-line preserve-caught-error -- cause нёс бы токен, см. комментарий выше
        throw new Error(scrub(error.message));
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async getUpdates(offset, timeoutSec, signal) {
      const result = await call(
        'getUpdates',
        { offset, timeout: timeoutSec, allowed_updates: ['message', 'callback_query'] },
        signal,
      );

      return z.array(TelegramUpdate).parse(result ?? []);
    },

    async sendMessage(chatId, text, extra) {
      await call('sendMessage', {
        chat_id: chatId,
        text,
        ...(extra?.buttons === undefined
          ? {}
          : { reply_markup: { inline_keyboard: extra.buttons } }),
      });
    },

    async answerCallbackQuery(callbackQueryId, text) {
      await call('answerCallbackQuery', {
        callback_query_id: callbackQueryId,
        ...(text === undefined ? {} : { text }),
      });
    },

    async setMyCommands(commands) {
      await call('setMyCommands', { commands });
    },

    async getFilePath(fileId) {
      const result = await call('getFile', { file_id: fileId });
      return z.object({ file_path: z.string() }).loose().parse(result).file_path;
    },

    async downloadFile(filePath) {
      const abort = new AbortController();
      const timer = setTimeout(() => {
        abort.abort();
      }, requestTimeoutMs);

      try {
        const response = await fetch(`${apiBase}/file/bot${token}/${filePath}`, {
          signal: abort.signal,
        });
        if (!response.ok) {
          throw new Error(`Telegram file → ${String(response.status)}`);
        }
        return Buffer.from(await response.arrayBuffer());
      } catch (error) {
        /* Как в call(): cause сознательно отброшен — он нёс бы токен в исходном тексте. */
        if (error instanceof Error && error.message.includes(token)) {
          // eslint-disable-next-line preserve-caught-error -- cause нёс бы токен
          throw new Error(scrub(error.message));
        }
        throw error;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
