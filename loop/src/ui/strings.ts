import type { LogLevel } from '../events/bus.ts';
import type { MilestoneStatus, ProjectStatus, TaskStatus } from '../db/board.ts';

/**
 * Every word the dashboard shows (task 153).
 *
 * **Russian only, and that is a decision rather than an omission** (A-21): the loop is a local tool
 * with exactly one operator, its surface is not the platform's, and the platform's string registry
 * deliberately does not extend to this package. One dictionary and no locale machinery — adding the
 * second language is a change to this file plus a selector, and until there is a second reader that
 * machinery would be weight with no load on it.
 *
 * A dictionary rather than literals in components for the ordinary reason: the words are reviewed
 * together, and a status that renders as `IN_PROGRESS` because somebody forgot to translate it is
 * visible here as a missing key rather than invisible in a page.
 */
export const RU = {
  title: 'Контур доставки',
  subtitle: 'Автономная сборка по спецификационному бандлу',

  emptyTitle: 'Проектов пока нет',
  emptyBody:
    'Контур покажет вехи, задачи и ленту, как только примет бандл. Пока база пуста, показывать нечего.',

  project: 'Проект',
  milestones: 'Вехи',
  tasks: 'Задачи',
  feed: 'Лента событий',
  feedEmpty: 'Событий пока нет.',
  feedLive: 'Лента подключена',
  feedReconnecting: 'Переподключение…',
  dependsOn: 'Ждёт',
  noDependencies: 'ничего не ждёт',
  techStack: 'Стек',

  totals: 'Всего задач',
  cold: 'Состояние загружено с диска',

  frozenTitle: 'Конвейер заморожен: красный CI',
  frozenTask: 'Красная задача',
  frozenPaused: 'Приостановлено исполнителей',
  retry: 'Возобновить',
  retrying: 'Возобновляем…',
  retryFailed: 'Возобновить не удалось',
  retryNoDirectory:
    'Каталог проекта неизвестен этой базе — возобновите через POST /api/orchestrator/retry.',
} as const;

export const PROJECT_STATUS_RU: Record<ProjectStatus, string> = {
  ACTIVE: 'В работе',
  PAUSED: 'Приостановлен',
  COMPLETED: 'Завершён',
  FAILED: 'Провален',
};

export const MILESTONE_STATUS_RU: Record<MilestoneStatus, string> = {
  PENDING: 'Ожидает',
  IN_PROGRESS: 'В работе',
  COMPLETED: 'Готова',
  FAILED: 'Провалена',
};

export const TASK_STATUS_RU: Record<TaskStatus, string> = {
  PENDING: 'Ожидает',
  IN_PROGRESS: 'В работе',
  COMPLETED: 'Готова',
  FAILED: 'Провалена',
  BLOCKED: 'Заблокирована',
  PAUSED: 'Приостановлена',
};

export const LOG_LEVEL_RU: Record<LogLevel, string> = {
  INFO: 'инфо',
  WARN: 'предупреждение',
  ERROR: 'ошибка',
  DEBUG: 'отладка',
};
