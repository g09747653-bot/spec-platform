import { z } from 'zod';

import {
  EXECUTOR_CREDENTIAL_KINDS,
  type ExecutorCredential,
  type ExecutorCredentialKind,
} from '../executor/credential.ts';
import {
  parseRoleOrder,
  type LoopRole,
  type RoleConfiguration,
  type RoleCredentials,
} from '../llm/roles.ts';
import { LLM_PROVIDERS, type LlmProviderId } from '../llm/types.ts';
import { DEFAULT_MAX_EXECUTORS } from '../orchestrator/schedule.ts';

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
 * - **exactly one of `ANTHROPIC_API_KEY` | `CLAUDE_CODE_OAUTH_TOKEN`** — the credential the executor
 *   container is handed, pointwise (never the whole `.env`, see task 155);
 * - `PORT` — the dashboard is the only way to watch an autonomous run, so a loop without one is a
 *   loop nobody can supervise;
 * - `WORKSPACE_ROOT_PATH` — where the projects the loop builds actually live. There is no default
 *   that could be right: guessing it would mean writing a stranger's code into a guessed directory.
 *
 * **Why exactly one, and not «whichever is there» (амендмент А-23).** The CLI's documented
 * precedence puts `ANTHROPIC_API_KEY` above `CLAUDE_CODE_OAUTH_TOKEN`, so a machine carrying both
 * runs every container on the metered key while its operator believes the subscription is paying —
 * a configuration whose cost is invisible until the invoice. Refusing the ambiguous case at boot is
 * cheaper than discovering it later, and it makes the loop's own logs able to name, truthfully,
 * which budget a run spent.
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

export const CREDENTIAL_REQUIRED =
  'exactly one of ANTHROPIC_API_KEY | CLAUDE_CODE_OAUTH_TOKEN is required — the executor container is handed that one credential and nothing else from the environment';

export const CREDENTIAL_AMBIGUOUS =
  'ANTHROPIC_API_KEY and CLAUDE_CODE_OAUTH_TOKEN are both set — leave exactly one: the CLI prefers the API key, so a run that was meant to spend the subscription would silently spend the key instead';

const envObject = z.object({
  // --- the floor: absent means the loop cannot run at all ---
  /** The metered Console key. Read by `--bare`, which is the isolation the API-key path uses. */
  ANTHROPIC_API_KEY: optional(z.string().min(1)),
  /** The subscription token from `claude setup-token`. Never read in `--bare` mode. */
  CLAUDE_CODE_OAUTH_TOKEN: optional(z.string().min(1)),
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
  /**
   * The provider order for one role, overriding `LOOP_PROVIDER_ORDER` (task 161; А-24 §1).
   *
   * Absent — the ordinary case — means «the same vendor the executor runs», which `llm/roles.ts`
   * puts at the head of the configured chain. Present, it is taken whole: an operator who writes
   * `google` for the researcher means the researcher runs on Google.
   */
  LOOP_ROLE_PROVIDER_ARCHITECT: optional(z.string().min(1)),
  LOOP_ROLE_PROVIDER_CONTROLLER: optional(z.string().min(1)),
  LOOP_ROLE_PROVIDER_RESEARCHER: optional(z.string().min(1)),
  LOOP_ANTHROPIC_MODEL: optional(z.string().min(1)),
  OPENAI_API_KEY: optional(z.string().min(1)),
  LOOP_OPENAI_MODEL: optional(z.string().min(1)),
  GOOGLE_GENERATIVE_AI_API_KEY: optional(z.string().min(1)),
  LOOP_GOOGLE_MODEL: optional(z.string().min(1)),
  LOOP_LLM_TIMEOUT_MS: z.preprocess(
    blankToUndefined,
    z.coerce.number().int().positive().default(120_000),
  ),

  /**
   * How many executor containers may run at once (task 159; бандл A0 Task 3.1).
   *
   * Ten by default, which is the bundle's number and the customer's machine's — and it is a
   * **ceiling, not a target**: the scheduler starts fewer whenever the plan's own shape says so
   * (a milestone with two tasks, files that collide, a spent rate-limit window). A run whose actual
   * parallelism sits below this is a run obeying its plan, not a run underperforming.
   */
  LOOP_MAX_EXECUTORS: z.preprocess(
    blankToUndefined,
    z.coerce.number().int().min(1).max(64).default(DEFAULT_MAX_EXECUTORS),
  ),

  /**
   * One acceptance **test** command's limit, in milliseconds (task 174; А-26 §3).
   *
   * Five minutes by default. The fifteen-minute acceptance ceiling stays the back stop for the
   * whole run — this bounds the recognisable case inside it: a test the executor wrote that never
   * finishes, which the M16а gate paid fifteen minutes to discover once.
   */
  ACCEPTANCE_TEST_TIMEOUT_MS: z.preprocess(
    blankToUndefined,
    z.coerce.number().int().positive().default(300_000),
  ),

  LOCAL_LLM_API_BASE: optional(url('LOCAL_LLM_API_BASE')),
  LOCAL_LLM_MODEL: optional(z.string().min(1)),
  /**
   * Мост подписки — звено `claude-cli` цепочки (task 175). Его присутствие и конфигурирует
   * провайдера, как `LOCAL_LLM_API_BASE` конфигурирует `ollama`; своя переменная, а не второе
   * использование локальной, чтобы журнал, называя звено, называл и бюджет: ollama — карта,
   * claude-cli — тариф.
   */
  CLAUDE_CLI_API_BASE: optional(url('CLAUDE_CLI_API_BASE')),
  WHISPER_API_BASE: optional(url('WHISPER_API_BASE')),
  TELEGRAM_BOT_TOKEN: optional(z.string().min(1)),
  TELEGRAM_OWNER_CHAT_ID: optional(z.string().min(1)),
  /**
   * База Bot API (задача 167). Боевое умолчание — api.telegram.org; гейтовая прогулка подставляет
   * локальный стенд, потому что ВХОДЯЩЕЕ сообщение владельца в настоящий Bot API программно не
   * вложить (это привилегия человека с аккаунтом), а сквозной путь без рук доказывается на всём
   * остальном настоящем. Тот же класс крана, что DOCKER_ENGINE_PIPE.
   */
  TELEGRAM_API_BASE: optional(url('TELEGRAM_API_BASE')),
});

