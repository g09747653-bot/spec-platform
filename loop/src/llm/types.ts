/**
 * The loop's model interface (task 156; зеркало D-229 и constitution P7).
 *
 * **No business logic in this package depends on a vendor.** The intake asks for text; which
 * provider answers is a line in `.env` and nothing else. A hard-coded `anthropic` here would be the
 * same defect the platform's constitution forbids in its own code, and the milestone's brief names
 * it outright: «захардкоженного anthropic не существует».
 *
 * The interface is deliberately one call. The loop asks a model for prose — the texts of handoff
 * assignments — and nothing else: no tools, no streaming, no conversation. A wider interface would
 * be an invitation to move a decision into the model, and in this package the decisions belong to
 * code (which tasks depend on which, when a task is done, what the gate says).
 */

export const LLM_PROVIDERS = ['anthropic', 'openai', 'google', 'ollama', 'claude-cli'] as const;

export type LlmProviderId = (typeof LLM_PROVIDERS)[number];

export interface LlmRequest {
  /** The instruction, whole. */
  prompt: string;
  /** What the model is, before the instruction. */
  system?: string;
  maxOutputTokens?: number;
  signal?: AbortSignal;
}

export interface LlmProvider {
  readonly id: LlmProviderId;
  readonly model: string;
  generate(request: LlmRequest): Promise<string>;
}

/** Every configured provider refused. Carries the count, never a vendor payload. */
export class AllProvidersFailedError extends Error {
  readonly attempts: number;

  constructor(attempts: number, cause?: unknown) {
    super(`ни один из ${String(attempts)} настроенных провайдеров не ответил`);
    this.name = 'AllProvidersFailedError';
    this.attempts = attempts;
    this.cause = cause;
  }
}

/** No provider is configured at all — a different situation from «all of them failed». */
export class NoProviderConfiguredError extends Error {
  constructor() {
    super(
      'ни один LLM-провайдер не настроен: задайте LOOP_PROVIDER_ORDER и ключ хотя бы одного из них',
    );
    this.name = 'NoProviderConfiguredError';
  }
}
