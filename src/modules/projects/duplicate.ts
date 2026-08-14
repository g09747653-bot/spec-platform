import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';
import { z } from 'zod';

import type { SchemaDatabase } from '@/db';
import type { OwnerScope } from '@/db/owner-scope';
import {
  answers,
  attachments,
  informationNeeds,
  projects,
  questionRounds,
  reviewFeedback,
  sessions,
  specFiles,
  specRevisions,
  workflowState,
} from '@/db/schema';
import { queryOneRow } from '@/db/sql';
import { StorageNotFoundError, type StorageStore } from '@/modules/adapters/storage';

import { createAttachmentRepository } from './repositories/attachments';

/**
 * Project duplication (task 77; FR-002 AC-6/AC-7; solution.md — `duplicateProject`).
 *
 * The copy is a **fork**, not a link: every row belongs to the new project, so modifying either side
 * cannot reach the other (AC-7). That is a property of the data, not of the code being careful —
 * there is no shared row and no shared identifier anywhere below.
 *
 * **What is copied, and why each thing is on the list.** The plan names spec files at their current
 * revisions, the workflow state, answers, information needs and attachment references. The gates read
 * more than that, and AC-6 requires the duplicate to *resume*, so what actually travels is everything
 * a snapshot is assembled from: the session's prompt and summary, the position, the rounds and their
 * answers, the needs with their satisfaction, the revisions with their approval, and the reviews with
 * their decisions. Leaving reviews behind would put a duplicate taken at a `review` position in front
 * of a gate it had already passed once.
 *
 * **What is deliberately not copied:**
 *
 * - **Proposed changes.** A pending proposal is a decision the owner was in the middle of taking, on
 *   the *other* project. Carrying it would present the same diff twice and let one be accepted while
 *   the other's base moved — which is the ambiguity DR-11 removes within a project, reintroduced
 *   across two. The plan says so explicitly, and this is the reason.
 * - **Generation runs and their chunks.** A stream log, not state: solution.md prunes them once a run
 *   completes, and they describe an HTTP response that will never be replayed on the copy.
 * - **Export records.** They record what left *that* project.
 *
 * **Revision history travels whole**, not just the current revision. Copying one revision per file
 * would mean inventing its provenance — a number, an origin, and for an enriched revision a
 * `derived_from` pointing at an ancestor that was not copied, which the check constraint refuses. The
 * history is internally consistent by construction, so it is cheaper to copy than to summarise, and
 * the duplicate keeps a diffable past (A4).
 *
 * **Atomicity.** The production driver has no interactive transactions (D-16), so the whole copy is
 * one statement: a chain of CTEs, each feeding the next. A failure anywhere leaves no project behind —
 * the alternative is a half-copied project in the owner's list, which every later query reads as a
 * broken row.
 *
 * The one thing that cannot be inside that statement is the **stored objects**: `attachments.blob_key`
 * is unique, so two rows cannot address one object, and the objects must therefore be copied before
 * the rows that name them. The new session id is generated here rather than by the database so the
 * new keys can be computed first — the objects are copied, and only then does the single statement
 * run. If it fails, the copies are orphaned and swept by the same reconciliation solution.md already
 * describes for a failed delete; no partial project exists.
 */

const DuplicatedRow = z.object({
  project_id: z.uuid(),
  session_id: z.uuid(),
});

export interface DuplicateResult {
  projectId: string;
  sessionId: string;
  name: string;
}

/** How a copy is named. Deliberately obvious, so two rows in a list are never ambiguous. */
export function duplicateName(name: string): string {
  return `${name} (copy)`.slice(0, 200);
}

/**
 * Copies each stored object under the source session to a key under the new one.
 *
 * Returns old key → new key. An object that cannot be read is **skipped**, not fatal: its row is
 * copied without a body it never had, and a duplication that failed because one document had already
 * gone missing would be a worse answer than a duplicate whose parse results are intact.
 */
