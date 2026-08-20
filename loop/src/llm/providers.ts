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
              messages: [{ role: 'user', content: request.prompt }],
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
): LlmProvider {
  return {
    id,
    model,
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
                { role: 'user', content: request.prompt },
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
    async generate(request) {
      const reply = GoogleReply.parse(
        await call(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: request.prompt }] }],
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
          credentials.anthropicModel ?? 'claude-sonnet-4-5',
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
          credentials.openaiModel ?? 'gpt-4.1-mini',
          timeoutMs,
        ),
      );
    }

    if (id === 'google' && credentials.googleApiKey !== undefined) {
      built.push(
        google(credentials.googleApiKey, credentials.googleModel ?? 'gemini-2.5-flash', timeoutMs),
      );
    }

    if (id === 'ollama' && credentials.localApiBase !== undefined) {
      built.push(
        openAiCompatible(
          'ollama',
          credentials.localApiBase,
          undefined,
          credentials.localModel ?? 'qwen3:8b',
          timeoutMs,
        ),
      );
    }
  }

  return built;
}
