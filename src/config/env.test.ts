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

/**
 * Regression: D-BUILD-1 / D-12.
 *
 * A deployment platform hands a declared-but-unfilled variable to the build as an empty string,
 * not as an absent key. `.optional()` admits `undefined` but not `''`, so the first production
 * build failed on twelve later-milestone variables that are explicitly allowed to be absent.
 */
describe('parseEnv treats a blank value as an absent one', () => {
  it('accepts an optional variable declared but left empty', () => {
    const env = parseEnv({ ...MINIMAL, AUTH_SECRET: '' });
    expect(env.AUTH_SECRET).toBeUndefined();
  });

  it('accepts an optional variable containing only whitespace', () => {
    const env = parseEnv({ ...MINIMAL, AUTH_SECRET: '   ' });
    expect(env.AUTH_SECRET).toBeUndefined();
  });

  it('accepts every later-milestone variable declared and empty at once', () => {
    const env = parseEnv({
      ...MINIMAL,
      AUTH_SECRET: '',
      AUTH_URL: '',
      AUTH_GOOGLE_ID: '',
      AUTH_GOOGLE_SECRET: '',
      AUTH_GITHUB_ID: '',
      AUTH_GITHUB_SECRET: '',
      ANTHROPIC_API_KEY: '',
      OPENAI_API_KEY: '',
      GOOGLE_GENERATIVE_AI_API_KEY: '',
      LLM_PROVIDER_ORDER: '',
      LLM_REQUEST_TIMEOUT_MS: '',
      QUALITY_STAGE_ENABLED: '',
      MAX_ROUNDS_PER_STAGE: '',
      DECISION_INTENT_MIN_CONFIDENCE: '',
      BLOB_READ_WRITE_TOKEN: '',
      WEB_SEARCH_API_KEY: '',
      WEB_FETCH_MAX_BYTES: '',
      WEB_FETCH_TIMEOUT_MS: '',
      PARSE_TIMEOUT_MS: '',
      MAX_UPLOAD_BYTES: '',
      ALLOWED_UPLOAD_TYPES: '',
      SENTRY_DSN: '',
    });

    expect(env.AUTH_URL).toBeUndefined();
    expect(env.SENTRY_DSN).toBeUndefined();
    // Blank must fall back to the documented default, not to a coerced zero or empty list.
    expect(env.MAX_ROUNDS_PER_STAGE).toBe(3);
    expect(env.LLM_REQUEST_TIMEOUT_MS).toBe(60_000);
    expect(env.LLM_PROVIDER_ORDER).toEqual(['anthropic', 'openai', 'google']);
    expect(env.QUALITY_STAGE_ENABLED).toBe(false);
    expect(env.ALLOWED_UPLOAD_TYPES).toContain('application/pdf');
  });

  it('still rejects a required variable supplied as an empty string, by name', () => {
    try {
      parseEnv({ DATABASE_URL: '' });
      expect.unreachable('an empty required variable must not pass');
    } catch (error) {
      expect(error).toBeInstanceOf(EnvironmentConfigurationError);
      const { issues } = error as EnvironmentConfigurationError;
      expect(issues.some((issue) => issue.startsWith('DATABASE_URL:'))).toBe(true);
    }
  });

  it('still rejects a required variable supplied as whitespace, by name', () => {
    try {
      parseEnv({ DATABASE_URL: '  \t ' });
      expect.unreachable('a whitespace-only required variable must not pass');
    } catch (error) {
      const { issues } = error as EnvironmentConfigurationError;
      expect(issues.some((issue) => issue.startsWith('DATABASE_URL:'))).toBe(true);
    }
  });

  it('reports a missing and an empty required variable identically', () => {
    const messageFor = (source: Record<string, string | undefined>) => {
      try {
        parseEnv(source);
        return null;
      } catch (error) {
        return (error as EnvironmentConfigurationError).issues;
      }
    };

    expect(messageFor({ DATABASE_URL: '' })).toEqual(messageFor({}));
  });

  it('leaves a filled value untouched, including its internal whitespace', () => {
    const env = parseEnv({ ...MINIMAL, ALLOWED_UPLOAD_TYPES: 'text/plain, text/markdown' });
    expect(env.DATABASE_URL).toBe(MINIMAL.DATABASE_URL);
    expect(env.ALLOWED_UPLOAD_TYPES).toEqual(['text/plain', 'text/markdown']);
  });
});
