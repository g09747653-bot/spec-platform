import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { AUDIENCE_PROFILES } from '@/modules/projects/audience';

import { users } from './users';

/** Renders a tuple of names as a SQL value list. The inputs are compile-time constants. */
const list = (values: readonly string[]) => sql.raw(values.map((value) => `'${value}'`).join(', '));

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
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    projectId: uuid('project_id')
      .notNull()
      .unique()
      .references(() => projects.id, { onDelete: 'cascade' }),
    initialPrompt: text('initial_prompt').notNull(),
    summary: text('summary'),
    /** Current-state field by design; not immutable (solution.md — Entity Notes). */
    qualityEnabled: boolean('quality_enabled').notNull().default(false),
    /**
     * Who the interview is addressing (У-5; task 106). Chosen once at project creation and stored
     * here rather than asked again per round: a register that changed mid-interview would read as
     * two different interviewers.
     */
    audienceProfile: text('audience_profile').notNull().default('non-technical'),
    /**
     * The language the user's own words are in (У-1; task 108), as an ISO 639-1 code.
     *
     * Nullable, and null is a real value: a two-word prompt in a language with no script of its own
     * carries no signal, and the prompt layer then instructs the model to mirror the user rather
     * than guessing. No CHECK — the codes come from our own detector, not from a request.
     */
    contentLanguage: text('content_language'),
    /**
     * The methodology whose graph this session walks (task 117; Эталон §1.4).
     *
     * Defaulted to the parity methodology, so every row written before M9п — and every caller that
     * does not care — means the workflow the first six milestones built. No CHECK constraint: the
     * set of configurations is a property of the *build*, not of the data, and a row naming a
     * methodology a later build stopped shipping must still open (the registry degrades it to the
     * default rather than refusing to read the session). What a request may *write* is checked at
     * the boundary against the registry.
     */
    methodologyId: text('methodology_id').notNull().default('myspec-greenfield-v1'),
    /** Number of times the session has reached `complete` (FR-020). */
    completionCount: integer('completion_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'sessions_audience_profile_valid',
      sql`${table.audienceProfile} IN (${list(AUDIENCE_PROFILES)})`,
    ),
  ],
);

export type ProjectRow = typeof projects.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
