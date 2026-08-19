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
import { INTERVIEW_STYLES } from '@/modules/projects/interview-style';

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
 * One conversation on a project (FR-003; ERD `PROJECTS ||--o{ SESSIONS`, amendment А-6).
 *
 * **A project holds many sessions.** The UNIQUE on `project_id` was dropped in M9п, because the Edit
 * workflow (task 118) needs a second chat that writes revisions into the *same* `spec_files` — so it
 * must live on the same project — while carrying its own graph on its own `workflow_state` row. The
 * index that replaces the constraint is not decoration: every read below a project now filters by
 * `project_id` and expects several rows back.
 *
 * `initial_prompt` is `NOT NULL`: a session cannot exist without the grounding input that FR-003
 * AC-1 requires it to persist, and FR-003 AC-3 keeps that text available to every later stage
 * without the user restating it.
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
      .references(() => projects.id, { onDelete: 'cascade' }),
    /**
     * What this chat is called in the project's list (task 120).
     *
     * `NOT NULL`, so the list always has something to print and to search: a chat with no name of
     * its own would make the search box lie about what it covers. Distinct from `projects.name`
     * because the two name different things now — a project is the bundle, a session is one
     * conversation about it.
     *
     * Defaulted for the same reason `methodology_id` is: rows written before M9п are backfilled with
     * the project's name (which is what the chat has always been called, since a project *was* its
     * session), and a caller that does not care gets the same honest placeholder `deriveProjectName`
     * falls back to (D-20). Every caller that has the user's words in hand passes a derived title.
     */
    title: text('title').notNull().default('Untitled chat'),
    /**
     * Archived chats leave the Active list and nothing else (task 120).
     *
     * A flag rather than a deletion, and the whole acceptance criterion is that distinction:
     * archiving is reversible and never destroys a row. Nothing below a session reads it — the
     * bundle a session produced stays exportable whether or not the chat that produced it is
     * archived.
     */
    archived: boolean('archived').notNull().default(false),
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
     * Which questions the interview asks (task 144), chosen beside the profile rather than instead
     * of it.
     *
     * Defaulted to `default`, which is the name of the register the profile already picked: every
     * row written before this column existed was interviewed that way, so the backfill is not a
     * guess. It carries a CHECK for the same reason `audience_profile` does — the set of styles is a
     * property of the *contract*, not of the deployment's configuration, and a value outside it
     * would silently reach the prompt layer as an unrecognised string.
     */
    interviewStyle: text('interview_style').notNull().default('default'),
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
    /**
     * The model this chat's agent calls use (task 121; Эталон §1.5 — the composer's picker).
     *
     * `null` is Auto and is the default: the configured failover chain, exactly as А-3 requires Auto
     * to mean. A provider id pins the chain to that one provider. No CHECK, for the same reason
     * `methodology_id` has none — the set of providers is a property of the deployment's
     * configuration, not of the data, and a row naming a provider whose key was later removed must
     * still open (it degrades to Auto).
     */
    modelId: text('model_id'),
    /** Number of times the session has reached `complete` (FR-020). */
    completionCount: integer('completion_count').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    index('sessions_project_id_idx').on(table.projectId),
    check(
      'sessions_audience_profile_valid',
      sql`${table.audienceProfile} IN (${list(AUDIENCE_PROFILES)})`,
    ),
    check(
      'sessions_interview_style_valid',
      sql`${table.interviewStyle} IN (${list(INTERVIEW_STYLES)})`,
    ),
    /* A chat with a blank name is a row the list cannot print and the search cannot match. */
    check('sessions_title_not_blank', sql`${table.title} ~ '[^[:space:]]'`),
  ],
);

export type ProjectRow = typeof projects.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
