import { createServer, type Server } from 'node:http';

import { buildPrompt, ChatMessage, ResponseFormat } from './prompt.ts';
import type { CliAnswer } from './cli.ts';

import { z } from 'zod';

/**
 * OpenAI-совместимый сервер моста (задача 175).
 *
 * Три маршрута, и ни одним больше: `/v1/models` — чтобы SDK, который сначала спрашивает список,
 * получил ответ; `/health` — чтобы поднимающий скрипт мог дождаться готовности; POST
 * `/v1/chat/completions` — сама работа. Слушает только loopback: мост — локальное звено одной
 * машины, а не сервис.
 *
 * **SSE-стрим с keep-alive пустыми дельтами каждые 10 с** — весь смысл стримового пути: undici-предел
 * «тихого тела» (300 с) не наступает, пока CLI думает; замер M16а — конституция 77 с, длинные
 * документы минуты. Готовый текст затем режется на куски по 2000 знаков: читатель, считающий
 * дельты, видит поток, а не глыбу.
 *
 * Ошибка ПОСЛЕ начала стрима — обрыв соединения, не JSON с ошибкой: заголовки уже ушли со статусом
 * 200, и обрыв — единственный сигнал, который SDK честно читает как отказ звена (и уходит в
 * failover). До начала стрима — обычные 4xx/5xx.
 *
 * Значение токена сюда не попадает вовсе: сервер держит функцию `generate`, а не учётку.
 */

const ChatRequest = z
  .object({
    messages: z.array(ChatMessage).default([]),
    stream: z.boolean().optional(),
    response_format: ResponseFormat.optional(),
    max_tokens: z.number().int().positive().optional(),
  })
  .loose();

export interface BridgeDeps {
  /** Один ход CLI. Подменяется в тестах; в бою — `runCli` с токеном и путём. */
  generate(prompt: string, system: string, maxTokens: number | undefined): Promise<CliAnswer>;
  /** Строки журнала — длины и длительности, никогда содержимое и никогда учётки. */
  log(line: string): void;
  now?: () => number;
  /** Интервал keep-alive; в тестах — маленький. */
  keepAliveMs?: number;
}

export const MODEL_ID = 'claude-subscription-bridge';

const chunkOf = (
  id: string,
  created: number,
  delta: Record<string, unknown>,
  finish: string | null = null,
): string =>
  `data: ${JSON.stringify({
    id,
    object: 'chat.completion.chunk',
    created,
    model: MODEL_ID,
    choices: [{ index: 0, delta, finish_reason: finish }],
  })}\n\n`;

export function createBridgeServer(deps: BridgeDeps): Server {
  const now = deps.now ?? Date.now;
  const keepAliveMs = deps.keepAliveMs ?? 10_000;

  return createServer((request, response) => {
    if (request.method === 'GET' && request.url?.startsWith('/v1/models') === true) {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ object: 'list', data: [{ id: MODEL_ID, object: 'model' }] }));
      return;
    }
    if (request.method === 'GET' && request.url === '/health') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end('{"status":"ok"}');
      return;
    }
    if (request.method !== 'POST' || request.url?.startsWith('/v1/chat/completions') !== true) {
      response.writeHead(404).end();
      return;
    }

    const body: Buffer[] = [];
    request.on('data', (piece: Buffer) => body.push(piece));
    request.on('end', () => {
      void (async () => {
        let payload: z.infer<typeof ChatRequest>;
        try {
          payload = ChatRequest.parse(JSON.parse(Buffer.concat(body).toString('utf8')));
        } catch {
          response.writeHead(400, { 'content-type': 'application/json' });
          response.end('{"error":{"message":"bad json"}}');
          return;
        }

        const id = `bridge-${now().toString(36)}`;
        const created = Math.floor(now() / 1000);
        const { prompt, system } = buildPrompt(payload.messages, payload.response_format);
        const startedAt = now();
        deps.log(
          `→ ${id}: messages=${String(payload.messages.length)}, промпт ${String(prompt.length)} зн., ` +
            `система ${String(system.length)} зн., stream=${String(payload.stream === true)}, ` +
            `format=${payload.response_format?.type ?? '—'}, max_tokens=${String(payload.max_tokens ?? '—')}`,
        );

        if (payload.stream === true) {
          response.writeHead(200, {
            'content-type': 'text/event-stream',
            'cache-control': 'no-cache',
            connection: 'keep-alive',
          });
          response.write(chunkOf(id, created, { role: 'assistant', content: '' }));
          const keepAlive = setInterval(() => {
            response.write(chunkOf(id, created, {}));
          }, keepAliveMs);

          try {
            const answer = await deps.generate(prompt, system, payload.max_tokens);
            clearInterval(keepAlive);
            deps.log(
              `← ${id}: ${((now() - startedAt) / 1000).toFixed(1)} с, ` +
                `${String(answer.text.length)} зн., completion_tokens=${String(answer.usage.completion_tokens)}`,
            );
            for (let offset = 0; offset < answer.text.length; offset += 2000) {
              response.write(
                chunkOf(id, created, { content: answer.text.slice(offset, offset + 2000) }),
              );
            }
            response.write(chunkOf(id, created, {}, 'stop'));
            response.write('data: [DONE]\n\n');
            response.end();
          } catch (error) {
            clearInterval(keepAlive);
            deps.log(`× ${id}: ${error instanceof Error ? error.message : String(error)}`);
            response.destroy();
          }
          return;
        }

        try {
          const answer = await deps.generate(prompt, system, payload.max_tokens);
          deps.log(
            `← ${id}: ${((now() - startedAt) / 1000).toFixed(1)} с (нестрим), ${String(answer.text.length)} зн.`,
          );
          response.writeHead(200, { 'content-type': 'application/json' });
          response.end(
            JSON.stringify({
              id,
              object: 'chat.completion',
              created,
              model: MODEL_ID,
              choices: [
                {
                  index: 0,
                  message: { role: 'assistant', content: answer.text },
                  finish_reason: 'stop',
                },
              ],
              usage: answer.usage,
            }),
          );
        } catch (error) {
          deps.log(`× ${id}: ${error instanceof Error ? error.message : String(error)}`);
          response.writeHead(502, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ error: { message: 'bridge upstream failed' } }));
        }
      })();
    });
  });
}
