/**
 * Проба продукта: контур ОТКРЫВАЕТ работу и ПОЛЬЗУЕТСЯ ею (А-44 п.2).
 *
 * **Чего не было.** В цепи «мысль → ТЗ → реализация → тестирование → полировка → готовое» звена
 * тестирования не было вовсе: никто не кликал. Заказчик открыл продукт и за минуту нашёл то, чего
 * не увидел ни один суд: 74 из 86 ссылок главной ведут `href="#"`, в продукте лежит
 * `decorative-stubs.js` с тостом «Демо-версия, функция недоступна», раскрытое мега-меню ломается —
 * текст колонок налезает сам на себя. Ни одного из трёх кадр не показывает: кадр — это первый
 * экран в покое.
 *
 * **Что делает проба.** Поднимает продукт настоящим HTTP-сервером (не `file://`: модули и `fetch`
 * под ним не работают, и суд судил бы искалеченную страницу), открывает его настоящим браузером,
 * перечисляет интерактивные элементы, НАВОДИТ и КЛИКАЕТ каждый и записывает, что случилось.
 *
 * **Проба возвращает УЛИКИ, вердикт выносит код** (конституция P1). Здесь нет ни одного слова
 * «сломано»: есть «слой раскрылся», «пар накладывающихся текстовых блоков — 3», «текст, ставший
 * видимым, — вот такой». Классификация живёт в `visual-judge.ts` чистой функцией, потому что
 * определение сломанного — это решение, а решения принимает код.
 *
 * **Всё, что проба видит, она видит ИЗНУТРИ КОНТЕЙНЕРА** (D-314): и листинг диска, и кадры, и
 * тексты уезжают наружу её собственным stdout. Хостового чтения того, что написал контейнер, здесь
 * нет ни одного — ровно потому, что долгоживущий процесс контура на Windows к таким записям
 * стойко слеп.
 */

/** Маркер: дальше в stdout идёт JSON пробы, одной строкой на кусок. */
export const PROBE_RESULT = '__LOOP_PROBE_RESULT__';

/** Кусок JSON — стандартный вывод режется, чтобы длина строки не решала судьбу улик. */
export const PROBE_CHUNK = 4_000;

/** Сколько интерактивных элементов проба трогает руками. Обрезание называется вслух, не молчком. */
export const PROBE_ELEMENT_LIMIT = 120;

export interface ProbeOptions {
  /** Страница входа относительно корня продукта — «index.html». */
  entry: string;
  /** Признаки движения в исходниках: имя и регулярное выражение, одно на оба берега. */
  signals: readonly { name: string; source: string; flags: string }[];
  /** Как из разметки достаётся ссылка — то же выражение, что у суда одного входа. */
  hrefPattern: { source: string; flags: string };
  /** Сколько элементов трогать. Меньше — только в кейсах. */
  limit?: number;
}

/**
 * Скрипт пробы — обычный JS, который исполняет `node` внутри приёмочного образа с браузером.
 *
 * Собирается ЗДЕСЬ, а не лежит отдельным файлом, по той же причине, по которой здесь лежит
 * Dockerfile исполнителя: выражения, по которым проба ищет движение и ссылки, обязаны быть теми
 * же, что у суда, — а единственный способ этого добиться — вставить их из одного места.
 */
