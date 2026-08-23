/**
 * The in-process event bus (task 153; бандл A0 §Observability).
 *
 * The orchestrator lives inside the dashboard's server process — that is what "monolith" means here
 * — so a log line reaches an open page by being *handed* to it, not by the page asking. Polling the
 * database for new rows would be the obvious alternative and is the one the A0 solution rules out by
 * name: an autonomous run writes thousands of lines, ten subscribers each asking SQLite «anything
 * new?» every second is a load the loop's own database does not need, and it turns "immediately"
 * into "within a second".
 *
 * A singleton on `globalThis`, because Next reloads modules in development and a second copy of this
 * module would be a second bus — publishers on one, subscribers on the other, and a feed that goes
 * quiet for no visible reason.
 */

export const AGENT_ROLES = [
  'ARCHITECT',
  'EXECUTOR',
  'CONTROLLER',
  'RESEARCHER',
  'ORCHESTRATOR',
] as const;

export const LOG_LEVELS = ['INFO', 'WARN', 'ERROR', 'DEBUG'] as const;

export type AgentRole = (typeof AGENT_ROLES)[number];
export type LogLevel = (typeof LOG_LEVELS)[number];

export interface LogEvent {
  /** `agent_logs.log_id` — monotonic, and what a reconnecting reader deduplicates against. */
  logId: number;
  projectId: string;
  taskId: string | null;
  agentRole: AgentRole;
  logLevel: LogLevel;
  message: string;
  createdAt: string;
}

/** Everything the dashboard reacts to. Log lines dominate; state changes redraw the tree. */
export type LoopEvent =
  | { type: 'log'; log: LogEvent }
  | { type: 'task-status'; projectId: string; taskId: string; status: string }
  | { type: 'milestone-status'; projectId: string; milestoneId: string; status: string }
  | { type: 'project-status'; projectId: string; status: string }
  /**
   * Суд полноты плана нашёл пробелы и конвейер не запущен (А-33 п.4б): шлюз превращает это в
   * алерт с перечнем и кнопкой решения. Дашборду событие безвредно — любой не-log перерисовывает
   * дерево, полезной нагрузки страница не читает.
   */
  | { type: 'plan-review'; projectId: string; gaps: string[] };

export type Subscriber = (event: LoopEvent) => void;

export interface EventBus {
  publish(event: LoopEvent): void;
  subscribe(subscriber: Subscriber): () => void;
  /** How many feeds are attached — the dashboard shows it, and a leak is visible in it. */
  subscriberCount(): number;
}

function createEventBus(): EventBus {
  const subscribers = new Set<Subscriber>();

  return {
    publish(event) {
      for (const subscriber of [...subscribers]) {
        try {
          subscriber(event);
        } catch (error) {
          /*
           * A subscriber that throws must not take the publisher down with it. The publisher here is
           * the orchestrator writing a log line; a dead browser connection is not a reason to stop
           * building software.
           */
          console.error('подписчик ленты бросил исключение', error);
        }
      }
    },

    subscribe(subscriber) {
      subscribers.add(subscriber);
      return () => subscribers.delete(subscriber);
    },

    subscriberCount() {
      return subscribers.size;
    },
  };
}

const KEY = Symbol.for('spec-platform.loop.event-bus');

interface BusHolder {
  [KEY]?: EventBus;
}

export function eventBus(): EventBus {
  const holder = globalThis as unknown as BusHolder;
  holder[KEY] ??= createEventBus();
  return holder[KEY];
}
