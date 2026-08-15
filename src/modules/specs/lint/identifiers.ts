/**
 * Reading a specification document as structure rather than as prose (task 114; А-3 У-3).
 *
 * Everything the linters need comes from three questions about a line: which heading is it under,
 * does it *define* a requirement identifier, and does it merely *mention* one. The distinction
 * between defining and mentioning is the whole of the cross-reference rule — «FR-012» at the head of
 * its own entry is a definition, the same token inside a sentence is a reference to one — so it is
 * drawn once, here, and the rules above never re-derive it.
 *
 * Deliberately syntactic. Nothing here knows what a requirement means, and nothing here calls a
 * model: a cross-reference either resolves or it does not, and that is a measurement (see
 * `FEEDBACK_SOURCES`). The cost of that honesty is that the parser must be conservative — it treats
 * only unambiguous shapes as definitions, so the failure mode is a missed finding rather than a
 * fabricated one.
 */

/**
 * The identifier families this project uses.
 *
 * `FR`/`NFR`/`DR`/`IR` are the families `.specs/requirements.md` defines and `AC` is the acceptance
 * criterion suffix that appears inside them. Generated bundles follow the same convention because
 * the generation prompt is derived from the same section schema.
 */
const FAMILIES = ['NFR', 'FR', 'DR', 'IR'];

/**
 * `FR-001`, `NFR-012`, `DR-4`, `IR-002` — anywhere in a line.
 *
 * The boundaries are spelled out rather than left to `\b`, and that is not pedantry: `_` is a word
 * character, so `\b` does **not** sit between `1` and `_`, and `_Requirements: FR-001_` — the exact
 * shape every task in this bundle uses to trace itself — matched nothing at all. `NFR` leads the
 * alternation for the same class of reason: `FR|NFR` would match the `FR` inside `NFR-001` at the
 * wrong offset if the lookbehind ever loosened.
 */
const MENTION = new RegExp(
  `(?<![0-9A-Za-z])(${FAMILIES.join('|')})-(\\d{1,4})(?![0-9A-Za-z])`,
  'g',
);

/**
 * A line that *introduces* an identifier.
 *
 * Two shapes, and the split is where the whole cross-reference rule lives. **Prefixed**: a heading
 * (`### FR-001 …`), a list item (`- **FR-001** …`), or a table cell (`| FR-001 | … |`) — the marker
 * is itself the announcement that an entry begins. **Bare**: a line that opens with the identifier
 * *and a separator* (`FR-001 — Authentication`), because that is a title and not a sentence.
 *
 * A bare line with no separator — «FR-042 is constrained by …» — is a mention, and treating it as a
 * definition is the one mistake that would make the cross-reference rule useless: every broken
 * reference that happened to start its sentence would define itself.
 */
const DEFINITION_PREFIXED = new RegExp(
  `^\\s*(?:#{1,6}\\s+|[-*+]\\s+|\\d+[.)]\\s+|\\|\\s*)[*_\`]{0,3}(${FAMILIES.join('|')})-(\\d{1,4})(?![0-9A-Za-z])`,
);

const DEFINITION_BARE = new RegExp(
  `^\\s*[*_\`]{0,3}(${FAMILIES.join('|')})-(\\d{1,4})[*_\`]{0,3}\\s*[—–:-]\\s+`,
);

export interface SpecLine {
  /** 1-based, for the humans reading the finding rather than for the schema (v2 stores no line). */
  number: number;
  text: string;
  /** The nearest heading above this line, or `''` above the first one. */
  heading: string;
  /** The heading trail, «Section — Subsection», as review.v2 items name a place. */
  sectionPath: string;
}

/** Normalises an identifier so `FR-1` and `FR-001` are the same requirement. */
export function canonicalIdentifier(family: string, digits: string): string {
  return `${family.toUpperCase()}-${String(Number(digits))}`;
}

/** How the identifier was written where it was found — what a finding should quote back. */
export function displayIdentifier(family: string, digits: string): string {
  return `${family.toUpperCase()}-${digits}`;
}

/** Splits a document into lines that know where they are. */
export function readLines(content: string): SpecLine[] {
  const trail: string[] = [];
  const lines: SpecLine[] = [];

  let fenced = false;

  for (const [index, raw] of content.split(/\r?\n/).entries()) {
    const text = raw;

    // A fenced block is quoted material — an example requirement inside one is not a requirement.
    if (/^\s*(```|~~~)/.test(text)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;

    const heading = /^(#{1,6})\s+(.*)$/.exec(text);

    if (heading !== null) {
      const depth = heading[1]?.length ?? 1;
      const title = (heading[2] ?? '').trim();
      trail.length = Math.max(0, depth - 1);
      trail[depth - 1] = title;
    }

    const path = trail.filter((part) => part !== '');

    lines.push({
      number: index + 1,
      text,
      heading: path[path.length - 1] ?? '',
      sectionPath: path.length === 0 ? '(document)' : path.join(' — '),
    });
  }

  return lines;
}

export interface IdentifierOccurrence {
  identifier: string;
  display: string;
  line: SpecLine;
}

/** Every identifier a line introduces — at most one, because an entry opens with its own name. */
export function definedIdentifier(line: SpecLine): IdentifierOccurrence | null {
  const match = DEFINITION_PREFIXED.exec(line.text) ?? DEFINITION_BARE.exec(line.text);
  if (match === null) return null;

  const [, family = '', digits = ''] = match;

  return {
    identifier: canonicalIdentifier(family, digits),
    display: displayIdentifier(family, digits),
    line,
  };
}

/** Every identifier a line names, definition included. */
export function mentionedIdentifiers(line: SpecLine): IdentifierOccurrence[] {
  const found: IdentifierOccurrence[] = [];

  for (const match of line.text.matchAll(MENTION)) {
    const [, family = '', digits = ''] = match;
    found.push({
      identifier: canonicalIdentifier(family, digits),
      display: displayIdentifier(family, digits),
      line,
    });
  }

  return found;
}

/** The set of identifiers a document defines. */
export function definedIn(content: string): Map<string, IdentifierOccurrence> {
  const defined = new Map<string, IdentifierOccurrence>();

  for (const line of readLines(content)) {
    const occurrence = definedIdentifier(line);
    if (occurrence !== null && !defined.has(occurrence.identifier)) {
      defined.set(occurrence.identifier, occurrence);
    }
  }

  return defined;
}
