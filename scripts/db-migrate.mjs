#!/usr/bin/env node
/**
 * Applies every pending in-repo migration to the database named by `DATABASE_URL` (task 6).
 *
 * Used locally, by CI, and by the Vercel deploy step (task 9), which is why it takes its target
 * purely from the environment: the same command migrates the preview branch for a preview
 * deployment and the production branch for a production deploy.
 */
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { migrate } from 'drizzle-orm/neon-http/migrator';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error(
    'DATABASE_URL is not set. Set it in .env for local runs, or in the deployment environment.',
  );
  process.exit(1);
}

const db = drizzle(neon(connectionString));

try {
  await migrate(db, { migrationsFolder: './migrations' });
  console.log('Migrations applied.');
} catch (error) {
  // Never echo the connection string — it carries credentials (NFR-006 AC-2).
  console.error('Migration failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
}
