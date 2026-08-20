import { z } from 'zod';

import { LLM_PROVIDERS } from '../llm/types.ts';

/**
 * The loop's configuration, parsed once and never read raw (task 152).
 *
 * The same discipline the platform runs on (IR-X2): one module reads the environment, everything
 * downstream takes a typed value. What differs is what "missing" means here. The platform refuses
 * to boot without any of its variables because every one of them is load-bearing for the first
 * request. The loop has a **three-variable floor** and a long tail of optional integrations — a
 * Telegram bot, a Whisper endpoint, a local model — that a deployment may simply not have. A tail
 * variable is therefore validated **when it is present** and absent otherwise, so an unconfigured
 * integration is a feature that is off rather than a boot failure (бандл A0 §Bootstrap; task 152).
 *
 * The floor is the three without which the loop has nothing to do:
 *
 * - `ANTHROPIC_API_KEY` — the funded key the executor container is handed, pointwise (never the
 *   whole `.env`, see task 155);
 * - `PORT` — the dashboard is the only way to watch an autonomous run, so a loop without one is a
 *   loop nobody can supervise;
 * - `WORKSPACE_ROOT_PATH` — where the projects the loop builds actually live. There is no default
 *   that could be right: guessing it would mean writing a stranger's code into a guessed directory.
 */

/** Present-but-blank is absent. A variable set to `""` in a `.env` is not a configured value. */
const blankToUndefined = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

const required = (message: string) =>
  z.preprocess(blankToUndefined, z.string({ error: message }).min(1, message));

const optional = (schema: z.ZodType<string>) => z.preprocess(blankToUndefined, schema.optional());

const port = z.preprocess(
  blankToUndefined,
  z.coerce
    .number({ error: 'PORT must be a number — the dashboard listens on it' })
    .int()
    .min(1)
    .max(65_535),
);

const url = (name: string) =>
  z.url({ error: `${name} must be an absolute URL, for example http://127.0.0.1:11434/v1` });

export const envSchema = z.object({
  // --- the floor: absent means the loop cannot run at all ---
  ANTHROPIC_API_KEY: required(
    'ANTHROPIC_API_KEY is required — the executor container is handed this key and nothing else from the environment',
  ),
  PORT: port,
  WORKSPACE_ROOT_PATH: required(
    'WORKSPACE_ROOT_PATH is required — it is the directory the loop builds projects in, and there is no safe default',
  ),

  // --- the tail: validated when present, absent when not ---
  /** Where the loop keeps its own SQLite file. Defaults inside the package, gitignored. */
  LOOP_DB_PATH: z.preprocess(blankToUndefined, z.string().min(1).default('.data/loop.db')),
  /** Transport override for the Docker Engine seam (task 154). Absent = derived from the platform. */
  DOCKER_ENGINE_PIPE: optional(z.string().min(1)),
  DOCKER_ENGINE_SOCKET: optional(z.string().min(1)),
  /** The locally running Spec Platform, for the façade of M17а. */
  SPEC_PLATFORM_API_BASE: optional(url('SPEC_PLATFORM_API_BASE')),

  /*
   * The provider chain, in attempt order (task 156; D-229's mirror).
   *
   * Configuration, never code: the loop asks a model for the *texts* of handoff assignments, and
   * which vendor answers is this line. A provider named here without its credential is skipped, so
   * the order can list more than a given machine has.
   */
  LOOP_PROVIDER_ORDER: z.preprocess(
    (value) =>
      typeof value === 'string' && value.trim() !== ''
        ? value
            .split(',')
            .map((entry) => entry.trim())
            .filter((entry) => entry !== '')
        : undefined,
    z.array(z.enum(LLM_PROVIDERS)).min(1).default(['anthropic']),
  ),
  LOOP_ANTHROPIC_MODEL: optional(z.string().min(1)),
  OPENAI_API_KEY: optional(z.string().min(1)),
  LOOP_OPENAI_MODEL: optional(z.string().min(1)),
  GOOGLE_GENERATIVE_AI_API_KEY: optional(z.string().min(1)),
  LOOP_GOOGLE_MODEL: optional(z.string().min(1)),
  LOOP_LLM_TIMEOUT_MS: z.preprocess(
    blankToUndefined,
    z.coerce.number().int().positive().default(120_000),
  ),

  LOCAL_LLM_API_BASE: optional(url('LOCAL_LLM_API_BASE')),
  LOCAL_LLM_MODEL: optional(z.string().min(1)),
  WHISPER_API_BASE: optional(url('WHISPER_API_BASE')),
  TELEGRAM_BOT_TOKEN: optional(z.string().min(1)),
  TELEGRAM_OWNER_CHAT_ID: optional(z.string().min(1)),
});

export type LoopEnv = z.infer<typeof envSchema>;

/**
 * A configuration failure, rendered as the operator needs to read it: every issue at once, each
 * naming its variable. One-at-a-time reporting turns a fresh `.env` into three restarts.
 */
export class LoopConfigurationError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`loop configuration is invalid:\n${issues.map((issue) => `  - ${issue}`).join('\n')}`);
    this.name = 'LoopConfigurationError';
    this.issues = issues;
  }
}

/** Parses an arbitrary source. Pure and injectable, so the failure path is testable. */
export function parseEnv(source: Record<string, string | undefined>): LoopEnv {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    throw new LoopConfigurationError(
      result.error.issues.map((issue) => {
        const name = issue.path.join('.');
        return name === '' ? issue.message : `${name}: ${issue.message}`;
      }),
    );
  }

  return result.data;
}

/* eslint-disable no-restricted-properties -- this module is the loop's single sanctioned reader. */
let cached: LoopEnv | undefined;

export function getEnv(): LoopEnv {
  cached ??= parseEnv(process.env);
  return cached;
}
/* eslint-enable no-restricted-properties */

/**
 * Parses the environment or ends the process, printing what is missing (task 152 AC-3).
 *
 * A loop that starts with a hole in its configuration discovers it hours later, in the middle of an
 * autonomous run, as a container that could not be handed a key — so the failure is moved to the
 * first second of the process, where it costs a restart instead of a night.
 *
 * `exit` and `write` are injected so the test can assert what reached stderr without ending the
 * test runner.
 */
export function requireEnv(
  source: Record<string, string | undefined>,
  io: { write: (text: string) => void; exit: (code: number) => never },
): LoopEnv {
  try {
    return parseEnv(source);
  } catch (error) {
    if (!(error instanceof LoopConfigurationError)) throw error;

    io.write(`${error.message}\n`);
    io.write('See loop/.env.example for the full template.\n');
    return io.exit(1);
  }
}
