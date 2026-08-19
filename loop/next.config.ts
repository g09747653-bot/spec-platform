import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { NextConfig } from 'next';

import { getEnv } from './src/config/env.ts';

/**
 * Evaluated by `next dev`, `next build` and `next start` — so a loop with a hole in its `.env` stops
 * the CLI with the missing variable named, rather than failing hours into an autonomous run.
 */
getEnv();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {
    /*
     * **This package, not the workspace — and the loop builds with webpack because of it.**
     *
     * Turbopack picks its root by looking for a lockfile, and the only `pnpm-lock.yaml` sits at the
     * repository root. Both settings were measured, and both fail:
     *
     *   root = repository root → Turbopack adopts the *platform's* `src/instrumentation.ts` and
     *     `src/proxy.ts` as this application's convention files and fails on their `@/` imports.
     *     Hiding those two files makes the loop build, which is what pins the cause.
     *   root = this package → «Could not find the Next.js package», because pnpm's store lives in
     *     `<repo>/node_modules/.pnpm` and Turbopack does not resolve outside its root.
     *
     * So the scripts pass `--webpack`, which has neither restriction. The root stays declared as
     * this package on purpose: anyone who drops the flag gets the loud failure above rather than the
     * quiet one where two applications share a build.
     */
    root: dirname(fileURLToPath(import.meta.url)),
  },
  // Playwright and the operator both reach the dashboard over the loopback address.
  allowedDevOrigins: ['127.0.0.1'],
  typescript: {
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
