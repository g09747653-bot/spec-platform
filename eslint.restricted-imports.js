/**
 * Import restrictions expressed against module *specifiers* rather than paths (tasks 39, 42).
 *
 * Two rules live here, and they share one ESLint rule name, which is why they share a file: ESLint
 * merges configuration last-wins **per rule**, so a second `no-restricted-imports` block would silently
 * replace the first for any file both match. Keeping the patterns in one place and expressing the
 * exemptions as narrower blocks that re-state the remaining restriction is the only arrangement in
 * which both stay in force.
 *
 * 1. **The section schema's consumption chain** (constitution P3, D-16): only `assemblePrompt` and
 *    `validateStructure` may import `specs/section-schema.ts`.
 * 2. **The vendor edge** (constitution P7 and Technology Constraints — Disallowed: "direct calls to
 *    any provider SDK from React components or business logic modules"): only `adapters/llm/providers.ts`
 *    may import the AI SDK. Everything else talks to `LlmAdapter`.
 */

/** The only two files permitted to import the schema module. */
const SCHEMA_CONSUMERS = [
  'src/modules/prompts/assemble-prompt.ts',
  'src/modules/specs/validate-structure.ts',
];

/** The only file permitted to import a provider SDK. */
const VENDOR_EDGE = ['src/modules/adapters/llm/providers.ts'];

const LINTED = ['src/**/*.{ts,tsx}', 'e2e/**/*.ts'];

const SCHEMA_PATTERN = {
  group: [
    '@/modules/specs/section-schema',
    './section-schema',
    '../section-schema',
    '**/specs/section-schema',
  ],
  message:
    'Only assemblePrompt and validateStructure may import specs/section-schema.ts. ' +
    'Ask validateStructure whether a document conforms — it is the single structural-validation entry point (constitution P3, D-16).',
};

const SDK_PATTERN = {
  group: ['ai', '@ai-sdk/*', '@ai-sdk/*/**'],
  message:
    'Provider SDKs are confined to src/modules/adapters/llm/providers.ts (constitution P7, A3). ' +
    'Generate through the LlmAdapter interface, which mentions no vendor type and is substitutable by a test double (IR-001-AC-5).',
};

const rule = (...patterns) => ({ 'no-restricted-imports': ['error', { patterns }] });

export const restrictedImportConfigs = [
  { files: LINTED, rules: rule(SCHEMA_PATTERN, SDK_PATTERN) },
  // The schema's own consumers keep the vendor restriction, and lose only the schema one.
  { files: SCHEMA_CONSUMERS, rules: rule(SDK_PATTERN) },
  // The vendor edge keeps the schema restriction, and loses only the SDK one.
  { files: VENDOR_EDGE, rules: rule(SCHEMA_PATTERN) },
];

/** Both patterns, for the fixture configuration — no file there is exempt from either. */
export const restrictedImportRule = rule(SCHEMA_PATTERN, SDK_PATTERN);
