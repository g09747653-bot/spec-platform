import { describe, expect, it } from 'vitest';

import { createFakeEngine } from '../docker/testing/fake-engine.ts';

import { observeProjectRoot, snapshotTree, treesMatch } from './observe.ts';

/**
 * Контейнерные глаза приёмки (D-314; принцип А-30).
 *
 * Стойкую слепоту хостового кэша к контейнерным записям в тесте не воспроизвести — тестируется
 * ШОВ: что наблюдатель спрашивает контейнер (и как именно), что он честно разбирает ответ и что
 * любой его отказ именован, а не замаскирован под «файлов нет». Живое доказательство слепоты и её
 * лечения — восьмой прогон гейта 167.
 */

describe('наблюдение корня проекта (observeProjectRoot)', () => {
  it('спрашивает контейнер и разбирает листинг с манифестом из одного вывода', async () => {
    const engine = createFakeEngine({
      onStart: () => ({
        exitCode: 0,
        stdout: ['./go.mod', './cmd', './cmd/main.go', '__LOOP_OBSERVE_MANIFEST__'],
      }),
    });

    const observed = await observeProjectRoot(engine, 'debian:test', 'C:/ws', 'obs-1');

    expect(observed.ok).toBe(true);
    if (!observed.ok) return;
    expect(observed.paths.has('go.mod')).toBe(true);
    expect(observed.paths.has('cmd/main.go')).toBe(true);
    /* package.json в листинге нет — и текст после маркера манифестом не считается. */
    expect(observed.packageJson).toBeNull();
  });

  it('отдаёт текст package.json, когда листинг его содержит', async () => {
    const engine = createFakeEngine({
      onStart: () => ({
        exitCode: 0,
        stdout: ['./package.json', '__LOOP_OBSERVE_MANIFEST__', '{"scripts":{"test":"node -e 0"}}'],
      }),
    });

    const observed = await observeProjectRoot(engine, 'debian:test', 'C:/ws', 'obs-2');

    expect(observed.ok).toBe(true);
    if (!observed.ok) return;
    expect(observed.packageJson).toContain('node -e 0');
  });

  it('монтирует наблюдаемое только на чтение, без сети, и исключает handoff со скрытыми', async () => {
    const engine = createFakeEngine({
      onStart: () => ({ exitCode: 0, stdout: ['__LOOP_OBSERVE_MANIFEST__'] }),
    });

    await observeProjectRoot(engine, 'debian:test', 'C:/ws', 'obs-3');

    const spec = engine.containers[0]?.spec;
    expect(spec?.binds?.[0]).toMatch(/:ro$/);
    expect(spec?.networkDisabled).toBe(true);
    const command = spec?.cmd?.join('\n') ?? '';
    expect(command).toContain('-name handoff');
    expect(command).toContain("-name '.*'");
    expect(command).toContain('-prune');
  });

  it('ненулевой выход наблюдателя — именованный отказ, не пустой проект', async () => {
    const engine = createFakeEngine({ onStart: () => ({ exitCode: 2 }) });

    const observed = await observeProjectRoot(engine, 'debian:test', 'C:/ws', 'obs-4');

    expect(observed).toEqual({ ok: false, reason: 'наблюдатель вернул 2' });
  });

  it('вывод без разделителя — отказ: недоразобранный ответ не притворяется наблюдением', async () => {
    const engine = createFakeEngine({
      onStart: () => ({ exitCode: 0, stdout: ['./package.json'] }),
    });

    const observed = await observeProjectRoot(engine, 'debian:test', 'C:/ws', 'obs-5');

    expect(observed.ok).toBe(false);
  });

  it('упавший движок — отказ с причиной, а не исключение цикла', async () => {
    const engine = createFakeEngine({});
    engine.createContainer = () => Promise.reject(new Error('демон недоступен'));

    const observed = await observeProjectRoot(engine, 'debian:test', 'C:/ws', 'obs-6');

    expect(observed).toEqual({ ok: false, reason: 'демон недоступен' });
  });
});

describe('снимок дерева и его сравнение (snapshotTree, treesMatch)', () => {
  it('снимает `тип размер mtime путь` контейнерным find, минуя handoff и скрытые', async () => {
    const engine = createFakeEngine({
      onStart: () => ({
        exitCode: 0,
        stdout: ['f 12 1755820800.0 ./src/util.js', 'd 4096 1755820800.0 ./src'],
      }),
    });

    const snapshot = await snapshotTree(engine, 'debian:test', 'C:/ws', 'snap-1');

    expect(snapshot.ok).toBe(true);
    if (!snapshot.ok) return;
    expect(snapshot.entries.size).toBe(2);

    const command = engine.containers[0]?.spec.cmd?.join('\n') ?? '';
    expect(command).toContain('-printf');
    expect(command).toContain('%T@');
    expect(command).toContain('-name handoff');
  });

  it('не взятый снимок именован — сомнение решает вызывающий, не наблюдатель', async () => {
    const engine = createFakeEngine({ onStart: () => ({ exitCode: 1 }) });

    const snapshot = await snapshotTree(engine, 'debian:test', 'C:/ws', 'snap-2');

    expect(snapshot).toEqual({ ok: false, reason: 'наблюдатель вернул 1' });
  });

  it('совпадение снимков — только строка в строку; любое расхождение есть правка', () => {
    const base = ['f 12 1.0 ./a.js', 'd 4096 1.0 ./src'];

    expect(treesMatch(new Set(base), new Set(base))).toBe(true);
    /* Новый файл, изменившийся размер, изменившийся mtime — всё это разные строки. */
    expect(treesMatch(new Set(base), new Set([...base, 'f 3 2.0 ./b.js']))).toBe(false);
    expect(treesMatch(new Set(base), new Set(['f 13 1.0 ./a.js', 'd 4096 1.0 ./src']))).toBe(false);
    expect(treesMatch(new Set(base), new Set(['f 12 9.9 ./a.js', 'd 4096 1.0 ./src']))).toBe(false);
  });
});
