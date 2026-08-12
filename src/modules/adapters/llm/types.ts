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

/** The three providers the constitution mandates, in configuration order. */
export type ProviderId = 'anthropic' | 'openai' | 'google';

/** A conversation turn. Deliberately minimal — the shape every provider can express. */
export interface ModelMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GenerateOptions {
  messages: readonly ModelMessage[];
  /** Correlates the call with its `generation_runs` row; used by the durable chunk log (task 45). */
  runId: string;
  /** Called for every incremental piece of text, in order (A5; FR-008 AC-2). */
  onChunk?: (text: string) => void;
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

  constructor(attempts: number) {
    super('Generation failed: no configured provider could complete the request.');
    this.name = 'AllProvidersFailedError';
    this.attempts = attempts;
  }
}
