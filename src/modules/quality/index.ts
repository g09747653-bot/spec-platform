/**
 * `quality` — the optional Quality stage (constitution A6).
 *
 * Nothing may import this module. It is reachable only through the capability registry,
 * which is empty when `QUALITY_STAGE_ENABLED` is false, so the parity path is byte-identical
 * whether or not this module is installed (constitution P3).
 *
 * May import: `prompts`, `specs`, `adapters/llm`.
 */
export const MODULE_ID = 'quality';
