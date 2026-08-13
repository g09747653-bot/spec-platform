#!/usr/bin/env node
/**
 * Boundary fixture check (task 3; constitution A1, SC-15) and section-schema chain check
 * (task 39; constitution P3, D-16).
 *
 * Asserts that the lint-encoded rules actually reject the violations they exist for — and, just as
 * importantly, still permit the allowed ones. Run in CI as its own build-blocking step so that a
 * rule silently losing its teeth is a red build.
 *
 * Exits non-zero on the first expectation that does not hold.
 */
import { ESLint } from 'eslint';

const RULE = 'import-x/no-restricted-paths';
const SCHEMA_IMPORT_RULE = 'no-restricted-imports';
const HEADINGS_RULE = 'spec-platform/no-duplicated-section-headings';

/** @type {{ file: string, shouldFail: boolean, why: string, rule?: string }[]} */
const EXPECTATIONS = [
  {
    file: 'src/modules/web/__fixtures__/web-imports-adapters.ts',
    shouldFail: true,
    why: "'web' must not import 'adapters/*'",
  },
  {
    file: 'src/modules/specs/__fixtures__/specs-imports-quality.ts',
    shouldFail: true,
    why: "no core module may import 'quality' (constitution A6)",
  },
  {
    file: 'src/modules/workflow/__fixtures__/workflow-imports-agents.ts',
    shouldFail: true,
    why: "'workflow' must not import 'agents'",
  },
  {
    file: 'src/modules/adapters/llm/__fixtures__/adapters-imports-workflow.ts',
    shouldFail: true,
    why: "'adapters/*' must not import a core module",
  },
  {
    file: 'src/modules/web/__fixtures__/web-imports-repository.ts',
    shouldFail: true,
    why: "'web' must not reach a repository directly (D-13); it goes through a server action",
  },
  {
    file: 'src/modules/prompts/__fixtures__/prompts-imports-specs.ts',
    shouldFail: false,
    why: "'prompts' MAY import 'specs' (the section schema)",
  },
  {
    file: 'src/modules/agents/__fixtures__/agents-imports-section-schema.ts',
    shouldFail: true,
    rule: SCHEMA_IMPORT_RULE,
    why: 'only assemblePrompt and validateStructure may import section-schema.ts (P3)',
  },
  {
    file: 'src/modules/specs/__fixtures__/specs-relative-imports-section-schema.ts',
    shouldFail: true,
    rule: SCHEMA_IMPORT_RULE,
    why: 'the relative spelling of the same import is restricted too',
  },
  {
    file: 'src/modules/prompts/__fixtures__/prompts-restates-headings.ts',
    shouldFail: true,
    rule: HEADINGS_RULE,
    why: 'a heading list restated in a prompt asset is duplicated structural truth (P3)',
  },
];

const eslint = new ESLint({
  overrideConfigFile: 'eslint.fixtures.config.js',
  // The fixtures are globally ignored by the production config; lint them anyway.
  ignore: false,
});

const results = await eslint.lintFiles(EXPECTATIONS.map((e) => e.file));

/** @type {string[]} */
const failures = [];

for (const expectation of EXPECTATIONS) {
  const result = results.find((r) => r.filePath.replace(/\\/g, '/').endsWith(expectation.file));

  if (!result) {
    failures.push(`${expectation.file}: fixture was not linted at all (is it still there?)`);
    continue;
  }

  const rule = expectation.rule ?? RULE;
  const violations = result.messages.filter((m) => m.ruleId === rule);
  const didFail = violations.length > 0;

  if (didFail !== expectation.shouldFail) {
    failures.push(
      expectation.shouldFail
        ? `${expectation.file}: expected a ${rule} error because ${expectation.why}, got none. The rule has lost its teeth.`
        : `${expectation.file}: expected NO ${rule} error because ${expectation.why}, got ${String(violations.length)}: ${violations.map((v) => v.message).join(' | ')}`,
    );
    continue;
  }

  // A fixture must not be silently unparseable — that would fake a pass either way.
  const fatal = result.messages.filter((m) => m.fatal);
  if (fatal.length > 0) {
    failures.push(
      `${expectation.file}: fatal parse error: ${fatal.map((f) => f.message).join(' | ')}`,
    );
    continue;
  }

  const verdict = expectation.shouldFail ? 'rejected' : 'allowed';
  console.log(`  ok  ${verdict.padEnd(8)} ${expectation.file}`);
}

if (failures.length > 0) {
  console.error('\nBoundary fixture check FAILED:\n');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(`\nBoundary fixture check passed (${String(EXPECTATIONS.length)} fixtures).`);
