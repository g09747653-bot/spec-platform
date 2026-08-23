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

/**
 * Одно изображение во входе запроса (А-35 п.2б).
 *
 * Картинка приходит уже прочитанной — base64 без префикса `data:` — потому что путь на диске
 * значил бы, что провайдер умеет читать файлы этой машины, а он умеет только принимать байты.
 */
export interface LlmImage {
  /** `image/png`, `image/jpeg`, `image/webp`. */
  mediaType: string;
  data: string;
  /** Чем эта картинка является для судьи — подпись уходит в промпт рядом с ней. */
  label?: string;
}

export interface LlmRequest {
  /** The instruction, whole. */
  prompt: string;
  /** What the model is, before the instruction. */
  system?: string;
  maxOutputTokens?: number;
  signal?: AbortSignal;
  /**
   * Глаза суда качества: скриншоты, которые модель обязана посмотреть, а не вообразить.
   * Звенья без образного входа при таком запросе пропускаются цепочкой, а не портят вердикт.
   */
  images?: readonly LlmImage[];
}

export interface LlmProvider {
  readonly id: LlmProviderId;
  readonly model: string;
  /**
   * Принимает ли звено изображения. Свойство адаптера, а не догадка вызывающего: способность
   * видеть — вендорское знание, и жить оно обязано там же, где URL и форма запроса.
   */
  readonly supportsImages: boolean;
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

/** Ни одно из настроенных звеньев не умеет смотреть — суд с глазами не состоится. */
export class NoVisionProviderError extends Error {
  constructor(configured: number) {
    super(
      `ни одно из ${String(configured)} настроенных звеньев не принимает изображения: ` +
        'суду качества нечем смотреть',
    );
    this.name = 'NoVisionProviderError';
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
