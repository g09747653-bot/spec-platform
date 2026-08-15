import {
  definedIdentifier,
  definedIn,
  mentionedIdentifiers,
  readLines,
  type SpecLine,
} from './identifiers';

/**
 * The deterministic spec linters (task 114; А-3 У-3; Эталон §6).
 *
 * Four checks, no model call, and that is the point rather than an optimisation. The reference
 * product's reviewer found broken cross-references and renumbered identifiers — but only on a second
 * pass, because it was *asking a model to notice* something that is decidable by reading the
 * document. Anything decidable belongs here: a measurement is always available, always the same
 * answer twice, costs nothing, and survives an exhausted provider chain (which is exactly when a
 * board would otherwise be empty).
 *
 * The four:
 *
 * 1. **cross-reference** — an identifier the document names but nothing in the bundle defines;
 * 2. **identifier-stability** — an identifier the previous revision defined and this one does not,
 *    which is what renumbering looks like from the outside;
 * 3. **ears** — a requirement line that is not in an EARS shape;
 * 4. **traceability** — a requirement with no task referring to it, in a tasks document.
 *
 * Every finding names a place and proposes a concrete change, because it becomes a Must Fix item on
 * the same board as the model's findings and has to read like one (Эталон §1.3).
 */

export const LINT_RULES = [
  'cross-reference',
  'identifier-stability',
  'ears',
  'traceability',
] as const;

export type LintRule = (typeof LINT_RULES)[number];

export interface LintFinding {
  rule: LintRule;
  /** Stable across runs over the same document: the rule plus what it is about. */
  id: string;
  sectionPath: string;
  title: string;
  body: string;
  suggestion: string;
}

export interface LintInput {
  specType: string;
  /** The revision under review. */
  content: string;
  /** The revision before it, when there is one — the only input the stability rule needs. */
  previousContent?: string | null;
  /**
   * The rest of the bundle, keyed by spec type: what a cross-reference is allowed to resolve
   * against, and where a tasks document finds the requirements it must cover.
   */
  bundle?: Readonly<Record<string, string>>;
}

/** `- [ ] 12. Do the thing` / `- [x] 12\. Do the thing` — a task line in our tasks documents. */
const TASK_LINE = /^\s*[-*+]\s*\[[ xX]\]/;

/**
 * Whether a line states a requirement.
 *
 * A bullet or a numbered line inside a section that *defines* an identifier, or any line opening
 * with an acceptance-criterion label. Deliberately narrow: prose in a Rationale paragraph is not a
 * requirement, and a linter that scolded every sentence without "shall" in it would be turned off
 * within a day.
 */
