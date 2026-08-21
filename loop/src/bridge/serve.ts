/* eslint-disable no-restricted-properties -- отдельный процесс со своим конвертом: мост читает
   свои три переменные сам, как гейтовые прогулки, а не через getEnv() — полу контура (PORT,
   WORKSPACE_ROOT_PATH) он не подчинён и падать из-за него не должен. */
import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

import { runCli } from './cli.ts';
import { createBridgeServer } from './server.ts';

/**
 * Вход моста подписки: `pnpm --filter @spec-platform/loop bridge` (задача 175).
 *
 * Требует РОВНО подписочный токен — `CLAUDE_CODE_OAUTH_TOKEN`. Метрический ключ здесь не
 * принимается сознательно: смысл звена — тратить тариф подписки (А-23), и мост, молча севший на
 * ключ, был бы тем самым невидимым счётом, от которого контур защищается правилом «ровно одно».
 * Нет токена — именованный отказ на первой секунде, не молчание (опциональность M17а).
 *
 * Платформа подключает мост штатным конфигом локального звена (`OLLAMA_BASE_URL`), контур — своим
 * звеном `claude-cli` (`CLAUDE_CLI_API_BASE`); сам мост об обоих не знает ничего.
 */

const token = process.env.CLAUDE_CODE_OAUTH_TOKEN?.trim() ?? '';
if (token === '') {
  process.stderr.write(
    'мост подписки не запущен: CLAUDE_CODE_OAUTH_TOKEN не задан (loop/.env или окружение).\n' +
      'Токен выдаёт `claude setup-token`; метрический ANTHROPIC_API_KEY мост сознательно не принимает.\n',
  );
  process.exit(1);
}

const port = Number(process.env.BRIDGE_PORT ?? 8091);
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  process.stderr.write(`мост подписки не запущен: BRIDGE_PORT «${String(process.env.BRIDGE_PORT)}» — не порт.\n`);
  process.exit(1);
}

const defaultCli = join(homedir(), '.local', 'bin', process.platform === 'win32' ? 'claude.exe' : 'claude');
const cliPath = process.env.CLAUDE_CLI_PATH?.trim() ?? (existsSync(defaultCli) ? defaultCli : 'claude');

/* cwd вне репозитория: неинтерактивный ход не должен видеть ничьих файлов. */
const workDir = join(tmpdir(), 'claude-bridge-cwd');
mkdirSync(workDir, { recursive: true });
const logPath = join(workDir, 'bridge.log');

const log = (line: string): void => {
  const at = new Date().toISOString();
  try {
    appendFileSync(logPath, `[${at}] ${line}\n`, 'utf8');
  } catch {
    /* журнал — удобство, не условие работы */
  }
  console.log(`[${at.slice(11, 19)}] ${line}`);
};

const server = createBridgeServer({
  generate: (prompt, system, maxTokens) =>
    runCli(prompt, system, { cliPath, token, workDir, maxTokens, baseEnv: process.env }),
  log,
});

server.listen(port, '127.0.0.1', () => {
  log(`мост подписки слушает http://127.0.0.1:${String(port)}/v1 (CLI: ${cliPath}; лог: ${logPath})`);
});
