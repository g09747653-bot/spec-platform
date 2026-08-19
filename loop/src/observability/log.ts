import type { DatabaseSync } from 'node:sqlite';

import { z } from 'zod';

import {
  AGENT_ROLES,
  eventBus,
  LOG_LEVELS,
  type AgentRole,
  type EventBus,
  type LogEvent,
  type LogLevel,
} from '../events/bus.ts';

/**
 * Writing a log line (task 153).
 *
 * **One call does both halves**, and that is the whole design: the row goes into `agent_logs` — the
 * durable record a reload reads its tail from — and the same row, with the id the database just
 * assigned, is published on the bus for whoever is watching right now. Two separate calls would
 * eventually be one call somewhere, and the line that never reached the feed is the line an operator
 * needed most.
 *
 * The id matters as much as the text. A page that reconnects has a last-seen id, and the tail it
 * re-reads plus the events that arrived meanwhile have to be reconcilable — which is only possible
 * if a live event carries the same identity the stored row has.
 */

export interface LogWrite {
  projectId: string;
  taskId?: string | null;
  agentRole: AgentRole;
  logLevel?: LogLevel;
  message: string;
}

export interface Logger {
  write(entry: LogWrite): LogEvent;
  /** The last `limit` lines of a project, oldest first — what a fresh page starts from. */
  tail(projectId: string, limit: number): LogEvent[];
}

const INSERT = `
  INSERT INTO agent_logs (project_id, task_id, agent_role, message, log_level)
  VALUES (?, ?, ?, ?, ?)
  RETURNING log_id, project_id, task_id, agent_role, message, log_level, created_at
`;

const TAIL = `
  SELECT log_id, project_id, task_id, agent_role, message, log_level, created_at
  FROM agent_logs
  WHERE project_id = ?
  ORDER BY log_id DESC
  LIMIT ?
`;

/**
 * What comes back out of SQLite, parsed rather than asserted.
 *
 * A row from the database is data crossing a boundary like any other (constitution — runtime
 * validation at every boundary), and the id in particular is load-bearing: a reconnecting page
 * deduplicates against it, so an id that arrived as something other than a number would be a feed
 * that silently repeats or drops lines.
 */
const Row = z.object({
  log_id: z.coerce.number().int().positive(),
  project_id: z.string(),
  task_id: z.string().nullable(),
  agent_role: z.enum(AGENT_ROLES).catch('ORCHESTRATOR'),
  message: z.string(),
  log_level: z.enum(LOG_LEVELS).catch('INFO'),
  created_at: z.string(),
});

function toEvent(row: unknown): LogEvent {
  const parsed = Row.parse(row);

  return {
    logId: parsed.log_id,
    projectId: parsed.project_id,
    taskId: parsed.task_id,
    agentRole: parsed.agent_role,
    logLevel: parsed.log_level,
    message: parsed.message,
    createdAt: parsed.created_at,
  };
}

export function createLogger(database: DatabaseSync, bus: EventBus = eventBus()): Logger {
  return {
    write(entry) {
      const event = toEvent(
        database
          .prepare(INSERT)
          .get(
            entry.projectId,
            entry.taskId ?? null,
            entry.agentRole,
            entry.message,
            entry.logLevel ?? 'INFO',
          ),
      );

      bus.publish({ type: 'log', log: event });
      return event;
    },

    tail(projectId, limit) {
      // Read newest-first so `LIMIT` takes the tail; handed back oldest-first, the way it reads.
      return database.prepare(TAIL).all(projectId, limit).map(toEvent).reverse();
    },
  };
}
