import type { GenerationEvent } from './stream-protocol';

/**
 * The producer half of the heartbeat (round 5, Р-4; амендмент А-9).
 *
 * A generation stream is silent for long stretches that are not failures: a provider working through
 * its quota back-off ladder, a local model reading a 30 000-character prompt, a local model reasoning
 * before it writes its first word of prose. The reader cannot tell any of those from a socket whose
 * far end is gone, so it drops the connection at its idle deadline — and the M9п gate's Edit step
 * showed what that costs: six reconnects, an error card, and a refusal from the one-run-at-a-time
 * guard on a generation that was proceeding perfectly well.
 *
 * So the producer says so. Every stream wraps its `send` in one of these: real events reset the
 * silence timer, and each `intervalMs` without one emits a `heartbeat`. It is a **transport**
 * concern in the strictest sense — nothing here touches the durable chunk log, the attempt counter
 * or the sequence, so resume works out exactly as it did before this file existed (Р-2; D-95).
 *
 * `stop()` is not optional. The timer is what keeps the emitter alive, and a stream that closes
 * without stopping it leaves a timer writing into a controller nobody is reading.
 */

/** Silence a live producer is allowed before it has to prove it is still there. */
export const HEARTBEAT_INTERVAL_MS = 15_000;

/** Schedules `fn` after `ms` and returns the cancel for it. Injected so tests need no clock. */
export type Schedule = (fn: () => void, ms: number) => () => void;

const defaultSchedule: Schedule = (fn, ms) => {
  const handle = setTimeout(fn, ms);
  return () => {
    clearTimeout(handle);
  };
};

export interface Heartbeating {
  /** Sends an event and restarts the silence timer. Same signature as the `send` it wraps. */
  send: (event: GenerationEvent) => void;
  /** Stops beating. Idempotent, and mandatory when the stream closes. */
  stop: () => void;
}

export function withHeartbeat(
  emit: (event: GenerationEvent) => void,
  options: { intervalMs?: number; schedule?: Schedule } = {},
): Heartbeating {
  const intervalMs = options.intervalMs ?? HEARTBEAT_INTERVAL_MS;
  const schedule = options.schedule ?? defaultSchedule;

  let cancel: (() => void) | null = null;
  let stopped = false;

  const disarm = () => {
    cancel?.();
    cancel = null;
  };

  /*
   * A timer re-armed after each beat rather than a repeating interval: the property wanted here is
   * "no more than `intervalMs` of silence", which is measured from the last thing sent — and only a
   * timer that restarts with every send measures that.
   */
  const arm = () => {
    if (stopped) return;

    cancel = schedule(() => {
      cancel = null;
      emit({ type: 'heartbeat' });
      arm();
    }, intervalMs);
  };

  arm();

  return {
    send(event: GenerationEvent) {
      disarm();
      emit(event);
      arm();
    },

    stop() {
      stopped = true;
      disarm();
    },
  };
}
