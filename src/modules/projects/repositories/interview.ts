import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import type { SchemaDatabase } from '@/db';
import { answers, informationNeeds, questionRounds } from '@/db/schema';
import { queryRows } from '@/db/sql';

/**
 * Persistence for rounds, answers and information needs (tasks 31/35–37; DR-5; DR-13).
 *
 * Ownership is resolved by the caller: every route first loads the session through the
 * `OwnerScope`d session repository and only then touches interview rows by the ids that lookup
 * yielded — the same contract the workflow-state repository has carried since task 19. A round id
 * arriving from a request body is trusted only after `findRoundById` proves it belongs to the
 * authorised session.
 *
 * Writes that must be all-or-nothing are single statements (CTE chains) because the production
 * driver has no interactive transactions (D-16).
 */

/** The `need:<name>` namespace for direct fallback answers (task 37; see the schema notes). */
export const FALLBACK_QUESTION_ID_PREFIX = 'need:';

const RoundRow = z.object({
  id: z.uuid(),
  session_id: z.uuid(),
  stage: z.string(),
  round_number: z.number().int().positive(),
  questions: z.unknown(),
  answered: z.boolean(),
});

export interface StoredRound {
  id: string;
  sessionId: string;
  stage: string;
  roundNumber: number;
  /** The persisted `QuestionSetSchema` payload; callers re-parse before rendering or matching. */
  questions: unknown;
  /** Whether any answer row exists — what "an answered round" means everywhere (FR-007 AC-2). */
  answered: boolean;
}

const toRound = (row: z.infer<typeof RoundRow>): StoredRound => ({
  id: row.id,
  sessionId: row.session_id,
  stage: row.stage,
  roundNumber: row.round_number,
  questions: row.questions,
  answered: row.answered,
});

export interface CardAnswerItem {
  questionId: string;
  selectedOptionIds: readonly string[];
  freeText?: string | undefined;
}

