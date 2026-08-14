/**
 * The one interface all model interaction passes through (constitution A3, P7; IR-001).
 *
 * No provider-specific shape appears here, which is what makes the abstraction real rather than
 * nominal: business logic that compiles against this cannot depend on a vendor's response format, and
 * a test double (task 18) is substitutable for the real thing with no network at all (IR-001-AC-5).
 *
 * Failover across providers is a property of the implementation, never of the caller (A3): a caller
 * asks for generation and learns afterwards which provider served it.
 */

/**
 * The three providers the constitution mandates, a local one, and the deterministic double.
 *
 * `stub` is a provider in the same sense the others are — it implements the same interface and is
 * chosen the same way, by naming it in `LLM_PROVIDER_ORDER`. It is how IR-001-AC-5's "substitutable
 * with a test double that requires no network" holds for the running application and not merely for a
 * unit test (D-48). No deployment configures it.
 *
 * `ollama` is a fourth *adapter*, not a fourth mandated integration (D-90). The constitution's
 * Integration Points table names Anthropic, OpenAI and Google, and all three remain integrated and
 * unchanged; this one exists so a development machine and the milestone gate keep working when a
 * funded provider's daily quota is spent. It is unreachable from a deployment by construction —
 * `localhost` is not a thing Vercel can dial — so the production chain is unaffected.
 *
 * P7 is what makes adding it cheap: nothing above the adapter boundary learns that a fifth name
 * exists, because no business logic names a provider at all.
 */
export type ProviderId = 'anthropic' | 'openai' | 'google' | 'ollama' | 'stub';

/** A conversation turn. Deliberately minimal — the shape every provider can express. */
export interface ModelMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * A tool a model may call, described without reference to any vendor's tool format.
 *
 * The parameter schema is JSON Schema — the one shape every provider accepts — so a tool definition
 * crosses the adapter boundary as data. The research tool of FR-019 is the first consumer (task 68).
 */
export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON Schema for the tool's arguments. */
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<string>;
}

/** A generation attempt is starting. Attempts after the first mean the previous one was abandoned. */
export interface AttemptStart {
  /** 1-based: the position in the configured chain being tried. */
  attempt: number;
  provider: ProviderId;
  /**
   * True when the attempt being abandoned had already streamed text.
   *
   * The caller must discard it: output from two providers is never concatenated, and partial output
   * is never persisted (FR-018 AC-5; D-9). This is what raises the `restart` event.
   */
  discardsPreviousOutput: boolean;
}

export interface GenerateOptions {
  messages: readonly ModelMessage[];
  /** Correlates the call with its `generation_runs` row; used by the durable chunk log (task 44). */
  runId: string;
  /** Tools the model may call during generation. */
  tools?: readonly ToolDefinition[];
  /** Called for every incremental piece of text, in order (A5; FR-008 AC-2). */
  onChunk?: (text: string) => void;
  /** Called as each attempt begins, including the first — the restart signal of D-9. */
  onAttempt?: (start: AttemptStart) => void;
  /** Cooperative cancellation, so a disconnected client does not keep a provider call alive. */
  signal?: AbortSignal;
}

export interface GenerateResult {
  text: string;
  providerUsed: ProviderId;
  /** How many providers were tried, including the successful one (IR-001-AC-2). */
  attempts: number;
}

export interface LlmAdapter {
  /** Streams a completion, resolving with the whole text once the stream ends. */
  generateStreaming(options: GenerateOptions): Promise<GenerateResult>;
}

/**
 * Raised when every configured provider has failed (FR-018 AC-2).
 *
 * Carries no provider payload: the message a user sees must not leak vendor names or raw responses
 * (FR-018 AC-7), and Sentry gets the stage and run id instead (NFR-010).
 */
export class AllProvidersFailedError extends Error {
  readonly attempts: number;
  /**
   * Whether the chain was exhausted by **rate limiting** rather than by faults (round 2, Д-5).
   *
   * The distinction is the user's, not the operator's: "something went wrong" and "the service is
   * busy, try in a minute" call for different behaviour from the person reading them, and the M6
   * gate walk hit the second while being told the first. It carries no vendor name and no payload —
   * only which of two things happened (FR-018 AC-7).
   */
  readonly overloaded: boolean;

