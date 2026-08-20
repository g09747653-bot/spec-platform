import { getDatabase } from '../../../../db/client.ts';
import { eventBus, type LoopEvent } from '../../../../events/bus.ts';
import { createLogger } from '../../../../observability/log.ts';

/**
 * `GET /api/observability/stream-logs` — the live feed (task 153; бандл A0 §Observability).
 *
 * Server-Sent Events over the in-process bus, and **no database polling anywhere in this file**.
 * The orchestrator runs in this process; when it writes a log line the row and the event are one
 * call (`observability/log.ts`), so the line is handed to every open feed in the same tick it is
 * persisted.
 *
 * **The join is ordered so a reload can lose nothing.** Subscribing *first* and buffering, then
 * reading the stored tail, then flushing only the buffered events the tail did not already contain,
 * closes the window in between: read-then-subscribe would drop every line emitted during the read,
 * and subscribe-then-read-without-buffering would show them out of order. `since` lets a client that
 * already rendered a tail ask for only what is newer than it.
 */
export const dynamic = 'force-dynamic';
/* SSE cannot run on the edge here: the bus and the database are Node objects in this process. */
export const runtime = 'nodejs';

const TAIL_LIMIT = 200;
const HEARTBEAT_MS = 15_000;

export function GET(request: Request): Response {
  const url = new URL(request.url);
  const projectId = url.searchParams.get('projectId');
  const since = Number(url.searchParams.get('since') ?? '0');

  if (projectId === null || projectId === '') {
    return new Response('projectId обязателен', { status: 400 });
  }

  const bus = eventBus();
  const logger = createLogger(getDatabase(), bus);
  const encoder = new TextEncoder();

  let unsubscribe: (() => void) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let open = true;
      const buffered: LoopEvent[] = [];
      let joined = false;

      const send = (event: string, payload: unknown) => {
        if (!open) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`),
          );
        } catch {
          // The client went away between the check and the write. Nothing to repair.
          open = false;
        }
      };

      /*
       * **A byte before anything else, and it is load-bearing.** The browser does not consider an
       * `EventSource` open until the response actually starts arriving, and a stream with nothing to
       * say yet sends nothing — so a feed opened on a quiet project sat in «Переподключение…»
       * forever while being perfectly connected. Measured: three of this route's browser cases
       * failed on exactly that, and only the ones with a stored tail passed. A comment line is not
       * an event and never reaches the page as a line.
       */
      controller.enqueue(encoder.encode(': connected\n\n'));

      // 1. Subscribe before reading, buffering whatever arrives while the read is in flight.
      unsubscribe = bus.subscribe((event) => {
        if (!joined) {
          buffered.push(event);
          return;
        }
        deliver(event);
      });

      const delivered = new Set<number>();

      function deliver(event: LoopEvent): void {
        /*
         * A status change is the other half of what an operator watches. The feed alone would leave
         * the plan frozen at whatever the server rendered on page load — and the gate walk found
         * exactly that, waiting forever on a status that had already moved. The event carries no
         * payload the page needs beyond «something moved»: the tree is server-rendered, so the page
         * asks the server for it again rather than rebuilding it from a diff.
         */
        if (event.type !== 'log') {
          if (event.projectId === projectId) send('status', event);
          return;
        }

        if (event.log.projectId !== projectId) return;
        if (delivered.has(event.log.logId)) return;

        delivered.add(event.log.logId);
        send('log', event.log);
      }

      // 2. The stored tail, minus whatever the client says it already has.
      const tail = logger
        .tail(projectId, TAIL_LIMIT)
        .filter((line) => !Number.isFinite(since) || line.logId > since);

      for (const line of tail) {
        delivered.add(line.logId);
        send('log', line);
      }

      // 3. The join: everything buffered during the read that the tail did not already carry.
      joined = true;
      for (const event of buffered) deliver(event);
      buffered.length = 0;

      // A comment line keeps proxies and sleeping laptops from deciding the connection is dead. It
      // is not an event, so it never reaches the page as a line.
      heartbeat = setInterval(() => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(': ping\n\n'));
        } catch {
          open = false;
        }
      }, HEARTBEAT_MS);
    },

    cancel() {
      unsubscribe?.();
      if (heartbeat !== undefined) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      // Nothing in front of this server buffers, but a proxy that appeared later would break the
      // feed silently, and this header is what tells it not to.
      'x-accel-buffering': 'no',
    },
  });
}
