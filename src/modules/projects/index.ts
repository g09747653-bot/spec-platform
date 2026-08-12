/**
 * `projects` — user projects, sessions, attachments.
 *
 * Ownership is enforced in the repository signature via `OwnerScope` (D-13, NFR-005).
 *
 * May import: repository interfaces, `adapters/parsing`, `adapters/storage`.
 * Must not import: `workflow`, `agents`, `prompts`, `specs`, `quality`, `web`,
 * `adapters/llm`, `adapters/research`.
 */
export const MODULE_ID = 'projects';
