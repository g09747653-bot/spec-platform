import { describe, expect, it } from 'vitest';

import { LoopConfigurationError, parseEnv, requireEnv } from './env.ts';

/**
 * The loop's configuration floor (task 152 AC-3).
 *
 * A hole in the configuration must cost a restart, not a night: the loop runs unattended for hours,
 * and a missing key discovered at the moment a container is handed one is a failure nobody is
 * watching for.
 */

const FLOOR = {
  ANTHROPIC_API_KEY: 'sk-ant-not-a-real-key',
  PORT: '3100',
  WORKSPACE_ROOT_PATH: 'C:\\Users\\Owner\\workspace',
};

describe('the loop environment (task 152)', () => {
  it('accepts the three-variable floor and nothing else', () => {
    const env = parseEnv({ ...FLOOR });

    expect(env.PORT).toBe(3100);
    expect(env.WORKSPACE_ROOT_PATH).toBe('C:\\Users\\Owner\\workspace');
    expect(env.TELEGRAM_BOT_TOKEN).toBeUndefined();
    expect(env.LOOP_DB_PATH).toBe('.data/loop.db');
  });

  it.each(Object.keys(FLOOR))('refuses a configuration missing %s, by name', (missing) => {
    const source = Object.fromEntries(
      Object.entries(FLOOR).filter(([name]) => name !== missing),
    ) as Record<string, string | undefined>;

    try {
      parseEnv(source);
      expect.unreachable('a missing floor variable must throw');
    } catch (error) {
      expect(error).toBeInstanceOf(LoopConfigurationError);
      expect((error as LoopConfigurationError).issues.join('\n')).toContain(missing);
    }
  });

  it('treats a blank value as missing — an empty line in a .env is not a configured value', () => {
    expect(() => parseEnv({ ...FLOOR, ANTHROPIC_API_KEY: '   ' })).toThrow(LoopConfigurationError);
  });

  it('reports every missing variable at once, so a fresh .env takes one pass', () => {
    try {
      parseEnv({});
      expect.unreachable('an empty environment must throw');
    } catch (error) {
      const issues = (error as LoopConfigurationError).issues.join('\n');

      for (const name of Object.keys(FLOOR)) expect(issues).toContain(name);
    }
  });

  it('validates a tail variable when it is present, and ignores it when it is not', () => {
    expect(() => parseEnv({ ...FLOOR, LOCAL_LLM_API_BASE: 'not-a-url' })).toThrow(
      LoopConfigurationError,
    );

    expect(parseEnv({ ...FLOOR, LOCAL_LLM_API_BASE: 'http://127.0.0.1:11434/v1' })).toMatchObject({
      LOCAL_LLM_API_BASE: 'http://127.0.0.1:11434/v1',
    });

    // Absent stays absent: an unconfigured integration is off, not a boot failure.
    expect(parseEnv({ ...FLOOR }).WHISPER_API_BASE).toBeUndefined();
  });

  it('refuses a port that is not one', () => {
    expect(() => parseEnv({ ...FLOOR, PORT: 'http' })).toThrow(LoopConfigurationError);
    expect(() => parseEnv({ ...FLOOR, PORT: '70000' })).toThrow(LoopConfigurationError);
  });

  it('exits with code 1 and names the variable in stderr', () => {
    const written: string[] = [];
    let exited: number | null = null;

    expect(() =>
      requireEnv(
        { PORT: '3100', WORKSPACE_ROOT_PATH: 'C:\\workspace' },
        {
          write: (text) => written.push(text),
          exit: (code: number) => {
            exited = code;
            // The real `exit` never returns; the double stops the function the same way.
            throw new Error('exit called');
          },
        },
      ),
    ).toThrow('exit called');

    expect(exited).toBe(1);
    expect(written.join('')).toContain('ANTHROPIC_API_KEY');
    expect(written.join('')).toContain('.env.example');
  });

  it('returns the parsed configuration without touching stderr when it is complete', () => {
    const written: string[] = [];

    const env = requireEnv(
      { ...FLOOR },
      {
        write: (text) => written.push(text),
        exit: () => {
          throw new Error('exit must not be called');
        },
      },
    );

    expect(env.PORT).toBe(3100);
    expect(written).toEqual([]);
  });
});
