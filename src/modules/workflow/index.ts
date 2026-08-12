/**
 * `workflow` — stage/substage state machine, gates, transitions (constitution A2).
 *
 * The only module permitted to change a session's stage. Gates are pure predicates over
 * persisted state and perform no I/O (NFR-012 AC-1).
 *
 * May import: repository interfaces, `specs` types, capability interfaces.
 * Must not import: `agents`, `prompts`, `projects`, `quality`, `adapters`, `web`.
 */
export const MODULE_ID = 'workflow';
