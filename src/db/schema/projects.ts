import { boolean, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { users } from './users';

/**
 * Owned container for one bundle (DR-1; FR-002).
 *
 * `owner_id` is `NOT NULL` and cascades: every row below a project resolves to exactly one user,
 * which is what makes the `OwnerScope` predicate of task 13 expressible as a single join condition,
 * and what makes DR-6's cascade a database property rather than application bookkeeping.
 *
 * The index on `owner_id` exists because *every* read is scoped by it (NFR-005 AC-1) — the project
 * list has no unscoped query path.
 */
export const projects = pgTable(
  'projects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [index('projects_owner_id_idx').on(table.ownerId)],
);

/**
 * The workflow run for a project (FR-003; ERD `PROJECTS ||--|| SESSIONS`).
 *
 * `project_id` is unique, so the one-to-one relationship is enforced by the database rather than by
 * convention. `initial_prompt` is `NOT NULL`: a session cannot exist without the grounding input
 * that FR-003 AC-1 requires it to persist, and FR-003 AC-3 keeps that text available to every later
 * stage without the user restating it.
 *
 * `summary` stays null until the interview agent persists one — the third condition of the
 * interview exit gate (constitution A2) is precisely "this column is not null".
 */
export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .unique()
    .references(() => projects.id, { onDelete: 'cascade' }),
  initialPrompt: text('initial_prompt').notNull(),
  summary: text('summary'),
  /** Current-state field by design; not immutable (solution.md — Entity Notes). */
  qualityEnabled: boolean('quality_enabled').notNull().default(false),
  /** Number of times the session has reached `complete` (FR-020). */
  completionCount: integer('completion_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
});

export type ProjectRow = typeof projects.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
