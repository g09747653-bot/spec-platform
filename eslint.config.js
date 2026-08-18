import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import importX from 'eslint-plugin-import-x';
import reactHooks from 'eslint-plugin-react-hooks';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import tseslint from 'typescript-eslint';

import { noRestrictedPathsRule } from './eslint.boundaries.js';
import { designTokensConfigs } from './eslint.design-tokens.js';
import { restrictedImportConfigs } from './eslint.restricted-imports.js';
import { sectionSchemaConfigs } from './eslint.section-schema.js';
import { uiStringsConfigs } from './eslint.ui-strings.js';

/**
 * Build-blocking lint configuration.
 *
 * Constitution — Coding Standards: strict TypeScript, no `any`, no non-null assertion abuse,
 * no unchecked casts. Formatting is owned by Prettier and is never a lint concern.
 */
export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      // Output of the live gate walk — screenshots, transcripts, and hand-run probes (gitignored).
      '.gate-artifacts/**',
      // Round 5 diagnosis scratch: hand-run reproduction scripts and their output (gitignored).
      '.gate-tmp/**',
      'next-env.d.ts',
      'migrations/**',
      // Deliberate violations, linted only by `pnpm test:boundaries`.
      'src/modules/**/__fixtures__/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      // --- Constitution: no `any`, no unchecked casts, no non-null assertion abuse ---
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/consistent-type-assertions': [
        'error',
        { assertionStyle: 'as', objectLiteralTypeAssertions: 'never' },
      ],
      // --- Boundary hygiene ---
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },

  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },

  // IR-X2: the environment is read in exactly one place. `src/config/env.ts` grants itself an
  // explicit inline exemption; nothing else in the application may reach `process.env`.
  //
  // D-8 / task 46: `EventSource` is banned outright. It cannot issue the `POST` the generation stream
  // needs, cannot set headers, and reconnects on a policy resume cannot control — one fetch-based
  // reader covers both stream paths instead. Both spellings are blocked, because a rule that only
  // catches the bare global is a rule that teaches people to write `window.EventSource`.
  {
    files: ['src/**/*.{ts,tsx}', 'e2e/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message:
            'Read configuration through `getEnv()` in src/config/env.ts — it is Zod-validated and parsed once at boot (IR-X2).',
        },
        {
          object: 'window',
          property: 'EventSource',
          message:
            'EventSource is not used in this codebase (D-8). Consume both streams with response.body.getReader() through useResumableStream.',
        },
        {
          object: 'globalThis',
          property: 'EventSource',
          message:
            'EventSource is not used in this codebase (D-8). Consume both streams with response.body.getReader() through useResumableStream.',
        },
      ],
      'no-restricted-globals': [
        'error',
        {
          name: 'EventSource',
          message:
            'EventSource is not used in this codebase (D-8). Consume both streams with response.body.getReader() through useResumableStream.',
        },
      ],
    },
  },

  // Constitution A1 / D-17: the allowed-edge table is lint configuration, not convention.
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'import-x': importX },
    settings: {
      'import-x/resolver-next': [createTypeScriptImportResolver({ project: './tsconfig.json' })],
    },
    rules: {
      'import-x/no-restricted-paths': noRestrictedPathsRule,
    },
  },

  // Constitution P3 / D-16: one home for the required-heading list, and exactly two consumers.
  // Constitution P7: one file may import a provider SDK.
  ...sectionSchemaConfigs,
  ...restrictedImportConfigs,

  // Task 124: one home for colour. Tokens are declared in src/app/brand.css and nowhere else.
  ...designTokensConfigs,

  // Task 143: one home for copy. Every word a reader sees comes from src/modules/web/i18n/dictionary.
  ...uiStringsConfigs,

  // Plain JS tooling scripts are outside the TypeScript program.
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        URL: 'readonly',
      },
    },
  },

  prettierConfig,
);
