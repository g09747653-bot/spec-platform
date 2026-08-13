import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * "No duplicated structural truth", as lint (task 39; constitution P3, D-16).
 *
 * P3 makes two demands that review discipline cannot keep: the required-heading list must have
 * exactly one home, and exactly two consumers. The *import* half lives in
 * `eslint.restricted-imports.js`; this file holds the other half — a heading list rewritten anywhere
 * else (a prompt file, a test fixture, a UI string) is an error, because a second copy is exactly the
 * drift P3 exists to prevent.
 *
 * Imported by `eslint.config.js` (production lint) and `eslint.fixtures.config.js` (the
 * deliberate-violation fixtures behind `pnpm test:boundaries`), so the two can never disagree.
 */

const REPO_ROOT = import.meta.dirname;

const SCHEMA_FILE = 'src/modules/specs/section-schema.ts';

/** Files linted for the rule below. */
const LINTED = ['src/**/*.{ts,tsx}', 'e2e/**/*.ts'];

const MARKER_START = '/* section-schema:headings:start */';
const MARKER_END = '/* section-schema:headings:end */';

/**
 * Reads the heading vocabulary out of the schema module.
 *
 * The rule must not *contain* the headings — that would be the very duplication it forbids — so it
 * derives them from the one source of truth, between explicit markers. A missing marker throws:
 * a rule that quietly finds nothing to forbid is worse than no rule at all.
 */
function readHeadings() {
  const file = path.join(REPO_ROOT, SCHEMA_FILE);
  const source = readFileSync(file, 'utf8');

  const start = source.indexOf(MARKER_START);
  const end = source.indexOf(MARKER_END);

  if (start === -1 || end === -1 || end < start) {
    throw new Error(
      `${SCHEMA_FILE} must delimit its heading list with ${MARKER_START} and ${MARKER_END}; ` +
        'without the markers the no-duplicated-section-headings rule cannot find the vocabulary it enforces.',
    );
  }

  const block = source.slice(start + MARKER_START.length, end);
  const headings = [...block.matchAll(/'([^'\\\n]+)'/g)].map((match) => match[1]);

  if (headings.length === 0) {
    throw new Error(`${SCHEMA_FILE} declares no headings between its markers.`);
  }

  return new Set(headings.map(normalise));
}

/** The comparison `section-schema.ts` documents: trim, collapse whitespace, case-fold. */
function normalise(value) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** `## Overview` and `Overview` are the same claim about structure. */
function asHeadingText(value) {
  return normalise(value.replace(/^\s*#{1,6}\s+/, ''));
}

let cachedHeadings;

function knownHeadings() {
  cachedHeadings ??= readHeadings();
  return cachedHeadings;
}

/**
 * Reports a file that names two or more required headings.
 *
 * Two is the threshold on purpose. One occurrence of `'Overview'` is a word; two of them in the same
 * file — `'Overview'` next to `'Data Model'` — is a heading list, which is the thing P3 forbids. The
 * looser rule (any single heading string) would fire on ordinary UI copy and be switched off within a
 * week; this one fires on what actually constitutes duplicated structural truth.
 */
const noDuplicatedSectionHeadings = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Forbid restating the required section headings outside specs/section-schema.ts (constitution P3).',
    },
    schema: [],
    messages: {
      duplicated:
        'Duplicated structural truth: "{{heading}}" is a required section heading, and this file already names {{first}}. ' +
        'Required headings live only in specs/section-schema.ts and reach the rest of the system through validateStructure (constitution P3, D-16).',
    },
  },
  create(context) {
    const headings = knownHeadings();
    /** @type {{ node: import('estree').Node, text: string }[]} */
    const found = [];

    function consider(node, raw) {
      if (typeof raw !== 'string') return;
      const text = asHeadingText(raw);
      if (!headings.has(text)) return;
      if (found.some((entry) => entry.text === text)) return;
      found.push({ node, text });
    }

    return {
      Literal(node) {
        consider(node, node.value);
      },
      TemplateElement(node) {
        consider(node, node.value.cooked ?? node.value.raw);
      },
      'Program:exit'() {
        if (found.length < 2) return;

        const [first, ...rest] = found;
        for (const entry of rest) {
          context.report({
            node: entry.node,
            messageId: 'duplicated',
            data: { heading: entry.text, first: `"${first.text}"` },
          });
        }
      },
    };
  },
};

export const specPlatformPlugin = {
  rules: { 'no-duplicated-section-headings': noDuplicatedSectionHeadings },
};

/** The config blocks both ESLint configurations spread in. */
export const sectionSchemaConfigs = [
  {
    files: LINTED,
    plugins: { 'spec-platform': specPlatformPlugin },
    rules: {
      'spec-platform/no-duplicated-section-headings': 'error',
    },
  },
  {
    // The schema module is where the headings live. Its two consumers are *not* exempt: they read the
    // list through the import, so they have no reason to spell one out either.
    files: [SCHEMA_FILE],
    rules: { 'spec-platform/no-duplicated-section-headings': 'off' },
  },
];