export const envSchema = envObject;

export type LoopEnv = z.infer<typeof envSchema>;

/**
 * The floor's one rule that no single field can express: **exactly one credential**.
 *
 * Checked **beside** the schema rather than as an object-level refinement, and that is not a style
 * choice: a refinement on the object runs only when every field already parsed, so an operator
 * filling a fresh `.env` would be told about a malformed `PORT` first and about the missing
 * credential only on the next attempt — the very «three restarts» this module exists to avoid. It
 * reads the raw source for the same reason, so it has an answer even when the parse failed.
 *
 * The message names **both** spellings, because an operator who reads only «ANTHROPIC_API_KEY» in a
 * failure reaches for the key the amendment moved away from.
 */
export function credentialIssue(source: Record<string, string | undefined>): string | null {
  const present = EXECUTOR_CREDENTIAL_KINDS.filter(
    (name) => blankToUndefined(source[name]) !== undefined,
  );

  if (present.length === 1) return null;

  return present.length === 0 ? CREDENTIAL_REQUIRED : CREDENTIAL_AMBIGUOUS;
}

/**
 * The per-role provider orders this configuration declares (task 161).
 *
 * Assembled here rather than read at each call site, so «which vendor does the researcher use?» has
 * one answer in one place — the same discipline the rest of this module exists for.
 */
export function roleConfiguration(env: LoopEnv): RoleConfiguration {
  const perRole: Partial<Record<LoopRole, LlmProviderId[]>> = {};

  const architect = parseRoleOrder(env.LOOP_ROLE_PROVIDER_ARCHITECT);
  const controller = parseRoleOrder(env.LOOP_ROLE_PROVIDER_CONTROLLER);
  const researcher = parseRoleOrder(env.LOOP_ROLE_PROVIDER_RESEARCHER);

  if (architect !== undefined) perRole.architect = architect;
  if (controller !== undefined) perRole.controller = controller;
  if (researcher !== undefined) perRole.researcher = researcher;

  return { order: env.LOOP_PROVIDER_ORDER, perRole };
}

/** Every credential the chains need, read once — the shape `createRoleChain` takes. */
export function providerCredentials(env: LoopEnv): RoleCredentials {
  return {
    ...(env.ANTHROPIC_API_KEY === undefined ? {} : { anthropicApiKey: env.ANTHROPIC_API_KEY }),
    anthropicModel: env.LOOP_ANTHROPIC_MODEL,
    openaiApiKey: env.OPENAI_API_KEY,
    openaiModel: env.LOOP_OPENAI_MODEL,
    googleApiKey: env.GOOGLE_GENERATIVE_AI_API_KEY,
    googleModel: env.LOOP_GOOGLE_MODEL,
    localApiBase: env.LOCAL_LLM_API_BASE,
    localModel: env.LOCAL_LLM_MODEL,
    claudeCliApiBase: env.CLAUDE_CLI_API_BASE,
    timeoutMs: env.LOOP_LLM_TIMEOUT_MS,
  };
}

/**
 * The credential, with its kind — what the executor wrapper and the command builder both need.
 *
 * Total by construction: `parseEnv` has already refused every environment that does not hold
 * exactly one, so this cannot be reached with none.
 */
export function executorCredential(env: LoopEnv): ExecutorCredential {
  const kind: ExecutorCredentialKind =
    env.ANTHROPIC_API_KEY === undefined ? 'CLAUDE_CODE_OAUTH_TOKEN' : 'ANTHROPIC_API_KEY';

  return { kind, value: env[kind] ?? '' };
}

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
  const credential = credentialIssue(source);

  const issues = result.success
    ? []
    : result.error.issues.map((issue) => {
        const name = issue.path.join('.');
        return name === '' ? issue.message : `${name}: ${issue.message}`;
      });

  if (credential !== null) {
    issues.push(`${EXECUTOR_CREDENTIAL_KINDS.join(' | ')}: ${credential}`);
  }

  if (issues.length > 0) throw new LoopConfigurationError(issues);
  if (!result.success) throw new LoopConfigurationError(['configuration is invalid']);

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
