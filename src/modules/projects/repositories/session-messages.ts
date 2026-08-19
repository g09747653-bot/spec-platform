import { sql } from 'drizzle-orm';
import { z } from 'zod';

import type { SchemaDatabase } from '@/db';
import { sessionMessages } from '@/db/schema';
import { queryOneRow, queryRows } from '@/db/sql';

/**
 * Persistence for the conversation's own turns (task 132; see `db/schema/messages.ts`).
 *
 * Ownership is resolved by the caller, exactly as it is for rounds and answers: every route loads
 * the session through the `OwnerScope`d session repository first and only then writes by the id
 * that lookup yielded. A session id arriving from a request body never reaches this file untested.
 *
 * Two methods, and there will not be a third: a message is appended, and a session's messages are
 * read. Nothing updates one — the position a message was written at is a fact about the past, and
 * the text is what somebody said.
 */
export type MessageRole = 'user' | 'assistant';
export type MessageOrigin = 'chat' | 'bridge' | 'driver';

export interface StoredMessage {
  id: string;
  role: MessageRole;
  origin: MessageOrigin;
  /** The position the message was written at — recorded, never re-derived at render time. */
  stage: string;
  substage: string | null;
  body: string;
  createdAt: Date;
}

const MessageRow = z.object({
  id: z.uuid(),
  role: z.enum(['user', 'assistant']),
  origin: z.enum(['chat', 'bridge', 'driver']),
  stage: z.string(),
  substage: z.string().nullable(),
  body: z.string(),
  created_at: z.coerce.date(),
});

const toMessage = (row: z.infer<typeof MessageRow>): StoredMessage => ({
  id: row.id,
  role: row.role,
  origin: row.origin,
  stage: row.stage,
  substage: row.substage,
  body: row.body,
  createdAt: row.created_at,
});

export interface AppendMessageInput {
  sessionId: string;
  role: MessageRole;
  origin: MessageOrigin;
  stage: string;
  substage: string | null;
  body: string;
}

export function createSessionMessageRepository(db: SchemaDatabase) {
  return {
    /**
     * Appends one message and hands back the row it wrote.
     *
     * The id comes back because the client needs it: a chat turn is drawn optimistically the moment
     * it is sent, and the persisted block that arrives on the next render carries the same id, so
     * the projection can drop the local copy instead of showing the sentence twice.
     *
     * A blank body is refused by the database rather than by a check here — `body ~ '[^[:space:]]'`
     * — because "an empty message is not a message" is a property of the record, not of one caller.
     */
    async append(input: AppendMessageInput): Promise<StoredMessage> {
      const row = await queryOneRow(
        db,
        sql`
          INSERT INTO ${sessionMessages} (session_id, role, origin, stage, substage, body)
          VALUES (
            ${input.sessionId}::uuid,
            ${input.role},
            ${input.origin},
            ${input.stage},
            ${input.substage},
            ${input.body}
          )
          RETURNING id, role, origin, stage, substage, body, created_at
        `,
        MessageRow,
      );

      return toMessage(row);
    },

    /** Every message of one chat, oldest first — the order the feed lays them out in. */
    async listForSession(sessionId: string): Promise<StoredMessage[]> {
      const rows = await queryRows(
        db,
        sql`
          SELECT id, role, origin, stage, substage, body, created_at
          FROM ${sessionMessages}
          WHERE session_id = ${sessionId}::uuid
          ORDER BY created_at ASC, id ASC
        `,
        MessageRow,
      );

      return rows.map(toMessage);
    },
  };
}

export type SessionMessageRepository = ReturnType<typeof createSessionMessageRepository>;
