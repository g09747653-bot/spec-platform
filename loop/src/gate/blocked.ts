import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

import chokidar, { type FSWatcher } from 'chokidar';

import { HANDOFF, HandoffTask, taskFileName } from '../intake/handoff.ts';

/**
 * The blocking protocol (task 157; бандл A0 §blocked_protocol).
 *
 * An executor that hits something it cannot get past writes `BLOCKED_<taskId>.md` in the workspace
 * root and the task stops. **The block is lifted by a person deleting that file** — not by a button,
 * not by a timeout, not by the loop deciding enough time has passed. That is the design's one
 * deliberate hand-off to the operator, and the file is both the message and the switch.
 *
 * The watcher exists because the alternative is polling, and the operator who has just fixed the
 * problem should not then wait on a poll interval to find out whether the loop noticed.
 */

export function blockedFileName(taskId: string): string {
  return `BLOCKED_${taskId}.md`;
}

export function blockedPath(projectDirectory: string, taskId: string): string {
  return join(projectDirectory, blockedFileName(taskId));
}

export interface BlockedDetails {
  taskId: string;
  executorId: string;
  role?: string;
  at: string;
  problem: string;
  files?: readonly string[];
  failingCommands?: readonly string[];
  instructions: string;
}

/** The A0 template, filled in. The shape is the contract the operator reads. */
export function renderBlockedFile(details: BlockedDetails): string {
  const list = (values: readonly string[] | undefined) =>
    values === undefined || values.length === 0
      ? '  - —'
      : values.map((value) => `  - \`${value}\``).join('\n');

  return [
    `# BLOCKED: ${details.taskId}`,
    '',
    '## Инициатор',
    `* **Идентификатор агента:** ${details.executorId}`,
    `* **Роль агента:** ${details.role ?? 'Executor'}`,
    `* **Дата и время блокировки:** ${details.at}`,
    '',
    '## Описание проблемы',
    details.problem,
    '',
    '## Затронутые файлы и тесты',
    '* **Файлы:**',
    list(details.files),
    '* **Сбойные тесты / команды:**',
    list(details.failingCommands),
    '',
    '## Инструкции для разблокировки',
    details.instructions,
    '',
    '---',
    '',
    'Удалите этот файл, когда препятствие устранено — контур увидит удаление и вернёт задачу в работу.',
    '',
  ].join('\n');
}

/** Writes the file and puts the task into `BLOCKED`, on disk first and in the index after. */
export function raiseBlock(
  database: DatabaseSync,
  projectDirectory: string,
  details: BlockedDetails,
): string {
  const path = blockedPath(projectDirectory, details.taskId);
  writeFileSync(path, renderBlockedFile(details), 'utf8');

  setTaskStatusOnDisk(projectDirectory, details.taskId, 'BLOCKED');
  database.prepare('UPDATE tasks SET status = ? WHERE task_id = ?').run('BLOCKED', details.taskId);

  return path;
}

/** Rewrites the status inside `task_<taskId>.json` — the disk is the source of truth. */
export function setTaskStatusOnDisk(
  projectDirectory: string,
  taskId: string,
  status: HandoffTask['status'],
): void {
  const path = join(projectDirectory, HANDOFF.tasks, taskFileName(taskId));
  if (!existsSync(path)) return;

  const task = HandoffTask.parse(JSON.parse(readFileSync(path, 'utf8')));
  writeFileSync(
    path,
    `${JSON.stringify(HandoffTask.parse({ ...task, status }), null, 2)}\n`,
    'utf8',
  );
}

export interface BlockWatcher {
  /** Resolves once the watcher is actually watching — a race the tests would otherwise lose. */
  ready: Promise<void>;
  close(): Promise<void>;
}

/**
 * Watches the workspace root for blocking files disappearing.
 *
 * `chokidar` rather than `fs.watch`: the events this depends on are the ones raw `fs.watch` reports
 * inconsistently across platforms, and the loop's host is Windows while its CI is Linux. A watcher
 * that works on one of them is a protocol that works on one of them.
 *
 * The unblock is **not** «set it to PENDING and hope»: the status is written to disk first and the
 * database updated after, in the same order everything else in the loop uses, so a crash between
 * the two is repaired by the next import rather than losing the operator's action.
 */
/**
 * Один вотчер на каталог проекта, надолго (задача 167 — находка живого гейта).
 *
 * `watchBlocks` был построен и оттестирован задачей 157 — и НЕ подключён ни в одной точке
 * продукта: файл блокировки обещал «контур увидит удаление», а удаление не видел никто. Оператор
 * гейта M17а снял блокировку по инструкции ленты, и статус в индексе остался BLOCKED навсегда —
 * молчаливый отказ ровно того класса, который гейт объявляет красным. Реестр на `globalThis` — по
 * той же причине, что шина: dev-перезагрузка модулей не должна плодить вторые вотчеры.
 *
 * Снятие чинит СТАТУС (диск → индекс → лента); перезапуск конвейера остаётся за оператором
 * (`start-loop`), как лента и говорит.
 */
const WATCHERS = Symbol.for('spec-platform.loop.block-watchers');

interface WatcherHolder {
  [WATCHERS]?: Map<string, BlockWatcher>;
}

function watcherRegistry(): Map<string, BlockWatcher> {
  const holder = globalThis as unknown as WatcherHolder;
  holder[WATCHERS] ??= new Map<string, BlockWatcher>();
  return holder[WATCHERS];
}

export function ensureBlockWatcher(
  database: DatabaseSync,
  projectDirectory: string,
  onUnblocked: (taskId: string) => void,
): BlockWatcher {
  const registry = watcherRegistry();
  const existing = registry.get(projectDirectory);
  if (existing !== undefined) return existing;

  const watcher = watchBlocks(database, projectDirectory, onUnblocked);
  registry.set(projectDirectory, watcher);
  return watcher;
}

export function watchBlocks(
  database: DatabaseSync,
  projectDirectory: string,
  onUnblocked: (taskId: string) => void,
): BlockWatcher {
  const watcher: FSWatcher = chokidar.watch(projectDirectory, {
    depth: 0,
    ignoreInitial: true,
    /* The file is written in one go; there is nothing to debounce and nothing to wait for. */
    awaitWriteFinish: false,
  });

  const unblock = (path: string) => {
    const match = /BLOCKED_(.+)\.md$/.exec(path);
    const taskId = match?.[1];
    if (taskId === undefined) return;

    setTaskStatusOnDisk(projectDirectory, taskId, 'PENDING');
    database
      .prepare("UPDATE tasks SET status = 'PENDING' WHERE task_id = ? AND status = 'BLOCKED'")
      .run(taskId);

    onUnblocked(taskId);
  };

  watcher.on('unlink', unblock);

  return {
    ready: new Promise<void>((settle) => {
      watcher.on('ready', () => {
        settle();
      });
    }),
    close: () => watcher.close(),
  };
}
