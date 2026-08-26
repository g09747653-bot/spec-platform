import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { HANDOFF } from '../intake/handoff.ts';

import {
  clearVerdict,
  hasRedVerdict,
  readVerdict,
  verdictPath,
  writeRedVerdict,
} from './verdicts.ts';

/**
 * Вердикт приёмки как файл источника правды (задача 176).
 *
 * Свойства ровно те, на которых стоит механизм: файл появляется с причиной и доказательствами,
 * принятие его уносит. Распознавание «были ли правки» живёт теперь в `gate/observe.ts` (снимки
 * контейнерными глазами, D-314) и тестируется там и в стаб-циклах.
 */

let workspace: string;

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), 'loop-verdicts-'));
  mkdirSync(join(workspace, HANDOFF.reports), { recursive: true });
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

describe('файл вердикта (task 176)', () => {
  it('пишется с причиной, находками контролёра и хвостом вывода — и читается назад', () => {
    writeRedVerdict(workspace, {
      taskId: 'task_x',
      reason: 'Приёмочный прогон «npm test» в чистом контейнере вернул 1 — задача не принята.',
      acceptance: {
        accepted: false,
        reason: 'Приёмочный прогон «npm test» в чистом контейнере вернул 1 — задача не принята.',
        commands: null,
        unitExitCode: 1,
        e2eExitCode: null,
        artifacts: [],
        output: '$ npm test\nFAIL src/util.test.js\n  ● converts metres',
        controller: {
          clean: false,
          reason: 'Контролёр вернул задачу: eslint.',
          findings: [{ label: 'eslint', exitCode: 1, output: '1 problem (1 error)' }],
          ran: ['eslint'],
          skipped: [],
          judged: ['src/util.js'],
        },
        returnedByController: false,
  measurement: null,
      },
    });

    expect(hasRedVerdict(workspace, 'task_x')).toBe(true);
    const text = readVerdict(workspace, 'task_x') ?? '';
    expect(text).toContain('НЕ ПРИНЯТА');
    expect(text).toContain('вернул 1');
    expect(text).toContain('eslint');
    expect(text).toContain('converts metres');
    expect(text).toContain('SUCCESS» без единой правки');
  });

  it('принятие уносит вердикт; отсутствие файла — не красная задача', () => {
    writeRedVerdict(workspace, { taskId: 'task_y', reason: 'красная', acceptance: null });
    expect(hasRedVerdict(workspace, 'task_y')).toBe(true);

    clearVerdict(workspace, 'task_y');
    expect(hasRedVerdict(workspace, 'task_y')).toBe(false);
    expect(readVerdict(workspace, 'task_y')).toBeNull();
    /* Повторная очистка — не ошибка: force-подход, как у статуса. */
    expect(() => {
      clearVerdict(workspace, 'task_y');
    }).not.toThrow();
  });

  it('лежит в handoff/reports — в том же монтировании, что отчёты исполнителя', () => {
    expect(verdictPath(workspace, 'task_z')).toBe(
      join(workspace, 'handoff', 'reports', 'verdict_task_z.md'),
    );
  });
});
