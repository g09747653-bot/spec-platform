import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Chain } from '../llm/chain.ts';

import nvidiaPlan from '../../fixtures/plan-review/nvidia-plan.json' with { type: 'json' };

import {
  completenessPrompt,
  ensurePlanReviewed,
  planGate,
  readPlanReview,
  readSeed,
  recordPlanDecision,
  reviewPlanCompleteness,
  writePlanReview,
  writeSeed,
  type ReviewableTask,
} from './plan-review.ts';

/**
 * Суд полноты плана против задумки (А-33 п.4б). Модель — стаб, как всюду в CI; живой замер этого
 * же тракта снят мостом и лежит фикстурой (`fixtures/plan-review/`) — регрессия на слепке
 * nvidia-плана внизу гоняет его дословно.
 */

let directory: string;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'loop-plan-review-'));
});

afterEach(() => {
  rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

const stubChain = (answer: string): Chain => ({
  providers: [],
  generate: () => Promise.resolve({ text: answer, provider: 'anthropic' }),
});

const TASKS: ReviewableTask[] = [
  {
    taskId: 'T001',
    title: 'Каркас страниц',
    description: 'Собрать разметку главной.',
    filesToEdit: ['index.html'],
  },
  {
    taskId: 'T002',
    title: 'Стили шапки',
    description: 'Воспроизвести шапку.',
    filesToEdit: ['src/styles/header.css'],
  },
];

describe('задумка на диске (SEED.md)', () => {
  it('пишется и читается дословно; отсутствие и пустота — null', () => {
    expect(readSeed(directory)).toBeNull();

    writeSeed(directory, '  Сайт — копия nvidia.com  ');
    expect(readSeed(directory)).toBe('Сайт — копия nvidia.com');
  });
});

describe('промпт суда — полнота ВХОДА', () => {
  it('несёт задумку дословно и каждую задачу с охватом', () => {
    const prompt = completenessPrompt('Задумка владельца про копию.', TASKS);

    expect(prompt).toContain('Задумка владельца про копию.');
    for (const task of TASKS) {
      expect(prompt).toContain(task.taskId);
      expect(prompt).toContain(task.title);
    }
    expect(prompt).toContain('src/styles/header.css');
    expect(prompt).toContain('"verdict":"gaps"');
  });
});

describe('разбор вердикта', () => {
  it('complete — полон', async () => {
    const outcome = await reviewPlanCompleteness('seed', TASKS, stubChain('{"verdict":"complete"}'));
    expect(outcome).toEqual({ status: 'complete', judgedBy: 'anthropic' });
  });

  it('gaps — пробелы поимённо, и ограда кода не мешает', async () => {
    const outcome = await reviewPlanCompleteness(
      'seed',
      TASKS,
      stubChain('```json\n{"verdict":"gaps","gaps":["нет переноса графики"]}\n```'),
    );
    expect(outcome).toEqual({
      status: 'gaps',
      gaps: ['нет переноса графики'],
      judgedBy: 'anthropic',
    });
  });

  it('мусорный ответ — skipped с причиной, не молчание и не вердикт', async () => {
    const outcome = await reviewPlanCompleteness('seed', TASKS, stubChain('не могу судить'));
    expect(outcome.status).toBe('skipped');
    if (outcome.status === 'skipped') expect(outcome.reason).toContain('не разобран');
  });

  it('«gaps» без единого пробела — противоречие, а не вердикт: skipped', async () => {
    const outcome = await reviewPlanCompleteness(
      'seed',
      TASKS,
      stubChain('{"verdict":"gaps","gaps":[]}'),
    );
    expect(outcome.status).toBe('skipped');
  });

  it('все звенья суда отказали — skipped с причиной звена', async () => {
    const failing: Chain = {
      providers: [],
      generate: () => Promise.reject(new Error('провайдер ответил 429')),
    };
    const outcome = await reviewPlanCompleteness('seed', TASKS, failing);
    expect(outcome.status).toBe('skipped');
    if (outcome.status === 'skipped') expect(outcome.reason).toContain('429');
  });
});

describe('гейт над вердиктом на диске — чистая функция', () => {
  const gapsRecord = {
    verdict: 'gaps' as const,
    gaps: ['нет переноса графики'],
    judgedBy: 'claude-cli',
    at: '2026-08-23T10:00:00.000Z',
    decision: null,
  };

  it('файла нет → review; complete → run; gaps без решения → halt; с acceptPlan → accept', () => {
    expect(planGate(null, false)).toEqual({ action: 'review' });
    expect(planGate({ ...gapsRecord, verdict: 'complete', gaps: [] }, false)).toEqual({
      action: 'run',
    });
    expect(planGate(gapsRecord, false)).toEqual({
      action: 'halt',
      gaps: ['нет переноса графики'],
    });
    expect(planGate(gapsRecord, true)).toEqual({
      action: 'accept',
      gaps: ['нет переноса графики'],
    });
  });

  it('записанное решение владельца открывает конвейер и без acceptPlan', () => {
    const decided = {
      ...gapsRecord,
      decision: { action: 'proceed' as const, at: '2026-08-23T10:05:00.000Z' },
    };
    expect(planGate(decided, false)).toEqual({ action: 'run' });
  });
});

describe('вердикт на диске', () => {
  it('пишется, читается и принимает решение владельца', () => {
    writePlanReview(directory, {
      verdict: 'gaps',
      gaps: ['нет переноса графики'],
      judgedBy: 'claude-cli',
      at: '2026-08-23T10:00:00.000Z',
      decision: null,
    });

    expect(readPlanReview(directory)?.gaps).toEqual(['нет переноса графики']);

    const decided = recordPlanDecision(directory, '2026-08-23T10:05:00.000Z');
    expect(decided?.decision?.action).toBe('proceed');
    expect(readPlanReview(directory)?.decision?.action).toBe('proceed');
  });

  it('решение не по чему принимать — null: полному плану решение не пишется', () => {
    writePlanReview(directory, {
      verdict: 'complete',
      gaps: [],
      judgedBy: 'claude-cli',
      at: '2026-08-23T10:00:00.000Z',
      decision: null,
    });
    expect(recordPlanDecision(directory, '2026-08-23T10:05:00.000Z')).toBeNull();
  });
});

describe('весь суд одной точкой (ensurePlanReviewed)', () => {
  const say = () => {
    const lines: { message: string; level: string }[] = [];
    return {
      lines,
      write: (message: string, level: 'INFO' | 'WARN' | 'ERROR' = 'INFO') => {
        lines.push({ message, level });
      },
    };
  };

  it('нет SEED.md — суд не проводился, конвейер едет, причина названа', async () => {
    const feed = say();
    const review = await ensurePlanReviewed({
      projectDirectory: directory,
      tasks: TASKS,
      chain: stubChain('{"verdict":"complete"}'),
      acceptPlan: false,
      say: feed.write,
    });

    expect(review.proceed).toBe(true);
    expect(feed.lines.some((line) => line.message.includes('SEED.md'))).toBe(true);
    expect(readPlanReview(directory)).toBeNull();
  });

  it('нет провайдера — суд не проводился, причина названа', async () => {
    writeSeed(directory, 'задумка');
    const feed = say();
    const review = await ensurePlanReviewed({
      projectDirectory: directory,
      tasks: TASKS,
      chain: null,
      acceptPlan: false,
      say: feed.write,
    });

    expect(review.proceed).toBe(true);
    expect(feed.lines.some((line) => line.message.includes('провайдер'))).toBe(true);
  });

  it('пробелы: конвейер стоит, вердикт на диске, перечень в ленте уровнем ERROR', async () => {
    writeSeed(directory, 'полная графическая копия');
    const feed = say();
    const review = await ensurePlanReviewed({
      projectDirectory: directory,
      tasks: TASKS,
      chain: stubChain('{"verdict":"gaps","gaps":["нет переноса контентной графики"]}'),
      acceptPlan: false,
      say: feed.write,
    });

    expect(review.proceed).toBe(false);
    expect(review.gaps).toEqual(['нет переноса контентной графики']);
    expect(readPlanReview(directory)?.verdict).toBe('gaps');
    expect(
      feed.lines.some(
        (line) => line.level === 'ERROR' && line.message.includes('нет переноса контентной графики'),
      ),
    ).toBe(true);
  });

  it('повтор с нерешёнными пробелами НЕ судит заново и держит конвейер', async () => {
    writeSeed(directory, 'копия');
    writePlanReview(directory, {
      verdict: 'gaps',
      gaps: ['нет переноса графики'],
      judgedBy: 'claude-cli',
      at: '2026-08-23T10:00:00.000Z',
      decision: null,
    });

    let asked = 0;
    const spy: Chain = {
      providers: [],
      generate: () => {
        asked += 1;
        return Promise.resolve({ text: '{"verdict":"complete"}', provider: 'anthropic' });
      },
    };

    const review = await ensurePlanReviewed({
      projectDirectory: directory,
      tasks: TASKS,
      chain: spy,
      acceptPlan: false,
      say: () => undefined,
    });

    expect(review.proceed).toBe(false);
    expect(asked).toBe(0);
  });

  it('acceptPlan дописывает решение владельца и открывает конвейер; решение переживает повтор', async () => {
    writeSeed(directory, 'копия');
    writePlanReview(directory, {
      verdict: 'gaps',
      gaps: ['нет переноса графики'],
      judgedBy: 'claude-cli',
      at: '2026-08-23T10:00:00.000Z',
      decision: null,
    });

    const accepted = await ensurePlanReviewed({
      projectDirectory: directory,
      tasks: TASKS,
      chain: null,
      acceptPlan: true,
      say: () => undefined,
    });
    expect(accepted.proceed).toBe(true);
    expect(readPlanReview(directory)?.decision?.action).toBe('proceed');

    const again = await ensurePlanReviewed({
      projectDirectory: directory,
      tasks: TASKS,
      chain: null,
      acceptPlan: false,
      say: () => undefined,
    });
    expect(again.proceed).toBe(true);
  });

  it('полный план: вердикт записан, конвейер едет, повтор не судит заново', async () => {
    writeSeed(directory, 'копия');
    let asked = 0;
    const counting: Chain = {
      providers: [],
      generate: () => {
        asked += 1;
        return Promise.resolve({ text: '{"verdict":"complete"}', provider: 'google' });
      },
    };

    const first = await ensurePlanReviewed({
      projectDirectory: directory,
      tasks: TASKS,
      chain: counting,
      acceptPlan: false,
      say: () => undefined,
    });
    expect(first.proceed).toBe(true);
    expect(readPlanReview(directory)?.verdict).toBe('complete');

    const second = await ensurePlanReviewed({
      projectDirectory: directory,
      tasks: TASKS,
      chain: counting,
      acceptPlan: false,
      say: () => undefined,
    });
    expect(second.proceed).toBe(true);
    expect(asked).toBe(1);
  });

  it('суд недоступен (все звенья красные) — named-деградация, конвейер едет без вердикта', async () => {
    writeSeed(directory, 'копия');
    const feed = say();
    const failing: Chain = {
      providers: [],
      generate: () => Promise.reject(new Error('провайдер ответил 500')),
    };

    const review = await ensurePlanReviewed({
      projectDirectory: directory,
      tasks: TASKS,
      chain: failing,
      acceptPlan: false,
      say: feed.write,
    });

    expect(review.proceed).toBe(true);
    expect(readPlanReview(directory)).toBeNull();
    expect(feed.lines.some((line) => line.message.includes('не состоялся'))).toBe(true);
  });
});

describe('регрессия на слепке nvidia-плана (А-33 п.4б)', () => {
  /**
   * Слепок — реальные 41 задание финальной приёмки Программы А (workspace tg-20260822-235200);
   * вердикт — ЖИВОЙ ответ моста подписки на этот слепок, снятый 2026-08-23 тем же промптом и
   * разобранный тем же кодом. Суд обязан найти дыру, стоившую приёмке голого сайта: перенос
   * контентной графики не покрыт ни одной задачей (T004 — только логотип/иконки/шрифты).
   */
  const liveVerdict = readFileSync(
    join(import.meta.dirname, '..', '..', 'fixtures', 'plan-review', 'nvidia-verdict.txt'),
    'utf8',
  );

  it('вход суда несёт слепок целиком: все 41 задание и задумку', () => {
    const prompt = completenessPrompt(nvidiaPlan.seed, nvidiaPlan.tasks);
    expect(nvidiaPlan.tasks).toHaveLength(41);
    for (const task of nvidiaPlan.tasks) expect(prompt).toContain(task.taskId);
    expect(prompt).toContain('графическую копию nvidia.com');
  });

  it('живой вердикт моста находит отсутствие переноса контентной графики и останавливает конвейер', async () => {
    const outcome = await reviewPlanCompleteness(
      nvidiaPlan.seed,
      nvidiaPlan.tasks,
      stubChain(liveVerdict),
    );

    expect(outcome.status).toBe('gaps');
    if (outcome.status !== 'gaps') return;

    /* Пробел именован и говорит о контентной графике/изображениях — не о вкусах. */
    expect(outcome.gaps.length).toBeGreaterThan(0);
    expect(outcome.gaps.join('\n')).toMatch(/изображени|графи/i);
    expect(outcome.gaps.join('\n')).toContain('T004');

    /* И этот вердикт держит конвейер до решения владельца. */
    writePlanReview(directory, {
      verdict: 'gaps',
      gaps: outcome.gaps,
      judgedBy: outcome.judgedBy,
      at: '2026-08-23T10:00:00.000Z',
      decision: null,
    });
    expect(planGate(readPlanReview(directory), false).action).toBe('halt');
  });
});