  constructor(attempts: number, overloaded = false) {
    super(
      overloaded
        ? 'Generation did not complete: the service is busy right now.'
        : 'Generation failed: no configured provider could complete the request.',
    );
    this.name = 'AllProvidersFailedError';
    this.attempts = attempts;
    this.overloaded = overloaded;
  }
}

/**
 * Whether a provider error means "come back in a moment" (round 2, Д-5).
 *
 * Recognised structurally rather than by vendor: 429 and 503 are the two statuses that mean *retry
 * later*, and every SDK in the chain puts the status somewhere on the error.
 *
 * **The shapes below are the ones production actually throws**, captured from a live call during the
 * gate remediation rather than guessed:
 *
 * ```
 * name: AI_APICallError
 * message: This model is currently experiencing high demand. Spikes in demand are usually
 *          temporary. Please try again later.
 * statusCode: 503
 * isRetryable: true
 * ```
 *
 * and, once the AI SDK has exhausted its own internal retries, that error wrapped in an
 * `AI_RetryError` — which carries `lastError` and `errors`, **not** `cause`. A walker that followed
 * only `cause` would have missed every real occurrence, which is precisely the sort of detector that
 * passes its unit tests and never fires.
 *
 * Note the message wording: "high demand", not "rate limit". Matching on vocabulary alone would have
 * missed it too; the status is what makes this reliable, and the phrases are the belt to that braces.
 *
 * Anything ambiguous reads as **not** a rate limit. A false positive costs the user seven seconds of
 * waiting before an error they were going to get anyway, and tells them to retry when retrying
 * cannot help.
 */
const RETRY_LATER_STATUSES = [429, 503];

const RETRY_LATER_MESSAGE =
  /\b(429|503)\b|rate.?limit|too many requests|overloaded|quota|high demand|try again later|temporarily unavailable/i;

/** Walks an error and everything it wraps, once each, cycles included. */
function* chainOf(error: unknown): Generator<Record<string, unknown>> {
  const seen = new Set<unknown>();
  const queue: unknown[] = [error];

  while (queue.length > 0) {
    const current = queue.shift();

    if (typeof current !== 'object' || current === null || seen.has(current)) continue;
    seen.add(current);

    const record = current as Record<string, unknown>;
    yield record;

    // `cause` is the standard chain; `lastError` and `errors` are how the AI SDK's RetryError wraps.
    queue.push(record.cause, record.lastError);
    if (Array.isArray(record.errors)) queue.push(...(record.errors as unknown[]));
  }
}

export function isRateLimited(error: unknown): boolean {
  for (const record of chainOf(error)) {
    const status = record.statusCode ?? record.status;

    if (typeof status === 'number' && RETRY_LATER_STATUSES.includes(status)) return true;
    if (typeof record.message === 'string' && RETRY_LATER_MESSAGE.test(record.message)) return true;
  }

  return false;
}

/** `Please retry in 31.550265287s` — the provider stating how long its own bucket needs. */
const RETRY_HINT = /retry in ([\d.]+)\s*s/i;

/**
 * How long the provider asked us to wait, in milliseconds, or `null` if it did not say.
 *
 * Worth honouring rather than guessing at: the live diagnosis behind Д-5 found Google answering a
 * free-tier overrun with "limit: 20" per minute and an explicit `Please retry in 31.550265287s`. A
 * fixed ladder of one, two and four seconds would have retried three times inside a window the
 * provider had already told us was thirty seconds wide, and then reported failure — busier, slower,
 * and wrong.
 *
 * A `Retry-After` header is checked too, since that is the standard spelling of the same fact.
 */
export function retryAfterMs(error: unknown): number | null {
  for (const record of chainOf(error)) {
    if (typeof record.message === 'string') {
      const match = RETRY_HINT.exec(record.message);
      const seconds = match?.[1];

      if (seconds !== undefined) return Math.ceil(Number(seconds) * 1000);
    }

    const headers = record.responseHeaders;

    if (typeof headers === 'object' && headers !== null) {
      const after = (headers as Record<string, unknown>)['retry-after'];

      if (typeof after === 'string' && /^\d+$/.test(after)) return Number(after) * 1000;
    }
  }

  return null;
}
