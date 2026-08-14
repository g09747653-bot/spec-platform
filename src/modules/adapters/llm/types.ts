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
 * The three providers the constitution mandates, plus the deterministic double.
 *
 * `stub` is a provider in the same sense the others are — it implements the same interface and is
 * chosen the same way, by naming it in `LLM_PROVIDER_ORDER`. It is how IR-001-AC-5's "substitutable
 * with a test double that requires no network" holds for the running application and not merely for a
 * unit test (D-48). No deployment configures it.
 */
export type ProviderId = 'anthropic' | 'openai' | 'google' | 'stub';

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
 * Whether a provider error is an explicit "you are going too fast" (round 2, Д-5).
 *
 * Recognised structurally rather than by vendor: every SDK in the chain surfaces the HTTP status
 * somewhere on the error, and the two statuses that mean *retry later* are 429 and 503. The message
 * fallback catches the SDKs that stringify before they throw. Anything ambiguous reads as **not** a
 * rate limit, so an ordinary fault is never retried into a long wait.
 */
export function isRateLimited(error: unknown): boolean {
  const statuses = [429, 503];

  for (let current: unknown = error, depth = 0; current !== null && depth < 5; depth += 1) {
    if (typeof current !== 'object') break;

    const record = current as Record<string, unknown>;
    const status = record.status ?? record.statusCode;

    if (typeof status === 'number' && statuses.includes(status)) return true;

    if (
      typeof record.message === 'string' &&
      /\b(429|503)\b|rate.?limit|too many requests|overloaded|quota/i.test(record.message)
    ) {
      return true;
    }

    current = record.cause ?? null;
  }

  return false;
}
