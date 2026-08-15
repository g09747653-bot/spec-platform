import type { TransitionEdge } from '@/modules/workflow/transition-table';

import { MYSPEC_BROWNFIELD_V1, MYSPEC_EDIT_V1, MYSPEC_GREENFIELD_V1 } from './configs/myspec';
import { OPENSPEC_BROWNFIELD_V1, SPECKIT_GREENFIELD_V1 } from './configs/foreign';
import { buildTransitionTable } from './graph';
import type { ChatClass, MethodologyConfig } from './model/config';
import { assertMethodologyConfig } from './validate';

/**
 * The methodology registry (task 116; Эталон §1.4).
 *
 * Five configurations, one of which is the workflow every earlier milestone was written against.
 * `DEFAULT_METHODOLOGY_ID` is `myspec-greenfield-v1` and everything that has no opinion resolves to
 * it — a session row written before this milestone, a snapshot built from a literal in a test, a
 * caller that has no session at all. That is what keeps "the parity path is untouched" a property of
 * the code rather than a promise: the default is not a special case in the engine, it is simply the
 * configuration the engine gets when nobody chose another.
 *
 * Tables are built once, at module load, and frozen. They are pure functions of frozen configs, so
 * caching them costs nothing to reason about and saves rebuilding the graph on every gate evaluation.
 */
export const METHODOLOGY_CONFIGS: readonly MethodologyConfig[] = Object.freeze([
  MYSPEC_GREENFIELD_V1,
  MYSPEC_BROWNFIELD_V1,
  SPECKIT_GREENFIELD_V1,
  OPENSPEC_BROWNFIELD_V1,
  MYSPEC_EDIT_V1,
]);

export const METHODOLOGY_IDS = METHODOLOGY_CONFIGS.map((config) => config.id);

export type MethodologyId = string;

export const DEFAULT_METHODOLOGY_ID = MYSPEC_GREENFIELD_V1.id;

const BY_ID: ReadonlyMap<string, MethodologyConfig> = new Map(
  METHODOLOGY_CONFIGS.map((config) => [config.id, config] as const),
);

const TABLES: ReadonlyMap<string, readonly TransitionEdge[]> = new Map(
  METHODOLOGY_CONFIGS.map(
    (config) => [config.id, Object.freeze(buildTransitionTable(config))] as const,
  ),
);

export function isMethodologyId(value: string): boolean {
  return BY_ID.has(value);
}

/**
 * The configuration for an id, falling back to the default.
 *
 * Total on purpose. The id arrives from a database column, and a row naming a methodology this build
 * no longer ships is a session that must still open — degrading to the parity graph shows the user a
 * workflow that works, where throwing would show them a page that does not (P5). The picker and the
 * request boundary both validate against `isMethodologyId`, so an unknown id cannot be *written*;
 * this path only covers reading one that already exists.
 */
export function methodologyConfig(id: string | null | undefined): MethodologyConfig {
  if (id === null || id === undefined) return MYSPEC_GREENFIELD_V1;
  return BY_ID.get(id) ?? MYSPEC_GREENFIELD_V1;
}

/** The transition table of a methodology — the graph the state machine walks for that session. */
export function transitionTableFor(id: string | null | undefined): readonly TransitionEdge[] {
  const table = id === null || id === undefined ? undefined : TABLES.get(id);
  return table ?? TABLES.get(DEFAULT_METHODOLOGY_ID) ?? [];
}

/** The methodologies a picker may offer for a chat class (task 117). */
export function methodologiesForChatClass(chatClass: ChatClass): MethodologyConfig[] {
  return METHODOLOGY_CONFIGS.filter((config) => config.chatClass === chatClass);
}

/**
 * Boot guard (task 116 AC-2). Called from `instrumentation.ts` and `next.config.ts`, beside the
 * prompt-registry assertion — a malformed graph is a build-time error, not a runtime surprise.
 */
export function assertMethodologyConfigs(): void {
  for (const config of METHODOLOGY_CONFIGS) assertMethodologyConfig(config);
}
