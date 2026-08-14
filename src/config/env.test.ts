import { describe, expect, it } from 'vitest';

import { EnvironmentConfigurationError, NO_CREDENTIAL, parseEnv } from './env';

/**
 * Environment loader (task 7; IR-X2; NFR-006 AC-1).
 *
 * `parseEnv` takes its source as an argument, so every case here is pure: no `process.env`
 * mutation, no I/O, no ordering coupling between tests (NFR-012 AC-2).
 */

/**
 * Everything required today. The five `AUTH_*` credentials moved from optional to required in
 * task 12, per the milestone-driven rule of D-8; the Google key is required from task 42 not because
 * of the milestone but because it is the provider the default chain names (D-46); the storage and
 * search credentials were tightened at the M6 tail once both were confirmed in the deployment
 * environment (D-73).
 */
const MINIMAL = {
  DATABASE_URL: 'postgres://user:pw@host/db',
  AUTH_SECRET: 'gr4hVX0Yy5tGqk8p9jJ1lQ4bM2nB6vC8xZ0aS1dF3gH=',
  AUTH_GOOGLE_ID: 'google-client-id',
  AUTH_GOOGLE_SECRET: 'google-client-secret',
  AUTH_GITHUB_ID: 'github-client-id',
  AUTH_GITHUB_SECRET: 'github-client-secret',
  GOOGLE_GENERATIVE_AI_API_KEY: 'google-generative-ai-key',
  BLOB_READ_WRITE_TOKEN: 'vercel-blob-token',
  WEB_SEARCH_API_KEY: 'web-search-key',
} as const;

const REQUIRED_TODAY = Object.keys(MINIMAL);

/** `MINIMAL` with one variable left out — the shape of a deployment that forgot to set it. */
const without = (omitted: string): Record<string, string | undefined> =>
  Object.fromEntries(Object.entries(MINIMAL).filter(([name]) => name !== omitted));

