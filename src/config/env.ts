import { z } from 'zod';

/**
 * The one place this application reads its environment (IR-X2; constitution — Coding Standards:
 * runtime validation at every boundary).
 *
 * Everything is parsed once, at boot, through Zod. An invalid or missing required variable is a
 * boot failure that names every offending variable, not a `undefined` that surfaces three layers
 * deep at request time.
 *
 * A lint rule (`no-restricted-properties`) forbids `process.env` everywhere else in `src/`, so
 * this module cannot be bypassed.
 *
 * **Server-only.** Nothing here is prefixed `NEXT_PUBLIC_`, so no value in this file can reach a
 * client bundle (constitution S1; NFR-006 AC-1/AC-2).
 *
 * **Optionality is milestone-driven.** Variables whose integrations do not exist yet are optional
 * and are tightened to required at the milestone that introduces them (see `.specs/decisions.md`
 * D-8). The full variable list is the Configuration table of `.specs/solution.md`.
 */

/** Comma-separated list → trimmed, non-empty string array. */
const csv = (fallback: readonly string[]) =>
  z
    .string()
    .optional()
    .transform((raw) => {
      if (raw === undefined || raw.trim() === '') return [...fallback];
      return raw
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part !== '');
    });

const positiveInt = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((raw, ctx) => {
      if (raw === undefined || raw.trim() === '') return fallback;
      const parsed = Number(raw);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        ctx.addIssue({ code: 'custom', message: `expected a positive integer, received "${raw}"` });
        return z.NEVER;
      }
      return parsed;
    });

const boolish = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((raw, ctx) => {
      if (raw === undefined || raw.trim() === '') return fallback;
      const normalised = raw.trim().toLowerCase();
      if (normalised === 'true' || normalised === '1') return true;
      if (normalised === 'false' || normalised === '0') return false;
      ctx.addIssue({ code: 'custom', message: `expected true or false, received "${raw}"` });
      return z.NEVER;
    });

/**
 * The providers a chain may name.
 *
 * `stub` is the deterministic test double of IR-001-AC-5, selected the same way every other provider
 * is — by configuration. That is what makes "substitutable with a test double that requires no
 * network" true of the *running application* and not only of a unit test: the end-to-end suite points
 * `LLM_PROVIDER_ORDER` at it and exercises the real routes, the real engine and the real streaming
 * path with no vendor involved, exactly as it points `DATABASE_URL` at a throwaway database (D-18).
 * It needs no key, and no deployment names it (D-48).
 */
const LLM_PROVIDERS = ['anthropic', 'openai', 'google', 'ollama', 'stub'] as const;

/**
 * The address of the local provider, when one is in the chain.
 *
 * A default rather than a required variable, because there is exactly one place Ollama listens unless
 * a developer has moved it. The `/v1` suffix is part of the address, not an implementation detail: it
 * is the OpenAI-compatible surface, and the adapter speaks that protocol (D-90).
 */
const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434/v1';

/**
 * Which variable holds which provider's credential.
 *
 * The chain is what makes a key mandatory (see `requireChainKeys` below), so this map is the join
 * between "which providers are configured" and "which secrets must therefore exist". `stub` and
 * `ollama` are absent on purpose: neither has a credential to demand. For `ollama` that is the whole
 * of the rule — a local model is reached by address, and its *availability* is not checked here at
 * all, because a provider that is down is a failover concern rather than a boot failure (D-90).
 */
const PROVIDER_KEYS: Readonly<Partial<Record<(typeof LLM_PROVIDERS)[number], string>>> =
  Object.freeze({
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
    google: 'GOOGLE_GENERATIVE_AI_API_KEY',
  });

/**
 * The default failover chain.
 *
 * `google` alone, because that is the only provider funded for this deployment. This is a
 * configuration value and nothing else: adding a second provider is `LLM_PROVIDER_ORDER=google,openai`
 * plus that provider's key, with no code change anywhere (IR-001-AC-4).
 */
const DEFAULT_PROVIDER_ORDER = ['google'] as const;

/**
 * A required variable. Because `normaliseBlanks` has already turned a blank value into an absent
 * one, "missing" and "declared but empty" reach this schema identically — and both must produce
 * the same message naming the variable.
 */
const required = (description: string) =>
  z.string({ error: `required: ${description}` }).min(1, `required: ${description}`);

