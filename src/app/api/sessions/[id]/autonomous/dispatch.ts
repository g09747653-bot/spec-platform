import { decodeEvents, type GenerationEvent } from '@/modules/web/api/stream-protocol';

import { POST as decideReview } from '../../../reviews/[id]/decision/route';
import { POST as decideSpec } from '../../../specs/[specFileId]/decision/route';
import { POST as submitAnswers } from '../answers/route';
import { POST as startGeneration } from '../generate/route';
import { POST as askRound } from '../rounds/route';
import { POST as requestTransition } from '../transition/route';
import { GET as resumeGeneration } from '../../../generations/[runId]/stream/route';

/**
 * The driver pressing the buttons (task 145; the Architect's «драйвер обязан ходить теми же
 * эндпоинтами, что и кнопки»).
 *
 * Every move below calls the **same route handler** the corresponding control calls, with the same
 * body, through a real `Request` — the pattern `messages/route.ts` established for typed decisions
 * (D-107) and for the same reason it gives: anything cheaper, reaching past the handler into a
 * service, would be a second path that could drift from the first, and «the driver produces the same
 * persisted state as a person» would become a promise instead of a consequence. There is no
 * driver-only write anywhere in this file, no new transition, no gate skipped and no budget
 * relaxed — a refusal is simply a refusal, exactly as it would be under a click.
 *
 * **Authentication is ambient, not carried.** `currentOwnerScope()` resolves through Auth.js, which
 * reads the cookie from Next's per-request context rather than from the `Request` object it is
 * handed. That is why the driver lives in a route handler and not in a job runner: it borrows the
 * request scope of the tick that called it, so the endpoints it presses see exactly the user whose
 * browser is watching, and a driver executing outside a session's own request would authenticate as
 * nobody. What a desktop or headless runner would still need is named in the report.
 */
export interface DispatchOutcome {
  /** True when the move landed. */
  ok: boolean;
  /** The endpoint's own error code, when it refused. */
  code: string | null;
  /** Whether the refusal is worth another tick rather than an ending (a lost race, never a gate). */
  retryable: boolean;
}

const LANDED: DispatchOutcome = { ok: true, code: null, retryable: false };

/** A refusal is read from `{ error: { code } }` — the one shape every handler answers with. */
async function refusalOf(response: Response): Promise<DispatchOutcome> {
  const payload: unknown = await response.json().catch(() => null);
  const code =
    typeof payload === 'object' &&
    payload !== null &&
    'error' in payload &&
    typeof payload.error === 'object' &&
    payload.error !== null &&
    'code' in payload.error &&
    typeof payload.error.code === 'string'
      ? payload.error.code
      : null;

  /*
   * `CONFLICT` is the only code that means «read again», and it means it precisely: every handler
   * returns it when an optimistic-concurrency guard lost, which is a race and not a verdict. Every
   * other 409 in the table — GATE_REJECTED, ROUND_LIMIT_REACHED, PENDING_DECISION — is the machine
   * saying no, and retrying it would be the driver arguing with a gate.
   */
  return { ok: false, code, retryable: code === 'CONFLICT' };
}

export function jsonRequest(url: string, body?: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

export async function dispatchAskRound(
  origin: string,
  sessionId: string,
): Promise<DispatchOutcome> {
  const response = await askRound(jsonRequest(`${origin}/api/sessions/${sessionId}/rounds`), {
    params: Promise.resolve({ id: sessionId }),
  });

  return response.ok ? LANDED : refusalOf(response);
}

export async function dispatchAnswers(
  origin: string,
  sessionId: string,
  body: unknown,
): Promise<DispatchOutcome> {
  const response = await submitAnswers(
    jsonRequest(`${origin}/api/sessions/${sessionId}/answers`, body),
    { params: Promise.resolve({ id: sessionId }) },
  );

  return response.ok ? LANDED : refusalOf(response);
}

export async function dispatchTransition(
  origin: string,
  sessionId: string,
  toStage: string,
  toSubstage: string | null,
): Promise<DispatchOutcome> {
  const response = await requestTransition(
    jsonRequest(`${origin}/api/sessions/${sessionId}/transition`, {
      toStage,
      ...(toSubstage === null ? {} : { toSubstage }),
    }),
    { params: Promise.resolve({ id: sessionId }) },
  );

  return response.ok ? LANDED : refusalOf(response);
}

export async function dispatchApprove(
  origin: string,
  specFileId: string,
  revisionNumber: number,
): Promise<DispatchOutcome> {
  const response = await decideSpec(
    jsonRequest(`${origin}/api/specs/${specFileId}/decision`, {
      decision: 'approve',
      revisionNumber,
    }),
    { params: Promise.resolve({ specFileId }) },
  );

  return response.ok ? LANDED : refusalOf(response);
}

export async function dispatchReviewDecision(
  origin: string,
  reviewId: string,
  decision: 'accept' | 'request_changes',
  selectedItemIds: readonly string[],
): Promise<DispatchOutcome> {
  const response = await decideReview(
    jsonRequest(`${origin}/api/reviews/${reviewId}/decision`, {
      decision,
      selectedItemIds: [...selectedItemIds],
    }),
    { params: Promise.resolve({ id: reviewId }) },
  );

  return response.ok ? LANDED : refusalOf(response);
}

/**
 * Reads a generation stream to its end and reports how it finished.
 *
 * Draining is not optional and the reason is in `generate/route.ts`: `cancel()` on that body is
 * deliberately empty, so abandoning the reader does not stop the run — it leaves it `running`, and
 * the one-run-per-session guard then refuses every later generation for this session until it ends
 * on its own. A driver that fired and forgot would deadlock its own next move.
 *
 * The status code says almost nothing here. Once the stream opens, every outcome including total
 * provider failure is an `error` event on a 200, so the ending has to be read out of the events
 * themselves. `GENERATION_IN_FLIGHT` is the one error worth another tick: it means another reader
 * got there first, which the next step resolves by draining that run instead.
 */
async function drain(response: Response): Promise<DispatchOutcome> {
  if (!response.ok) return refusalOf(response);
  if (response.body === null) return { ok: false, code: 'NO_STREAM', retryable: false };

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let last: GenerationEvent | null = null;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const decoded = decodeEvents(buffer);
    buffer = decoded.rest;
    for (const event of decoded.events) {
      if (event.type === 'complete' || event.type === 'error') last = event;
    }
  }

  if (last === null) return { ok: false, code: 'STREAM_ENDED_SILENTLY', retryable: true };
  if (last.type === 'complete') return LANDED;

  return {
    ok: false,
    code: last.code,
    retryable: last.code === 'GENERATION_IN_FLIGHT',
  };
}

export async function dispatchGenerate(
  origin: string,
  sessionId: string,
): Promise<DispatchOutcome> {
  const response = await startGeneration(
    jsonRequest(`${origin}/api/sessions/${sessionId}/generate`),
    { params: Promise.resolve({ id: sessionId }) },
  );

  return drain(response);
}

/**
 * Attaches to a run this session already has in flight — the resume endpoint the browser uses.
 *
 * `from=0` because the driver has rendered nothing and needs only the ending; the durable chunk log
 * makes replaying from the start free of consequence (the reader's de-duplication is the client's
 * problem, and this reader has no state to de-duplicate against).
 */
export async function dispatchAwaitGeneration(
  origin: string,
  runId: string,
): Promise<DispatchOutcome> {
  const response = await resumeGeneration(
    new Request(`${origin}/api/generations/${runId}/stream?from=0`),
    { params: Promise.resolve({ runId }) },
  );

  return drain(response);
}
