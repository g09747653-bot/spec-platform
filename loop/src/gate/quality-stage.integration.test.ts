import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createDockerEngine, type DockerEngine } from '../docker/engine.ts';
import { resolveEndpoint } from '../docker/transport.ts';

import { ACCEPTANCE_BROWSER_IMAGE } from './capability-image.ts';
import { judgeProduct } from './quality-stage.ts';

/**
 * Суд качества против НАСТОЯЩЕГО браузера над продуктом, который несёт все три дефекта заказчика
 * (А-44 п.2).
 *
 * **Почему кейс живой, а не на заглушке.** Дефект, который надо поймать, живёт не в трубе и не в
 * состоянии — он живёт в столкновении с реальностью: `href="#"` меняет `location.href` на
 * `…/index.html#`, прокрутка к элементу сдвигает viewport-координаты всех блоков, наведение
 * раскрывает слой, который есть только в CSS. Заглушка ответила бы то, что в неё записали, и обе
 * ошибки, найденные первым живым прогоном пробы, прошли бы мимо.
 *
 * **Обе эти ошибки — не выдумка кейса.** Первый прогон объявил все девять элементов
 * «работает» (якорь принят за навигацию), второй — три мёртвые ссылки внизу страницы «работает»
 * (прокрутка принята за раскрытие). На живом продукте та же пара объявила бы работающими 74 ссылки
 * из 86, то есть скрыла бы ровно то, ради чего ось заведена.
 *
 * Пропускается по имени и с причиной, когда приёмочного образа с браузером на машине нет: он
 * весит без малого два гигабайта и собирается по требованию (`capability-image.ts`).
 */

const ENDPOINT = resolveEndpoint(process.platform);

let engine: DockerEngine;
let ready = false;
let site: string | undefined;

const FILES: Readonly<Record<string, string>> = {
  'index.html': `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>Витрина</title>
<link rel="stylesheet" href="styles.css"></head>
<body>
<header><nav>
  <a class="nav" href="/products.html">Продукты</a>
  <div class="mega-host"><a class="nav" href="#" id="mega">Каталог</a>
    <div class="mega"><div class="col">Карты подробное описание модели</div><div class="col">Ноутбуки для творчества и работы</div></div>
  </div>
  <a class="nav" href="#">Поддержка</a>
  <a class="nav" href="#">Драйверы</a>
  <a class="nav" href="#">Компания</a>
  <button id="buy">Купить</button>
</nav></header>
<main>
  <h1>Главная</h1><p>Текст первого экрана.</p>
  <section class="tall"><h2>Секция</h2><p>Ещё текст.</p></section>
  <a href="#">Ссылка 1</a><a href="#">Ссылка 2</a><a href="#">Ссылка 3</a>
</main>
<script src="src/scripts/decorative-stubs.js"></script>
</body></html>`,
  'products.html': `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>Продукты</title></head>
<body><h1>Продукты</h1><a href="/index.html">Назад</a></body></html>`,
  'styles.css': `body { font-family: system-ui; margin: 0; }
.nav { padding: 12px; display: inline-block; transition: color .2s ease; }
.nav:hover { color: crimson; }
.tall { height: 1400px; }
.mega-host { display: inline-block; position: relative; }
.mega { display: none; position: absolute; top: 40px; left: 0; width: 420px; height: 120px; background: #fff; border: 1px solid #ccc; }
.mega-host:hover .mega { display: block; }
.mega .col { position: absolute; top: 10px; left: 10px; width: 380px; }
@keyframes pulse { from { opacity: 1 } to { opacity: .5 } }`,
  'src/scripts/decorative-stubs.js': `document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('buy').addEventListener('click', () => {
    alert('Демо-версия, функция недоступна');
  });
});`,
};

beforeAll(async () => {
  engine = createDockerEngine(ENDPOINT);

  if (!(await engine.ping())) {
    console.warn(`Docker не отвечает на ${ENDPOINT.display} — живой суд качества пропущен.`);
    return;
  }
  if (!(await engine.hasImage(ACCEPTANCE_BROWSER_IMAGE))) {
    console.warn(
      `Приёмочного образа с браузером (${ACCEPTANCE_BROWSER_IMAGE}) на машине нет — живой суд ` +
        'качества пропущен. Он собирается по требованию первой же задачей с визуальным замером.',
    );
    return;
  }

  site = mkdtempSync(join(tmpdir(), 'loop-quality-'));
  for (const [name, text] of Object.entries(FILES)) {
    const path = join(site, name);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, text, 'utf8');
  }

  ready = true;
}, 5 * 60_000);

afterAll(() => {
  if (site !== undefined) rmSync(site, { recursive: true, force: true, maxRetries: 5 });
});

describe('суд качества открывает продукт и пользуется им', () => {
  it(
    'ловит все три дефекта, которые заказчик нашёл за минуту, а суды по кадрам не видели',
    async () => {
      if (!ready || site === undefined) return;

      const outcome = await judgeProduct(
        { projectDirectory: site, seed: 'Сделай витрину каталога.' },
        /* Цепочки нет намеренно: ось связности — не предмет этого кейса, и её отсутствие названо. */
        { engine, chain: null },
      );

      expect(outcome.status).toBe('judged');
      if (outcome.status !== 'judged') return;

      const { counts, outcomes } = outcome.board.operability;
      const nameOf = (kind: string) =>
        outcomes.filter((entry) => entry.outcome === kind).map((entry) => entry.probe.label);

      /* 1. Мёртвые ссылки: законны, но посчитаны — то самое число, которого не было. */
      expect(counts.inert).toBe(6);
      expect(nameOf('inert')).toContain('Поддержка');
      expect(nameOf('inert')).toContain('Ссылка 1');

      /* 2. Самообъявленная заглушка: тост «Демо-версия, функция недоступна». */
      expect(counts.stub).toBe(1);
      expect(nameOf('stub')).toEqual(['Купить']);

      /* 3. Раскрытое мега-меню, налезающее текстом само на себя. */
      expect(counts.broken).toBe(1);
      expect(nameOf('broken')).toEqual(['Каталог']);

      /* Настоящая ссылка отличается от мёртвой — иначе число ничего не значило бы. */
      expect(nameOf('working')).toEqual(['Продукты']);

      expect(outcome.board.operability.verdict).toBe('broken');
      expect(outcome.board.green).toBe(false);
      expect(outcome.board.entry.verdict).toBe('single-entry');
      expect(outcome.entry).toBe('index.html');

      /* Исходник с самообъявлением назван поимённо и приговорён к удалению, а не к переписи. */
      expect(outcome.text).toContain('decorative-stubs.js');
      expect(outcome.text).toContain('удаляется, а не переписывается');
    },
    10 * 60_000,
  );
});