/**
 * The value that says "this integration has no credential in this environment".
 *
 * `BLOB_READ_WRITE_TOKEN` and `WEB_SEARCH_API_KEY` are required, so a deployment that forgets one
 * fails to boot instead of quietly serving an in-process store or a search that finds nothing
 * (D-73). But the local, no-credential path still has to be reachable, and reachable *deliberately*:
 * the end-to-end suite must not write to a live Blob store or pay for a search on every generation
 * (NFR-012 AC-2), and a developer without either account must still be able to run the application.
 *
 * So absence is stated rather than implied. This is the same move `LLM_PROVIDER_ORDER=stub` makes
 * for the model chain (D-48): the substitute is selected by configuration, in one named value, and
 * the composition roots — `createDefaultStorage`, `createDefaultResearch` — are the only readers.
 *
 * What it does *not* buy: a deployment can still choose `none` and get the local behaviour. That is
 * true of `stub` as well, and it is the honest boundary of a configuration check — it can refuse an
 * omission, never a decision.
 */
export const NO_CREDENTIAL = 'none';

const baseEnvSchema = z.object({
  // --- Required from Milestone 0 ---
  DATABASE_URL: required('the Neon connection string for this environment'),

  // --- Auth.js — required from Milestone 1 (task 12), per D-8 ---
  AUTH_SECRET: required('a random secret for Auth.js (openssl rand -base64 32)'),
  AUTH_GOOGLE_ID: required('the Google OAuth client id'),
  AUTH_GOOGLE_SECRET: required('the Google OAuth client secret'),
  AUTH_GITHUB_ID: required('the GitHub OAuth client id'),
  AUTH_GITHUB_SECRET: required('the GitHub OAuth client secret'),
  /**
   * Optional on purpose. Auth.js resolves the callback base from the request when this is absent,
   * which is what lets one build serve production and every preview URL (`trustHost`, see
   * `projects/auth/config.ts`). Setting it pins the value — useful locally, wrong on a deployment
   * whose hostname changes per commit.
   */
  AUTH_URL: z.url().optional(),

  /*
   * --- LLM providers — Milestone 3 (tasks 42–43) ---
   *
   * Declared optional here and made mandatory by the chain: `requireChainKeys` demands a key for
   * every provider named in `LLM_PROVIDER_ORDER`, and leaves the others alone. That rule is stricter
   * than "all three are required" for the providers that matter, and — unlike it — keeps working at
   * any chain length, which is what lets a provider be added later by configuration alone (D-46).
   */
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1).optional(),
  /**
   * Where the local provider listens. Optional, and carrying its own default, because `ollama` needs
   * no credential — only an address, and that address is the same on every machine that has not been
   * reconfigured (D-90).
   */
  OLLAMA_BASE_URL: z.url().optional().default(DEFAULT_OLLAMA_BASE_URL),
  /**
   * The window the local model's server was started with (А-8; task 130).
   *
   * **Ollama's own variable, read here by its own name, deliberately.** It is one number describing
   * one machine: the server sizes its context slot from it, and the assembler packs prompts to it.
   * A variable of our own meaning the same thing would be two numbers that can disagree — and the
   * symptom of that disagreement is a silently truncated prompt, which is the defect this whole
   * amendment exists to remove (D-146).
   *
   * The default is Ollama's own default, not the gate's 16 384. A machine that has not set it is
   * therefore *under*-declared and over-packs, which costs context; over-declaring would cost the
   * system instruction.
   */
  OLLAMA_CONTEXT_LENGTH: positiveInt(4_096),
  /** Ordered failover chain — configuration, never code (IR-001-AC-4). */
  LLM_PROVIDER_ORDER: csv(DEFAULT_PROVIDER_ORDER).pipe(z.array(z.enum(LLM_PROVIDERS)).min(1)),
  LLM_REQUEST_TIMEOUT_MS: positiveInt(60_000),

  // --- Workflow tuning (constitution A2; FR-005 AC-10; D-4) ---
  QUALITY_STAGE_ENABLED: boolish(false),
  MAX_ROUNDS_PER_STAGE: positiveInt(3),
  /**
   * How many times one stage may be sent back for changes (task 113; Эталон §1.3).
   *
   * Five, because that is the depth the reference session actually reached — its constitution took
   * six revisions, which is five request-changes cycles. Configuration rather than a constant so the
   * bound can be widened without a code change, exactly like the round budget.
   */
  MAX_REVISION_CYCLES_PER_STAGE: positiveInt(5),
  DECISION_INTENT_MIN_CONFIDENCE: z
    .string()
    .optional()
    .transform((raw, ctx) => {
      if (raw === undefined || raw.trim() === '') return 0.8;
      const parsed = Number(raw);
      if (Number.isNaN(parsed) || parsed < 0 || parsed > 1) {
        ctx.addIssue({ code: 'custom', message: `expected a number in [0,1], received "${raw}"` });
        return z.NEVER;
      }
      return parsed;
    }),

  /*
   * --- Storage and research — required from Milestone 5 (tasks 63, 70), tightened at the M6 tail ---
   *
   * Held optional through M5 until both were confirmed present in the deployment environment (the
   * lesson of D-8/M1: a variable made required ahead of its value fails every deploy). Now required,
   * so the in-process store and the null research adapter are unreachable on a deployment that
   * simply forgot them. `NO_CREDENTIAL` selects them where they belong (D-73).
   */
  BLOB_READ_WRITE_TOKEN: required('the Vercel Blob read-write token'),

  WEB_SEARCH_API_KEY: required('the web search API key'),
  WEB_FETCH_MAX_BYTES: positiveInt(1_000_000),
  WEB_FETCH_TIMEOUT_MS: positiveInt(10_000),

  // --- Uploads and parsing — required from Milestone 5 (tasks 63–65) ---
  PARSE_TIMEOUT_MS: positiveInt(30_000),
  MAX_UPLOAD_BYTES: positiveInt(10_485_760),
  ALLOWED_UPLOAD_TYPES: csv([
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/markdown',
    'image/png',
    'image/jpeg',
  ]),

  // --- Observability — required from Milestone 8 (task 95) ---
  SENTRY_DSN: z.string().min(1).optional(),
});

