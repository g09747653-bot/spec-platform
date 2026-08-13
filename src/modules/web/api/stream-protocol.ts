import { z } from 'zod';

/**
 * The generation stream's wire format (task 45; solution.md — Streaming Protocol; constitution A5).
 *
 * Newline-delimited JSON over a single HTTP response. One event per line, each a self-describing
 * object, so a client that reconnects mid-line can discard the partial tail and lose nothing but that
 * line — which the durable chunk log will replay anyway.
 *
 * Both the `POST` generation stream and the `GET` resume stream speak this, and one client reads both
 * (D-8). `EventSource` is deliberately not used anywhere: it cannot issue `POST`, cannot set headers,
 * and reconnects on a policy of its own that resume cannot control.
 *
 * The schema is not decoration. Model-adjacent bytes crossing into the browser are a boundary like any
 * other, and the constitution requires boundaries to be parsed rather than trusted.
 */

export const GENERATION_STREAM_CONTENT_TYPE = 'application/x-ndjson';

const RunEvent = z.object({
  type: z.literal('run'),
  runId: z.string().min(1),
  stage: z.string().min(1),
  /**
   * Which attempt this stream is carrying.
   *
   * Sequences restart at zero on failover, so a sequence number alone does not identify a position in
   * a run — `(attempt, sequence)` does. A resuming client sends both back, which is how the server
   * can tell "you are behind" from "the text you were reading has been thrown away".
   */
  attempt: z.number().int().positive(),
});

const DeltaEvent = z.object({
  type: z.literal('delta'),
  sequence: z.number().int().min(0),
  text: z.string(),
});

const ResearchEvent = z.object({
  type: z.literal('research'),
  status: z.enum(['started', 'finished']),
});

const RestartEvent = z.object({
  type: z.literal('restart'),
  reason: z.literal('provider_failover'),
  /** The attempt now beginning. Everything rendered from earlier attempts is void. */
  attempt: z.number().int().positive(),
});

const CompleteEvent = z.object({
  type: z.literal('complete'),
  specFileId: z.string().min(1),
  revisionNumber: z.number().int().positive(),
});

const ErrorEvent = z.object({
  type: z.literal('error'),
  code: z.string().min(1),
  message: z.string().min(1),
  retryable: z.boolean(),
});

export const generationEventSchema = z.discriminatedUnion('type', [
  RunEvent,
  DeltaEvent,
  ResearchEvent,
  RestartEvent,
  CompleteEvent,
  ErrorEvent,
]);

export type GenerationEvent = z.infer<typeof generationEventSchema>;

export function encodeEvent(event: GenerationEvent): string {
  return `${JSON.stringify(event)}\n`;
}

/**
 * Splits a growing buffer into whole events, returning the unparsed remainder.
 *
 * The remainder matters: a chunk boundary lands wherever the network puts it, and half a JSON object
 * is not an event. Anything that fails to parse is dropped rather than thrown — a malformed line must
 * not take down a stream whose remaining events are fine, and the chunk log is what guarantees the
 * text itself is recoverable.
 */
export function decodeEvents(buffer: string): { events: GenerationEvent[]; rest: string } {
  const lines = buffer.split('\n');
  const rest = lines.pop() ?? '';
  const events: GenerationEvent[] = [];

  for (const line of lines) {
    if (line.trim() === '') continue;

    try {
      const parsed = generationEventSchema.safeParse(JSON.parse(line));
      if (parsed.success) events.push(parsed.data);
    } catch {
      // Not JSON at all. Same treatment: skip the line, keep the stream.
    }
  }

  return { events, rest };
}
