import { existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { HANDOFF } from '../intake/handoff.ts';

import type { AcceptanceVerdict } from './accept.ts';

/**
 * Вердикт приёмки — исполнителю следующей итерации (задача 176; находка §6 рапорта M16а).
 *
 * Прогон Б показал разрыв: вердикт красной задачи жил в ленте, которой исполнитель не видит.
 * Задание говорит «создай утилиту» — всё создано; исполнитель трижды честно отвечал «SUCCESS»,
 * не меняя ни файла, а приёмка трижды получала ту же красноту. Оператор лечил это через бриф —
 * правильное место починки называет А-27 п.7: **вердикт приёмки в контексте повторной итерации**,
 * тем же приёмом, каким контролёрный возврат 161 даёт исследователя.
 *
 * Механизм — диск, как всё в handoff: `handoff/reports/verdict_<taskId>.md` пишется при красном
 * исходе, читается исполнителем повтора (строка в его промпте) и стирается при принятии. Файл
 * лежит внутри workspace, который контейнер исполнителя уже монтирует, — ни нового канала, ни
 * нового формата, просто ещё один файл источника правды.
 */

/** `handoff/reports/verdict_<taskId>.md` — рядом с отчётами исполнителя, в его же монтировании. */
export function verdictFileName(taskId: string): string {
  return `verdict_${taskId}.md`;
}

export function verdictPath(projectDirectory: string, taskId: string): string {
  return join(projectDirectory, HANDOFF.reports, verdictFileName(taskId));
}

export function hasRedVerdict(projectDirectory: string, taskId: string): boolean {
  return existsSync(verdictPath(projectDirectory, taskId));
}

/** Хвост вывода — достаточно, чтобы назвать причину; целиком вывод остаётся в ленте. */
const OUTPUT_TAIL_LINES = 60;

const tail = (text: string): string => text.split('\n').slice(-OUTPUT_TAIL_LINES).join('\n').trim();

export interface RedVerdictNote {
  taskId: string;
  /** Почему задача красная — предложение из вердикта цикла. */
  reason: string;
  /** Вердикт приёмки, когда она успела состояться; null — красный случился раньше (таймаут). */
  acceptance: AcceptanceVerdict | null;
}

/**
 * Пишет вердикт так, как его будет читать агент: причина первой строкой, затем — чем она доказана
 * (упавшая команда и хвост её вывода, находки контролёра), затем — что от повтора требуется.
 */
export function writeRedVerdict(projectDirectory: string, note: RedVerdictNote): string {
  const lines = [
    `# Вердикт приёмки задачи ${note.taskId}: НЕ ПРИНЯТА`,
    '',
    'Это вердикт предыдущей итерации этой же задачи. Прочитай его до работы: повтор обязан',
    'починить именно названную причину. «SUCCESS» без единой правки при этом вердикте будет',
    'отвергнут по имени, третьего одинакового захода не будет.',
    '',
    '## Причина',
    '',
    note.reason,
  ];

  const acceptance = note.acceptance;
  if (acceptance !== null) {
    for (const finding of acceptance.controller?.findings ?? []) {
      lines.push(
        '',
        `## Находка контролёра: ${finding.label}`,
        '',
        '```',
        tail(finding.output),
        '```',
      );
    }

    if (acceptance.output.trim() !== '' && !acceptance.returnedByController) {
      lines.push(
        '',
        '## Хвост вывода приёмочного прогона',
        '',
        '```',
        tail(acceptance.output),
        '```',
      );
    }

    const failedArtifacts = acceptance.artifacts.filter(
      (artifact) => !artifact.present || !artifact.matched,
    );
    if (failedArtifacts.length > 0) {
      lines.push('', '## Неподтверждённые артефакты', '');
      for (const artifact of failedArtifacts) {
        lines.push(
          `- \`${artifact.path}\`: ${artifact.present ? tail(artifact.output) : 'файла нет'}`,
        );
      }
    }
  }

  lines.push('');

  const path = verdictPath(projectDirectory, note.taskId);
  writeFileSync(path, lines.join('\n'), 'utf8');
  return path;
}

/** Принятая задача уносит свой вердикт: устаревшая красная причина хуже отсутствующей. */
export function clearVerdict(projectDirectory: string, taskId: string): void {
  rmSync(verdictPath(projectDirectory, taskId), { force: true });
}

/**
 * Изменился ли workspace с момента `sinceMs` (mtime-класс прогона Б).
 *
 * Обходит дерево проекта, минуя `handoff/` (отчёт и вердикт пишутся самим контуром) и скрытые
 * каталоги, с ранним выходом на первом же изменённом файле или каталоге. Ошибка чтения читается
 * как «изменялся» — недоказанное «не трогал» не должно становиться отказом повтора.
 *
 * Сдвиг часов контейнера и хоста покрыт допуском вызывающего (`EDIT_CLOCK_TOLERANCE_MS`), и
 * ошибка допуска смещена в сторону «правки были»: ложное «не было правок» отвергло бы честную
 * починку, ложное «были» лишь повторит приёмку — старое поведение, ничего не потеряно.
 */
export function workspaceEditedSince(projectDirectory: string, sinceMs: number): boolean {
  const walk = (directory: string): boolean => {
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return true;
    }

    for (const entry of entries) {
      if (entry.name === 'handoff' || entry.name.startsWith('.')) continue;

      const path = join(directory, entry.name);
      let modifiedAt: number;
      try {
        modifiedAt = statSync(path).mtimeMs;
      } catch {
        return true;
      }

      if (modifiedAt >= sinceMs) return true;
      if (entry.isDirectory() && walk(path)) return true;
    }

    return false;
  };

  return walk(projectDirectory);
}

/** Допуск на рассинхронизацию часов контейнера и хоста при сравнении mtime. */
export const EDIT_CLOCK_TOLERANCE_MS = 2_000;

/** Читает вердикт, когда он есть, — для ленты и тестов; исполнителю файл отдаёт монтирование. */
export function readVerdict(projectDirectory: string, taskId: string): string | null {
  const path = verdictPath(projectDirectory, taskId);
  if (!existsSync(path)) return null;

  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}
