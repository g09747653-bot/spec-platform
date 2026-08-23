/**
 * Независимый попиксельный замер бенчмарка А-36.
 *
 * **Почему отдельный инструмент.** Сверку внутри рабочей директории пишет сам исполнитель
 * (задача WA02), и число, которым он себя мерит, — его собственное. Бенчмарк судит контур, поэтому
 * мерит посторонний код: свой сервер, свой браузер, свои допуски, ни одной строки из workspace.
 *
 * **Что меряется.** Каждый из 87 эталонных кадров живого сайта имеет спутник-JSON с
 * `{slug, width, viewportHeight, scrollY}`. Клон открывается на той же ширине, прокручивается на тот
 * же `scrollY`, снимается кадр того же размера — и сравнивается попиксельно.
 *
 * **Что исключается и почему это названо.** Знак и название по вердикту А-36.1 у клона СВОИ, и
 * пиксели знака обязаны отличаться — мерить их значило бы мерить не то. Поэтому области бренда
 * вычитаются из метрики: их прямоугольники берутся из DOM клона (шапка, подвал, favicon-плитки,
 * узлы со словом-знаком), маскируются в ОБОИХ кадрах одинаково и отдельной строкой отчёта
 * называются — сколько их и какую долю площади они съели. Так число остаётся честным: «вёрстка
 * совпадает на N%, при этом X% площади из метрики вычтено и вот почему».
 *
 * Запуск:  node measure.mjs [--out <каталог>] [--limit N]
 */
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const WORKSPACE = String.raw`C:\Users\Bob\Desktop\F\Fmyspec-clone-spec-platform\loop\.data\workspace\tg-20260822-235200`;
const BASELINE = join(WORKSPACE, 'tools', 'visual-diff', 'baseline');

/* pixelmatch и pngjs берём из node_modules рабочей директории — единственное, что оттуда берётся. */
const requireFromWorkspace = createRequire(join(WORKSPACE, 'package.json'));
const { PNG } = requireFromWorkspace('pngjs');
const pixelmatch = requireFromWorkspace('pixelmatch').default ?? requireFromWorkspace('pixelmatch');

const requireFromRepo = createRequire(
  String.raw`C:\Users\Bob\Desktop\F\Fmyspec-clone-spec-platform\package.json`,
);
const { chromium } = requireFromRepo('@playwright/test');

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = argv.indexOf(name);
  return index === -1 ? fallback : argv[index + 1];
};

const OUT = flag('--out', join(process.cwd(), 'result'));
const LIMIT = Number(flag('--limit', '0'));
/*
 * Корень нормализуется ОБЯЗАТЕЛЬНО: путь с прямыми слэшами из командной строки не совпадал с
 * результатом `join()` под Windows, проверка `startsWith` резала всё, и сервер отдавал 404 на
 * каждый файл. Замер при этом «состоялся» — мерил страницу ошибки против эталона и печатал число.
 * Молчаливое число хуже отсутствия числа: сравнение корней теперь идёт по разрешённым путям.
 */
const ROOT = resolve(flag('--root', WORKSPACE));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
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

