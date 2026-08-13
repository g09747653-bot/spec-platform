import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { jsonSchema, streamText, tool, type ToolSet } from 'ai';

import type { ModelMessage, ProviderId, ToolDefinition } from './types';

/**
 * The vendor edge (task 42; constitution P7, A3; D-6).
 *
 * This is the only file in the repository that imports an AI SDK package, and lint enforces that
 * (`eslint.restricted-imports.js`). Everything above it — the failover chain, the agents, the route
 * handlers — sees `ProviderStream`, a function from messages to text deltas, which mentions no vendor
 * type at all. Swapping a provider, or the SDK itself, is a change confined to this file.
 *
 * The SDK is used for **normalisation and streaming only**. Failover is ours (D-6): it has our
 * semantics for a mid-stream failure, and it must be deterministically testable, which a vendor's
 * retry policy is not.
 */

/**
 * What the layers above call. Resolves with the complete text; rejects if the provider fails at any
 * point, including mid-stream.
 */
export type ProviderStream = (input: ProviderStreamInput) => Promise<string>;

export interface ProviderStreamInput {
  messages: readonly ModelMessage[];
  /** Tools the model may call, described in JSON Schema rather than any vendor's format. */
  tools?: readonly ToolDefinition[];
  /** Called for each incremental piece of text, in order. */
  onDelta: (text: string) => void;
  /** Cancels the provider call when the caller gives up — a timeout, or a disconnected client. */
  signal?: AbortSignal;
}

/**
 * Maps our provider-neutral tool definitions onto the SDK's tool set.
 *
 * A pure function, and exported for its own test: it is the one place a vendor-shaped object is built
 * from our data, and it is testable without a network call, which the surrounding stream is not.
 */
export function toSdkTools(tools: readonly ToolDefinition[] | undefined): ToolSet | undefined {
  if (tools === undefined || tools.length === 0) return undefined;

  const set: ToolSet = {};

  for (const definition of tools) {
    set[definition.name] = tool({
      description: definition.description,
      inputSchema: jsonSchema<Record<string, unknown>>(definition.parameters),
      execute: (args: Record<string, unknown>) => definition.execute(args),
    });
  }

  return set;
}

/**
 * The model each provider generates with.
 *
 * Constants rather than configuration: the Configuration table of `.specs/solution.md` is the
 * authoritative variable list, and it names the chain and the timeout, not the model. Changing one of
 * these is a one-line, reviewed edit (D-45).
 *
 * Pinned, never a floating alias. `gemini-flash-latest` also works on this account, but an alias
 * changes the model under a deployment with no diff and no review — and the bundle is the product
 * (constitution P4), so which model wrote it is not a detail.
 *
 * The Google id was chosen by probing the funded account, and then re-chosen after the live smoke:
 * `gemini-2.5-flash` and `gemini-2.5-pro` are closed to new users, `gemini-pro-latest` is outside the
 * free tier's quota, and `gemini-3.6-flash` — the newest that answered — turned out to be the one that
 * *sometimes* does not: it returned "this model is currently experiencing high demand" on one probe
 * and exceeded the 60-second per-provider timeout on a live generation. `gemini-3.5-flash` completed
 * every attempt, so it is the default. Availability beats novelty for the model that writes the
 * product (D-45).
 *
 * Anthropic's and OpenAI's ids come from their SDK's own model-id union and are **unverified against a
 * live account**, because neither provider is funded.
 */
export const DEFAULT_MODELS: Readonly<Record<ProviderId, string>> = Object.freeze({
  anthropic: 'claude-sonnet-5',
  openai: 'gpt-5.2',
  google: 'gemini-3.5-flash',
  stub: 'deterministic-stub',
});

/**
 * A provider failed. Carries no vendor payload beyond a short cause for the server log — user-facing
 * text is assembled by the failover client, which strips provider identity entirely (FR-018 AC-7).
 */
export class ProviderCallError extends Error {
  readonly provider: ProviderId;

  constructor(provider: ProviderId, cause: unknown) {
    super(`Provider ${provider} did not complete the request.`);
    this.name = 'ProviderCallError';
    this.provider = provider;
    this.cause = cause;
  }
}

/**
 * Splits our flat message list into the SDK's `system` string and its conversation turns.
 *
 * Exported for its own test: losing a system message here would silently drop the instruction that
 * carries the required section list, and the symptom would be a structural validation failure three
 * layers away.
 */
export function splitMessages(messages: readonly ModelMessage[]): {
  system: string | undefined;
  turns: { role: 'user' | 'assistant'; content: string }[];
} {
  const systemParts: string[] = [];
  const turns: { role: 'user' | 'assistant'; content: string }[] = [];

  for (const message of messages) {
    if (message.role === 'system') systemParts.push(message.content);
    else turns.push({ role: message.role, content: message.content });
  }

  return {
    system: systemParts.length > 0 ? systemParts.join('\n\n') : undefined,
    turns,
  };
}

function languageModel(provider: ProviderId, apiKey: string, model: string) {
  if (provider === 'anthropic') return createAnthropic({ apiKey })(model);
  if (provider === 'openai') return createOpenAI({ apiKey })(model);
  return createGoogleGenerativeAI({ apiKey })(model);
}

/**
 * Builds the streaming call for one provider.
 *
 * Two details here are load-bearing and easy to get wrong:
 *
 * 1. **The full stream, not `textStream`.** The SDK's `textStream` documents that "error parts are not
 *    surfaced"; a provider dying mid-generation would end that iterator quietly and look exactly like
 *    a short but successful answer. Consuming `stream` and throwing on an `error` part is what makes
 *    a mid-stream failure a failure — which is the precondition for D-9's discard-and-restart.
 * 2. **`maxRetries: 0`.** The chain is our retry mechanism, with our timeout budget per provider
 *    (NFR-004). Leaving the SDK's own retries on would spend that budget invisibly and make the
 *    failover tests non-deterministic.
 */
export function createProviderStream(
  provider: ProviderId,
  apiKey: string,
  model: string,
): ProviderStream {
  return async ({ messages, tools, onDelta, signal }) => {
    const { system, turns } = splitMessages(messages);
    const toolSet = toSdkTools(tools);

    try {
      const result = streamText({
        model: languageModel(provider, apiKey, model),
        ...(system === undefined ? {} : { system }),
        ...(toolSet === undefined ? {} : { tools: toolSet }),
        messages: turns,
        abortSignal: signal,
        maxRetries: 0,
      });

      let text = '';

      for await (const part of result.stream) {
        if (part.type === 'text-delta') {
          text += part.text;
          onDelta(part.text);
          continue;
        }

        if (part.type === 'error') throw new ProviderCallError(provider, part.error);
        if (part.type === 'abort') throw new ProviderCallError(provider, 'aborted');
      }

      return text;
    } catch (cause) {
      if (cause instanceof ProviderCallError) throw cause;
      throw new ProviderCallError(provider, cause);
    }
  };
}
