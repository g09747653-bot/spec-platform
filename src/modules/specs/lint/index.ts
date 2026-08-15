/**
 * The deterministic spec linters (task 114; А-3 У-3).
 *
 * The public face of the module is one function and the shape it returns. How a finding becomes a
 * board item — severity, source, confidence — is the caller's business, and stated once at the place
 * the board is assembled rather than here, so this module never has to know what a review is.
 */
export { lintSpecDocument, earsViolation, LINT_RULES } from './lint-spec';
export type { LintFinding, LintInput, LintRule } from './lint-spec';
