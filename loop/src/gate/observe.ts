import type { DockerEngine } from '../docker/engine.ts';
import { readLogFrames } from '../docker/log-frames.ts';
import { bindMount } from '../docker/paths.ts';

/**
 * Контейнерные глаза приёмки (D-314; принцип А-30).
 *
 * **Всё, что судит приёмка, наблюдается ИЗНУТРИ контейнера — хостовый взгляд на bind-mount уликой
 * не является.** Живой гейт M17а замерил, почему: долгоживущий серверный процесс контура на
 * Windows-хосте СТОЙКО не видит файлы, записанные исполнителем-контейнером — go.mod, созданный
 * итерацией №1 (mtime и содержимое читаемы свежими процессами), для `existsSync` контура не
 * существовал и десять минут спустя, при синхронных до секунды часах. Детект стека судил вчерашний
 * мир (generic → debian-образ → 127 на живом go-проекте), а mtime-детект правок был слеп к
 * контейнерным записям тем же механизмом.
 *
 * Это обобщение уже прожитого класса: walkArtifacts решает присутствие артефактов внутри
 * контейнера с D-274. Здесь тот же ход для двух оставшихся наблюдений суда:
 *
 * - `observeProjectRoot` — чем является проект (листинг корня + манифест) для детекта стека;
 * - `snapshotTree` — снимок дерева (имя, размер, mtime) для детекта правок между итерациями.
 *
 * Наблюдатель монтирует каталог только на чтение и без сети: наблюдение не имеет права быть тем,
 * что изменило наблюдаемое. Любой отказ наблюдения — именованный `ok: false`; что с ним делать
 * (сомнение — в чью пользу), решает вызывающий по духу своего допуска.
 */

export interface ObserveDeps {
  /** Наблюдение — секунды, не минуты; предел собственный, не приёмочный. */
  timeoutMs?: number;
}

export const OBSERVE_TIMEOUT_MS = 60_000;

type Observed = { ok: true; output: string } | { ok: false; reason: string };

/**
 * Один наблюдательный заход: команда в контейнере над каталогом, смонтированным read-only.
 *
 * Исключение из движка (демон недоступен, образа нет) — не бросок, а именованный отказ: слепота
 * наблюдателя есть штатный исход наблюдения, и переводить её в падение цикла значило бы судить
 * задачу за состояние среды.
 */
async function observe(
  engine: DockerEngine,
  image: string,
  hostPath: string,
  name: string,
  command: string,
  deps: ObserveDeps,
): Promise<Observed> {
  try {
    const stale = await engine.findByName(name);
    if (stale !== null) await engine.removeContainer(stale, { force: true });

    const id = await engine.createContainer({
      name,
      image,
      cmd: ['sh', '-c', command],
      binds: [bindMount(hostPath, '/observed', 'ro')],
      workingDir: '/observed',
      env: {},
      networkDisabled: true,
    });

    const collected: string[] = [];

    try {
      await engine.startContainer(id);

      const draining = (async () => {
        try {
          for await (const line of readLogFrames(await engine.attachLogs(id, { follow: true }))) {
            collected.push(line.text);
          }
        } catch {
          // Оборванный хвост лога наблюдателя — не вердикт; решает код выхода.
        }
      })();

      const abort = new AbortController();
      const timer = setTimeout(() => {
        abort.abort();
      }, deps.timeoutMs ?? OBSERVE_TIMEOUT_MS);
      timer.unref();

      let exitCode: number | null;
      try {
        exitCode = await engine.waitContainer(id, abort.signal);
      } catch {
        await engine.stopContainer(id, 0).catch(() => undefined);
        exitCode = null;
      } finally {
        clearTimeout(timer);
      }

      await draining;

      if (exitCode !== 0) {
        return {
          ok: false,
          reason:
            exitCode === null
              ? `наблюдатель не уложился в ${String(Math.round((deps.timeoutMs ?? OBSERVE_TIMEOUT_MS) / 1000))} с`
              : `наблюдатель вернул ${String(exitCode)}`,
        };
      }

      return { ok: true, output: collected.join('\n') };
    } finally {
      await engine.removeContainer(id, { force: true }).catch(() => undefined);
    }
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

/** Разделитель листинга и манифеста в выводе одного наблюдательного контейнера. */
export const MANIFEST_MARKER = '__LOOP_OBSERVE_MANIFEST__';

export type RootObservation =
  | { ok: true; paths: ReadonlySet<string>; packageJson: string | null }
  | { ok: false; reason: string };

/**
 * Чем является проект: пути двух верхних уровней (все маркерные файлы стека живут не глубже
 * `tests/e2e`) и содержимое `package.json`, когда он есть, — одним контейнером, потому что оба
 * ответа нужны одному решению и обязаны описывать один и тот же момент.
 *
 * `handoff/` и скрытые каталоги исключены зеркально хостовому обходу, который этот наблюдатель
 * заменяет: они пишутся самим контуром и стека не определяют.
 */
export async function observeProjectRoot(
  engine: DockerEngine,
  image: string,
  hostPath: string,
  name: string,
  deps: ObserveDeps = {},
): Promise<RootObservation> {
  const command = [
    String.raw`find . -mindepth 1 -maxdepth 2 \( -name handoff -o -name '.*' \) -prune -o -print`,
    `printf '%s\\n' '${MANIFEST_MARKER}'`,
    'cat package.json 2>/dev/null || true',
  ].join('\n');

  const observed = await observe(engine, image, hostPath, name, command, deps);
  if (!observed.ok) return observed;

  const lines = observed.output.split('\n');
  const marker = lines.indexOf(MANIFEST_MARKER);
  if (marker === -1) {
    return { ok: false, reason: 'вывод наблюдателя не содержит разделителя листинга' };
  }

  const paths = new Set(
    lines
      .slice(0, marker)
      .map((line) => (line.startsWith('./') ? line.slice(2) : line))
      .filter((line) => line !== ''),
  );
  const manifest = lines.slice(marker + 1).join('\n');

  return { ok: true, paths, packageJson: paths.has('package.json') ? manifest : null };
}

export type TreeSnapshot =
  | { ok: true; entries: ReadonlySet<string> }
  | { ok: false; reason: string };

/**
 * Снимок дерева проекта: `тип размер mtime путь` на строку, минуя `handoff/` (его пишет сам
 * контур: отчёт, вердикт) и скрытые каталоги — те же исключения, что были у хостового обхода.
 *
 * Сравниваются два снимка ОДНИХ глаз, поэтому миллисекундный допуск на рассинхронизацию часов
 * хоста и контейнера (D-308) здесь не нужен по построению; его дух — «сомнение читается как
 * „правки были“» — остаётся за вызывающим, который обязан так читать любой `ok: false`.
 */
export async function snapshotTree(
  engine: DockerEngine,
  image: string,
  hostPath: string,
  name: string,
  deps: ObserveDeps = {},
): Promise<TreeSnapshot> {
  const command = String.raw`find . -mindepth 1 \( -name handoff -o -name '.*' \) -prune -o -printf '%y %s %T@ %p\n'`;

  const observed = await observe(engine, image, hostPath, name, command, deps);
  if (!observed.ok) return observed;

  return {
    ok: true,
    entries: new Set(observed.output.split('\n').filter((line) => line !== '')),
  };
}

/** Совпадают ли два снимка полностью — единственное чтение, при котором «правок не было». */
export function treesMatch(before: ReadonlySet<string>, after: ReadonlySet<string>): boolean {
  if (before.size !== after.size) return false;
  for (const entry of before) if (!after.has(entry)) return false;
  return true;
}
