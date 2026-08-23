import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { collectEntryFacts, judgeEntryPoint, type EntryFacts } from './entry-point.ts';

/**
 * Один входной канал (А-35 п.2в, уточнено А-35.2). Критерий заказчика — про ОПЫТ запуска:
 * одно действие открывает работу целиком; «ходить по папке» — провал.
 */

let directory: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'loop-entry-'));
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

const facts = (over: Partial<EntryFacts>): EntryFacts => ({
  entries: [],
  pages: [],
  links: {},
  ...over,
});

describe('вердикт по фактам — чистая функция', () => {
  it('одна страница-вход и всё достижимо — вход один', () => {
    const verdict = judgeEntryPoint(
      facts({
        entries: ['index.html'],
        pages: ['index.html', 'products.html'],
        links: { 'index.html': ['products.html'], 'products.html': ['index.html'] },
      }),
    );

    expect(verdict).toEqual({
      verdict: 'single-entry',
      entry: 'index.html',
      findings: [],
      unreachable: [],
    });
  });

  it('навигация в два шага остаётся одним входом', () => {
    const verdict = judgeEntryPoint(
      facts({
        entries: ['index.html'],
        pages: ['index.html', 'catalog.html', 'card.html'],
        links: { 'index.html': ['catalog.html'], 'catalog.html': ['card.html'] },
      }),
    );

    expect(verdict.verdict).toBe('single-entry');
  });

  it('страница-сирота — провал критерия, и она названа', () => {
    const verdict = judgeEntryPoint(
      facts({
        entries: ['index.html'],
        pages: ['index.html', 'products.html'],
        links: { 'index.html': [] },
      }),
    );

    expect(verdict.verdict).toBe('scattered');
    expect(verdict.unreachable).toEqual(['products.html']);
    expect(verdict.findings[0]).toContain('products.html');
    expect(verdict.findings[0]).toContain('открытием файла');
  });

  it('нет ни страницы, ни команды — «ходить по папке»', () => {
    const verdict = judgeEntryPoint(facts({ pages: ['src/pages/index.src.html'] }));

    expect(verdict.verdict).toBe('scattered');
    expect(verdict.entry).toBeNull();
    expect(verdict.findings[0]).toContain('ходить по папке');
  });

  it('команда запуска называется главным входом впереди файла, и это не дефект', () => {
    const verdict = judgeEntryPoint(
      facts({
        entries: ['index.html', 'npm start'],
        pages: ['index.html'],
        links: { 'index.html': [] },
      }),
    );

    expect(verdict).toEqual({
      verdict: 'single-entry',
      entry: 'npm start',
      findings: [],
      unreachable: [],
    });
  });
});

describe('факты с диска', () => {
  it('собирает страницы, ссылки и команды, минуя инструменты и зависимости', () => {
    writeFileSync(
      join(directory, 'index.html'),
      '<a href="./pages/products.html">Видеокарты</a><a href="https://nvidia.com">внешняя</a>',
      'utf8',
    );
    mkdirSync(join(directory, 'pages'));
    writeFileSync(join(directory, 'pages', 'products.html'), '<a href="../index.html">Домой</a>');
    mkdirSync(join(directory, 'tools', 'visual-diff'), { recursive: true });
    writeFileSync(join(directory, 'tools', 'visual-diff', 'report.html'), '<html></html>');
    mkdirSync(join(directory, 'node_modules', 'x'), { recursive: true });
    writeFileSync(join(directory, 'node_modules', 'x', 'readme.html'), '<html></html>');
    writeFileSync(
      join(directory, 'package.json'),
      JSON.stringify({ scripts: { start: 'node serve.js' } }),
      'utf8',
    );

    const collected = collectEntryFacts(directory);

    expect(collected.pages).toEqual(['index.html', 'pages/products.html']);
    expect(collected.entries).toEqual(['index.html', 'npm start']);
    expect(collected.links['index.html']).toEqual(['pages/products.html']);
    expect(collected.links['pages/products.html']).toEqual(['index.html']);
    expect(judgeEntryPoint(collected).verdict).toBe('single-entry');
  });

  it('две страницы без ссылки друг на друга читаются как разбросанные части', () => {
    writeFileSync(join(directory, 'index.html'), '<h1>Главная</h1>', 'utf8');
    writeFileSync(join(directory, 'products.html'), '<h1>Видеокарты</h1>', 'utf8');

    const verdict = judgeEntryPoint(collectEntryFacts(directory));

    expect(verdict.verdict).toBe('scattered');
    expect(verdict.unreachable).toEqual(['products.html']);
  });
});
