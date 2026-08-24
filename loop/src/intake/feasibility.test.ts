import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Chain } from '../llm/chain.ts';

import {
  censusMaterial,
  describeCensus,
  describeFeasibility,
  feasibilityPrompt,
  judgeFeasibility,
  planConditions,
  readFeasibility,
  verdictOf,
  type FeasibilityRecord,
} from './feasibility.ts';

/**
 * Суждение о выполнимости на входе (А-42 п.2).
 *
 * Кейсы разделены ровно по границе ответственности, которую стадия проводит: **перепись и вердикт
 * судит код** (чистые функции, таблица случаев), **перечни даёт модель** (фиктивная цепочка),
 * **условия уезжают в план** (проверяется, что уезжают, а не что модель их красиво написала).
 */

let directory: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'loop-feasibility-'));
});

afterEach(() => {
  try {
    rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  } catch {
    // Уборка — не утверждение.
  }
});

/** Цепочка, отвечающая заданным текстом. Провайдер назван — журналу нужен бюджет, не только факт. */
function chainSaying(text: string, provider = 'stub'): Chain {
  return {
    providers: ['stub'],
    generate: () => Promise.resolve({ text, provider }),
  } as unknown as Chain;
}

function chainThrowing(message: string): Chain {
  return {
    providers: ['stub'],
    generate: () => Promise.reject(new Error(message)),
  } as unknown as Chain;
}

const seed = (text = 'Сделай копию сайта nvidia.com') => {
  writeFileSync(join(directory, 'SEED.md'), `${text}\n`, 'utf8');
  return text;
};

describe('перепись материала считает код (А-42 п.2)', () => {
  it('различает виды и складывает байты', () => {
    mkdirSync(join(directory, 'assets', 'images'), { recursive: true });
    mkdirSync(join(directory, 'assets', 'fonts'), { recursive: true });
    writeFileSync(join(directory, 'assets', 'images', 'hero.png'), 'x'.repeat(1000));
    writeFileSync(join(directory, 'assets', 'images', 'card.jpg'), 'x'.repeat(500));
    writeFileSync(join(directory, 'assets', 'fonts', 'fa-solid.woff2'), 'x'.repeat(200));
    writeFileSync(join(directory, 'index.html'), '<!doctype html>');

    const census = censusMaterial(directory);

    expect(census.files).toBe(4);
    expect(census.bytes).toBe(1000 + 500 + 200 + 15);
    expect(census.byKind).toEqual({ изображения: 2, шрифты: 1, разметка: 1 });
    expect(describeCensus(census)).toContain('изображения: 2');
  });

  it('служебные деревья не считает — node_modules материалом задумки не бывает', () => {
    mkdirSync(join(directory, 'node_modules', 'left-pad'), { recursive: true });
    mkdirSync(join(directory, 'handoff', 'tasks'), { recursive: true });
    writeFileSync(join(directory, 'node_modules', 'left-pad', 'index.js'), 'x');
    writeFileSync(join(directory, 'handoff', 'tasks', 'task_1.json'), '{}');
    writeFileSync(join(directory, 'index.html'), '<!doctype html>');

    expect(censusMaterial(directory).files).toBe(1);
  });

  it('пустая директория — не «неизвестно», а названный ноль', () => {
    expect(censusMaterial(directory)).toEqual({ files: 0, bytes: 0, byKind: {} });
    expect(describeCensus(censusMaterial(directory))).toBe('В рабочей директории материала нет.');
  });
});

describe('вердикт выводит код, а не модель (P1)', () => {
  it('пусто в недостижимом — выполнимо целиком', () => {
    expect(verdictOf({ reproducible: ['всё'], outOfReach: [] })).toBe('полностью');
  });

  it('пусто в воспроизводимом — невыполнимо', () => {
    expect(
      verdictOf({
        reproducible: [],
        outOfReach: [{ what: 'всё', why: 'материал', instead: 'ничего' }],
      }),
    ).toBe('невыполнимо');
  });

  it('оба перечня непусты — частично, что бы модель о себе ни думала', () => {
    expect(
      verdictOf({
        reproducible: ['вёрстка'],
        outOfReach: [{ what: 'шрифт', why: 'лицензия', instead: 'системный гротеск' }],
      }),
    ).toBe('частично');
  });
});

describe('промпт несёт задумку дословно и перепись как факт', () => {
  it('в нём есть и текст задумки, и числа переписи, и правило «копия ≠ 100%»', () => {
    const prompt = feasibilityPrompt('Скопируй сайт целиком', {
      files: 141,
      bytes: 17_000_000,
      byKind: { изображения: 141 },
    });

    expect(prompt).toContain('Скопируй сайт целиком');
    expect(prompt).toContain('изображения: 141');
    expect(prompt).toContain('НЕ пиксельное тождество');
    expect(prompt, 'о материале и разрешениях не спрашивают — решают сами').toContain(
      'Разрешений на материал не спрашивают',
    );
  });
});

