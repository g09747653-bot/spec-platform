import { sql } from 'drizzle-orm';
import { check, integer, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { ASKING_STAGES } from '@/modules/workflow/model/stages';

import { sessions } from './projects';

/** Renders a tuple of names as a SQL value list. The inputs are compile-time constants. */
const list = (values: readonly string[]) => sql.raw(values.map((value) => `'${value}'`).join(', '));

/**
 * The structured interview record (task 31; FR-005; DR-5; DR-13).
 *
 * Three tables, one invariant chain: a **round** presents validated questions for one stage, an
 * **answer** belongs to a round, and an **information need** is a named unit of required input
 * that a round declared and an answered round may satisfy. Everything the engine's snapshot reads
 * about the interview is derivable from these rows alone — resuming a session reconstructs
 * satisfied needs from here, never from conversational memory (FR-005 AC-11).
 *
 * The `stage` CHECKs are derived from the same tuples as the workflow tables (D-15): rounds are
 * asked in the grounding interview and in every spec stage's `collect`, and never in `complete`.
 */
export const questionRounds = pgTable(
  'question_rounds',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    stage: text('stage').notNull(),
    /** 1-based; `(session_id, stage, round_number)` unique — what `roundBudgetGate` counts. */
    roundNumber: integer('round_number').notNull(),
    /** A `QuestionSetSchema`-validated payload (solution.md — Entity Notes). */
    questions: jsonb('questions').notNull(),
    presentedAt: timestamp('presented_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('question_rounds_session_stage_round_unique').on(
      table.sessionId,
      table.stage,
      table.roundNumber,
    ),
    check('question_rounds_stage_valid', sql`${table.stage} IN (${list(ASKING_STAGES)})`),
    check('question_rounds_round_number_positive', sql`${table.roundNumber} >= 1`),
    check('question_rounds_questions_is_object', sql`jsonb_typeof(${table.questions}) = 'object'`),
  ],
);

/**
 * One answer row per question per round (DR-5: option ids **and** free text are retained).
 *
 * `question_id` is a text identifier into the round's `questions` payload, with two documented
 * namespaces beyond plain question ids:
 *
 * - `NULL` — a free-text reply to the card as a whole (FR-005 AC-6, task 36): the user answered
 *   in chat instead of submitting the card. Multiple such rows may exist; PostgreSQL's unique
 *   treatment of NULLs permits them, deliberately.
 * - `need:<name>` — a direct fallback answer recorded against a named information need after the
 *   round budget was exhausted (FR-005 AC-10, task 37). The unique constraint then also stops a
 *   need from accumulating duplicate fallback rows within a round.
 *
 * The CHECK requires every answer to carry substance: at least one selected option or non-blank
 * free text — an empty answer row is a bug, not a record.
 */
export const answers = pgTable(
  'answers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    roundId: uuid('round_id')
      .notNull()
      .references(() => questionRounds.id, { onDelete: 'cascade' }),
    questionId: text('question_id'),
    selectedOptionIds: jsonb('selected_option_ids')
      .notNull()
      .default(sql`'[]'::jsonb`),
    freeText: text('free_text'),
    answeredAt: timestamp('answered_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique('answers_round_question_unique').on(table.roundId, table.questionId),
    check(
      'answers_selected_option_ids_is_array',
      sql`jsonb_typeof(${table.selectedOptionIds}) = 'array'`,
    ),
    check(
      'answers_carry_substance',
      sql`jsonb_array_length(${table.selectedOptionIds}) > 0
          OR (${table.freeText} IS NOT NULL AND ${table.freeText} ~ '[^[:space:]]')`,
    ),
  ],
);

/**
 * A named unit of required input, unique per session and stage (DR-13) — satisfaction is checked
 * by key, never by natural-language comparison. Declared by the round that first asked for it;
 * `satisfied_by_round` points at the round whose answering satisfied it (FR-005 AC-8) and stays
 * `NULL` while the need is outstanding, which is exactly what the exhaustion fallback lists
 * (FR-005 AC-10).
 */
export const informationNeeds = pgTable(
  'information_needs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    stage: text('stage').notNull(),
    name: text('name').notNull(),
    /*
     * Deliberately NO ACTION, not RESTRICT: a project deletion cascades to rounds and needs down
     * two paths of the same statement, and RESTRICT is checked immediately — it would abort the
     * cascade while the needs rows are still queued for deletion. NO ACTION checks at statement
     * end, when both paths have completed, so DR-6's cascade holds while an isolated round
     * deletion (which never legitimately happens) still fails integrity.
     */
    satisfiedByRound: uuid('satisfied_by_round').references(() => questionRounds.id),
  },
  (table) => [
    unique('information_needs_session_stage_name_unique').on(
      table.sessionId,
      table.stage,
      table.name,
    ),
    check('information_needs_stage_valid', sql`${table.stage} IN (${list(ASKING_STAGES)})`),
    check('information_needs_name_not_blank', sql`${table.name} ~ '[^[:space:]]'`),
  ],
);

export type QuestionRoundRow = typeof questionRounds.$inferSelect;
export type AnswerRow = typeof answers.$inferSelect;
export type InformationNeedRow = typeof informationNeeds.$inferSelect;
