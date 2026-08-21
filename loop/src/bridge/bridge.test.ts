import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { execFile } from 'node:child_process';

import { afterEach, describe, expect, it } from 'vitest';

import { parseEnv, providerCredentials } from '../config/env.ts';
import { buildProviders } from '../llm/providers.ts';
import { parseRoleOrder, roleOrder } from '../llm/roles.ts';

import { buildCliArgs, runCli, type CliAnswer } from './cli.ts';
import { buildPrompt, stripOuterFence } from './prompt.ts';
import { createBridgeServer, MODEL_ID } from './server.ts';

/**
 * Мост подписки (задача 175): три урока D-304 закреплены как проверяемые свойства, а не как
 * память оператора. Каждый урок был куплен живым отказом M16а — тест повторяет форму отказа и
 * утверждает, что мост в неё больше не попадает.
 *
 * Ни одного живого вызова: CLI подменён, сервер слушает loopback со стабовым генератором.
 */

const TOKEN = 'sk-ant-oat01-СЕКРЕТ-НЕ-ПЕЧАТАТЬ';

interface ExecCall {
  path: string;
  args: readonly string[];
  env: Record<string, string | undefined>;
  stdin: string;
}

/** Стаб `execFile`: записывает вызов, отвечает заданным stdout. */
function fakeExec(calls: ExecCall[], stdout: string): typeof execFile {
  return ((path: string, args: readonly string[], options: { env: Record<string, string> }, callback: (error: Error | null, stdout: string, stderr: string) => void) => {
    const call: ExecCall = { path, args, env: options.env, stdin: '' };
    calls.push(call);
    return {
      on: () => undefined,
      stdin: {
        end: (chunk: string) => {
          call.stdin = chunk;
          /* Ответ — после того как stdin закрыт, как у настоящего CLI. */
          setImmediate(() => {
            callback(null, stdout, '');
          });
        },
      },
    };
  }) as unknown as typeof execFile;
}

const cliJson = (result: string) =>
  JSON.stringify({
    is_error: false,
    result,
    usage: { input_tokens: 10, output_tokens: 20 },
    duration_api_ms: 500,
  });

let workDir = '';
afterEach(() => {
  if (workDir !== '') {
    rmSync(workDir, { recursive: true, force: true });
    workDir = '';
  }
});

const cliOptions = (calls: ExecCall[], stdout: string) => {
  workDir = mkdtempSync(join(tmpdir(), 'bridge-test-'));
  return {
    cliPath: 'claude-stub',
    token: TOKEN,
    workDir,
    baseEnv: { NODE_ENV: 'test' } as const,
    exec: fakeExec(calls, stdout),
    now: () => 1_000,
  };
};

describe('урок 1 D-304 — система только настоящим системным каналом', () => {
  it('отделяет системные сообщения от промпта, а не маркирует их в user-тексте', () => {
    const built = buildPrompt([
      { role: 'system', content: 'Ты генератор конституций.' },
      { role: 'user', content: 'Напиши конституцию.' },
      { role: 'assistant', content: 'Черновик.' },
      { role: 'user', content: 'Доработай.' },
    ]);

    expect(built.system).toBe('Ты генератор конституций.');
    expect(built.prompt).not.toContain('Ты генератор конституций.');
    expect(built.prompt).toContain('Напиши конституцию.');
    expect(built.prompt).toContain('Твой предыдущий ответ был:');
    expect(built.prompt).toContain('Доработай.');
  });

  it('кладёт систему в argv как --append-system-prompt и никуда больше', () => {
    const args = buildCliArgs('система');
    const at = args.indexOf('--append-system-prompt');

    expect(at).toBeGreaterThan(-1);
    expect(args[at + 1]).toBe('система');
    expect(buildCliArgs('')).not.toContain('--append-system-prompt');
  });

  it('переводит response_format в JSON-инструкцию хвостом промпта (путь А-10, без грамматики)', () => {
    const built = buildPrompt([{ role: 'user', content: 'дай список' }], {
      type: 'json_schema',
      json_schema: { schema: { type: 'object', properties: { items: { type: 'array' } } } },
    });

    expect(built.prompt).toContain('ТОЛЬКО валидным JSON');
    expect(built.prompt).toContain('"items"');
  });
});

describe('урок 2 D-304 — промпт потоком stdin, не аргументом', () => {
  it('не кладёт содержимое промпта в argv вовсе — оно уходит в stdin', async () => {
    const calls: ExecCall[] = [];
    const prompt = 'Реальное содержимое: кавычки "и" переводы\nстрок, кириллица на тысячи знаков.';

    await runCli(prompt, 'система', cliOptions(calls, cliJson('ответ')));

    expect(calls).toHaveLength(1);
    const call = calls.at(0);
    if (call === undefined) throw new Error('CLI не был вызван');
    expect(call.stdin).toBe(prompt);
    expect(call.args.join(' ')).not.toContain('Реальное содержимое');
  });
});