/**
 * A provider in the chain must have its key; a provider outside it need not.
 *
 * This is the rule rather than "the three keys are required", and the difference is not academic.
 * Requiring all three would fail the build of every deployment that pays for one vendor — including
 * this one — while requiring none would let a chain be configured that cannot make a single call. The
 * chain is the thing that is actually true about an environment, so the chain is what the check reads
 * (D-46; IR-001-AC-4).
 */
function requireChainKeys(
  env: z.infer<typeof baseEnvSchema>,
  ctx: z.RefinementCtx<z.infer<typeof baseEnvSchema>>,
): void {
  const source: Record<string, unknown> = { ...env };

  for (const provider of env.LLM_PROVIDER_ORDER) {
    const variable = PROVIDER_KEYS[provider];

    if (variable === undefined) continue;

    if (source[variable] === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: [variable],
        message: `required: the API key for "${provider}", which is listed in LLM_PROVIDER_ORDER`,
      });
    }
  }
}

export const envSchema = baseEnvSchema.superRefine(requireChainKeys);

export type Env = z.infer<typeof envSchema>;

/** Thrown at boot when configuration is unusable. Lists every offending variable at once. */
export class EnvironmentConfigurationError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(
      [
        'Invalid environment configuration. The process cannot start until these are fixed:',
        ...issues.map((issue) => `  - ${issue}`),
        '',
        'See the Configuration table in .specs/solution.md, and .env.example for a template.',
      ].join('\n'),
    );
    this.name = 'EnvironmentConfigurationError';
    this.issues = issues;
  }
}

/**
 * Blank means absent.
 *
 * A deployment platform hands a declared-but-unfilled variable to the build as an **empty
 * string**, not as an absent key — Vercel does this for every variable it proposes when importing
 * a project. `.optional()` admits `undefined` but not `''`, so without this every unfilled
 * later-milestone variable would fail the boot it is explicitly allowed to skip (D-12).
 *
 * Normalising here rather than per field keeps the rule in one place and keeps it symmetric: a
 * required variable supplied as `''` is still missing, and still fails by name.
 */
function normaliseBlanks(
  source: Record<string, string | undefined>,
): Record<string, string | undefined> {
  const normalised: Record<string, string | undefined> = {};

  for (const [key, value] of Object.entries(source)) {
    normalised[key] = value === undefined || value.trim() === '' ? undefined : value;
  }

  return normalised;
}

/**
 * Parses an arbitrary source of variables. Pure and injectable, so the failure path is unit
 * testable without mutating `process.env`.
 */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(normaliseBlanks(source));

  if (!result.success) {
    const issues = result.error.issues.map((issue) => {
      const name = issue.path.join('.') || '(root)';
      return `${name}: ${issue.message}`;
    });
    throw new EnvironmentConfigurationError(issues);
  }

  return result.data;
}

/* eslint-disable no-restricted-properties -- this module is the single sanctioned reader. */
let cached: Env | undefined;

/** The validated configuration, parsed once per process. */
export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
/* eslint-enable no-restricted-properties */
