'use client';

import { useEffect, useRef, useState } from 'react';

import type { LogEvent } from '../events/bus.ts';

import { LOG_LEVEL_RU, RU } from './strings.ts';

/**
 * The live log feed (task 153).
 *
 * The server rendered the tail; this component's whole job is everything that happens **after** the
 * page loaded. A line the orchestrator emits has to appear without the page asking for it, so the
 * connection is a stream the server pushes into — and once it is open, nothing here polls, refetches
 * or reloads.
 *
 * `EventSource` rather than a fetch reader, deliberately, and it is the one place the loop differs
 * from the platform on this: the platform banned `EventSource` because its generation stream is a
 * `POST` with headers and a resume policy it has to control (D-8), and none of that applies here.
 * This is a one-way `GET` of text, and `EventSource` brings the reconnection the feed wants for
 * free — an operator whose laptop slept should find the feed reattached, not dead.
 *
 * **Deduplication is by `logId`, not by position.** A reconnect replays a tail that overlaps what is
 * already on screen; matching on the id is what makes the overlap a no-op instead of a doubled run
 * of lines.
 */
export function LiveFeed({ projectId, initial }: { projectId: string; initial: LogEvent[] }) {
  const [lines, setLines] = useState<LogEvent[]>(initial);
  const [live, setLive] = useState(false);
  const seen = useRef(new Set(initial.map((line) => line.logId)));
  const bottom = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const lastSeen = initial.at(-1)?.logId ?? 0;
    const query = new URLSearchParams({ projectId, since: String(lastSeen) });
    const source = new EventSource(`/api/observability/stream-logs?${query.toString()}`);

    source.addEventListener('open', () => {
      setLive(true);
    });
    source.addEventListener('error', () => {
      setLive(false);
    });

    source.addEventListener('log', (event) => {
      const parsed = parseLine((event as MessageEvent<string>).data);
      if (parsed === null || seen.current.has(parsed.logId)) return;

      seen.current.add(parsed.logId);
      setLines((current) => [...current, parsed]);
    });

    return () => {
      source.close();
    };
  }, [projectId, initial]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [lines]);

  return (
    <>
      <p className="feed-state" data-live={live ? 'yes' : 'no'} data-testid="feed-state">
        {live ? RU.feedLive : RU.feedReconnecting}
      </p>

      {lines.length === 0 ? (
        <p className="empty" data-testid="feed-empty">
          {RU.feedEmpty}
        </p>
      ) : (
        <ol className="feed" data-testid="feed">
          {lines.map((line) => (
            <li key={line.logId} data-level={line.logLevel} data-testid="feed-line">
              <span className="when">{clock(line.createdAt)}</span>
              <span className="who" title={LOG_LEVEL_RU[line.logLevel]}>
                {line.agentRole}
              </span>
              <span className="what">{line.message}</span>
            </li>
          ))}
        </ol>
      )}
      <div ref={bottom} />
    </>
  );
}

/** A stored timestamp is `YYYY-MM-DD HH:MM:SS` in UTC; the feed shows the time and drops the date. */
function clock(createdAt: string): string {
  const time = /\d{2}:\d{2}:\d{2}/.exec(createdAt);
  return time?.[0] ?? createdAt;
}

function parseLine(data: string): LogEvent | null {
  try {
    const value: unknown = JSON.parse(data);

    if (
      typeof value === 'object' &&
      value !== null &&
      'logId' in value &&
      typeof value.logId === 'number' &&
      'message' in value &&
      typeof value.message === 'string'
    ) {
      return value as LogEvent;
    }

    return null;
  } catch {
    return null;
  }
}
