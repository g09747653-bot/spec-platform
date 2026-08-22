import type { StartOutcome } from '../../docker/testing/fake-engine.ts';
import { MANIFEST_MARKER } from '../observe.ts';

/**
 * Валидные ответы наблюдателя приёмки (D-314) для стабов, чьи кейсы — не о наблюдении.
 *
 * После D-314 приёмка спрашивает контейнер, чем является копия, а цикл повтора — снимками, что
 * изменилось; фейковый демон сам по себе не отвечает ничем. Тесты планировщика, заморозки и ролей
 * спрашивают о своём — им нужен наблюдатель, который просто не мешает: nodejs-проект с одним
 * тест-скриптом, и снимки, различающиеся между «до» и «после» (то есть «правки были» — повтор
 * всегда уходит приёмке, отказ 176 в чужие сюжеты не вмешивается; так эти кейсы вели себя и при
 * mtime-детекте, где их свежесозданные фикстуры выглядели правками). Тесты самого шва наблюдения
 * (observe/accept/run-cycle) этим помощником не пользуются — они диктуют ответы сами.
 *
 * `null` — контейнер не наблюдательский, пусть кейс решает сам.
 */
export function observerStubOutcome(name: string): StartOutcome | null {
  if (name.endsWith('-observe')) {
    return {
      exitCode: 0,
      stdout: ['./package.json', MANIFEST_MARKER, '{"scripts":{"test":"node -e 0"}}'],
    };
  }
  if (name.endsWith('-snapshot-before')) {
    return { exitCode: 0, stdout: ['f 1 100.0 ./package.json'] };
  }
  if (name.endsWith('-snapshot-after')) {
    return { exitCode: 0, stdout: ['f 2 200.0 ./package.json'] };
  }
  return null;
}
