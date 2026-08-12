import importX from 'eslint-plugin-import-x';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import tseslint from 'typescript-eslint';

import { noRestrictedPathsRule } from './eslint.boundaries.js';

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
  plugins: { 'import-x': importX },
  settings: {
    'import-x/resolver-next': [createTypeScriptImportResolver({ project: './tsconfig.json' })],
  },
  rules: {
    'import-x/no-restricted-paths': noRestrictedPathsRule,
  },
});
