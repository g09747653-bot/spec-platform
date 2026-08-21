import { execFile } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripOuterFence } from './prompt.ts';

/**
 * Вызов Claude Code CLI — один неинтерактивный ход (задача 175; уроки 2 и 3 из D-304).
 *
 * Три урока M16а закреплены здесь кодом, а не памятью оператора:
 *
 * 1. **Система — только `--append-system-prompt`** (см. `prompt.ts`): аргументы собирает
 *    `buildCliArgs`, и системный текст — единственное место, где содержимое запроса вообще
 *    касается argv.
 * 2. **Промпт — потоком stdin, не аргументом.** Командная строка Windows на реальном содержимом
 *    (кавычки, переводы строк, кириллица на десятки тысяч знаков) дала честный is_error; stdin не
 *    встречает командную строку вовсе. `buildCliArgs` поэтому не имеет параметра «промпт» — его
 *    некуда было бы положить.
 * 3. **`--tools ''`** — без единого инструмента: генератору нужен текст, а не агентный ход.
 *    Ревью-промпт уводил модель в tool_use, и `--max-turns 1` рвал его как error_max_turns.
 *
 * Изоляция — та же, что у прогулок: `--setting-sources ''` закрывает канал инъекции настроек
 * репозитория, `--strict-mcp-config` отрезает MCP-серверы, cwd — вне репозитория. Значение токена
 * не печатается никогда: в лог уходят длины и длительности, в argv его нет по построению.
 */

export interface CliAnswer {
  text: string;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  apiMs: number;
}

export interface CliOptions {
  /** Путь к исполняемому файлу CLI. */
  cliPath: string;
  /** Подписочный токен. В argv не попадает — только в окружение процесса CLI. */
  token: string;
  /** Рабочая директория CLI — вне репозитория, чтобы ход не видел ничьих файлов. */
  workDir: string;
  /** Куда писать дампы отказов (`fail-*.json`). Обычно совпадает с `workDir`. */
  dumpDir?: string;
  maxTokens?: number | undefined;
  /**
   * Базовое окружение процесса CLI (PATH, HOME и прочее платформенное). Передаётся вызывающим —
   * у этого модуля нет своего права читать окружение; токен добавляется поверх точечно.
   */
  baseEnv: NodeJS.ProcessEnv;
  /** Подменяется в тестах; по умолчанию — настоящий `node:child_process.execFile`. */
  exec?: typeof execFile;
  /** Подменяемые часы для имён дампов — тестам не нужен настоящий Date. */
  now?: () => number;
}

/** Потолок CLAUDE_CODE_MAX_OUTPUT_TOKENS: выше CLI всё равно не примет. */
const MAX_OUTPUT_TOKENS_CEILING = 60_000;

/**
 * Аргументы одного вызова. Промпта среди них нет и быть не может — он уходит stdin-ом.
 * Экспортирована отдельно, потому что это и есть проверяемая форма уроков 1 и 3.
 */
export function buildCliArgs(system: string): string[] {
  return [
    '-p',
    '--tools',
    '',
    ...(system === '' ? [] : ['--append-system-prompt', system]),
    '--setting-sources',
    '',
    '--strict-mcp-config',
    '--max-turns',
    '1',
    '--output-format',
    'json',
  ];
}

export function runCli(prompt: string, system: string, options: CliOptions): Promise<CliAnswer> {
  const exec = options.exec ?? execFile;
  const now = options.now ?? Date.now;

  const env: NodeJS.ProcessEnv = { ...options.baseEnv };
  env.CLAUDE_CODE_OAUTH_TOKEN = options.token;
  if (options.maxTokens !== undefined) {
    env.CLAUDE_CODE_MAX_OUTPUT_TOKENS = String(
      Math.min(options.maxTokens, MAX_OUTPUT_TOKENS_CEILING),
    );
  }

  return new Promise((resolve, reject) => {
    const child = exec(
      options.cliPath,
      buildCliArgs(system),
      {
        cwd: options.workDir,
        env,
        maxBuffer: 64 * 1024 * 1024,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        const raw = stdout;
        if (error !== null && raw.trim() === '') {
          reject(new Error(`CLI: ${error.message.slice(0, 300)} ${stderr.slice(0, 300)}`));
          return;
        }

        try {
          const parsed = JSON.parse(raw.slice(raw.indexOf('{'))) as {
            is_error?: boolean;
            subtype?: unknown;
            api_error_status?: unknown;
            stop_reason?: unknown;
            result?: unknown;
            usage?: { input_tokens?: number; output_tokens?: number };
            duration_api_ms?: number;
          };

          if (parsed.is_error === true) {
            /*
             * Отказ CLI — с дампом на диск: содержимое запроса и сырой ответ, чтобы класс отказа
             * был читаем после (три класса M16а найдены именно так). Токена в дампе нет — только
             * промпт, система и вывод CLI.
             */
            const dumpPath = join(
              options.dumpDir ?? options.workDir,
              `fail-${now().toString(36)}.json`,
            );
            try {
              appendFileSync(
                dumpPath,
                JSON.stringify({ system, prompt, raw, stderr: stderr.slice(0, 2000) }, null, 2),
                'utf8',
              );
            } catch {
              /* дамп — улика, не условие: невозможность записать её не прячет сам отказ */
            }
            const shown =
              typeof parsed.result === 'string'
                ? parsed.result
                : parsed.result === undefined
                  ? ''
                  : JSON.stringify(parsed.result);
            reject(
              new Error(
                `CLI is_error: subtype=${String(parsed.subtype)} api=${String(parsed.api_error_status)} ` +
                  `stop=${String(parsed.stop_reason)} result=${shown.slice(0, 200)} → ${dumpPath}`,
              ),
            );
            return;
          }

          resolve({
            text: stripOuterFence(typeof parsed.result === 'string' ? parsed.result : ''),
            usage: {
              prompt_tokens: parsed.usage?.input_tokens ?? 0,
              completion_tokens: parsed.usage?.output_tokens ?? 0,
              total_tokens:
                (parsed.usage?.input_tokens ?? 0) + (parsed.usage?.output_tokens ?? 0),
            },
            apiMs: parsed.duration_api_ms ?? 0,
          });
        } catch (parseError) {
          reject(
            new Error(
              `CLI вывод не разобран: ${String(parseError).slice(0, 200)}; raw=${raw.slice(0, 200)}`,
            ),
          );
        }
      },
    );

    child.on('error', reject);
    /* Урок 2: промпт уходит потоком stdin — содержимое любой длины и с любым экранированием. */
    child.stdin?.end(prompt, 'utf8');
  });
}
