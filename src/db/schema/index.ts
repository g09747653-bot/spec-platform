/**
 * Drizzle schema barrel — the single module `drizzle.config.ts` reads to derive migrations.
 *
 * Tables arrive with their milestones: `users`, `projects`, `sessions` and `workflow_state` in
 * task 11; the Auth.js adapter tables in task 12; `spec_files` and `spec_revisions` with the
 * column-scoped immutability trigger in task 16 (D-11).
 */

export * from './users';
export * from './auth';
export * from './projects';
export * from './workflow';
