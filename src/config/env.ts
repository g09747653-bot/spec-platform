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

const LLM_PROVIDERS = ['anthropic', 'openai', 'google'] as const;

/**
 * A required variable. Because `normaliseBlanks` has already turned a blank value into an absent
 * one, "missing" and "declared but empty" reach this schema identically — and both must produce
 * the same message naming the variable.
 */
const required = (description: string) =>
  z.string({ error: `required: ${description}` }).min(1, `required: ${description}`);

export const envSchema = z.object({
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

  // --- LLM providers — required from Milestone 3 (tasks 39–44) ---
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().min(1).optional(),
  /** Ordered failover chain — configuration, never code (IR-001-AC-4). */
  LLM_PROVIDER_ORDER: csv(LLM_PROVIDERS).pipe(z.array(z.enum(LLM_PROVIDERS)).min(1)),
  LLM_REQUEST_TIMEOUT_MS: positiveInt(60_000),

  // --- Workflow tuning (constitution A2; FR-005 AC-10; D-4) ---
  QUALITY_STAGE_ENABLED: boolish(false),
  MAX_ROUNDS_PER_STAGE: positiveInt(3),
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

  // --- Storage — required from Milestone 5 (task 63) ---
  BLOB_READ_WRITE_TOKEN: z.string().min(1).optional(),

  // --- Research — required from Milestone 5 (task 68) ---
  WEB_SEARCH_API_KEY: z.string().min(1).optional(),
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
