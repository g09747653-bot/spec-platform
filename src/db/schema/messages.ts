import { sql } from 'drizzle-orm';
import { check, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import {
  SPEC_STAGES,
  STAGES,
  SUBSTAGELESS_STAGES,
  SUBSTAGES,
} from '@/modules/workflow/model/stages';

import { sessions } from './projects';

/** Renders a tuple of names as a SQL value list. The inputs are compile-time constants. */
const list = (values: readonly string[]) => sql.raw(values.map((value) => `'${value}'`).join(', '));

/** What wrote a message. Two kinds today, and each is a turn of the same conversation. */
export const MESSAGE_ORIGINS = ['chat', 'bridge'] as const;

/** Who is speaking. `system` blocks of the feed are derived, never written, so there are two. */
export const MESSAGE_ROLES = ['user', 'assistant'] as const;

/**
 * The conversation's own turns (task 132; Эталон §1.1, §1.2).
 *
 * Everything else in the feed is a projection of a row that exists for another reason — a round, a
 * run, a revision, a board. Two things are not, and M11п is where that stopped being tenable:
 *
 * - **free chat** (`origin = 'chat'`) lived in the browser's memory for the length of a visit, so a
 *   reload dropped the question and the answer. The reference product's saved session contains its
 *   chat verbatim, which is what returned checklist row `1.2-4` from "our own difference" to a gap
 *   (А-12);
 * - **the analytical bridge** (`origin = 'bridge'`) is the interviewer's short commentary between
 *   two rounds — it names the contradictions it found in the answers and what the next round will
 *   therefore probe (Эталон §1.2). It is prose the model wrote about this session; there is no
 *   other row it could be derived from.
 *
 * One table for both, because they are the same thing: a message someone wrote at a position. The
 * feed reads it exactly as it reads the other five sources, and the projection stays pure.
 *
 * **`stage`/`substage` are recorded, not derived**, and that is the second half of row `1.2-4`. The
 * client used to stamp a chat turn with wherever the session happened to be at render time, so the
 * same reply carried `review` during the review and `complete` once the session sealed — a
 * `data-msg-stage` that answers "where is the session now?" instead of "what was it doing when this
 * was written?", which is the opposite of what `feed-item.tsx` promises. Written once, at the
 * moment the message happens, it cannot drift.
 *
 * The CHECKs are the same pair `workflow_state` carries, derived from the same tuples (D-15): a
 * spec stage always carries a substage, `interview`/`complete` never do.
 */
export const sessionMessages = pgTable(
  'session_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => sessions.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    origin: text('origin').notNull(),
    /** The position the message was written at — a fact about the past, never re-stamped. */
    stage: text('stage').notNull(),
    substage: text('substage'),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (table) => [
    index('session_messages_session_created_idx').on(table.sessionId, table.createdAt),
    check('session_messages_role_valid', sql`${table.role} IN (${list(MESSAGE_ROLES)})`),
    check('session_messages_origin_valid', sql`${table.origin} IN (${list(MESSAGE_ORIGINS)})`),
    check('session_messages_stage_valid', sql`${table.stage} IN (${list(STAGES)})`),
    check(
      'session_messages_substage_valid',
      // `substage IS NOT NULL` is load-bearing here for the same reason it is in `workflow_state`:
      // `NULL IN (...)` is NULL, and a CHECK accepts NULL.
      sql`(${table.stage} IN (${list(SUBSTAGELESS_STAGES)}) AND ${table.substage} IS NULL)
          OR (${table.stage} IN (${list(SPEC_STAGES)})
              AND ${table.substage} IS NOT NULL
              AND ${table.substage} IN (${list(SUBSTAGES)}))`,
    ),
    check('session_messages_body_not_blank', sql`${table.body} ~ '[^[:space:]]'`),
  ],
);

export type SessionMessageRow = typeof sessionMessages.$inferSelect;
