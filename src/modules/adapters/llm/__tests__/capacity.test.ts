import { describe, expect, it } from 'vitest';

import { parseEnv } from '@/config/env';
import { testEnv } from '@/config/testing/test-env';

import {
  capacityFor,
  charsForTokens,
  estimatePromptTokens,
  estimateTokens,
  localCapacity,
  LOCAL_GENERATION_RESERVE_TOKENS,
} from '../capacity';
import { buildProviderRegistry } from '../provider-registry';

/**
 * Declared provider capacity (task 130; амендмент А-8; D-146).
 *
 * The claims here are the ones the packer stands on, and each of them fails silently if it is wrong:
 * a token estimate that ran low would let a prompt over the window through, and on the local runtime
 * that does not cost the overflow — it costs two thirds of the prompt, from the front, taking the
 * system instruction with it (measured in round 4: 20 000 tokens in, 8 194 read).
 */

describe('estimateTokens', () => {
  /**
   * The measurement this is calibrated against, kept as a test rather than only as a comment.
   *
   * `qwen3:14b` tokenised 20 000 characters of English prose to 2 866 tokens on this machine. The
   * estimate must sit above that — the direction is the whole point, because the two errors are not
   * symmetric: over-estimating spends window we did not need, under-estimating loses the prompt.
   */
  it('over-estimates English prose rather than under-estimating it', () => {
    const measured = 2_866;
    const prose = 'The specification bundle records every requirement. '
      .repeat(400)
      .slice(0, 20_000);

    expect(estimateTokens(prose)).toBeGreaterThan(measured);
  });

  it('counts non-Latin script far more finely, because tokenisers do', () => {
    const cyrillic = 'спецификация требований и решений '.repeat(50);
    const latin = 'specification of requirements and design '.repeat(50);

    expect(estimateTokens(cyrillic) / cyrillic.length).toBeGreaterThan(
      estimateTokens(latin) / latin.length,
    );
  });

  it('is monotone, which is what makes the packer converge', () => {
    const text = 'a'.repeat(5_000);

    expect(estimateTokens(text.slice(0, 2_000))).toBeLessThan(estimateTokens(text));
  });

  it('charges a turn for its framing, so two messages are not cheaper than one', () => {
    const one = estimatePromptTokens([{ role: 'user', content: 'abcdefgh' }]);
    const two = estimatePromptTokens([
      { role: 'system', content: 'abcd' },
      { role: 'user', content: 'efgh' },
    ]);

    expect(two).toBeGreaterThan(one);
  });

  it('converts back to characters without ever claiming more than it counted', () => {
    for (const tokens of [0, 1, 100, 11_059]) {
      expect(estimateTokens('x'.repeat(charsForTokens(tokens)))).toBeLessThanOrEqual(
        Math.max(tokens, 1),
      );
    }
  });
});

describe('localCapacity', () => {
  it('derives the prompt allowance from the window minus the reserve, with a margin', () => {
    const capacity = localCapacity(16_384);

    expect(capacity.generationReserveTokens).toBe(LOCAL_GENERATION_RESERVE_TOKENS);
    expect(capacity.promptTokens).toBe(11_059);
    // Measured: 11 972 tokens were read whole at this window; the declaration sits under that.
    expect(capacity.promptTokens).toBeLessThan(11_972);
  });

  it('never lets the reserve claim more than half a small window', () => {
    const capacity = localCapacity(4_096);

    expect(capacity.generationReserveTokens).toBe(2_048);
    expect(capacity.promptTokens).toBeGreaterThan(0);
  });

  it('scales with the window the server was actually started with', () => {
    expect(localCapacity(32_768).promptTokens).toBeGreaterThan(localCapacity(16_384).promptTokens);
  });
});

describe('capacityFor', () => {
  it('gives every hosted provider room the default budget cannot fill (А-8, point 4)', () => {
    // 120 000 characters is the assembler's whole budget; even counted at the finest ratio it is far
    // below any hosted window, which is what makes the hosted prompt byte-identical to pre-А-8.
    const wholeBudget = estimateTokens('я'.repeat(120_000));

    for (const provider of ['anthropic', 'openai', 'google', 'stub'] as const) {
      expect(capacityFor(provider, 16_384).promptTokens).toBeGreaterThan(wholeBudget);
    }
  });

  it('gives the local provider a window an ordinary generation context would overrun', () => {
    expect(capacityFor('ollama', 16_384).promptTokens).toBeLessThan(
      estimateTokens('x'.repeat(120_000)),
    );
  });
});

describe('the registry declares it', () => {
  it('reads the window from the variable the Ollama server itself reads', () => {
    const registry = buildProviderRegistry(
      parseEnv(testEnv({ LLM_PROVIDER_ORDER: 'google,ollama', OLLAMA_CONTEXT_LENGTH: '16384' })),
    );

    const [google, ollama] = registry;

    expect(ollama?.capacity).toEqual(localCapacity(16_384));
    expect(google?.capacity.promptTokens).toBeGreaterThan(ollama?.capacity.promptTokens ?? 0);
  });

  it('defaults to Ollama’s own default, so an unset machine under-declares rather than over', () => {
    const registry = buildProviderRegistry(parseEnv(testEnv({ LLM_PROVIDER_ORDER: 'ollama' })));

    expect(registry[0]?.capacity).toEqual(localCapacity(4_096));
  });
});