describe('суждение целиком', () => {
  it('пишет запись на диск, выводит вердикт кодом и называет судью', async () => {
    seed();
    writeFileSync(join(directory, 'index.html'), '<!doctype html>');

    const outcome = await judgeFeasibility({
      projectDirectory: directory,
      seed: 'Сделай копию сайта nvidia.com',
      chain: chainSaying(
        JSON.stringify({
          reproducible: ['состав и порядок секций', 'стилистика и поведение'],
          outOfReach: [
            {
              what: 'текстовое начертание оригинала',
              why: 'лицензия',
              instead: 'ближайший по метрикам системный гротеск',
            },
          ],
        }),
        'google',
      ),
    });

    expect(outcome.status).toBe('judged');
    const record = outcome.status === 'judged' ? outcome.record : null;
    expect(record?.verdict).toBe('частично');
    expect(record?.judgedBy).toBe('google');
    expect(record?.material.files).toBe(2);
    expect(readFeasibility(directory)?.verdict).toBe('частично');
  });

  it('второй раз не судит: суждение, однажды объявленное владельцу, под ним не меняют', async () => {
    seed();
    let calls = 0;
    const chain = {
      providers: ['stub'],
      generate: () => {
        calls += 1;
        return Promise.resolve({
          text: JSON.stringify({ reproducible: ['всё'], outOfReach: [] }),
          provider: 'stub',
        });
      },
    } as unknown as Chain;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await judgeFeasibility({ projectDirectory: directory, seed: 'задумка', chain });
    }

    expect(calls, 'интейк идёт заново на каждом перезаходе — суждение только один раз').toBe(1);
  });

  it('без задумки и без провайдера — названный отказ, а не выдуманный вердикт', async () => {
    const noSeed = await judgeFeasibility({ projectDirectory: directory, seed: null, chain: null });
    expect(noSeed).toEqual({
      status: 'skipped',
      reason: 'задумки (SEED.md) в рабочей директории нет',
    });

    const noChain = await judgeFeasibility({
      projectDirectory: directory,
      seed: 'задумка',
      chain: null,
    });
    expect(noChain).toEqual({
      status: 'skipped',
      reason: 'провайдер роли архитектора не настроен',
    });
    expect(readFeasibility(directory), 'несостоявшееся суждение файла не пишет').toBeNull();
  });

  it('провайдер упал — деградация с причиной, интейк не падает', async () => {
    seed();
    const outcome = await judgeFeasibility({
      projectDirectory: directory,
      seed: 'задумка',
      chain: chainThrowing('429 too many requests'),
    });

    expect(outcome.status).toBe('skipped');
    expect(outcome.status === 'skipped' ? outcome.reason : '').toContain('429');
  });

  it('ответ не разобран — отказ, а не пустой зелёный вердикт', async () => {
    seed();
    const outcome = await judgeFeasibility({
      projectDirectory: directory,
      seed: 'задумка',
      chain: chainSaying('конечно, всё выполнимо!'),
    });

    expect(outcome.status).toBe('skipped');
  });

  it('модель, назвавшая причину не из перечня, вердиктом не считается', async () => {
    seed();
    const outcome = await judgeFeasibility({
      projectDirectory: directory,
      seed: 'задумка',
      chain: chainSaying(
        JSON.stringify({
          reproducible: ['кое-что'],
          outOfReach: [{ what: 'герой-баннер', why: 'лень', instead: 'градиент' }],
        }),
      ),
    });

    expect(outcome.status).toBe('skipped');
  });
});

describe('следствия суждения — оба обязательны (А-42 п.2)', () => {
  const record: FeasibilityRecord = {
    verdict: 'частично',
    reproducible: ['состав и порядок секций'],
    outOfReach: [
      {
        what: 'фирменное начертание',
        why: 'лицензия',
        instead: 'системный гротеск близких метрик',
      },
      { what: 'вторая половина изображений', why: 'материал', instead: 'кадры из наличных 141' },
    ],
    material: { files: 141, bytes: 17_000_000, byKind: { изображения: 141 } },
    judgedBy: 'google',
    at: '2026-08-24T00:00:00.000Z',
  };

  it('(б) условия для плана несут и запрет, и замену', () => {
    const conditions = planConditions(record);

    expect(conditions).toHaveLength(2);
    expect(conditions[0]).toContain('фирменное начертание');
    expect(conditions[0]).toContain('лицензия');
    expect(conditions[0], 'исполнителю замена нужна не меньше запрета').toContain(
      'системный гротеск',
    );
  });

  it('(а) текст владельцу называет и то, что выйдет, и то, что нет', () => {
    const text = describeFeasibility(record);

    expect(text).toContain('воспроизводима частично');
    expect(text).toContain('состав и порядок секций');
    expect(text).toContain('фирменное начертание — лицензия');
    expect(text).toContain('Взамен:');
  });

  it('выполнимая целиком задумка не пугает владельца пустым перечнем', () => {
    const text = describeFeasibility({ ...record, verdict: 'полностью', outOfReach: [] });

    expect(text).toContain('воспроизводима наличными средствами целиком');
    expect(text).not.toContain('Не воспроизводится');
    expect(planConditions({ ...record, outOfReach: [] })).toEqual([]);
  });
});