export function buildProbeScript(options: ProbeOptions): string {
  const limit = options.limit ?? PROBE_ELEMENT_LIMIT;

  return `'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = '/workspace';
const ENTRY = ${JSON.stringify(options.entry)};
const LIMIT = ${String(limit)};
const SIGNALS = ${JSON.stringify(options.signals)};
const HREF = ${JSON.stringify(options.hrefPattern)};
const SKIP = ['node_modules', '.git', '.next', 'bundle', 'handoff', 'tools', 'test-results', 'dist', 'coverage'];

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.mp4': 'video/mp4', '.webm': 'video/webm',
};

function walk(dir, into) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.includes(item.name)) continue;
    const full = path.join(dir, item.name);
    if (item.isDirectory()) walk(full, into);
    else into.push(path.relative(ROOT, full).split(path.sep).join('/'));
  }
  return into;
}

/* Статика продукта по-настоящему: под file:// модули и fetch мертвы, и суд судил бы калеку. */
function serve(port) {
  const server = http.createServer((request, response) => {
    let target = decodeURIComponent((request.url || '/').split('?')[0].split('#')[0]);
    if (target.endsWith('/')) target += 'index.html';
    const file = path.join(ROOT, target.replace(/^\\/+/, ''));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      response.writeHead(404, { 'content-type': 'text/plain' });
      response.end('not found');
      return;
    }
    response.writeHead(200, { 'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(response);
  });
  return new Promise((resolve) => { server.listen(port, '127.0.0.1', () => { resolve(server); }); });
}

const clip = (text, max) => (typeof text === 'string' ? text.slice(0, max) : '');

async function shoot(page, label, into) {
  const buffer = await page.screenshot({ type: 'jpeg', quality: 68 });
  into.push({ label, mediaType: 'image/jpeg', base64: buffer.toString('base64') });
}

/* Что элемент делает при наведении и при клике — фиксируется в браузере, судится снаружи. */
const IN_PAGE = {
  inventory: (limit) => {
    const selector = 'a[href], button, summary, [role="button"], [role="tab"], [role="menuitem"], input[type="submit"], input[type="button"], [onclick]';
    const seen = new Set();
    const found = [];
    let total = 0;
    for (const node of Array.from(document.querySelectorAll(selector))) {
      const box = node.getBoundingClientRect();
      if (box.width < 2 || box.height < 2) continue;
      const style = getComputedStyle(node);
      if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) continue;
      total += 1;
      const href = node.getAttribute('href');
      const label = (node.innerText || node.getAttribute('aria-label') || node.value || node.title || '').trim().replace(/\\s+/g, ' ').slice(0, 60);
      const key = node.tagName + '|' + label + '|' + (href || '');
      if (seen.has(key)) continue;
      seen.add(key);
      node.setAttribute('data-loop-probe', String(found.length));
      found.push({
        index: found.length,
        label: label === '' ? '(без подписи)' : label,
        tag: node.tagName.toLowerCase(),
        href: href,
        inChrome: Boolean(node.closest('header, nav, footer')),
      });
      if (found.length >= limit) break;
    }
    return { total, elements: found };
  },

  /* Слепок страницы: по нему и решается, «сдвинулось ли» и «раскрылось ли». */
  snapshot: () => {
    const boxes = [];
    for (const node of Array.from(document.querySelectorAll('body *'))) {
      const style = getComputedStyle(node);
      if (style.visibility === 'hidden' || style.display === 'none') continue;
      const box = node.getBoundingClientRect();
      if (box.width < 1 || box.height < 1) continue;
      boxes.push(node);
    }
    return {
      href: location.href,
      visible: boxes.length,
      text: document.body.innerText.replace(/\\s+/g, ' ').trim().length,
      html: document.body.innerHTML.length,
      scroll: window.scrollY,
    };
  },

  styleOf: (index) => {
    const node = document.querySelector('[data-loop-probe="' + index + '"]');
    if (node === null) return null;
    const style = getComputedStyle(node);
    return [style.backgroundColor, style.color, style.transform, style.opacity, style.textDecorationLine, style.borderColor, style.boxShadow].join('|');
  },

  /*
   * Раскрытое: узлы, ставшие видимыми после действия. Их и осматривают на «текст налезает»,
   * «панель пуста», «слой не закрывается» — три вида испорченного результата, названные дословно.
   */
  revealed: (before) => {
    const seen = new Set(before);
    const fresh = [];
    for (const node of Array.from(document.querySelectorAll('body *'))) {
      const style = getComputedStyle(node);
      if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) continue;
      const box = node.getBoundingClientRect();
      if (box.width < 8 || box.height < 8) continue;
      const key = node.tagName + '@' + Math.round(box.x + window.scrollX) + ',' + Math.round(box.y + window.scrollY) + ',' + Math.round(box.width) + ',' + Math.round(box.height);
      if (seen.has(key)) continue;
      fresh.push(node);
    }
    if (fresh.length === 0) return { count: 0, text: '', overlapPairs: 0, area: 0, empty: false };

    /* Внешние узлы раскрытого — сам слой; текстовые листья внутри него и проверяются на наложение. */
    const outer = fresh.filter((node) => !fresh.some((other) => other !== node && other.contains(node)));
    const leaves = [];
    for (const root of outer) {
      for (const node of [root, ...Array.from(root.querySelectorAll('*'))]) {
        const own = Array.from(node.childNodes).some((child) => child.nodeType === 3 && child.textContent.trim().length > 1);
        if (!own) continue;
        const box = node.getBoundingClientRect();
        if (box.width < 8 || box.height < 8) continue;
        leaves.push(box);
      }
    }

    let overlapPairs = 0;
    for (let i = 0; i < leaves.length; i += 1) {
      for (let j = i + 1; j < leaves.length; j += 1) {
        const a = leaves[i], b = leaves[j];
        const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (width <= 0 || height <= 0) continue;
        const smaller = Math.min(a.width * a.height, b.width * b.height);
        if (smaller > 0 && (width * height) / smaller > 0.4) overlapPairs += 1;
      }
    }

    const text = outer.map((node) => node.innerText || '').join(' ').replace(/\\s+/g, ' ').trim();
    const area = outer.reduce((sum, node) => {
      const box = node.getBoundingClientRect();
      return sum + Math.max(0, box.width) * Math.max(0, box.height);
    }, 0);

    return {
      count: fresh.length,
      text: text.slice(0, 600),
      overlapPairs,
      area: area / (window.innerWidth * window.innerHeight),
      /* Пустая панель: раскрылось заметное место и в нём нет ни текста, ни картинки. */
      empty: area > 0.05 * window.innerWidth * window.innerHeight && text.length < 3 &&
        !outer.some((node) => node.querySelector('img, svg, video, canvas, picture')),
    };
  },

  /*
   * Ключи блоков — В КООРДИНАТАХ ДОКУМЕНТА, а не окна. Замерено пробой: прокрутка к элементу
   * сдвигает viewport-координаты ВСЕХ блоков, и «раскрылось новое» становилось истиной от одного
   * лишь пролистывания — три мёртвые ссылки внизу страницы вышли «работает».
   */
  boxKeys: () => {
    const keys = [];
    for (const node of Array.from(document.querySelectorAll('body *'))) {
      const style = getComputedStyle(node);
      if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) continue;
      const box = node.getBoundingClientRect();
      if (box.width < 8 || box.height < 8) continue;
      keys.push(node.tagName + '@' + Math.round(box.x + window.scrollX) + ',' + Math.round(box.y + window.scrollY) + ',' + Math.round(box.width) + ',' + Math.round(box.height));
    }
    return keys;
  },
};

async function main() {
  const files = walk(ROOT, []);
  const hrefs = {};
  const sources = [];
  for (const file of files) {
    if (/\\.(html?|css|m?jsx?|tsx?)$/i.test(file)) {
      let text = '';
      try { text = fs.readFileSync(path.join(ROOT, file), 'utf8'); } catch { text = ''; }
      if (/\\.html?$/i.test(file)) {
        const found = [];
        const pattern = new RegExp(HREF.source, HREF.flags);
        let match;
        while ((match = pattern.exec(text)) !== null) found.push(match[1]);
        hrefs[file] = found;
      }
      /* Исходники нужны не целиком: суду достаточно, СРАБОТАЛ ли признак и есть ли самозаявление. */
      const marks = SIGNALS.filter((signal) => new RegExp(signal.source, signal.flags).test(text)).map((signal) => signal.name);
      sources.push({ file, signals: marks, text: clip(text, 20000) });
    }
  }

  const packageJson = fs.existsSync(path.join(ROOT, 'package.json'))
    ? clip(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'), 20000) : null;

  /*
   * Страница входа: названная, иначе index.html, иначе первая найденная. Продукт без единой
   * страницы — не «пустой суд», а отказ с причиной: судить нечего, и это надо сказать.
   */
  const pages = files.filter((file) => /\\.html?$/i.test(file));
  const entryUsed = ENTRY || (pages.includes('index.html') ? 'index.html' : pages[0]);
  if (!entryUsed) {
    const refusal = JSON.stringify({ ok: false, reason: 'в рабочей директории нет ни одной страницы — открывать нечего' });
    process.stdout.write('${PROBE_RESULT}\\n' + refusal + '\\n');
    return;
  }

  const server = await serve(8787);
  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const base = 'http://127.0.0.1:8787/' + entryUsed;
  const shots = [];
  const liveness = [];
  const elements = [];
  const notes = [];
  let inventoryTotal = 0;
  let pageText = '';

  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const alerts = [];
    await page.exposeFunction('__loopAlert', (text) => { alerts.push(String(text)); });
    await page.addInitScript(() => {
      window.alert = (text) => { window.__loopAlert(String(text)); };
      window.confirm = (text) => { window.__loopAlert(String(text)); return false; };
    });

    await page.goto(base, { waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(1200);

    pageText = clip(await page.evaluate(() => document.body.innerText.replace(/\\s+/g, ' ').trim()), 30000);

    /* Кадры: четыре высоты рабочего стола и две — телефона. Покой судят по ним, работу — руками. */
    for (const [index, ratio] of [0, 0.33, 0.66, 1].entries()) {
      await page.evaluate((share) => { window.scrollTo(0, share * (document.body.scrollHeight - window.innerHeight)); }, ratio);
      await page.waitForTimeout(700);
      await shoot(page, 'рабочий стол 1440, экран ' + String(index + 1) + ' из 4', shots);
    }
    await page.evaluate(() => { window.scrollTo(0, 0); });
    await page.waitForTimeout(400);

    /* Один способ позвать страничную функцию: её исходник уезжает в браузер, довод — один на всех. */
    const inPage = (fn, arg) => page.evaluate(new Function('arg', 'return (' + fn.toString() + ')(arg);'), arg);

    const list = await inPage(IN_PAGE.inventory, LIMIT);
    inventoryTotal = list.total;

    const snapshot = () => inPage(IN_PAGE.snapshot, null);
    const boxKeys = () => inPage(IN_PAGE.boxKeys, null);
    const styleOf = (index) => inPage(IN_PAGE.styleOf, index);
    const revealed = (before) => inPage(IN_PAGE.revealed, before);

    /* Собственное движение: страница обязана меняться сама, без единого действия посетителя. */
    const still = await boxKeys();
    await page.waitForTimeout(2600);
    const later = await boxKeys();
    liveness.push({
      kind: 'motion', name: 'страница сама по себе, 2,6 с',
      moved: JSON.stringify(still) !== JSON.stringify(later),
      detail: 'видимых блоков было ' + String(still.length) + ', стало ' + String(later.length),
    });

    /* Появление при прокрутке. */
    const top = await boxKeys();
    await page.evaluate(() => { window.scrollTo(0, Math.round(document.body.scrollHeight * 0.5)); });
    await page.waitForTimeout(1200);
    const mid = await boxKeys();
    await page.evaluate(() => { window.scrollTo(0, 0); });
    await page.waitForTimeout(600);
    liveness.push({
      kind: 'reveal', name: 'прокрутка до середины',
      moved: mid.length !== top.length,
      detail: 'видимых блоков сверху ' + String(top.length) + ', в середине ' + String(mid.length),
    });

    /* ── работоспособность: навести и нажать каждый ── */
    for (const item of list.elements) {
      const target = page.locator('[data-loop-probe="' + String(item.index) + '"]').first();
      const record = {
        label: item.label, tag: item.tag, href: item.href, inChrome: item.inChrome,
        hoverChanged: false, clicked: false, navigated: false, changed: false,
        revealedText: '', overlapPairs: 0, emptyPanel: false, stuckOpen: false,
        alert: '', error: null,
      };

      try {
        const before = await snapshot();
        const beforeKeys = await boxKeys();
        const styleBefore = await styleOf(item.index);

        await target.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
        await target.hover({ timeout: 3000, force: true });
        await page.waitForTimeout(450);
        const styleAfter = await styleOf(item.index);
        record.hoverChanged = styleBefore !== null && styleAfter !== null && styleBefore !== styleAfter;

        const hovered = await revealed(beforeKeys);
        record.revealedText = hovered.text;
        record.overlapPairs = hovered.overlapPairs;
        record.emptyPanel = hovered.empty;
        if (hovered.count > 0) record.changed = true;

        const alertsBefore = alerts.length;
        /*
         * Нажатие с одной повторной попыткой после переписи.
         * Предыдущее действие могло перерисовать страницу, и метка на узле уехала вместе с ним —
         * это утверждение о нашей пробе, а не о продукте, и объявлять по нему «сломано» значило бы
         * красить исправную работу. Устоявший отказ — уже о продукте, и он идёт в улики.
         */
        try {
          await target.click({ timeout: 4000, force: true, noWaitAfter: true });
        } catch (first) {
          await inPage(IN_PAGE.inventory, LIMIT).catch(() => {});
          const again = page.locator('[data-loop-probe="' + String(item.index) + '"]').first();
          if ((await again.count()) === 0) throw first;
          await again.click({ timeout: 4000, force: true, noWaitAfter: true });
        }
        record.clicked = true;
        await page.waitForTimeout(700);

        const after = await snapshot();
        /*
         * Якорь навигацией НЕ является. Замерено первым же живым прогоном пробы: клик по
         * href="#" меняет location.href на …/index.html#, и все девять мёртвых ссылок
         * фикстуры вышли «работает». Ровно та же ошибка на живом продукте объявила бы
         * работающими 74 ссылки из 86 — то есть скрыла бы именно то, ради чего ось заведена.
         */
        const bare = (url) => String(url).split('#')[0];
        record.navigated = bare(after.href) !== bare(before.href);
        if (!record.navigated) {
          if (after.html !== before.html || after.visible !== before.visible || after.text !== before.text) {
            record.changed = true;
          }
          const opened = await revealed(beforeKeys);
          if (opened.text.length > record.revealedText.length) record.revealedText = opened.text;
          record.overlapPairs = Math.max(record.overlapPairs, opened.overlapPairs);
          record.emptyPanel = record.emptyPanel || opened.empty;

          /* Закрывается ли раскрытое: Escape, затем щелчок в пустоту. Не закрылось и перекрыло — испорчено. */
          if (opened.area > 0.5) {
            await page.keyboard.press('Escape').catch(() => {});
            await page.waitForTimeout(400);
            await page.mouse.click(3, 3).catch(() => {});
            await page.waitForTimeout(400);
            const stuck = await revealed(beforeKeys);
            record.stuckOpen = stuck.area > 0.5;
          }
        }
        record.alert = alerts.slice(alertsBefore).join(' ').slice(0, 300);
      } catch (error) {
        record.error = String(error && error.message ? error.message : error).slice(0, 200);
      }

      elements.push(record);

      /* Домой: следующий элемент судится на той же странице, что и предыдущий. */
      if (record.navigated || record.error !== null || record.changed) {
        await page.goto(base, { waitUntil: 'load', timeout: 60000 }).catch(() => {});
        await page.waitForTimeout(500);
        /* Метки живут на узлах, а навигация их стёрла: перепись повторяется тем же порядком. */
        await inPage(IN_PAGE.inventory, LIMIT).catch(() => {});
      } else {
        await page.keyboard.press('Escape').catch(() => {});
        await page.mouse.move(2, 2).catch(() => {});
        await page.waitForTimeout(200);
      }
    }

    liveness.push({
      kind: 'hover', name: 'наведение на ' + String(elements.length) + ' элементов',
      moved: elements.some((element) => element.hoverChanged),
      detail: 'состояние изменили ' + String(elements.filter((element) => element.hoverChanged).length),
    });

    if (list.total > list.elements.length) {
      notes.push('интерактивных элементов на входной странице ' + String(list.total) + ', проба трогала ' + String(list.elements.length) + ' (потолок пробы)');
    }

    await context.close();

    const mobile = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
    const small = await mobile.newPage();
    await small.goto(base, { waitUntil: 'load', timeout: 60000 });
    await small.waitForTimeout(1200);
    for (const [index, ratio] of [0, 0.5].entries()) {
      await small.evaluate((share) => { window.scrollTo(0, share * (document.body.scrollHeight - window.innerHeight)); }, ratio);
      await small.waitForTimeout(600);
      await shoot(small, 'телефон 375, экран ' + String(index + 1) + ' из 2', shots);
    }
    await mobile.close();
  } finally {
    await browser.close().catch(() => {});
    server.close();
  }

  const payload = JSON.stringify({
    ok: true,
    entry: { files, hrefs, packageJson },
    entryUsed,
    shots,
    liveness,
    operability: { total: inventoryTotal, elements, pageText, notes },
    sources: sources.map((source) => ({ file: source.file, signals: source.signals, text: source.text })),
  });

  process.stdout.write('${PROBE_RESULT}\\n');
  for (let at = 0; at < payload.length; at += ${String(PROBE_CHUNK)}) {
    process.stdout.write(payload.slice(at, at + ${String(PROBE_CHUNK)}) + '\\n');
  }
}

main().then(() => { process.exit(0); }).catch((error) => {
  console.error('проба продукта упала: ' + String(error && error.stack ? error.stack : error));
  process.exit(70);
});
`;
}
