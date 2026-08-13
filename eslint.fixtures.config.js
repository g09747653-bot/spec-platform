import importX from 'eslint-plugin-import-x';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import tseslint from 'typescript-eslint';

import { noRestrictedPathsRule } from './eslint.boundaries.js';
import { restrictedImportRule } from './eslint.restricted-imports.js';
import { specPlatformPlugin } from './eslint.section-schema.js';

/**
 * Configuration used only by `pnpm test:boundaries`.
 *
 * It applies the same boundary rule as `eslint.config.js` — imported from the same module, so
 * the two can never drift — to the deliberate-violation fixtures under
 * `src/modules/<module>/__fixtures__/`, which the production lint run ignores.
 *
 * No type-aware rules here: the fixtures are excluded from the TypeScript program on purpose.
 */
export default tseslint.config({
  files: ['src/modules/**/__fixtures__/**/*.ts'],
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: { sourceType: 'module', ecmaVersion: 'latest' },
  },
  plugins: { 'import-x': importX, 'spec-platform': specPlatformPlugin },
  settings: {
    'import-x/resolver-next': [createTypeScriptImportResolver({ project: './tsconfig.json' })],
  },
  rules: {
    'import-x/no-restricted-paths': noRestrictedPathsRule,
    // Tasks 39 and 42: the section schema's consumption chain and the vendor edge, checked on
    // deliberate violations. Both rule definitions are imported, never restated.
    'spec-platform/no-duplicated-section-headings': 'error',
    ...restrictedImportRule,
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
});
