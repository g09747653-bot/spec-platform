/**
 * `agents` — per-stage agent definitions and orchestration.
 *
 * Agents may propose content; they never control flow (constitution P1).
 *
 * May import: `prompts`, `specs`, `projects`, `adapters/llm`, `adapters/research`,
 * `workflow` (read-only).
 * Must not import: `quality`, `web`, `adapters/parsing`, `adapters/storage`.
 */
export const MODULE_ID = 'agents';
