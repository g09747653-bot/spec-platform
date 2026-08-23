import { z } from 'zod';

import type { LlmProvider, LlmProviderId, LlmRequest } from './types.ts';

/**
 * The provider adapters (task 156; constitution P7 carried into the loop).
 *
 * Four small `fetch` calls, one per vendor, each parsing its own reply shape with Zod and handing
 * back a string. No SDK, because an SDK is a dependency whose upgrade cadence and whose response
 * type would reach the intake — and the intake is supposed to know nothing about vendors at all.
 *
 * Everything vendor-specific — the URL, the headers, the request shape, the reply shape — is inside
 * one function per provider and nowhere else. That is the whole point of the file.
 */

const DEFAULT_TIMEOUT_MS = 120_000;

/**
 * The model each vendor answers with when the configuration names none (task 172).
 *
 * **Defaults are load-bearing and they rot.** `gemini-2.5-flash` stood here until the M15а gate
 * measured it on a clean machine: 404, «no longer available to new users», with the vendor naming
 * `gemini-3.6-flash` as its successor. The walk survived by overriding the model in `.env` — which
 * means the mine stayed armed for the next machine that had no override, and «works here» is exactly
 * the property a default must not have.
 *
 * The replacement is `gemini-3.5-flash` rather than the successor the 404 named, and the platform's
 * own `adapters/llm/providers.ts` is why: probing the same account, `3.6-flash` is the newest that
 * answers and also the one that *sometimes* does not — «currently experiencing high demand» on one
 * probe, and past the per-provider timeout on a live generation — while `3.5-flash` completed every
 * attempt. Two packages on one machine now name one model, which is one fact to re-measure instead
 * of two to keep in step.
 *
 * They are together, and named, so that checking them is one act rather than four greps. Every one
 * is overridden by its `LOOP_*_MODEL` variable; nothing downstream may hard-code a model id.
 */
export const DEFAULT_MODELS = {
  anthropic: 'claude-sonnet-4-5',
  openai: 'gpt-4.1-mini',
  google: 'gemini-3.5-flash',
  ollama: 'qwen3:8b',
  /* Мост игнорирует поле model — какая модель отвечает, решает CLI подписки; имя тут — честный
   * ярлык для журналов, не выбор (задача 175). */
  'claude-cli': 'claude-subscription-bridge',
} as const;

export interface ProviderCredentials {
  anthropicApiKey?: string | undefined;
  anthropicModel?: string | undefined;
  openaiApiKey?: string | undefined;
  openaiModel?: string | undefined;
  googleApiKey?: string | undefined;
  googleModel?: string | undefined;
  /** OpenAI-compatible local endpoint (Ollama). Its presence is what configures the provider. */
  localApiBase?: string | undefined;
  localModel?: string | undefined;
  /**
   * The subscription bridge — the repo's own OpenAI-compatible server over Claude Code CLI
   * (task 175). A separate link rather than a second use of `ollama`, so a log line naming the
   * provider names the budget it spends: «ollama» is the local card, «claude-cli» is the plan.
   */
  claudeCliApiBase?: string | undefined;
  timeoutMs?: number | undefined;
}

async function call(
  url: string,
  init: RequestInit,
  request: LlmRequest,
  timeoutMs: number,
): Promise<unknown> {
  const abort = new AbortController();
  const timer = setTimeout(() => {
    abort.abort();
  }, timeoutMs);
  request.signal?.addEventListener('abort', () => {
    abort.abort();
  });

  try {
    const response = await fetch(url, { ...init, signal: abort.signal });
    const text = await response.text();

    if (!response.ok) {
      // The status and nothing else: a vendor's error body can carry account details.
      throw new Error(`провайдер ответил ${String(response.status)}`);
    }

    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

const AnthropicReply = z.object({
  content: z.array(z.object({ type: z.string(), text: z.string().optional() })),
});

const OpenAiReply = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string().nullable() }) })),
});

const GoogleReply = z.object({
  candidates: z.array(
    z.object({ content: z.object({ parts: z.array(z.object({ text: z.string().optional() })) }) }),
  ),
});

function anthropic(key: string, model: string, timeoutMs: number): LlmProvider {
  return {
    id: 'anthropic',
    model,
    supportsImages: true,
    async generate(request) {
      const reply = AnthropicReply.parse(
        await call(
          'https://api.anthropic.com/v1/messages',
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-api-key': key,
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
              model,
              max_tokens: request.maxOutputTokens ?? 4096,
              ...(request.system === undefined ? {} : { system: request.system }),
              messages: [
                {
                  role: 'user',
                  content: [
                    ...(request.images ?? []).flatMap((image) => [
                      ...(image.label === undefined ? [] : [{ type: 'text', text: image.label }]),
                      {
                        type: 'image',
                        source: { type: 'base64', media_type: image.mediaType, data: image.data },
                      },
                    ]),
                    { type: 'text', text: request.prompt },
                  ],
                },
              ],
            }),
          },
          request,
          timeoutMs,
        ),
      );

      return reply.content
        .filter((block) => block.type === 'text')
        .map((block) => block.text ?? '')
        .join('');
    },
  };
}

