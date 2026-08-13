import { sql } from 'drizzle-orm';
import { z } from 'zod';

import type { SchemaDatabase } from '@/db';
import type { OwnerScope } from '@/db/owner-scope';
import { attachments, projects, sessions } from '@/db/schema';
import { queryRows } from '@/db/sql';

import { PARSE_STATUSES, type ParseStatus } from '../attachments/model';

/**
 * Attachment storage, scoped to an owner (NFR-005 AC-1; DR-1).
 *
 * Every statement here — including the inserts — carries `projects.owner_id = scope.userId` as a join
 * predicate rather than checking ownership beforehand and trusting the gap. An attachment is two joins
 * from the owner, so "is this session mine?" and "write this row" are one statement: there is no window
 * in which a session id from a request body has been accepted but not yet verified.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const AttachmentRowSchema = z.object({
  id: z.uuid(),
  session_id: z.uuid(),
  file_name: z.string(),
  mime_type: z.string(),
  size_bytes: z.number().int(),
  blob_key: z.string(),
  parse_status: z.enum(PARSE_STATUSES),
  parse_reason: z.string().nullable(),
  extracted_text: z.string().nullable(),
  attached_at_stage: z.string(),
  uploaded_at: z.union([z.date(), z.string()]),
});

export interface Attachment {
  id: string;
  sessionId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  blobKey: string;
  parseStatus: ParseStatus;
  parseReason: string | null;
  extractedText: string | null;
  attachedAtStage: string;
  uploadedAt: Date;
}

const toAttachment = (row: z.infer<typeof AttachmentRowSchema>): Attachment => ({
  id: row.id,
  sessionId: row.session_id,
  fileName: row.file_name,
  mimeType: row.mime_type,
  sizeBytes: row.size_bytes,
  blobKey: row.blob_key,
  parseStatus: row.parse_status,
  parseReason: row.parse_reason,
  extractedText: row.extracted_text,
  attachedAtStage: row.attached_at_stage,
  uploadedAt: row.uploaded_at instanceof Date ? row.uploaded_at : new Date(row.uploaded_at),
});

/**
 * Table-qualified on purpose: every statement below joins `sessions` and `projects`, which have their
 * own `id`, and an unqualified list is ambiguous in exactly those statements.
 */
const COLUMNS = sql`
  ${attachments.id}, ${attachments.sessionId}, ${attachments.fileName}, ${attachments.mimeType},
  ${attachments.sizeBytes}, ${attachments.blobKey}, ${attachments.parseStatus},
  ${attachments.parseReason}, ${attachments.extractedText}, ${attachments.attachedAtStage},
  ${attachments.uploadedAt}
`;

export interface RecordUploadInput {
  sessionId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  blobKey: string;
  attachedAtStage: string;
}

export type ExtractionRecord =
  { status: 'ok'; text: string } | { status: 'passthrough' } | { status: 'failed'; reason: string };

