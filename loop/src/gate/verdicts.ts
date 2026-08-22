import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
  /** Этот вердикт — сам именованный отказ повтора: второй раз он не сработает (см. маркер). */
  refusedRepeat?: boolean;
}

/**
 * Маркер «повтор без правок уже отвергался этим вердиктом» (находка живого гейта M17а).
 *
 * Отказ 176 существует против исполнителя, который зачитывает SUCCESS над красным кодом, ничего
 * не тронув. Но причина красноты бывает ПЕРЕХОДНОЙ — не про код: недоступный образ приёмки,
 * потерянный toolchain-PATH, починенная оператором среда. Правок тогда объективно не нужно, и
 * отказ, срабатывающий каждый повтор, замыкает задачу в вечный красный цикл (замерено: задача 1
 * живого прогона, три круга подряд). Правило после находки: отказ срабатывает ОДИН раз на цепочку
 * — второй подряд «SUCCESS без правок» уходит приёмке на перепроверку, и мир, если он изменился,
 * получает шанс это показать.
 */
export const REFUSED_REPEAT_MARKER = '<!-- loop:refused-repeat -->';

export function verdictRefusedRepeat(projectDirectory: string, taskId: string): boolean {
  return readVerdict(projectDirectory, taskId)?.includes(REFUSED_REPEAT_MARKER) ?? false;
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

  if (note.refusedRepeat === true) {
    lines.push(
      '',
      REFUSED_REPEAT_MARKER,
      'Повтор без правок уже был отвергнут этим вердиктом один раз. Следующий такой же повтор',
      'уйдёт приёмке на перепроверку: если причина красноты была переходной (среда, образ, PATH),',
      'перепрогон это покажет.',
    );
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

/*
 * Здесь жил хостовый mtime-обход «изменился ли workspace» с допуском на рассинхронизацию часов
 * (EDIT_CLOCK_TOLERANCE_MS). Он умер с D-314: долгоживущий хостовый процесс стойко слеп к
 * контейнерным записям, и слепой обход читал честную починку как «не тронул ни файла». Правки
 * теперь распознаёт дифф двух контейнерных снимков дерева (`gate/observe.ts`, снимает цикл до и
 * после итерации); дух допуска D-308 сохранён строже прежнего — любой не взятый снимок читается
 * как «правки были», отказ повтора по сомнению невозможен.
 */

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
