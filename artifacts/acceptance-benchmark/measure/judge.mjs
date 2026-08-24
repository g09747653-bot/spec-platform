/**
 * Драйвер суда трёх осей над готовым продуктом (А-36 п.2).
 *
 * **Судит контур своим кодом, улики собирает драйвер.** Вердикты выносят модули самого контура —
 * `loop/src/gate/visual-judge.ts` (связность, живость) и `loop/src/gate/entry-point.ts` (вход);
 * здесь только то, что нельзя вынести из модуля: браузер, кадры и поведенческие пробы. Так «суд»
 * остаётся судом контура, а не мнением сессии.
 *
 * Ось связности идёт с ГЛАЗАМИ: цепочка сама отбирает звенья, которые видят изображения
 * (`supportsImages`), — звено, молча выбросившее картинку, вернуло бы уверенный текст о том, чего
 * не смотрело.
 *
 * Запуск (из каталога loop, чтобы .env и node_modules были свои):
 *   node --env-file-if-exists=.env ../artifacts/acceptance-benchmark/measure/judge.mjs
 */
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

import { providerCredentials, getEnv, roleConfiguration } from '../../../loop/src/config/env.ts';
import { createRoleChain } from '../../../loop/src/llm/roles.ts';
import { collectEntryFacts, judgeEntryPoint } from '../../../loop/src/gate/entry-point.ts';
import {
  assembleBoard,
  judgeLiveness,
  loadShots,
  renderQualityBoard,
  reviewCoherence,
  scanMotionSignals,
} from '../../../loop/src/gate/visual-judge.ts';

const { chromium } = await import('@playwright/test');

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = argv.indexOf(name);
  return index === -1 ? fallback : argv[index + 1];
};

const WORKSPACE = resolve(
  flag(
    '--root',
    String.raw`C:\Users\Bob\Desktop\F\Fmyspec-clone-spec-platform\loop\.data\workspace\tg-20260822-235200`,
  ),
);
const OUT = resolve(flag('--out', join(WORKSPACE, '.judge')));

/* Механику драйвера можно проверить без глаз: ось связности тогда честно «не состоялась». */
const NO_EYES = argv.includes('--no-eyes');

/** Задумка может лежать выше корня подачи: сайт в подкаталоге — обычная раскладка плана. */
const SEED_PATH = resolve(flag('--seed', join(WORKSPACE, 'SEED.md')));

/** Страницы артефакта, через запятую. По умолчанию — одностраничник. */
const PAGES = flag('--pages', 'index.html')
  .split(',')
  .map((name) => name.trim())
  .filter((name) => name !== '');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ico': 'image/x-icon',
};

function serve(root) {
  return new Promise((done) => {
    const server = createServer((request, response) => {
      let path = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname);
      if (path.endsWith('/')) path += 'index.html';

      const file = resolve(join(root, path.replace(/^[/\\]+/, '')));
      if (!file.startsWith(root) || !existsSync(file)) {
        response.writeHead(404).end('not found');
        return;
      }

      response.writeHead(200, {
        'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
      });
      createReadStream(file).pipe(response);
    });

    server.listen(0, '127.0.0.1', () => done({ server, port: server.address().port }));
  });
}

/**
 * Кадры для оси связности — по фактическим страницам и той же линейке ширин, что судит замер.
 *
 * Глубина берётся долями экрана, а не пикселями: страница копии не обязана совпасть по высоте с
 * эталоном, и кадр «на 4600 px» на короткой странице был бы кадром подвала, выданным за середину.
 */
const BREAKPOINTS = [
  { width: 1440, height: 900, label: 'рабочий стол' },
  { width: 768, height: 1024, label: 'планшет' },
  { width: 375, height: 812, label: 'телефон' },
];

const DEPTHS = [
  { fraction: 0, label: 'первый экран' },
  { fraction: 0.35, label: 'середина' },
  { fraction: 0.7, label: 'глубина' },
];

const SHOTS = PAGES.flatMap((page) =>
  BREAKPOINTS.flatMap(({ width, height, label }) =>
    DEPTHS.map(({ fraction, label: depth }) => ({
      label: `${page.replace(/\.html?$/i, '')}, ${label} ${String(width)}, ${depth}`,
      page,
      width,
      height,
      fraction,
    })),
  ),
);

