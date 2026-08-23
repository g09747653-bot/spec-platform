/* =============================================================================
   Один вход в работу.
   Запуск: `npm start`, либо двойной щелчок по start.cmd (Windows) / start.sh.
   Поднимает локальный адрес, отдаёт сайт целиком и сам открывает браузер на
   главной. Дальше — обычная навигация по сайту; ходить по папке не нужно.
   ========================================================================== */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = __dirname;
const START_PORT = Number(process.env.PORT) || 4173;
const OPEN = process.env.NO_OPEN !== '1';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  let target = decodeURIComponent(url.pathname);
  if (target.endsWith('/')) target += 'index.html';

  /* Наружу из корня сайта запросом не выйти — сервер локальный, но не наивный. */
  const file = path.normalize(path.join(ROOT, target));
  if (!file.startsWith(ROOT)) {
    response.writeHead(403).end('403');
    return;
  }

  fs.readFile(file, (error, body) => {
    if (error) {
      response.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
      response.end(
        '<meta charset="utf-8"><body style="background:#08090a;color:#f4f5f6;' +
          'font-family:system-ui;display:grid;place-items:center;height:100vh;margin:0">' +
          '<div style="text-align:center"><h1>404</h1>' +
          '<p><a style="color:#76b900" href="/">Вернуться на главную</a></p></div>',
      );
      return;
    }

    response.writeHead(200, {
      'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'cache-control': 'no-cache',
    });
    response.end(body);
  });
});

/* Занятый порт — не повод падать: берём следующий и говорим, какой взяли. */
function listen(port, attemptsLeft) {
  server.once('error', (error) => {
    if (error.code === 'EADDRINUSE' && attemptsLeft > 0) {
      listen(port + 1, attemptsLeft - 1);
      return;
    }
    console.error('Не удалось занять порт:', error.message);
    process.exit(1);
  });

  server.listen(port, '127.0.0.1', () => {
    const address = `http://127.0.0.1:${port}/`;
    console.log('');
    console.log('  Сайт открыт целиком по адресу:');
    console.log(`      ${address}`);
    console.log('');
    console.log('  Остановить — Ctrl+C.');
    console.log('');
    if (OPEN) open(address);
  });
}

function open(address) {
  const command =
    process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', address]]
      : process.platform === 'darwin'
        ? ['open', [address]]
        : ['xdg-open', [address]];

  try {
    spawn(command[0], command[1], { stdio: 'ignore', detached: true }).unref();
  } catch {
    /* Браузер не открылся — адрес напечатан выше, этого достаточно. */
  }
}

listen(START_PORT, 20);
