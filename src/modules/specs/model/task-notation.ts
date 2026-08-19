/**
 * How a tasks document records a task, and how it records what that task waits for (task 169).
 *
 * **One notation, two consumers**, for the reason the section schema has one home and two consumers
 * (constitution P3): the form the model is *asked* to write and the form the machine bundle
 * *reads* have to be the same form, or the contract holds only by luck. The M14а gate is what that
 * luck looks like when it runs out — the live document wrote its tasks as emphasised bullets under
 * phase headings, the mapping knew two other shapes, and the loop received a schema-valid
 * `tasks.json` containing zero tasks from a 33-KB source.
 *
 * The consumers are:
 *
 * - **the mapping** (`specs/export/machine-bundle.ts`), which recognises all three shapes below as
 *   *tolerance* — bundles already sealed under the old instruction must keep exporting — and reads
 *   `dependsOn` out of the dependency clause;
 * - **the tasks-generation instruction** (`prompts/assets/spec-generation.ts`), which renders the
 *   canonical record from `CANONICAL_TASK_RECORD` and names the dependency labels from
 *   `DEPENDENCY_LABELS`.
 *
 * Nothing here validates: a document that ignores the canonical form is still a valid document and
 * still exports (the form is an instruction, not a refusal). What the canonical form buys is a
 * document whose dependencies are *stated*, because a bundle whose every `dependsOn` is empty
 * leaves the loop's planner blind to order — which is exactly the bundle the M14а gate produced.
 */

/** The words that open an explicit dependency clause, in both languages of the product (У-1). */
export const DEPENDENCY_LABELS = ['Dependencies', 'Зависимости'] as const;

/** What a task with nothing to wait for writes, so "none" is stated rather than left out. */
export const NO_DEPENDENCIES_MARK = '—';

/**
 * The canonical record: a markdown task-list item whose identifier precedes its title, with the
 * dependency clause on a line of its own beneath it.
 *
 * These are *lines*, not prose: the instruction quotes them and the mapping parses them, and a unit
 * test runs each one through the parser so a change here that the mapping cannot read fails loudly
 * rather than at the next live generation.
 */
export const CANONICAL_TASK_RECORD = Object.freeze({
  /** Opens a task. `1.` is the identifier the rest of the bundle refers to it by. */
  entry: '- [ ] 1. Short imperative title',
  /** States what the task waits for, by identifier. */
  dependencies: `_${DEPENDENCY_LABELS[0]}: 2, 3_`,
  /** The same clause for a task that waits for nothing. */
  noDependencies: `_${DEPENDENCY_LABELS[0]}: ${NO_DEPENDENCIES_MARK}_`,
} as const);

/** `#### Task 1.1: Title` / `#### Задача 2: Название` — the heading shape the A0 bundle writes. */
export const TASK_HEADING =
  /^ {0,3}(#{1,6})\s+(?:task|задача)\s+([A-Za-z0-9.-]+)\s*[:.—–-]\s*(.+)$/i;

/**
 * `- [ ] 148\. Title` / `- [x] 7. Title` — the checkbox shape, and the canonical one.
 *
 * Canonical because it is the only one of the three that carries an identifier the rest of the
 * bundle can refer to *and* survives being read as ordinary markdown: a task list renders as a task
 * list, and its checkbox is where progress is recorded.
 */
export const TASK_CHECKBOX = /^\s*[-*+]\s+\[[ xX]\]\s+(\d+(?:\.\d+)*)\\?[.)]\s+(.+)$/;

/**
 * `* **Задача 1.1: Название**` / `- **Task 2 — Title**` — the bold-bullet shape the M14а gate
 * caught in live output. The emphasis marks are required: a plain sentence that merely *mentions*
 * «задача 3» must not open an entry, and the task word with its token does the rest.
 */
export const TASK_BULLET =
  /^\s*[-*+]\s+[*_]{1,3}\s*(?:task|задача)\s+([A-Za-z0-9.-]+)\s*[:.—–-]\s*(.+)$/i;

/** A line that states an entry's dependencies, in either language of the product. */
export const DEPENDS_LINE = new RegExp(`(${DEPENDENCY_LABELS.join('|')})\\s*:`, 'iu');