/** Прокрутка со страницы, а не действиями Playwright: вечная анимация не бывает «стабильной». */
const settle = async (page, fraction) => {
  await page.evaluate(async () => {
    const step = window.innerHeight;
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((done) => setTimeout(done, 40));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(200);
  await page.evaluate((share) => {
    const reach = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    window.scrollTo(0, Math.round(reach * share));
  }, fraction);
  await page.waitForTimeout(450);
};

/**
 * Проба наведения: сдвинулся ли вычисленный стиль под курсором.
 *
 * **Кандидатов несколько, и это не щедрость, а точность.** Первый прогон драйвера брал первый узел
 * по селектору и на сборке, чью живость прошлый раунд доказал, вернул «не изменился»: узел оказался
 * без своих стилей наведения. Проба, способная выдать ложный «статичный», хуже отсутствующей —
 * поэтому проверяются несколько узлов, каждый предварительно вводится в поле зрения, и «не
 * шевелится» произносится только когда не шевельнулся НИ ОДИН.
 */
async function hoverProbe(page, selector, name, limit = 8) {
  const targets = page.locator(selector);
  const count = Math.min(await targets.count(), limit);

  if (count === 0) {
    return { kind: 'hover', name, moved: false, detail: 'узла такого рода на странице нет' };
  }

  const read = (node) => {
    const style = getComputedStyle(node);
    return [
      style.transform,
      style.backgroundColor,
      style.borderColor,
      style.color,
      style.boxShadow,
      style.opacity,
      style.filter,
      style.outlineColor,
      style.textDecorationLine,
    ].join('|');
  };

  for (let index = 0; index < count; index += 1) {
    const target = targets.nth(index);

    try {
      await target.evaluate((node) => node.scrollIntoView({ block: 'center' }));
      await page.waitForTimeout(120);

      const before = await target.evaluate(read);
      await target.hover({ timeout: 4_000 });
      await page.waitForTimeout(420);
      const after = await target.evaluate(read);

      if (before !== after) {
        const tag = await target.evaluate((node) => `${node.tagName.toLowerCase()}.${String(node.className).slice(0, 30)}`);
        return {
          kind: 'hover',
          name: `${name} (${tag})`,
          moved: true,
          detail: 'вычисленный стиль изменился под курсором',
        };
      }
    } catch {
      /* Узел мог уехать под анимацией — это не вердикт, пробуем следующий. */
    }

    /* Увести курсор, чтобы состояние предыдущего узла не тянулось в следующую пробу. */
    await page.mouse.move(2, 2).catch(() => undefined);
  }

  return {
    kind: 'hover',
    name,
    moved: false,
    detail: `ни один из ${String(count)} проверенных узлов не изменился под курсором`,
  };
}

/** Проба появления: элемент, скрытый до попадания в вид, обязан проявиться. */
async function revealProbe(page, name) {
  const found = await page.evaluate(async () => {
    const candidates = [...document.querySelectorAll('body *')].filter((node) => {
      const style = getComputedStyle(node);
      const box = node.getBoundingClientRect();
      return (
        box.width > 40 &&
        box.height > 20 &&
        (Number(style.opacity) < 0.35 || /translate|scale/.test(style.transform)) &&
        node.getBoundingClientRect().top > window.innerHeight * 0.5
      );
    });

    const node = candidates[0];
    if (node === undefined) return null;

    const read = () => {
      const style = getComputedStyle(node);
      return { opacity: Number(style.opacity), transform: style.transform };
    };

    const before = read();
    node.scrollIntoView({ block: 'center' });
    await new Promise((done) => setTimeout(done, 1200));
    const after = read();

    return { before, after, tag: node.tagName.toLowerCase(), cls: node.className?.toString().slice(0, 40) ?? '' };
  });

  if (found === null) {
    return { kind: 'reveal', name, moved: false, detail: 'скрытых до появления узлов не найдено' };
  }

  const moved =
    Math.abs(found.after.opacity - found.before.opacity) > 0.05 || found.after.transform !== found.before.transform;

  return {
    kind: 'reveal',
    name: `${name} (${found.tag}.${found.cls})`,
    moved,
    detail: moved
      ? `прозрачность ${found.before.opacity} → ${found.after.opacity}, transform ${found.before.transform} → ${found.after.transform}`
      : 'узел не изменился, попав в поле зрения',
  };
}

/** Проба движения: что-то обязано двигаться САМО, без участия человека. */
async function motionProbe(page, name) {
  const found = await page.evaluate(async () => {
    const nodes = [...document.querySelectorAll('body *')].filter((node) => {
      const box = node.getBoundingClientRect();
      return box.width > 30 && box.height > 10;
    });

    const sample = () =>
      nodes.map((node) => {
        const style = getComputedStyle(node);
        return `${style.transform}|${style.left}|${style.backgroundPosition}|${style.strokeDashoffset}`;
      });

    const before = sample();
    await new Promise((done) => setTimeout(done, 1600));
    const after = sample();

    for (const [index, value] of before.entries()) {
      if (after[index] !== value) {
        const node = nodes[index];
        return {
          tag: node.tagName.toLowerCase(),
          cls: node.className?.toString().slice(0, 40) ?? '',
          before: value.split('|')[0],
          after: (after[index] ?? '').split('|')[0],
        };
      }
    }
    return null;
  });

  if (found === null) {
    return { kind: 'motion', name, moved: false, detail: 'за 1,6 с само не сдвинулось ничего' };
  }

  return {
    kind: 'motion',
    name: `${name} (${found.tag}.${found.cls})`,
    moved: true,
    detail: `transform ${found.before} → ${found.after}`,
  };
}

/** Исходники артефакта — для сигналов движения (поддержка вердикта, но не вердикт). */
function artifactSources(root) {
  const sources = [];
  const walk = (directory, depth) => {
    if (depth > 3) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'bundle') continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(path, depth + 1);
      } else if (/\.(css|js|html)$/i.test(entry.name)) {
        sources.push({ file: path.slice(root.length + 1), text: readFileSync(path, 'utf8') });
      }
    }
  };
  walk(root, 0);
  return sources;
}