describe('parseEnv', () => {
  it('accepts a configuration carrying only the variables required today', () => {
    const env = parseEnv({ ...MINIMAL });
    expect(env.DATABASE_URL).toBe(MINIMAL.DATABASE_URL);
    expect(env.AUTH_SECRET).toBe(MINIMAL.AUTH_SECRET);
    expect(env.AUTH_GOOGLE_ID).toBe(MINIMAL.AUTH_GOOGLE_ID);
    expect(env.AUTH_GITHUB_ID).toBe(MINIMAL.AUTH_GITHUB_ID);
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

  describe('every credential required today fails by name when it is absent (D-8)', () => {
    for (const name of REQUIRED_TODAY) {
      it(`fails by name when ${name} is absent`, () => {
        try {
          parseEnv(without(name));
          expect.unreachable(`${name} must be required`);
        } catch (error) {
          const { issues } = error as EnvironmentConfigurationError;
          expect(issues.some((issue) => issue.startsWith(`${name}:`))).toBe(true);
        }
      });

      it(`fails identically when ${name} is declared but blank`, () => {
        const issuesFor = (source: Record<string, string | undefined>) => {
          try {
            parseEnv(source);
            return null;
          } catch (error) {
            return (error as EnvironmentConfigurationError).issues;
          }
        };

        expect(issuesFor({ ...MINIMAL, [name]: '   ' })).toEqual(issuesFor(without(name)));
      });
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
    expect(env.LLM_PROVIDER_ORDER).toEqual(['google']);
    expect(env.LLM_REQUEST_TIMEOUT_MS).toBe(60_000);
  });

  it('parses the failover chain as an ordered list of known providers', () => {
    const env = parseEnv({
      ...MINIMAL,
      LLM_PROVIDER_ORDER: 'openai, anthropic',
      OPENAI_API_KEY: 'openai-key',
      ANTHROPIC_API_KEY: 'anthropic-key',
    });
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
    expect(env.SENTRY_DSN).toBeUndefined();
  });

  /**
   * The M6 tail (D-73), and the reason it is more than a schema edit.
   *
   * Making the two credentials required closes a specific hole: a deployment that never set the Blob
   * token booted happily and served an in-process store, so an upload returned 201 and the file
   * survived exactly one process. The check that closes it must not also close the local path, which
   * the end-to-end suite and a developer without either account both depend on — so absence became a
   * value. Both halves are asserted here, because either alone is the wrong behaviour.
   */
  describe('storage and search credentials are required, with a stated way to have none', () => {
    for (const name of ['BLOB_READ_WRITE_TOKEN', 'WEB_SEARCH_API_KEY']) {
      it(`fails by name when ${name} is omitted entirely`, () => {
        try {
          parseEnv(without(name));
          expect.unreachable(`${name} must be required`);
        } catch (error) {
          const { issues } = error as EnvironmentConfigurationError;
          expect(issues.some((issue) => issue.startsWith(`${name}:`))).toBe(true);
        }
      });
    }

    it('accepts `none` as the explicit "no account in this environment"', () => {
      const env = parseEnv({
        ...MINIMAL,
        BLOB_READ_WRITE_TOKEN: NO_CREDENTIAL,
        WEB_SEARCH_API_KEY: NO_CREDENTIAL,
      });

      expect(env.BLOB_READ_WRITE_TOKEN).toBe(NO_CREDENTIAL);
      expect(env.WEB_SEARCH_API_KEY).toBe(NO_CREDENTIAL);
    });

    /*
     * The distinction the whole change rests on: `none` is a decision, blank is an omission, and
     * they must not read the same. Were blank to normalise into the local path, a deployment that
     * declared the variable and never filled it — which is exactly what Vercel does for a variable
     * proposed at import time (D-12) — would be back to the silent in-memory store.
     */
    it('does not accept a blank as a way to mean `none`', () => {
      expect(() => parseEnv({ ...MINIMAL, BLOB_READ_WRITE_TOKEN: '   ' })).toThrow(
        EnvironmentConfigurationError,
      );
      expect(() => parseEnv({ ...MINIMAL, WEB_SEARCH_API_KEY: '' })).toThrow(
        EnvironmentConfigurationError,
      );
    });
  });

  /**
   * The chain decides which keys are mandatory (D-46; IR-001-AC-4).
   *
   * The two failure modes this replaces are both real: "all three keys required" fails the build of
   * every deployment that pays for one vendor, and "no key required" lets a chain be configured that
   * cannot make a single call. Neither is caught by types, so both are checked here.
   */
  describe('a provider in the chain must have its key', () => {
    const withChain = (order: string, extra: Record<string, string> = {}) => ({
      ...MINIMAL,
      LLM_PROVIDER_ORDER: order,
      ...extra,
    });

    const issuesFor = (source: Record<string, string | undefined>) => {
      try {
        parseEnv(source);
        return null;
      } catch (error) {
        return (error as EnvironmentConfigurationError).issues;
      }
    };

    it('fails, naming the variable, when a chain provider has no key', () => {
      const issues = issuesFor(withChain('openai'));

      expect(issues?.some((issue) => issue.startsWith('OPENAI_API_KEY:'))).toBe(true);
      expect(issues?.join(' ')).toContain('LLM_PROVIDER_ORDER');
    });

    it('fails identically when the key is declared but blank', () => {
      expect(issuesFor(withChain('openai', { OPENAI_API_KEY: '   ' }))).toEqual(
        issuesFor(withChain('openai')),
      );
    });

    it('leaves the key of a provider outside the chain optional', () => {
      const env = parseEnv(withChain('google'));

      expect(env.ANTHROPIC_API_KEY).toBeUndefined();
      expect(env.OPENAI_API_KEY).toBeUndefined();
      expect(env.LLM_PROVIDER_ORDER).toEqual(['google']);
    });

    it('requires every key of a longer chain, and names each missing one', () => {
      const issues = issuesFor(withChain('anthropic,openai,google'));

      expect(issues?.some((issue) => issue.startsWith('ANTHROPIC_API_KEY:'))).toBe(true);
      expect(issues?.some((issue) => issue.startsWith('OPENAI_API_KEY:'))).toBe(true);
      // Google's key is present in MINIMAL, so it must not be reported.
      expect(issues?.some((issue) => issue.startsWith('GOOGLE_GENERATIVE_AI_API_KEY:'))).toBe(
        false,
      );
    });

    /**
     * The local provider is the exception the rule was already written to allow (round 3; D-90).
     *
     * `requireChainKeys` demands a key for every provider that *has* one, which is why adding a
     * provider with none needed no change to the check — only an absence from the key map. What it
     * deliberately does not do is verify that Ollama is running: that is true at one moment and false
     * at the next, and a boot-time answer to it would be a wrong answer by request time.
     */
    it('demands no key for the local provider, and none for a chain of one', () => {
      const env = parseEnv(withChain('ollama', { GOOGLE_GENERATIVE_AI_API_KEY: '' }));

      expect(env.LLM_PROVIDER_ORDER).toEqual(['ollama']);
      expect(env.GOOGLE_GENERATIVE_AI_API_KEY).toBeUndefined();
    });

    it('still demands the funded provider’s key when the chain names both', () => {
      const issues = issuesFor(withChain('google,ollama', { GOOGLE_GENERATIVE_AI_API_KEY: '' }));

      expect(issues?.some((issue) => issue.startsWith('GOOGLE_GENERATIVE_AI_API_KEY:'))).toBe(true);
      expect(issues?.some((issue) => issue.includes('ollama'))).toBe(false);
    });

    it('defaults the local provider’s address, and lets a machine move it', () => {
      expect(parseEnv(withChain('ollama')).OLLAMA_BASE_URL).toBe('http://localhost:11434/v1');
      expect(
        parseEnv(withChain('ollama', { OLLAMA_BASE_URL: 'http://127.0.0.1:9999/v1' }))
          .OLLAMA_BASE_URL,
      ).toBe('http://127.0.0.1:9999/v1');
    });

    it('accepts a full three-provider chain once every key is supplied', () => {
      const env = parseEnv(
        withChain('anthropic,openai,google', {
          ANTHROPIC_API_KEY: 'anthropic-key',
          OPENAI_API_KEY: 'openai-key',
        }),
      );

      expect(env.LLM_PROVIDER_ORDER).toEqual(['anthropic', 'openai', 'google']);
    });
  });

  it('keeps AUTH_URL optional, so one build can serve every deployment hostname', () => {
    expect(parseEnv({ ...MINIMAL }).AUTH_URL).toBeUndefined();
    expect(parseEnv({ ...MINIMAL, AUTH_URL: 'http://localhost:3000' }).AUTH_URL).toBe(
      'http://localhost:3000',
    );
    expect(() => parseEnv({ ...MINIMAL, AUTH_URL: 'not-a-url' })).toThrow(
      EnvironmentConfigurationError,
    );
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
    const env = parseEnv({ ...MINIMAL, SENTRY_DSN: '' });
    expect(env.SENTRY_DSN).toBeUndefined();
  });

  it('accepts an optional variable containing only whitespace', () => {
    const env = parseEnv({ ...MINIMAL, SENTRY_DSN: '   ' });
    expect(env.SENTRY_DSN).toBeUndefined();
  });

  it('accepts every later-milestone variable declared and empty at once', () => {
    const env = parseEnv({
      ...MINIMAL,
      AUTH_URL: '',
      ANTHROPIC_API_KEY: '',
      OPENAI_API_KEY: '',
      LLM_PROVIDER_ORDER: '',
      LLM_REQUEST_TIMEOUT_MS: '',
      QUALITY_STAGE_ENABLED: '',
      MAX_ROUNDS_PER_STAGE: '',
      DECISION_INTENT_MIN_CONFIDENCE: '',
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
    expect(env.LLM_PROVIDER_ORDER).toEqual(['google']);
    expect(env.QUALITY_STAGE_ENABLED).toBe(false);
    expect(env.ALLOWED_UPLOAD_TYPES).toContain('application/pdf');
  });

  it('still rejects a required variable supplied as an empty string, by name', () => {
    try {
      parseEnv({ ...MINIMAL, DATABASE_URL: '' });
      expect.unreachable('an empty required variable must not pass');
    } catch (error) {
      expect(error).toBeInstanceOf(EnvironmentConfigurationError);
      const { issues } = error as EnvironmentConfigurationError;
      expect(issues.some((issue) => issue.startsWith('DATABASE_URL:'))).toBe(true);
    }
  });

  it('still rejects a required variable supplied as whitespace, by name', () => {
    try {
      parseEnv({ ...MINIMAL, DATABASE_URL: '  \t ' });
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

    expect(messageFor({ ...MINIMAL, DATABASE_URL: '' })).toEqual(
      messageFor({ ...MINIMAL, DATABASE_URL: undefined }),
    );
  });

  it('leaves a filled value untouched, including its internal whitespace', () => {
    const env = parseEnv({ ...MINIMAL, ALLOWED_UPLOAD_TYPES: 'text/plain, text/markdown' });
    expect(env.DATABASE_URL).toBe(MINIMAL.DATABASE_URL);
    expect(env.ALLOWED_UPLOAD_TYPES).toEqual(['text/plain', 'text/markdown']);
  });
});