function requirementLines(lines: readonly SpecLine[]): SpecLine[] {
  const found: SpecLine[] = [];
  let insideRequirement = false;

  for (const line of lines) {
    if (/^#{1,6}\s/.test(line.text)) {
      insideRequirement = definedIdentifier(line) !== null;
      continue;
    }

    const isBullet = /^\s*(?:[-*+]\s+|\d+[.)]\s+)/.test(line.text);
    const isCriterion = /^\s*(?:[-*+]\s+|\d+[.)]\s+)?[*_`]{0,3}AC-\d/.test(line.text);

    if (isCriterion || (insideRequirement && isBullet)) found.push(line);
  }

  return found;
}

/**
 * EARS conformance, as a shape test (Эталон §6; А-3 У-3).
 *
 * The five templates share one obligation — the requirement says what the system **shall** do — and
 * differ in what precedes it. So the rule is: the line must contain `shall`, and a line that opens
 * with a trigger word must close that trigger properly (`When …, the system shall`, `If …, then the
 * system shall`). A line with a condition and no `shall` is the common failure and the one worth
 * catching: it reads like a requirement and cannot be tested.
 */
export function earsViolation(text: string): string | null {
  const line = text.replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+)/, '').trim();
  if (line === '') return null;

  // A criterion label is not part of the sentence: `AC-3: When …` is judged on what follows.
  const statement = line.replace(/^[*_`]{0,3}AC-\d+[*_`]{0,3}\s*[:—-]?\s*/i, '');
  if (statement === '') return null;

  if (!/\bshall\b/i.test(statement)) {
    return 'it never says what the system shall do, so there is nothing to test';
  }

  const trigger = /^(When|While|Where|If)\b/i.exec(statement);
  if (trigger === null) return null;

  const word = (trigger[1] ?? '').toLowerCase();
  const beforeShall = statement.slice(0, statement.toLowerCase().indexOf('shall'));

  if (word === 'if') {
    return /\bthen\b/i.test(beforeShall)
      ? null
      : 'it opens with "If" but never reaches "then", so the condition and the response run together';
  }

  return beforeShall.includes(',')
    ? null
    : `it opens with "${trigger[1] ?? ''}" but the ${word === 'while' ? 'state' : word === 'where' ? 'feature' : 'trigger'} is never closed with a comma`;
}

function crossReferenceFindings(input: LintInput, lines: readonly SpecLine[]): LintFinding[] {
  const defined = new Set<string>();

  for (const [, document] of Object.entries(input.bundle ?? {})) {
    for (const identifier of definedIn(document).keys()) defined.add(identifier);
  }
  for (const identifier of definedIn(input.content).keys()) defined.add(identifier);

  const findings = new Map<string, LintFinding>();

  for (const line of lines) {
    for (const mention of mentionedIdentifiers(line)) {
      if (defined.has(mention.identifier) || findings.has(mention.identifier)) continue;

      findings.set(mention.identifier, {
        rule: 'cross-reference',
        id: `linter-cross-reference-${mention.identifier}`,
        sectionPath: line.sectionPath,
        title: `${mention.display} is referenced but never defined`,
        body: `Line ${String(line.number)} of the ${input.specType} document refers to ${mention.display}, and no document in the bundle defines it. A coding agent following the reference finds nothing.`,
        suggestion: `Define ${mention.display} where it belongs, or change the reference to the identifier that was meant.`,
      });
    }
  }

  return [...findings.values()];
}

function stabilityFindings(input: LintInput): LintFinding[] {
  const previous = input.previousContent;
  if (previous === undefined || previous === null || previous.trim() === '') return [];

  const before = definedIn(previous);
  const after = definedIn(input.content);
  const findings: LintFinding[] = [];

  for (const [identifier, occurrence] of before) {
    if (after.has(identifier)) continue;

    findings.push({
      rule: 'identifier-stability',
      id: `linter-identifier-stability-${identifier}`,
      sectionPath: occurrence.line.sectionPath,
      title: `${occurrence.display} disappeared from this revision`,
      body: `The previous revision defined ${occurrence.display}; this one does not. Renumbering or dropping an identifier breaks every reference to it — including references in documents this one does not control.`,
      suggestion: `Restore ${occurrence.display} under its original number. If the requirement really is gone, say so explicitly rather than reusing its number for something else.`,
    });
  }

  return findings;
}

function earsFindings(input: LintInput, lines: readonly SpecLine[]): LintFinding[] {
  const findings: LintFinding[] = [];

  for (const line of requirementLines(lines)) {
    const violation = earsViolation(line.text);
    if (violation === null) continue;

    findings.push({
      rule: 'ears',
      id: `linter-ears-${String(line.number)}`,
      sectionPath: line.sectionPath,
      title: 'A requirement that is not in an EARS shape',
      body: `Line ${String(line.number)}: ${violation}. The line reads: “${line.text.trim()}”`,
      suggestion:
        'Restate it in one of the EARS forms: “The <system> shall <response>”, “When <trigger>, the <system> shall <response>”, “While <state>, …”, “Where <feature>, …”, or “If <condition>, then the <system> shall <response>”.',
    });
  }

  return findings;
}

function traceabilityFindings(input: LintInput): LintFinding[] {
  if (input.specType !== 'tasks') return [];

  const requirements = input.bundle?.requirements;
  if (requirements === undefined || requirements.trim() === '') return [];

  const referenced = new Set<string>();

  for (const line of readLines(input.content)) {
    for (const mention of mentionedIdentifiers(line)) referenced.add(mention.identifier);
  }

  // Nothing to say about a tasks document that lists no tasks at all — that is the model's job to
  // notice, and a linter claiming "no task covers FR-001" about an empty document says nothing.
  const hasTasks = readLines(input.content).some((line) => TASK_LINE.test(line.text));
  if (!hasTasks) return [];

  const findings: LintFinding[] = [];

  for (const [identifier, occurrence] of definedIn(requirements)) {
    if (referenced.has(identifier)) continue;

    findings.push({
      rule: 'traceability',
      id: `linter-traceability-${identifier}`,
      sectionPath: 'Requirement Coverage',
      title: `${occurrence.display} has no task`,
      body: `${occurrence.display} is defined in the requirements document and no task in this document refers to it. A requirement nobody builds is a requirement nobody notices is missing.`,
      suggestion: `Add a task that implements ${occurrence.display}, or name it in the requirements a listed task already covers.`,
    });
  }

  return findings;
}

/**
 * Every deterministic finding for one revision, in a stable order.
 *
 * Ordered by rule and then by id so two runs over the same bytes produce the same board — the same
 * property the context assembler holds, and for the same reason: a finding list that reshuffled
 * between renders would make a diff of two boards unreadable.
 */
export function lintSpecDocument(input: LintInput): LintFinding[] {
  const lines = readLines(input.content);

  const findings = [
    ...crossReferenceFindings(input, lines),
    ...stabilityFindings(input),
    ...earsFindings(input, lines),
    ...traceabilityFindings(input),
  ];

  return findings.sort(
    (a, b) => LINT_RULES.indexOf(a.rule) - LINT_RULES.indexOf(b.rule) || a.id.localeCompare(b.id),
  );
}