async function main() {
  mkdirSync(OUT, { recursive: true });

  const seed = readFileSync(SEED_PATH, 'utf8').trim();
  const { server, port } = await serve(WORKSPACE);
  const browser = await chromium.launch();

  const shots = [];
  const probes = [];

  try {
    for (const shot of SHOTS) {
      const context = await browser.newContext({
        viewport: { width: shot.width, height: shot.height },
        deviceScaleFactor: 1,
      });
      const page = await context.newPage();

      await page.goto(`http://127.0.0.1:${port}/${shot.page}`, { waitUntil: 'load', timeout: 30_000 });
      await settle(page, shot.fraction);

      const file = join(
        OUT,
        `${shot.page.replace('.html', '')}-${String(shot.width)}-d${String(Math.round(shot.fraction * 100))}.png`,
      );
      await page.screenshot({ path: file });
      shots.push({ label: shot.label, path: file });

      await context.close();
    }

    /* Пробы живости — на рабочем столе, на главной: там и наведение, и появление, и движение. */
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${port}/${PAGES[0] ?? 'index.html'}`, {
      waitUntil: 'load',
      timeout: 30_000,
    });
    await page.waitForTimeout(500);

    probes.push(await motionProbe(page, 'что-то движется само'));
    probes.push(await revealProbe(page, 'появление по видимости'));
    probes.push(
      await hoverProbe(page, '[class*="card" i], article, li a, .grid a', 'карточка в сетке'),
    );
    probes.push(
      await hoverProbe(page, 'button, a[class*="btn" i], [class*="button" i], a[class*="cta" i], nav a', 'кнопка или ссылка навигации'),
    );

    await context.close();
  } finally {
    await browser.close();
    server.close();
  }

  const evidence = { probes, signals: scanMotionSignals(artifactSources(WORKSPACE)) };
  const liveness = judgeLiveness(evidence);

  const entry = judgeEntryPoint(collectEntryFacts(WORKSPACE));

  const env = getEnv();
  const chain = NO_EYES
    ? { providers: [] }
    : createRoleChain(roleConfiguration(env), 'architect', providerCredentials(env));

  const coherence = NO_EYES
    ? { status: 'skipped', reason: 'прогон драйвера без глаз (--no-eyes): ось не судилась' }
    : chain.providers.length === 0
      ? { status: 'skipped', reason: 'провайдеров роли не настроено' }
      : await reviewCoherence({ seed, shots, images: loadShots(shots), chain });

  const board = assembleBoard({ coherence, liveness, evidence, entry });

  writeFileSync(join(OUT, 'board.json'), `${JSON.stringify({ board }, null, 2)}\n`, 'utf8');
  console.log(renderQualityBoard(board));
  console.log('');
  console.log(`доска: ${join(OUT, 'board.json')}`);
}

await main();