async function copyObjects(
  storage: StorageStore,
  scope: OwnerScope,
  newSessionId: string,
  sources: readonly { blobKey: string; fileName: string; mimeType: string }[],
): Promise<Map<string, string>> {
  const mapping = new Map<string, string>();

  for (const source of sources) {
    try {
      const bytes = await storage.read(scope, source.blobKey);
      const { blobKey } = await storage.put(scope, {
        sessionId: newSessionId,
        fileName: source.fileName,
        contentType: source.mimeType,
        bytes,
      });

      mapping.set(source.blobKey, blobKey);
    } catch (error) {
      if (!(error instanceof StorageNotFoundError)) throw error;
    }
  }

  return mapping;
}

export async function duplicateProject(
  db: SchemaDatabase,
  scope: OwnerScope,
  projectId: string,
  storage: StorageStore,
): Promise<DuplicateResult | null> {
  const attachmentRepository = createAttachmentRepository(db);

  const source = await db
    .select({ id: projects.id, name: projects.name })
    .from(projects)
    .where(
      sql`${projects.id} = ${projectId}::uuid AND ${projects.ownerId} = ${scope.userId}::uuid`,
    );

  const found = source[0];
  if (found === undefined) return null;

  const newProjectId = randomUUID();
  const newSessionId = randomUUID();
  const name = duplicateName(found.name);

  const sourceAttachments = await attachmentRepository.copySourcesForProject(scope, projectId);
  const keyMapping = await copyObjects(storage, scope, newSessionId, sourceAttachments);

  /*
   * `key_mapping` travels into the statement as a single jsonb value rather than as one parameter per
   * attachment: the number of documents is not known when the query is written, and a statement whose
   * shape depends on the data is a statement that is only tested at the sizes someone happened to try.
   */
  const mappingJson = JSON.stringify(Object.fromEntries(keyMapping));

  const duplicated = await queryOneRow(
    db,
    sql`
      WITH src AS (
        SELECT ${projects}.id, ${projects}.owner_id
        FROM ${projects}
        WHERE ${projects}.id = ${projectId}::uuid
          AND ${projects}.owner_id = ${scope.userId}::uuid
      ), src_session AS (
        SELECT ${sessions}.*
        FROM ${sessions}
        JOIN src ON src.id = ${sessions}.project_id
      ), new_project AS (
        INSERT INTO ${projects} (id, owner_id, name)
        SELECT ${newProjectId}::uuid, src.owner_id, ${name} FROM src
        RETURNING id
      ), new_session AS (
        INSERT INTO ${sessions} (id, project_id, initial_prompt, summary, quality_enabled)
        SELECT ${newSessionId}::uuid, new_project.id, s.initial_prompt, s.summary, s.quality_enabled
        FROM new_project, src_session s
        RETURNING id
      ), new_state AS (
        /*
         * The position travels; the pending action does not. It names rows of the *source* — a round
         * id, above all — and a copied session pointing at another session's round is a card that
         * cannot be answered. The round itself is copied below, and the page re-derives what is
         * pending from persisted state anyway (FR-017), so nothing is lost but the dangling pointer.
         */
        INSERT INTO ${workflowState} (session_id, stage, substage, pending_action, version)
        SELECT new_session.id, ws.stage, ws.substage, NULL, 1
        FROM new_session, ${workflowState} ws, src_session s
        WHERE ws.session_id = s.id
        RETURNING session_id
      ), new_rounds AS (
        INSERT INTO ${questionRounds} (session_id, stage, round_number, questions, presented_at)
        SELECT new_session.id, qr.stage, qr.round_number, qr.questions, qr.presented_at
        FROM new_session, ${questionRounds} qr, src_session s
        WHERE qr.session_id = s.id
        RETURNING id, stage, round_number
      ), new_answers AS (
        /* Rounds are keyed by (stage, round_number) within a session, which is what maps old to new. */
        INSERT INTO ${answers} (round_id, question_id, selected_option_ids, free_text, answered_at)
        SELECT nr.id, a.question_id, a.selected_option_ids, a.free_text, a.answered_at
        FROM ${answers} a
        JOIN ${questionRounds} qr ON qr.id = a.round_id
        JOIN src_session s ON s.id = qr.session_id
        JOIN new_rounds nr ON nr.stage = qr.stage AND nr.round_number = qr.round_number
        RETURNING id
      ), new_needs AS (
        INSERT INTO ${informationNeeds} (session_id, stage, name, satisfied_by_round)
        SELECT new_session.id, n.stage, n.name, nr.id
        FROM new_session, ${informationNeeds} n
        JOIN src_session s ON s.id = n.session_id
        LEFT JOIN ${questionRounds} qr ON qr.id = n.satisfied_by_round
        LEFT JOIN new_rounds nr ON nr.stage = qr.stage AND nr.round_number = qr.round_number
        RETURNING id
      ), new_attachments AS (
        INSERT INTO ${attachments} (
          session_id, file_name, mime_type, size_bytes, blob_key,
          parse_status, parse_reason, extracted_text, attached_at_stage, uploaded_at
        )
        SELECT
          new_session.id, at.file_name, at.mime_type, at.size_bytes,
          ${mappingJson}::jsonb ->> at.blob_key,
          at.parse_status, at.parse_reason, at.extracted_text, at.attached_at_stage, at.uploaded_at
        FROM new_session, ${attachments} at
        JOIN src_session s ON s.id = at.session_id
        WHERE ${mappingJson}::jsonb ? at.blob_key
        RETURNING id
      ), new_files AS (
        /*
         * The pointer is clamped to what is actually copied. Today they are the same number — every
         * revision is a parity revision — but a pointer at a revision the copy does not contain would
         * be a broken row rather than a stale one, and clamping costs one subquery.
         */
        INSERT INTO ${specFiles} (project_id, spec_type, file_name, current_revision)
        SELECT new_project.id, sf.spec_type, sf.file_name,
               LEAST(
                 sf.current_revision,
                 COALESCE((
                   SELECT MAX(r.revision_number) FROM ${specRevisions} r
                   WHERE r.spec_file_id = sf.id AND r.origin = 'parity'
                 ), 0)
               )
        FROM new_project, ${specFiles} sf
        JOIN src ON src.id = sf.project_id
        RETURNING id, spec_type
      ), new_revisions AS (
        /*
         * Parity revisions only, and every one of them. Enrichment rows name the parity revision they
         * were derived from, and that pointer cannot be remapped inside a statement that is still
         * inserting its own targets — so copying one would break the check constraint that makes A6
         * decidable. No enrichment revision exists before Milestone 7; when one can, this becomes a
         * second insert keyed on (spec_type, revision_number), not a relaxed constraint.
         */
        INSERT INTO ${specRevisions} (
          spec_file_id, revision_number, content, approved, origin, derived_from,
          context_attachment_ids, created_at
        )
        SELECT nf.id, sr.revision_number, sr.content, sr.approved, sr.origin, NULL,
               '[]'::jsonb, sr.created_at
        FROM ${specRevisions} sr
        JOIN ${specFiles} sf ON sf.id = sr.spec_file_id
        JOIN src ON src.id = sf.project_id
        JOIN new_files nf ON nf.spec_type = sf.spec_type
        WHERE sr.origin = 'parity'
        RETURNING id, spec_file_id, revision_number
      ), new_reviews AS (
        /*
         * Reviews travel with the revision they read, decision and all. A duplicate taken at a review
         * position would otherwise face a gate it had already satisfied, and AC-6 requires it to
         * resume rather than to redo.
         */
        INSERT INTO ${reviewFeedback} (
          spec_revision_id, outcome, items, decision, selected_item_ids, created_at, decided_at
        )
        SELECT nrv.id, rf.outcome, rf.items, rf.decision, rf.selected_item_ids, rf.created_at, rf.decided_at
        FROM ${reviewFeedback} rf
        JOIN ${specRevisions} sr ON sr.id = rf.spec_revision_id
        JOIN ${specFiles} sf ON sf.id = sr.spec_file_id
        JOIN src ON src.id = sf.project_id
        JOIN new_files nf ON nf.spec_type = sf.spec_type
        JOIN new_revisions nrv
          ON nrv.spec_file_id = nf.id AND nrv.revision_number = sr.revision_number
        RETURNING id
      )
      SELECT
        (SELECT id FROM new_project) AS project_id,
        (SELECT session_id FROM new_state) AS session_id
    `,
    DuplicatedRow,
  );

  return {
    projectId: duplicated.project_id,
    sessionId: duplicated.session_id,
    name,
  };
}
