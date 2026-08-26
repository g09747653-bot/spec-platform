import { createChain, type Chain } from './chain.ts';
import { LLM_PROVIDERS, type LlmProviderId } from './types.ts';

/**
 * Which model answers for which role (task 161; амендмент А-24 §1).
 *
 * The customer's instruction is literal: «контролировать и исследовать будет тот же самый тип,
 * который исполняет — Claude, но может быть GPT». So the **default** for every auxiliary role is the
 * executor's own vendor, and switching a role to a different cloud provider or to a local model is a
 * line of configuration rather than a change of code.
 *
 * **What «the same account» can and cannot mean here, measured rather than assumed.** The executor
 * runs Claude Code inside a container with a subscription token; the loop's own chain speaks HTTP to
 * `api.anthropic.com`, which takes a metered key and nothing else. On a subscription-only machine
 * the `anthropic` link therefore has no credential and is *skipped* — that is the chain's ordinary
 * behaviour (task 152), not a failure — and the role falls through to whatever else is configured.
 * The M15а gate walked exactly that path: the task architect ran on Google because the Anthropic
 * link had nothing to authenticate with. Putting the executor's vendor first anyway is what makes
 * the default true the moment a key exists, without a second code path appearing on that day.
 */

/**
 * The roles that ask a model something. Executors are containers and are not on this list.
 *
 * `judge` — суд качества (А-44 п.2). Своя роль, а не заимствованный архитектор: «судья подыгрывает
 * своему конвейеру» — именованный режим отказа, и разводить их конфигурацией должно быть возможно
 * одной строкой. Цепочка сама отберёт звено, которое ВИДИТ (`supportsImages`), — судить кадры
 * текстовой моделью значит получить уверенный текст о том, чего она не смотрела.
 */
export const LOOP_ROLES = ['architect', 'controller', 'researcher', 'judge'] as const;

export type LoopRole = (typeof LOOP_ROLES)[number];

/** The vendor an executor container runs: Claude Code is Anthropic's, whichever credential it holds. */
export const EXECUTOR_VENDOR: LlmProviderId = 'anthropic';

export interface RoleConfiguration {
  /** `LOOP_PROVIDER_ORDER` — the chain every role falls back to. */
  order: readonly LlmProviderId[];
  /** `LOOP_ROLE_PROVIDER_<ROLE>` — an explicit order for one role, when the operator set one. */
  perRole?: Partial<Record<LoopRole, readonly LlmProviderId[]>>;
}

/**
 * The attempt order for one role.
 *
 * An explicit per-role setting is taken **whole**: an operator who writes `google` for the
 * researcher means the researcher runs on Google, not «Google after Claude». Without one, the
 * executor's vendor leads and the configured chain follows, deduplicated so a chain that already
 * names it is not asked twice.
 */
export function roleOrder(config: RoleConfiguration, role: LoopRole): LlmProviderId[] {
  const explicit = config.perRole?.[role];
  if (explicit !== undefined && explicit.length > 0) return [...explicit];

  return [...new Set<LlmProviderId>([EXECUTOR_VENDOR, ...config.order])];
}

/** Parses a `LOOP_ROLE_PROVIDER_*` value: a comma-separated order, or nothing at all. */
export function parseRoleOrder(value: string | undefined): LlmProviderId[] | undefined {
  if (value === undefined || value.trim() === '') return undefined;

  const parsed = value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry): entry is LlmProviderId =>
      (LLM_PROVIDERS as readonly string[]).includes(entry),
    );

  return parsed.length === 0 ? undefined : parsed;
}

export type RoleCredentials = Omit<Parameters<typeof createChain>[0], 'order'>;

/** The chain one role speaks through. Same adapters, same failover; only the order differs. */
export function createRoleChain(
  config: RoleConfiguration,
  role: LoopRole,
  credentials: RoleCredentials,
): Chain {
  return createChain({ ...credentials, order: roleOrder(config, role) });
}