/** Свой статический сервер: клон обязан быть статикой, и подниматься он должен без его скриптов. */
function serve(root) {
  return new Promise((resolve) => {
    const server = createServer((request, response) => {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      let path = decodeURIComponent(url.pathname);
      if (path.endsWith('/')) path += 'index.html';

      const file = join(root, path.replace(/^[/\\]+/, ''));

      if (!file.startsWith(root) || !existsSync(file)) {
        response.writeHead(404).end('not found');
        return;
      }

      response.writeHead(200, { 'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream' });
      createReadStream(file).pipe(response);
    });

    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

/**
 * Прямоугольники бренда в координатах ВИДИМОЙ области, после прокрутки.
 *
 * Берутся из DOM клона: узлы, объявляющие себя знаком (роль, класс, alt, href на бренд-ассет), и
 * узлы, чей текст — само слово-знак. Совпадение по слову намеренно узкое: вычитать из метрики
 * произвольный текст — значит подкручивать число.
 */
/**
 * Прямоугольники бренда в координатах ВИДИМОЙ области, после прокрутки.
 *
 * Передаётся ФУНКЦИЕЙ, а не строкой: строковое выражение Playwright разбирает по эвристике, и
 * первый прогон инструмента вернул ноль областей там, где их две, — молчаливый ноль в метрике
 * опаснее её отсутствия.
 *
 * Слово-знак не зашито: оно читается из САМИХ бренд-узлов клона (их текст) — инструмент не обязан
 * знать заранее, «Neuro» там или «NEURA», а вычитать из метрики произвольный текст нельзя.
 */
function brandRects() {
  const nodes = new Set();

  const selectors = [
    'header a[href="/"] svg',
    'header a[href="/"] img',
    'header .logo',
    'header [class*="logo" i]',
    'footer [class*="logo" i]',
    '[class*="brand" i]',
    '[id*="logo" i]',
    'img[src*="logo" i]',
    'img[src*="brand" i]',
    'svg[class*="logo" i]',
  ];

  for (const selector of selectors) {
    for (const node of document.querySelectorAll(selector)) nodes.add(node);
  }

  /* Слово-знак — то, что написано в самих бренд-узлах: одно короткое слово из букв. */
  const words = new Set();
  for (const node of nodes) {
    for (const candidate of (node.textContent || '').split(/\s+/)) {
      const word = candidate.replace(/[^\p{L}\p{N}]/gu, '');
      if (word.length >= 3 && word.length <= 16) words.add(word.toLowerCase());
    }
    const label = node.getAttribute && (node.getAttribute('aria-label') || node.getAttribute('alt'));
    for (const candidate of (label || '').split(/\s+/)) {
      const word = candidate.replace(/[^\p{L}\p{N}]/gu, '');
      if (word.length >= 3 && word.length <= 16) words.add(word.toLowerCase());
    }
  }

  /* Узлы, чей СОБСТВЕННЫЙ текст — само слово-знак и ничего кроме него. */
  if (words.size > 0) {
    for (const node of document.querySelectorAll('a, span, div, h1, h2, p, li, strong, em, b')) {
      const own = [...node.childNodes]
        .filter((child) => child.nodeType === 3)
        .map((child) => (child.textContent || '').trim())
        .join(' ')
        .trim();
      if (own.length === 0 || own.length > 24) continue;
      const flat = own.replace(/[^\p{L}\p{N}]/gu, '').toLowerCase();
      if (words.has(flat)) nodes.add(node);
    }
  }

  const rects = [];
  for (const node of nodes) {
    const box = node.getBoundingClientRect();
    if (box.width < 1 || box.height < 1) continue;
    if (box.bottom < 0 || box.top > window.innerHeight) continue;
    rects.push({
      x: Math.max(0, Math.floor(box.left) - 2),
      y: Math.max(0, Math.floor(box.top) - 2),
      w: Math.ceil(box.width) + 4,
      h: Math.ceil(box.height) + 4,
    });
  }

  return { rects, words: [...words] };
}

/** Гасит прямоугольники одинаково в обоих кадрах — вычтенная область не может «совпасть» или «разойтись». */
function mask(png, rects) {
  let painted = 0;

  for (const rect of rects) {
    const x1 = Math.max(0, rect.x);
    const y1 = Math.max(0, rect.y);
    const x2 = Math.min(png.width, rect.x + rect.w);
    const y2 = Math.min(png.height, rect.y + rect.h);

    for (let y = y1; y < y2; y += 1) {
      for (let x = x1; x < x2; x += 1) {
        const index = (png.width * y + x) << 2;
        if (png.data[index] !== 0 || png.data[index + 1] !== 0 || png.data[index + 2] !== 0) painted += 1;
        png.data[index] = 0;
        png.data[index + 1] = 0;
        png.data[index + 2] = 0;
        png.data[index + 3] = 255;
      }
    }
  }

  return painted;
}

/** Площадь объединения прямоугольников — считаем по маске, чтобы пересечения не удваивались. */
function maskedArea(width, height, rects) {
  const seen = new Uint8Array(width * height);
  let area = 0;

  for (const rect of rects) {
    const x2 = Math.min(width, rect.x + rect.w);
    const y2 = Math.min(height, rect.y + rect.h);

    for (let y = Math.max(0, rect.y); y < y2; y += 1) {
      for (let x = Math.max(0, rect.x); x < x2; x += 1) {
        const index = width * y + x;
        if (seen[index] === 0) {
          seen[index] = 1;
          area += 1;
        }
      }
    }
  }

  return area;
}

const PAGE_URL = { index: '/index.html', products: '/products.html' };

async function main() {
  mkdirSync(OUT, { recursive: true });
  mkdirSync(join(OUT, 'diff'), { recursive: true });

  const frames = readdirSync(BASELINE)
    .filter((name) => name.endsWith('.png'))
    .map((name) => {
      const sidecar = join(BASELINE, name.replace(/\.png$/, '.json'));
      if (!existsSync(sidecar)) return null;
      const meta = JSON.parse(readFileSync(sidecar, 'utf8'));
      return { name, meta };
    })
    .filter(Boolean)
    .sort((left, right) => left.name.localeCompare(right.name));

  const chosen = LIMIT > 0 ? frames.slice(0, LIMIT) : frames;
  console.log(`эталонных кадров: ${frames.length}, меряем: ${chosen.length}`);

  const { server, port } = await serve(ROOT);
  const browser = await chromium.launch();
  const results = [];

  try {
    for (const [index, frame] of chosen.entries()) {
      const { slug, width, viewportHeight, scrollY, fullHeight } = frame.meta;
      const path = PAGE_URL[slug];

      if (path === undefined) {
        results.push({ frame: frame.name, status: 'skipped', reason: `неизвестная страница ${slug}` });
        continue;
      }

      const context = await browser.newContext({
        viewport: { width, height: viewportHeight },
        deviceScaleFactor: 1,
        reducedMotion: 'reduce',
      });
      const page = await context.newPage();

      try {
        await page.goto(`http://127.0.0.1:${port}${path}`, { waitUntil: 'load', timeout: 30_000 });
        await page.waitForTimeout(350);

        /* Ленивые изображения: прокрутить до низа и обратно, иначе метрика мерит пустоту. */
        await page.evaluate(async () => {
          const step = window.innerHeight;
          for (let y = 0; y < document.body.scrollHeight; y += step) {
            window.scrollTo(0, y);
            await new Promise((done) => setTimeout(done, 40));
          }
          window.scrollTo(0, 0);
        });
        await page.waitForTimeout(250);

        const cloneHeight = await page.evaluate(() => document.documentElement.scrollHeight);
        const bodyText = await page.evaluate(() => (document.body.innerText || '').trim().length);

        /* Пустая страница — поломка среды, а не «0% совпадения»: такое число нельзя публиковать. */
        if (bodyText < 40) {
          results.push({ frame: frame.name, status: 'empty-page', cloneHeight, bodyText });
          continue;
        }
        await page.evaluate((y) => window.scrollTo(0, y), scrollY);
        await page.waitForTimeout(300);

        const reached = await page.evaluate(() => Math.round(window.scrollY));
        const brand = await page.evaluate(brandRects);
        const rects = brand.rects;

        const shot = await page.screenshot({ type: 'png' });

        const cloneImage = PNG.sync.read(shot);
        const baseImage = PNG.sync.read(readFileSync(join(BASELINE, frame.name)));

        if (cloneImage.width !== baseImage.width || cloneImage.height !== baseImage.height) {
          results.push({
            frame: frame.name,
            status: 'size-mismatch',
            clone: `${cloneImage.width}x${cloneImage.height}`,
            baseline: `${baseImage.width}x${baseImage.height}`,
          });
          continue;
        }

        mask(cloneImage, rects);
        mask(baseImage, rects);

        const excluded = maskedArea(cloneImage.width, cloneImage.height, rects);
        const total = cloneImage.width * cloneImage.height;
        const measured = total - excluded;

        const diff = new PNG({ width: cloneImage.width, height: cloneImage.height });
        const differing = pixelmatch(
          cloneImage.data,
          baseImage.data,
          diff.data,
          cloneImage.width,
          cloneImage.height,
          { threshold: 0.1, includeAA: false },
        );

        writeFileSync(join(OUT, 'diff', frame.name), PNG.sync.write(diff));

        results.push({
          frame: frame.name,
          status: 'measured',
          slug,
          width,
          scrollY,
          reachedScrollY: reached,
          scrollShort: reached < scrollY - 4,
          baselineFullHeight: fullHeight,
          cloneFullHeight: cloneHeight,
          total,
          excluded,
          measured,
          differing,
          matchedPercent: measured === 0 ? 0 : ((measured - differing) / measured) * 100,
          brandRects: rects.length,
          brandWords: brand.words,
        });
      } catch (error) {
        results.push({ frame: frame.name, status: 'error', reason: String(error).slice(0, 300) });
      } finally {
        await context.close();
      }

      if ((index + 1) % 10 === 0) console.log(`  … ${index + 1}/${chosen.length}`);
    }
  } finally {
    await browser.close();
    server.close();
  }

  const measured = results.filter((row) => row.status === 'measured');

  /*
   * **Кадр, до которого клон не доскроллился, из процента ИСКЛЮЧАЕТСЯ** — и это не смягчение, а
   * противоположное. Первый полный замер показал, чего стоит наивное среднее: недостижимые кадры
   * дали 80,96%, а достижимые — 44,16%. Причина в том, что клон, которому не хватило высоты,
   * упирается в подвал, а подвал — тёмная однородная плита, и она «совпадает» с такой же плитой
   * глубоко на эталоне. Метрика в этом виде НАГРАЖДАЛА БЫ ЗА ОТСУТСТВИЕ КОНТЕНТА и тем сильнее,
   * чем больше его недостаёт. Поэтому процент считается по кадрам, где сравнивать есть что, а
   * недостающая высота выносится отдельным, столь же обязательным числом: охват высоты.
   */
  const reachable = measured.filter((row) => !row.scrollShort);
  const unreachable = measured.filter((row) => row.scrollShort);

  const sum = (list, pick) => list.reduce((total, row) => total + pick(row), 0);

  const measuredPixels = sum(reachable, (row) => row.measured);
  const differingPixels = sum(reachable, (row) => row.differing);
  const excludedPixels = sum(measured, (row) => row.excluded);
  const totalPixels = sum(measured, (row) => row.total);

  const byGroup = {};
  for (const row of measured) {
    const key = `${row.slug}-${row.width}`;
    byGroup[key] ??= {
      frames: 0,
      reachableFrames: 0,
      measured: 0,
      differing: 0,
      excluded: 0,
      cloneHeight: row.cloneFullHeight,
      baselineHeight: row.baselineFullHeight,
    };
    byGroup[key].frames += 1;
    byGroup[key].excluded += row.excluded;
    if (!row.scrollShort) {
      byGroup[key].reachableFrames += 1;
      byGroup[key].measured += row.measured;
      byGroup[key].differing += row.differing;
    }
  }

  const summary = {
    at: new Date().toISOString(),
    root: ROOT,
    framesTotal: frames.length,
    framesMeasured: measured.length,
    framesFailed: results.length - measured.length,
    framesScored: reachable.length,
    framesUnreachable: unreachable.length,
    matchedPercent: measuredPixels === 0 ? 0 : ((measuredPixels - differingPixels) / measuredPixels) * 100,
    /* Наивное среднее — для сверки с ним же: печатается, чтобы разрыв был виден, а не спрятан. */
    naiveMatchedPercentIncludingUnreachable:
      sum(measured, (row) => row.measured) === 0
        ? 0
        : ((sum(measured, (row) => row.measured) - sum(measured, (row) => row.differing)) /
            sum(measured, (row) => row.measured)) *
          100,
    measuredPixels,
    differingPixels,
    excludedPixels,
    excludedShareOfTotalPercent: totalPixels === 0 ? 0 : (excludedPixels / totalPixels) * 100,
    brandRectsTotal: sum(measured, (row) => row.brandRects),
    scrollShortFrames: unreachable.map((row) => row.frame),
    byGroup: Object.fromEntries(
      Object.entries(byGroup).map(([key, value]) => [
        key,
        {
          ...value,
          matchedPercent: value.measured === 0 ? 0 : ((value.measured - value.differing) / value.measured) * 100,
          heightCoveragePercent:
            value.baselineHeight === 0 ? 0 : (value.cloneHeight / value.baselineHeight) * 100,
        },
      ]),
    ),
    failures: results.filter((row) => row.status !== 'measured'),
  };

  writeFileSync(join(OUT, 'measure.json'), `${JSON.stringify({ summary, results }, null, 2)}\n`, 'utf8');

  console.log('');
  console.log(`СОВПАДЕНИЕ ПО ВЁРСТКЕ: ${summary.matchedPercent.toFixed(2)}%  (по ${summary.framesScored} сопоставимым кадрам из ${summary.framesTotal})`);
  console.log(`ОХВАТ ВЫСОТЫ: ${summary.framesUnreachable} кадров недостижимы — клону не хватило страницы`);
  console.log(`знак и брендовые области ИСКЛЮЧЕНЫ: ${summary.brandRectsTotal} прямоугольников, ${summary.excludedShareOfTotalPercent.toFixed(2)}% площади кадров`);
  console.log('');
  for (const [key, value] of Object.entries(summary.byGroup)) {
    const scored = value.reachableFrames === 0 ? '—' : `${value.matchedPercent.toFixed(2)}%`;
    console.log(
      `  ${key.padEnd(16)} ${String(scored).padStart(7)}  ` +
        `(сопоставимых ${value.reachableFrames}/${value.frames}, высота ${value.heightCoveragePercent.toFixed(0)}% эталона)`,
    );
  }
  console.log('');
  console.log(
    `для сверки — наивное среднее со всеми кадрами: ${summary.naiveMatchedPercentIncludingUnreachable.toFixed(2)}% ` +
      '(выше именно потому, что недостающий контент «совпадает» подвалом; поэтому не оно публикуется)',
  );
}

await main();
