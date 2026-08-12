import { describe, expect, it } from 'vitest';

import { EnvironmentConfigurationError, parseEnv } from './env';

/**
 * Environment loader (task 7; IR-X2; NFR-006 AC-1).
 *
 * `parseEnv` takes its source as an argument, so every case here is pure: no `process.env`
 * mutation, no I/O, no ordering coupling between tests (NFR-012 AC-2).
 */

const MINIMAL = { DATABASE_URL: 'postgres://user:pw@host/db' } as const;

describe('parseEnv', () => {
  it('accepts a configuration carrying only the variables required today', () => {
    const env = parseEnv({ ...MINIMAL });
    expect(env.DATABASE_URL).toBe(MINIMAL.DATABASE_URL);
  });

  it('rejects a missing required variable and names it', () => {
    expect(() => parseEnv({})).toThrow(EnvironmentConfigurationError);

    try {
      parseEnv({});
      expect.unreachable('parseEnv must throw when DATABASE_URL is absent');
    } catch (error) {
      expect(error).toBeInstanceOf(EnvironmentConfigurationError);
      const { issues, message } = error as EnvironmentConfigurationError;
      expect(issues.some((issue) => issue.startsWith('DATABASE_URL:'))).toBe(true);
      expect(message).toContain('DATABASE_URL');
    }
  });

  it('reports every offending variable at once rather than the first', () => {
    try {
      parseEnv({ MAX_ROUNDS_PER_STAGE: 'three', LLM_REQUEST_TIMEOUT_MS: '-1' });
      expect.unreachable('parseEnv must throw');
    } catch (error) {
      const { issues } = error as EnvironmentConfigurationError;
      const named = issues.map((issue) => issue.split(':')[0]);
      expect(named).toContain('DATABASE_URL');
      expect(named).toContain('MAX_ROUNDS_PER_STAGE');
      expect(named).toContain('LLM_REQUEST_TIMEOUT_MS');
    }
  });

  it('applies the defaults from the solution configuration table', () => {
    const env = parseEnv({ ...MINIMAL });

    expect(env.MAX_ROUNDS_PER_STAGE).toBe(3);
    expect(env.QUALITY_STAGE_ENABLED).toBe(false);
    expect(env.LLM_PROVIDER_ORDER).toEqual(['anthropic', 'openai', 'google']);
    expect(env.LLM_REQUEST_TIMEOUT_MS).toBe(60_000);
  });

  it('parses the failover chain as an ordered list of known providers', () => {
    const env = parseEnv({ ...MINIMAL, LLM_PROVIDER_ORDER: 'openai, anthropic' });
    expect(env.LLM_PROVIDER_ORDER).toEqual(['openai', 'anthropic']);
  });

  it('rejects an unknown provider in the failover chain', () => {
    expect(() => parseEnv({ ...MINIMAL, LLM_PROVIDER_ORDER: 'openai,llama' })).toThrow(
      EnvironmentConfigurationError,
    );
  });

  it('reads the Quality flag as a boolean, defaulting to disabled (constitution P3)', () => {
    expect(parseEnv({ ...MINIMAL, QUALITY_STAGE_ENABLED: 'true' }).QUALITY_STAGE_ENABLED).toBe(
      true,
    );
    expect(parseEnv({ ...MINIMAL, QUALITY_STAGE_ENABLED: '0' }).QUALITY_STAGE_ENABLED).toBe(false);
    expect(() => parseEnv({ ...MINIMAL, QUALITY_STAGE_ENABLED: 'yes' })).toThrow(
      EnvironmentConfigurationError,
    );
  });

  it('rejects a non-integer round budget instead of silently coercing it', () => {
    expect(() => parseEnv({ ...MINIMAL, MAX_ROUNDS_PER_STAGE: '2.5' })).toThrow(
      EnvironmentConfigurationError,
    );
  });

  it('keeps later-milestone variables optional until their milestone', () => {
    const env = parseEnv({ ...MINIMAL });
    expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    expect(env.AUTH_SECRET).toBeUndefined();
    expect(env.SENTRY_DSN).toBeUndefined();
  });
});
