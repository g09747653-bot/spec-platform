import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle migration tooling (constitution — Technology Constraints: migrations
 * version-controlled in-repo; D-12).
 *
 * This is build tooling, not application code: it runs outside the Next.js runtime and reads
 * the connection string directly rather than through `src/config/env.ts`, which is why the
 * `process.env` lint rule exempts root configuration files.
 *
 * Point `DATABASE_URL` at the Neon branch you intend to migrate — the production branch for a
 * production deploy, the preview branch for preview deployments (task 9).
 */

const connectionString = process.env.DATABASE_URL;

if (connectionString === undefined || connectionString === '') {
  throw new Error(
    'DATABASE_URL is not set. Drizzle cannot generate or apply migrations without a target database.',
  );
}

export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: { url: connectionString },
  strict: true,
  verbose: true,
});