describe('урок 3 D-304 — без единого инструмента', () => {
  it('передаёт --tools "" и изоляцию: --setting-sources "", --strict-mcp-config, --max-turns 1', () => {
    const args = buildCliArgs('');

    const tools = args.indexOf('--tools');
    expect(tools).toBeGreaterThan(-1);
    expect(args[tools + 1]).toBe('');

    const settings = args.indexOf('--setting-sources');
    expect(settings).toBeGreaterThan(-1);
    expect(args[settings + 1]).toBe('');

    expect(args).toContain('--strict-mcp-config');
    expect(args.slice(args.indexOf('--max-turns'))[1]).toBe('1');
  });
});

describe('красное условие — значение токена не печатается нигде', () => {
  it('токен есть ровно в окружении процесса CLI; в argv и в ошибках его нет', async () => {
    const calls: ExecCall[] = [];
    await runCli('промпт', '', cliOptions(calls, cliJson('ок')));

    const call = calls.at(0);
    if (call === undefined) throw new Error('CLI не был вызван');
    expect(call.env.CLAUDE_CODE_OAUTH_TOKEN).toBe(TOKEN);
    expect(call.args.join(' ')).not.toContain(TOKEN);

    /* Отказ CLI: сообщение ошибки не содержит токена. */
    const failing: ExecCall[] = [];
    const error = await runCli(
      'промпт',
      '',
      cliOptions(failing, JSON.stringify({ is_error: true, subtype: 'auth', result: 'denied' })),
    ).catch((raised: unknown) => raised);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain(TOKEN);
    expect((error as Error).message).toContain('CLI is_error');
  });

  it('строки журнала сервера несут длины и длительности, не содержимое и не учётки', async () => {
    const lines: string[] = [];
    const server = createBridgeServer({
      generate: () =>
        Promise.resolve<CliAnswer>({
          text: 'документ',
          usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
          apiMs: 5,
        }),
      log: (line) => lines.push(line),
      now: () => 2_000,
    });
    await new Promise<void>((ready) => server.listen(0, '127.0.0.1', ready));
    const port = (server.address() as AddressInfo).port;

    await fetch(`http://127.0.0.1:${String(port)}/v1/chat/completions`, {
      method: 'POST',
      body: JSON.stringify({
        messages: [{ role: 'user', content: `секретный промпт ${TOKEN}` }],
      }),
    });
    server.close();

    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line).not.toContain(TOKEN);
      expect(line).not.toContain('секретный промпт');
    }
  });
});