/** OpenAI's chat completions, and every service that speaks its shape — Ollama included. */
function openAiCompatible(
  id: LlmProviderId,
  baseUrl: string,
  key: string | undefined,
  model: string,
  timeoutMs: number,
  supportsImages = false,
): LlmProvider {
  return {
    id,
    model,
    supportsImages,
    async generate(request) {
      const reply = OpenAiReply.parse(
        await call(
          `${baseUrl.replace(/\/$/, '')}/chat/completions`,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              ...(key === undefined ? {} : { authorization: `Bearer ${key}` }),
            },
            body: JSON.stringify({
              model,
              max_completion_tokens: request.maxOutputTokens ?? 4096,
              messages: [
                ...(request.system === undefined
                  ? []
                  : [{ role: 'system', content: request.system }]),
                {
                  role: 'user',
                  content:
                    request.images === undefined || request.images.length === 0
                      ? request.prompt
                      : [
                          ...request.images.flatMap((image) => [
                            ...(image.label === undefined
                              ? []
                              : [{ type: 'text', text: image.label }]),
                            {
                              type: 'image_url',
                              image_url: { url: `data:${image.mediaType};base64,${image.data}` },
                            },
                          ]),
                          { type: 'text', text: request.prompt },
                        ],
                },
              ],
            }),
          },
          request,
          timeoutMs,
        ),
      );

      return reply.choices[0]?.message.content ?? '';
    },
  };
}

function google(key: string, model: string, timeoutMs: number): LlmProvider {
  return {
    id: 'google',
    model,
    supportsImages: true,
    async generate(request) {
      const reply = GoogleReply.parse(
        await call(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
            body: JSON.stringify({
              contents: [
                {
                  role: 'user',
                  parts: [
                    ...(request.images ?? []).flatMap((image) => [
                      ...(image.label === undefined ? [] : [{ text: image.label }]),
                      { inline_data: { mime_type: image.mediaType, data: image.data } },
                    ]),
                    { text: request.prompt },
                  ],
                },
              ],
              ...(request.system === undefined
                ? {}
                : { systemInstruction: { parts: [{ text: request.system }] } }),
              generationConfig: { maxOutputTokens: request.maxOutputTokens ?? 4096 },
            }),
          },
          request,
          timeoutMs,
        ),
      );

      return (reply.candidates[0]?.content.parts ?? []).map((part) => part.text ?? '').join('');
    },
  };
}

/**
 * The providers this configuration can actually reach, in the order asked for.
 *
 * A provider named in the order but missing its credential is **skipped, not fatal**: the loop's
 * environment is deliberately tolerant of an unconfigured integration (task 152), and the chain's
 * job is to answer, not to audit the `.env`. What is fatal is an order that leaves nothing at all,
 * and that is `NoProviderConfiguredError`, raised by the caller.
 */
export function buildProviders(
  order: readonly LlmProviderId[],
  credentials: ProviderCredentials,
): LlmProvider[] {
  const timeoutMs = credentials.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const built: LlmProvider[] = [];

  for (const id of order) {
    if (id === 'anthropic' && credentials.anthropicApiKey !== undefined) {
      built.push(
        anthropic(
          credentials.anthropicApiKey,
          credentials.anthropicModel ?? DEFAULT_MODELS.anthropic,
          timeoutMs,
        ),
      );
    }

    if (id === 'openai' && credentials.openaiApiKey !== undefined) {
      built.push(
        openAiCompatible(
          'openai',
          'https://api.openai.com/v1',
          credentials.openaiApiKey,
          credentials.openaiModel ?? DEFAULT_MODELS.openai,
          timeoutMs,
          true,
        ),
      );
    }

    if (id === 'google' && credentials.googleApiKey !== undefined) {
      built.push(
        google(
          credentials.googleApiKey,
          credentials.googleModel ?? DEFAULT_MODELS.google,
          timeoutMs,
        ),
      );
    }

    if (id === 'ollama' && credentials.localApiBase !== undefined) {
      built.push(
        openAiCompatible(
          'ollama',
          credentials.localApiBase,
          undefined,
          credentials.localModel ?? DEFAULT_MODELS.ollama,
          timeoutMs,
        ),
      );
    }

    if (id === 'claude-cli' && credentials.claudeCliApiBase !== undefined) {
      /*
       * Мост подписки картинок не носит, и это измерено, а не предположено: зонд 2026-08-23 послал
       * ему PNG сплошного цвета в теле запроса и получил честное `{"seen":false}`. Причин две, и обе
       * в его собственном устройстве — схема сообщения оставляет от `content` только текст, а CLI за
       * ним работает с `--tools ''` и файлов не читает. Ставить тут `true` значило бы получать
       * уверенные вердикты о кадрах, которых звено не видело.
       */
      built.push(
        openAiCompatible(
          'claude-cli',
          credentials.claudeCliApiBase,
          undefined,
          DEFAULT_MODELS['claude-cli'],
          timeoutMs,
        ),
      );
    }
  }

  return built;
}
