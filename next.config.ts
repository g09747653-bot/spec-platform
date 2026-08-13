import type { NextConfig } from 'next';

import { getEnv } from './src/config/env';
import { assertPromptRegistry } from './src/modules/prompts/registry';

/**
 * Evaluated by `next dev`, `next build` and `next start`. Parsing the environment here means an
 * invalid configuration stops the CLI with a non-zero exit code and a message naming every
 * offending variable, instead of failing later at request time (IR-X2; task 7).
 *
 * The prompt registry is checked in the same breath (task 41): a template that uses an undeclared
 * placeholder, or declares a variable no template uses, fails the build rather than reaching a model
 * with `{{foo}}` in it.
 */
getEnv();
assertPromptRegistry();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  /**
   * `pg` is used only for the test/local database path (D-18) and is a CommonJS package with optional
   * native bindings. Left to the bundler it produces resolution warnings for dependencies it never
   * loads; kept external it is simply required at runtime by the Node server.
   */
  serverExternalPackages: ['pg'],
  // Playwright drives the dev server over the loopback address.
  allowedDevOrigins: ['127.0.0.1'],
  typescript: {
    // Constitution — Coding Standards: type errors must fail the build, never be ignored.
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