describe('сервер моста — OpenAI-совместимая поверхность', () => {
  const start = async (generate: () => Promise<CliAnswer>, keepAliveMs = 10_000) => {
    const lines: string[] = [];
    const server = createBridgeServer({ generate, log: (line) => lines.push(line), keepAliveMs });
    await new Promise<void>((ready) => server.listen(0, '127.0.0.1', ready));
    const port = (server.address() as AddressInfo).port;
    return { server, port, lines };
  };

  const answer: CliAnswer = {
    text: 'готовый документ',
    usage: { prompt_tokens: 7, completion_tokens: 9, total_tokens: 16 },
    apiMs: 42,
  };

  it('нестримовый POST отвечает формой chat.completion с usage', async () => {
    const { server, port } = await start(() => Promise.resolve(answer));
    const response = await fetch(`http://127.0.0.1:${String(port)}/v1/chat/completions`, {
      method: 'POST',
      body: JSON.stringify({ messages: [{ role: 'user', content: 'привет' }] }),
    });
    const body = (await response.json()) as {
      model: string;
      choices: { message: { content: string }; finish_reason: string }[];
      usage: { total_tokens: number };
    };
    server.close();

    expect(response.status).toBe(200);
    expect(body.model).toBe(MODEL_ID);
    expect(body.choices[0]?.message.content).toBe('готовый документ');
    expect(body.choices[0]?.finish_reason).toBe('stop');
    expect(body.usage.total_tokens).toBe(16);
  });

  it('стримовый POST шлёт SSE: роль, keep-alive пустыми дельтами, куски, stop, [DONE]', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const { server, port } = await start(
      () => gate.then(() => ({ ...answer, text: 'x'.repeat(4100) })),
      20,
    );

    const response = await fetch(`http://127.0.0.1:${String(port)}/v1/chat/completions`, {
      method: 'POST',
      body: JSON.stringify({ stream: true, messages: [{ role: 'user', content: 'долго' }] }),
    });
    expect(response.headers.get('content-type')).toContain('text/event-stream');

    /* Даём keep-alive успеть тикнуть, пока генератор молчит. */
    await new Promise((r) => setTimeout(r, 90));
    release();

    const raw = await response.text();
    server.close();

    const events = raw
      .split('\n\n')
      .filter((piece) => piece.startsWith('data: '))
      .map((piece) => piece.slice('data: '.length));

    expect(events.at(-1)).toBe('[DONE]');
    const parsed = events.slice(0, -1).map((piece) => JSON.parse(piece) as {
      choices: { delta: Record<string, string>; finish_reason: string | null }[];
    });

    /* Первая дельта — роль; между ней и контентом были пустые keep-alive дельты. */
    expect(parsed[0]?.choices[0]?.delta.role).toBe('assistant');
    const empties = parsed.filter(
      (event) => Object.keys(event.choices[0]?.delta ?? {}).length === 0 && event.choices[0]?.finish_reason === null,
    );
    expect(empties.length).toBeGreaterThan(0);

    /* 4100 знаков режутся на куски ≤2000 — читатель видит поток, не глыбу. */
    const contents = parsed
      .map((event) => event.choices[0]?.delta.content ?? '')
      .filter((content) => content !== '');
    expect(contents.length).toBeGreaterThanOrEqual(3);
    expect(contents.join('')).toBe('x'.repeat(4100));
    expect(parsed.at(-1)?.choices[0]?.finish_reason).toBe('stop');
  });

  it('отказ звена до стрима — 502 JSON; посреди стрима — обрыв соединения, который SDK читает как отказ', async () => {
    const failing = () => Promise.reject(new Error('CLI is_error: subtype=rate_limit'));

    const plain = await start(failing);
    const nonStream = await fetch(`http://127.0.0.1:${String(plain.port)}/v1/chat/completions`, {
      method: 'POST',
      body: JSON.stringify({ messages: [] }),
    });
    plain.server.close();
    expect(nonStream.status).toBe(502);

    const streaming = await start(failing);
    const failed = await fetch(`http://127.0.0.1:${String(streaming.port)}/v1/chat/completions`, {
      method: 'POST',
      body: JSON.stringify({ stream: true, messages: [] }),
    })
      .then((response) => response.text())
      .then(() => 'дочитан')
      .catch(() => 'оборван');
    streaming.server.close();
    expect(failed).toBe('оборван');
  });

  it('/v1/models и /health отвечают; прочее — 404; кривой JSON — 400', async () => {
    const { server, port } = await start(() => Promise.resolve(answer));
    const base = `http://127.0.0.1:${String(port)}`;

    const models = (await (await fetch(`${base}/v1/models`)).json()) as {
      data: { id: string }[];
    };
    expect(models.data[0]?.id).toBe(MODEL_ID);
    expect((await fetch(`${base}/health`)).status).toBe(200);
    expect((await fetch(`${base}/elsewhere`)).status).toBe(404);
    expect(
      (
        await fetch(`${base}/v1/chat/completions`, { method: 'POST', body: 'не json' })
      ).status,
    ).toBe(400);
    server.close();
  });
});

describe('фенс снимается только с целого ответа', () => {
  it('обёрнутый целиком — разворачивается; фенс внутри текста — не трогается', () => {
    expect(stripOuterFence('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(stripOuterFence('```markdown\n# Документ\n```')).toBe('# Документ');
    const inner = 'Текст с примером:\n```js\ncode()\n```\nи хвостом.';
    expect(stripOuterFence(inner)).toBe(inner);
  });
});

describe('конфиг-тест цепочки — адаптер спереди, google запасным (§7.2)', () => {
  it('CLAUDE_CLI_API_BASE конфигурирует звено claude-cli, и порядок строится как заказан', () => {
    const env = parseEnv({
      CLAUDE_CODE_OAUTH_TOKEN: 'token',
      PORT: '3100',
      WORKSPACE_ROOT_PATH: 'C:/ws',
      LOOP_PROVIDER_ORDER: 'claude-cli,google',
      CLAUDE_CLI_API_BASE: 'http://127.0.0.1:8091/v1',
      GOOGLE_GENERATIVE_AI_API_KEY: 'g',
    });

    const providers = buildProviders(env.LOOP_PROVIDER_ORDER, providerCredentials(env));
    expect(providers.map((provider) => provider.id)).toEqual(['claude-cli', 'google']);
  });

  it('звено без своей базы пропускается, как ollama без своей — контур работает как вчера', () => {
    expect(buildProviders(['claude-cli', 'google'], { googleApiKey: 'g' }).map((p) => p.id)).toEqual(
      ['google'],
    );
  });

  it('per-role шов задачи 161 принимает claude-cli', () => {
    expect(parseRoleOrder('claude-cli,google')).toEqual(['claude-cli', 'google']);
    expect(
      roleOrder({ order: ['google'], perRole: { architect: ['claude-cli'] } }, 'architect'),
    ).toEqual(['claude-cli']);
  });
});
