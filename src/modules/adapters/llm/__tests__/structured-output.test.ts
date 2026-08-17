import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { capacityFor } from '../capacity';
import { createProviderStream } from '../providers';
import type { StructuredOutput } from '../types';

/**
 * Constrained decoding, asserted **on the wire** (task 131; амендмент А-10).
 *
 * The SDK is not mocked here, and that is the point. Task 130's bound was proved by reading the
 * argument handed to `streamText`; a response format has one more translation to survive after that
 * — the vendor adapter turning it into a request body — and the whole claim of А-10 is about what
 * that body says. So the network is the seam: `fetch` is replaced, the real SDK builds the real
 * request, and the assertion reads the bytes it was about to send.
 *
 * Nothing is dialled. The stub rejects every call, so the two providers named below are never
 * reached; what is captured is the request that would have gone out (NFR-012 AC-5).
 *
 * Two claims, and the second is the one А-10 promises the deployment:
 *
 * 1. **Local:** the schema arrives as `response_format: {type: "json_schema"}`, which Ollama's
 *    OpenAI-compatible surface applies as its native `format` — a grammar the sampler cannot leave.
 * 2. **Hosted: byte-identical.** The same call with and without a stated shape produces the same
 *    request body, character for character. A caller may declare its artifact's schema everywhere,
 *    and the funded chain runs exactly the request it ran before this task.
 */

const SHAPE: StructuredOutput = {
  name: 'question_set',
  schema: {
    type: 'object',
    properties: { verdict: { type: 'string', enum: ['pass', 'needs_revision'] } },
    required: ['verdict'],
  },
};

const bodies: unknown[] = [];

beforeEach(() => {
  bodies.length = 0;

  vi.stubGlobal(
    'fetch',
    vi.fn((_input: unknown, init?: { body?: unknown }) => {
      bodies.push(init?.body);

      // The request never leaves; capturing it is the whole measurement.
      return Promise.reject(new Error('captured by the test'));
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Runs one call and returns the request body it was about to send, parsed. */
async function requestBody(
  provider: 'google' | 'ollama',
  structuredOutput?: StructuredOutput,
): Promise<Record<string, unknown>> {
  const stream =
    provider === 'ollama'
      ? createProviderStream(
          'ollama',
          { baseUrl: 'http://127.0.0.1:11434/v1' },
          'qwen3:14b',
          capacityFor('ollama', 16_384),
        )
      : createProviderStream(
          'google',
          { apiKey: 'test-key' },
          'gemini-3.5-flash',
          capacityFor('google', 16_384),
        );

  await expect(
    stream({
      messages: [
        { role: 'system', content: 'Answer with one JSON object.' },
        { role: 'user', content: 'Review this document.' },
      ],
      ...(structuredOutput === undefined ? {} : { structuredOutput }),
      onDelta: () => undefined,
    }),
  ).rejects.toThrow();

  const body = bodies.at(-1);

  // Not a formality: a body that is not JSON text would make every assertion below vacuous.
  if (typeof body !== 'string') throw new Error('the captured request body was not JSON text');

  return JSON.parse(body) as Record<string, unknown>;
}

describe('a stated output shape reaches the local runtime (А-10)', () => {
  it('sends the schema as a json_schema response format', async () => {
    const body = await requestBody('ollama', SHAPE);

    expect(body.response_format).toMatchObject({
      type: 'json_schema',
      json_schema: { name: 'question_set', schema: SHAPE.schema },
    });
  });

  it('sends no response format when the caller stated no shape', async () => {
    const body = await requestBody('ollama');

    expect(body).not.toHaveProperty('response_format');
  });

  /*
   * The grammar constrains sampling; it does not replace the prompt. Both instructions still travel,
   * because a model told only «emit this shape» fills it with plausible nothing — Р-1's layers and
   * the asset's own contract are what make the content mean something.
   */
  it('changes nothing else about the local request', async () => {
    const constrained = await requestBody('ollama', SHAPE);
    const plain = await requestBody('ollama');

    const { response_format: _format, ...rest } = constrained;

    expect(rest).toEqual(plain);
  });
});

describe('the hosted request is unchanged, byte for byte (А-10)', () => {
  it('produces the same body with and without a stated shape', async () => {
    await requestBody('google', SHAPE);
    const constrained = bodies.at(-1);

    await requestBody('google');
    const plain = bodies.at(-1);

    expect(constrained).toBe(plain);
  });

  it('carries no response schema of any kind', async () => {
    const body = await requestBody('google', SHAPE);
    const config = body.generationConfig;

    expect(JSON.stringify(body)).not.toContain('json_schema');
    expect(config ?? {}).not.toHaveProperty('responseSchema');
    expect(config ?? {}).not.toHaveProperty('responseMimeType');
  });
});
