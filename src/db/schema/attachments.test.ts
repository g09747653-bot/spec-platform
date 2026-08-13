import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { attachments, projects, sessions, users } from '@/db/schema';
import {
  captureDatabaseError,
  createMigratedDatabase,
  type TestDatabase,
} from '@/db/testing/migrated-database';

/**
 * Task 63 — the attachment table's invariants.
 *
 * The two that matter are pairings, and both are asserted against the database rather than against
 * the service that currently respects them: text exists exactly when extraction succeeded, and a
 * reason exists exactly when it failed. A row that breaks either would reach the context assembler
 * looking like a document that is legitimately empty.
 */
describe('attachments (task 63)', () => {
  let database: TestDatabase;
  let sessionId: string;

  beforeAll(async () => {
    database = await createMigratedDatabase();
  });

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    await database.db.delete(users);

    const [owner] = await database.db
      .insert(users)
      .values({ email: 'owner@example.test' })
      .returning({ id: users.id });

    const [project] = await database.db
      .insert(projects)
      .values({ ownerId: owner?.id ?? '', name: 'Attachments' })
      .returning({ id: projects.id });

    const [session] = await database.db
      .insert(sessions)
      .values({ projectId: project?.id ?? '', initialPrompt: 'A tool for specs.' })
      .returning({ id: sessions.id });

    sessionId = session?.id ?? '';
  });

  const insert = (values: Partial<typeof attachments.$inferInsert> = {}) => {
    const row: typeof attachments.$inferInsert = {
      sessionId,
      fileName: 'brief.pdf',
      mimeType: 'application/pdf',
      sizeBytes: 2048,
      blobKey: `attachments/owner/session/${crypto.randomUUID()}-brief.pdf`,
      attachedAtStage: 'interview',
      ...values,
    };

    return database.db.insert(attachments).values(row).returning({ id: attachments.id });
  };

  it('stores an upload in the pending state before extraction has run', async () => {
    const [row] = await insert();

    const [stored] = await database.db
      .select()
      .from(attachments)
      .where(eq(attachments.id, row?.id ?? ''));

    expect(stored?.parseStatus).toBe('pending');
    expect(stored?.extractedText).toBeNull();
    expect(stored?.parseReason).toBeNull();
  });

  it('accepts an extracted document and an image passthrough', async () => {
    await expect(
      insert({ parseStatus: 'ok', extractedText: 'The extracted text.' }),
    ).resolves.toHaveLength(1);

    await expect(
      insert({ mimeType: 'image/png', fileName: 'chart.png', parseStatus: 'passthrough' }),
    ).resolves.toHaveLength(1);
  });

  it('refuses an `ok` row with no extracted text', async () => {
    const error = await captureDatabaseError(() => insert({ parseStatus: 'ok' }));

    expect(error).toMatch(/attachments_extracted_text_matches_status/);
  });

  it('refuses a failed row that carries extracted text', async () => {
    const error = await captureDatabaseError(() =>
      insert({ parseStatus: 'failed', parseReason: 'timeout', extractedText: 'half a document' }),
    );

    expect(error).toMatch(/attachments_extracted_text_matches_status/);
  });

  it('refuses a failed row with no reason, and a successful row that states one', async () => {
    const missing = await captureDatabaseError(() => insert({ parseStatus: 'failed' }));
    expect(missing).toMatch(/attachments_parse_reason_matches_status/);

    const spurious = await captureDatabaseError(() =>
      insert({ parseStatus: 'ok', extractedText: 'text', parseReason: 'nothing went wrong' }),
    );
    expect(spurious).toMatch(/attachments_parse_reason_matches_status/);
  });

  it('refuses an unknown parse status and an unknown stage', async () => {
    const status = await captureDatabaseError(() => insert({ parseStatus: 'parsing' }));
    expect(status).toMatch(/attachments_parse_status_valid/);

    const stage = await captureDatabaseError(() => insert({ attachedAtStage: 'generate' }));
    expect(stage).toMatch(/attachments_attached_at_stage_valid/);
  });

  it('refuses a zero-byte upload and a blank file name', async () => {
    const empty = await captureDatabaseError(() => insert({ sizeBytes: 0 }));
    expect(empty).toMatch(/attachments_size_bytes_positive/);

    const blank = await captureDatabaseError(() => insert({ fileName: '   ' }));
    expect(blank).toMatch(/attachments_file_name_not_blank/);
  });

  /**
   * Two rows naming one object would make deletion ambiguous — removing one attachment would strip
   * the bytes out from under the other.
   */
  it('refuses two attachments pointing at one stored object', async () => {
    const blobKey = 'attachments/owner/session/shared-object.pdf';
    await insert({ blobKey });

    const error = await captureDatabaseError(() => insert({ blobKey, fileName: 'copy.pdf' }));

    expect(error).toMatch(/attachments_blob_key_unique|duplicate key/);
  });

  /** DR-6: deleting the project takes the attachment rows with it. */
  it('cascades from the project', async () => {
    await insert();

    await database.db.delete(users);

    expect(await database.db.select().from(attachments)).toHaveLength(0);
  });
});
