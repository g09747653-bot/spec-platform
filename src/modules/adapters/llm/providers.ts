import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { jsonSchema, streamText, tool, type ToolSet } from 'ai';

import { generationAllowance } from './capacity';
import type { ModelMessage, ProviderCapacity, ProviderId, ToolDefinition } from './types';

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
 *
 * The Ollama id was chosen the same way the Google one was — by measuring the installed candidates on
 * this repository's own `spec.generation.v2` prompt rather than by reputation (D-91). Of the models
 * present, `qwen2.5:14b-instruct` was the only one that both produced the nine required constitution
 * headings in order *and* finished inside the per-provider timeout: `qwen3:14b` reasons for 45 seconds
 * before its first token and takes 97 in total, which `LLM_REQUEST_TIMEOUT_MS` would abort, and
 * `qwen3.5:9b` spent 114 seconds reasoning without emitting a single content token. A model that
 * cannot answer inside the budget is not a slower provider, it is a failing one.
 *
 * **Re-measured for the M9п gate (round 3, D-144), by the same method and on the same machine.** The
 * customer's choice, `qwen3.8:27b`, writes a conformant SpecKit constitution but needs 474 s for it —
 * 16.8 GB of weights do not fit 16 GiB of VRAM, and a third of the model runs on the CPU. That is
 * past the 300 s per-provider budget, so the documented fallback applies: `qwen3:14b`, which is
 * conformant on the same prompt in 32.4 s and stays wholly on the GPU. D-91's objection to it was the
 * 60-second timeout of its day; the gate's budget has been 300 s since D-90.
 */
export const DEFAULT_MODELS: Readonly<Record<ProviderId, string>> = Object.freeze({
  anthropic: 'claude-sonnet-5',
  openai: 'gpt-5.2',
  google: 'gemini-3.5-flash',
  ollama: 'qwen3:14b',
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

/**
 * How a provider is reached: by credential, or by address.
 *
 * A union rather than an optional field, because the local provider has no key that happens to be
 * missing — it has none at all, and what varies for it instead is its endpoint (D-90). Stating that in
 * the type means the registry cannot build an `ollama` entry by forgetting a secret, and cannot hand a
 * vendor an address it would silently ignore.
 */
export type ProviderConnection = { readonly apiKey: string } | { readonly baseUrl: string };

/**
 * Ollama accepts an `Authorization` header on its OpenAI-compatible endpoint and ignores it, but the
 * SDK refuses to build a client without one. A placeholder, not a secret: it authenticates nothing,
 * and the endpoint it is sent to is on this machine.
 */
const LOCAL_PLACEHOLDER_KEY = 'ollama';

function languageModel(provider: ProviderId, model: string, connection: ProviderConnection) {
  /*
   * `.chat()` is load-bearing. The callable default of `@ai-sdk/openai` is the **Responses** API,
   * which Ollama does not implement; pointing it at `/v1` unqualified fails with a 404 that reads like
   * a bad model id. `.chat()` selects chat completions, which is the surface Ollama actually serves.
   *
   * No new dependency: `@ai-sdk/openai` already speaks this protocol to any `baseURL`, so
   * `@ai-sdk/openai-compatible` would add a package to reach an endpoint we can already reach.
   */
  if ('baseUrl' in connection) {
    return createOpenAI({
      name: provider,
      baseURL: connection.baseUrl,
      apiKey: LOCAL_PLACEHOLDER_KEY,
    }).chat(model);
  }

  const { apiKey } = connection;

  if (provider === 'anthropic') return createAnthropic({ apiKey })(model);
  if (provider === 'openai') return createOpenAI({ apiKey })(model);
  return createGoogleGenerativeAI({ apiKey })(model);
}

/**
 * The explicit generation bound, and why only the local provider gets one (А-8, point 3; task 130).
 *
 * A model reached by address shares **one window** between the prompt it reads and the answer it
 * writes. Left unstated, the split is the runtime's to choose, and the runtime's choice is what
 * D-146 caught in the act: the prompt was cut to fit whatever was left, from the front, taking the
 * system instruction with it. Stating the reserve is what turns the input allowance into a number
 * the assembler can pack against — `capacity.promptTokens` is literally the window minus this.
 *
 * `maxOutputTokens` is the SDK's vendor-neutral spelling; against Ollama's OpenAI-compatible surface
 * it arrives as `max_tokens` and is applied as `num_predict`, which is verified live rather than
 * assumed (see the round-4 pre-flight: `max_tokens: 8` returns `finish_reason: "length"` after
 * exactly eight tokens).
 *
 * A hosted provider is deliberately **not** bounded. Its window is an order of magnitude larger than
 * anything assembled here, so a bound would constrain nothing that needed constraining while
 * changing a request that A-8 promises to leave alone — and a cap low enough to matter would cut off
 * documents the provider was perfectly able to finish.
 */
function generationBound(
  connection: ProviderConnection,
  capacity: ProviderCapacity | undefined,
  messages: readonly ModelMessage[],
): { maxOutputTokens?: number } {
  if (capacity === undefined || !('baseUrl' in connection)) return {};

  const allowance = generationAllowance(capacity, messages);

  return allowance === null ? {} : { maxOutputTokens: allowance };
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
  connection: ProviderConnection,
  model: string,
  capacity?: ProviderCapacity,
): ProviderStream {
  return async ({ messages, tools, onDelta, signal }) => {
    const { system, turns } = splitMessages(messages);
    const toolSet = toSdkTools(tools);

    try {
      const result = streamText({
        model: languageModel(provider, model, connection),
        ...(system === undefined ? {} : { system }),
        ...(toolSet === undefined ? {} : { tools: toolSet }),
        ...generationBound(connection, capacity, messages),
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