export function createInterviewRepository(db: SchemaDatabase) {
  const roundSelect = (predicate: ReturnType<typeof sql>) => sql`
    SELECT
      qr.id,
      qr.session_id,
      qr.stage,
      qr.round_number,
      qr.questions,
      EXISTS (SELECT 1 FROM ${answers} a WHERE a.round_id = qr.id) AS answered
    FROM ${questionRounds} qr
    WHERE ${predicate}
  `;

  return {
    /**
     * Persists a round together with the needs it declares — one statement, so a round can never
     * exist with half its needs registered. Needs already declared for the stage are left as they
     * are (`ON CONFLICT DO NOTHING`): re-declaring an unmet need in a narrower round is normal.
     */
    async createRound(input: {
      sessionId: string;
      stage: string;
      roundNumber: number;
      questions: unknown;
      declaredNeeds: readonly string[];
    }): Promise<{ id: string }> {
      const CreatedRow = z.object({ id: z.uuid() });

      const rows = await queryRows(
        db,
        sql`
          WITH new_round AS (
            INSERT INTO ${questionRounds} (session_id, stage, round_number, questions)
            VALUES (
              ${input.sessionId}::uuid,
              ${input.stage},
              ${input.roundNumber},
              ${JSON.stringify(input.questions)}::jsonb
            )
            RETURNING id
          ), declared AS (
            INSERT INTO ${informationNeeds} (session_id, stage, name)
            SELECT ${input.sessionId}::uuid, ${input.stage}, need.name
            FROM new_round,
                 jsonb_array_elements_text(${JSON.stringify([...input.declaredNeeds])}::jsonb)
                   AS need(name)
            ON CONFLICT (session_id, stage, name) DO NOTHING
          )
          SELECT id FROM new_round
        `,
        CreatedRow,
      );

      const created = rows[0];
      if (created === undefined) throw new Error('round insert returned no row');

      return created;
    },

    async findRoundById(roundId: string): Promise<StoredRound | null> {
      const rows = await queryRows(db, roundSelect(sql`qr.id = ${roundId}::uuid`), RoundRow);
      const row = rows[0];

      return row === undefined ? null : toRound(row);
    },

    /** The stage's newest round — fallback answers attach here, and numbering continues from it. */
    async latestRound(sessionId: string, stage: string): Promise<StoredRound | null> {
      const rows = await queryRows(
        db,
        sql`${roundSelect(sql`qr.session_id = ${sessionId}::uuid AND qr.stage = ${stage}`)}
            ORDER BY qr.round_number DESC
            LIMIT 1`,
        RoundRow,
      );
      const row = rows[0];

      return row === undefined ? null : toRound(row);
    },

    /** All card answers of a round, one statement — NFR-003 AC-1 wants them durable atomically. */
    async submitCardAnswers(roundId: string, items: readonly CardAnswerItem[]): Promise<void> {
      if (items.length === 0) throw new Error('a submission carries at least one answer');

      const payload = JSON.stringify(
        items.map((item) => ({
          question_id: item.questionId,
          selected_option_ids: [...item.selectedOptionIds],
          free_text: item.freeText ?? null,
        })),
      );

      await db.execute(sql`
        INSERT INTO ${answers} (round_id, question_id, selected_option_ids, free_text)
        SELECT
          ${roundId}::uuid,
          item->>'question_id',
          COALESCE(item->'selected_option_ids', '[]'::jsonb),
          NULLIF(item->>'free_text', '')
        FROM jsonb_array_elements(${payload}::jsonb) AS item
      `);
    },

    /** A free-text reply to the card as a whole (task 36): an answer row with no question id. */
    async addReplyAnswer(roundId: string, text: string): Promise<void> {
      await db.insert(answers).values({ roundId, freeText: text });
    },

    /** A direct fallback answer for one named need (task 37), in the `need:` namespace. */
    async addFallbackAnswer(roundId: string, needName: string, text: string): Promise<void> {
      await db.insert(answers).values({
        roundId,
        questionId: `${FALLBACK_QUESTION_ID_PREFIX}${needName}`,
        freeText: text,
      });
    },

    /**
     * Marks needs satisfied by a round (FR-005 AC-8). Only outstanding needs move — a need
     * satisfied by an earlier round keeps its original satisfier, so the record stays honest.
     */
    async markNeedsSatisfied(
      sessionId: string,
      stage: string,
      names: readonly string[],
      roundId: string,
    ): Promise<void> {
      if (names.length === 0) return;

      await db
        .update(informationNeeds)
        .set({ satisfiedByRound: roundId })
        .where(
          and(
            eq(informationNeeds.sessionId, sessionId),
            eq(informationNeeds.stage, stage),
            sql`${informationNeeds.name} IN (
              SELECT jsonb_array_elements_text(${JSON.stringify([...names])}::jsonb)
            )`,
            sql`${informationNeeds.satisfiedByRound} IS NULL`,
          ),
        );
    },

    /** Answer rows of a round, oldest first — what the summary highlights are built from. */
    async answersForRound(
      roundId: string,
    ): Promise<
      { questionId: string | null; selectedOptionIds: unknown; freeText: string | null }[]
    > {
      const rows = await db
        .select({
          questionId: answers.questionId,
          selectedOptionIds: answers.selectedOptionIds,
          freeText: answers.freeText,
        })
        .from(answers)
        .where(eq(answers.roundId, roundId))
        .orderBy(answers.answeredAt);

      return rows;
    },

    /** Every round of a session, newest first, for building summary context. */
    async roundsForSession(sessionId: string): Promise<StoredRound[]> {
      const rows = await queryRows(
        db,
        sql`${roundSelect(sql`qr.session_id = ${sessionId}::uuid`)}
            ORDER BY qr.presented_at DESC`,
        RoundRow,
      );

      return rows.map(toRound);
    },

    /** Drops a round that never became pending (its claim on the state lost a race). */
    async deleteUnansweredRound(roundId: string): Promise<void> {
      await db
        .delete(questionRounds)
        .where(
          and(
            eq(questionRounds.id, roundId),
            sql`NOT EXISTS (SELECT 1 FROM ${answers} a WHERE a.round_id = ${roundId}::uuid)`,
          ),
        );
    },
  };
}

export type InterviewRepository = ReturnType<typeof createInterviewRepository>;