export function createAttachmentRepository(db: SchemaDatabase) {
  return {
    /**
     * Records an upload whose bytes are already stored, in the `pending` state.
     *
     * `INSERT … SELECT` with the owner join: if the session is not the caller's, the SELECT yields no
     * row and the INSERT writes nothing. The caller learns that as `null`, which is the same answer it
     * would get for a session that does not exist (AR-2).
     */
    async recordUpload(scope: OwnerScope, input: RecordUploadInput): Promise<Attachment | null> {
      if (!UUID.test(input.sessionId)) return null;

      const rows = await queryRows(
        db,
        sql`
          INSERT INTO ${attachments}
            (session_id, file_name, mime_type, size_bytes, blob_key, attached_at_stage)
          SELECT
            ${sessions.id}, ${input.fileName}, ${input.mimeType}, ${input.sizeBytes},
            ${input.blobKey}, ${input.attachedAtStage}
          FROM ${sessions}
          JOIN ${projects} ON ${projects.id} = ${sessions.projectId}
          WHERE ${sessions.id} = ${input.sessionId}::uuid
            AND ${projects.ownerId} = ${scope.userId}
          RETURNING ${COLUMNS}
        `,
        AttachmentRowSchema,
      );

      const row = rows[0];
      return row === undefined ? null : toAttachment(row);
    },

    /**
     * Writes the outcome of extraction (DR-8).
     *
     * The three statuses are set together with the columns they imply, because the table refuses any
     * other combination — text exactly on `ok`, a reason exactly on `failed`.
     */
    async recordExtraction(
      scope: OwnerScope,
      attachmentId: string,
      outcome: ExtractionRecord,
    ): Promise<Attachment | null> {
      if (!UUID.test(attachmentId)) return null;

      const text = outcome.status === 'ok' ? outcome.text : null;
      const reason = outcome.status === 'failed' ? outcome.reason : null;

      const rows = await queryRows(
        db,
        sql`
          UPDATE ${attachments}
          SET parse_status = ${outcome.status},
              extracted_text = ${text},
              parse_reason = ${reason}
          FROM ${sessions}
          JOIN ${projects} ON ${projects.id} = ${sessions.projectId}
          WHERE ${attachments.id} = ${attachmentId}::uuid
            AND ${sessions.id} = ${attachments.sessionId}
            AND ${projects.ownerId} = ${scope.userId}
          RETURNING ${COLUMNS}
        `,
        AttachmentRowSchema,
      );

      const row = rows[0];
      return row === undefined ? null : toAttachment(row);
    },

    /** Every attachment of a session, oldest first — the list of FR-004 AC-6. */
    async listForSession(scope: OwnerScope, sessionId: string): Promise<Attachment[]> {
      if (!UUID.test(sessionId)) return [];

      const rows = await queryRows(
        db,
        sql`
          SELECT ${COLUMNS}
          FROM ${attachments}
          JOIN ${sessions} ON ${sessions.id} = ${attachments.sessionId}
          JOIN ${projects} ON ${projects.id} = ${sessions.projectId}
          WHERE ${sessions.id} = ${sessionId}::uuid
            AND ${projects.ownerId} = ${scope.userId}
          ORDER BY ${attachments.uploadedAt} ASC, ${attachments.id} ASC
        `,
        AttachmentRowSchema,
      );

      return rows.map(toAttachment);
    },

    async findById(scope: OwnerScope, attachmentId: string): Promise<Attachment | null> {
      if (!UUID.test(attachmentId)) return null;

      const rows = await queryRows(
        db,
        sql`
          SELECT ${COLUMNS}
          FROM ${attachments}
          JOIN ${sessions} ON ${sessions.id} = ${attachments.sessionId}
          JOIN ${projects} ON ${projects.id} = ${sessions.projectId}
          WHERE ${attachments.id} = ${attachmentId}::uuid
            AND ${projects.ownerId} = ${scope.userId}
        `,
        AttachmentRowSchema,
      );

      const row = rows[0];
      return row === undefined ? null : toAttachment(row);
    },

    /**
     * Removes an attachment and reports the object that is now unreferenced (FR-004 AC-7).
     *
     * The row goes first and the blob key is returned rather than deleted here: the database is the
     * record of what exists, and an object whose row is gone is invisible to every generation from that
     * moment. Deleting the bytes is the caller's next step and may fail without making the removal a
     * lie (solution.md — `adapters/storage`, Error Handling).
     */
    async remove(scope: OwnerScope, attachmentId: string): Promise<{ blobKey: string } | null> {
      if (!UUID.test(attachmentId)) return null;

      const rows = await queryRows(
        db,
        sql`
          DELETE FROM ${attachments}
          USING ${sessions}, ${projects}
          WHERE ${attachments.id} = ${attachmentId}::uuid
            AND ${sessions.id} = ${attachments.sessionId}
            AND ${projects.id} = ${sessions.projectId}
            AND ${projects.ownerId} = ${scope.userId}
          RETURNING ${attachments.blobKey} AS blob_key
        `,
        z.object({ blob_key: z.string() }),
      );

      const row = rows[0];
      return row === undefined ? null : { blobKey: row.blob_key };
    },

    /** Every stored object under a project — what DR-6's cascade must also delete from the store. */
    async blobKeysForProject(scope: OwnerScope, projectId: string): Promise<string[]> {
      if (!UUID.test(projectId)) return [];

      const rows = await queryRows(
        db,
        sql`
          SELECT ${attachments.blobKey} AS blob_key
          FROM ${attachments}
          JOIN ${sessions} ON ${sessions.id} = ${attachments.sessionId}
          JOIN ${projects} ON ${projects.id} = ${sessions.projectId}
          WHERE ${projects.id} = ${projectId}::uuid
            AND ${projects.ownerId} = ${scope.userId}
        `,
        z.object({ blob_key: z.string() }),
      );

      return rows.map((row) => row.blob_key);
    },
  };
}

export type AttachmentRepository = ReturnType<typeof createAttachmentRepository>;
