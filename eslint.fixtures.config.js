import importX from 'eslint-plugin-import-x';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import tseslint from 'typescript-eslint';

import { noRestrictedPathsRule } from './eslint.boundaries.js';
import { designTokensPlugin, designTokensRule } from './eslint.design-tokens.js';
import { restrictedImportRule } from './eslint.restricted-imports.js';
import { specPlatformPlugin } from './eslint.section-schema.js';
import { uiStringsPlugin, uiStringsRule } from './eslint.ui-strings.js';

/**
 * Configuration used only by `pnpm test:boundaries`.
 *
 * It applies the same boundary rule as `eslint.config.js` — imported from the same module, so
 * the two can never drift — to the deliberate-violation fixtures under
 * `src/modules/<module>/__fixtures__/`, which the production lint run ignores.
 *
 * No type-aware rules here: the fixtures are excluded from the TypeScript program on purpose.
 */
export default tseslint.config(
  {
    files: ['src/modules/**/__fixtures__/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { sourceType: 'module', ecmaVersion: 'latest' },
    },
    plugins: {
      'import-x': importX,
      'spec-platform': specPlatformPlugin,
      'design-tokens': designTokensPlugin,
    },
    settings: {
      'import-x/resolver-next': [createTypeScriptImportResolver({ project: './tsconfig.json' })],
    },
    rules: {
      'import-x/no-restricted-paths': noRestrictedPathsRule,
      // Tasks 39 and 42: the section schema's consumption chain and the vendor edge, checked on
      // deliberate violations. Both rule definitions are imported, never restated.
      'spec-platform/no-duplicated-section-headings': 'error',
      ...restrictedImportRule,
      // Task 124: colour literals and palette utilities, checked on deliberate violations.
      ...designTokensRule,
      // Task 46 AC-2 / D-8: `EventSource` is not used in this codebase.
      'no-restricted-globals': [
        'error',
        {
          name: 'EventSource',
          message:
            'EventSource is not used in this codebase (D-8). Consume both streams with response.body.getReader().',
        },
      ],
    },
  },

  /*
   * Task 143: no copy in a component. Its fixtures are the only ones written in `.tsx`, because the
   * rule's whole subject is JSX — text nodes, spoken attributes, printed expressions — and none of
   * those exist in a `.ts` file. That is also why they need a parser told about JSX, which the
   * block above deliberately does not ask for.
   */
  {
    files: ['src/modules/**/__fixtures__/**/*.tsx'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        sourceType: 'module',
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: { 'ui-strings': uiStringsPlugin },
    rules: uiStringsRule,
  },
);
