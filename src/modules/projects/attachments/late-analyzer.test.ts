import { and, eq } from 'drizzle-orm';
import { strToU8 } from 'fflate';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { OwnerScope } from '@/db/owner-scope';
import { projects, sessions, specFiles, specRevisions, users } from '@/db/schema';
import { createMigratedDatabase, type TestDatabase } from '@/db/testing/migrated-database';
import { createExtractorRegistry } from '@/modules/adapters/parsing';
import { createMemoryStorage, type MemoryStorage } from '@/modules/adapters/storage';

import { createLateAttachmentAnalyzer } from './late-analyzer';
import { createAttachmentService } from './service';

/**
 * Task 69 — which approved files predate a document, computed from persisted state.
 *
 * The acceptance criterion is exact: "attaching a document after two approvals names exactly those
 * two files". So the fixtures below build the situations where a looser rule would be wrong — a file
 * approved *after* the document was attached (and which therefore already knows about it), an
 * unapproved draft, and a file whose newest approved revision supersedes an older one that predates
 * the document.
 */
describe('LateAttachmentAnalyzer (task 69)', () => {
  let database: TestDatabase;
  let storage: MemoryStorage;
  let ownerId: string;
  let projectId: string;
  let sessionId: string;
  let scope: OwnerScope;

  const limits = { maxBytes: 10_000, allowedTypes: ['text/plain', 'text/markdown'] };

  const service = () =>
    createAttachmentService({
      db: database.db,
      storage,
      parsing: createExtractorRegistry({
        extractors: {
          'text/plain': (bytes) => Promise.resolve(new TextDecoder().decode(bytes)),
          'text/markdown': (bytes) => Promise.resolve(new TextDecoder().decode(bytes)),
        },
        read: (blobKey) => storage.read(scope, blobKey),
        timeoutMs: 1_000,
      }),
      limits,
    });

  const attach = async (fileName: string): Promise<string> => {
    const outcome = await service().upload(scope, {
      sessionId,
      fileName,
      declaredType: 'text/plain',
      bytes: strToU8(`Content of ${fileName}`),
      attachedAtStage: 'solution',
    });

    if (outcome.status !== 'stored') throw new Error(`upload failed: ${outcome.status}`);

    return outcome.attachment.id;
  };

  /**
   * A spec file with one approved revision carrying the given context set — the shape a real
   * generation writes (DR-12).
   *
   * The rows are inserted directly rather than through `specs/repositories/revisions`: `projects` may
   * not import `specs` (constitution A1), and a test living in `projects` is bound by the same rule
   * as the code it tests. The lint fixture check catches the attempt, which is the boundary working.
   */
  const approveFile = async (
    specType: 'constitution' | 'requirements' | 'solution',
    contextAttachmentIds: readonly string[],
    revisionNumber = 1,
  ): Promise<string> => {
    const [existing] = await database.db
      .select({ id: specFiles.id })
      .from(specFiles)
      .where(and(eq(specFiles.projectId, projectId), eq(specFiles.specType, specType)));

    const specFileId =
      existing?.id ??
      (
        await database.db
          .insert(specFiles)
          .values({ projectId, specType, fileName: `${specType}.md`, currentRevision: 0 })
          .returning({ id: specFiles.id })
      )[0]?.id ??
      '';

    await database.db.insert(specRevisions).values({
      specFileId,
      revisionNumber,
      content: `# ${specType}\n\n## Purpose\n\nApproved.`,
      approved: true,
      contextAttachmentIds: [...contextAttachmentIds],
    });

    await database.db
      .update(specFiles)
      .set({ currentRevision: revisionNumber })
      .where(eq(specFiles.id, specFileId));

    return specFileId;
  };

  const analyze = (attachmentId: string) =>
    createLateAttachmentAnalyzer(database.db).analyze(scope, sessionId, attachmentId);

  const names = async (attachmentId: string): Promise<string[]> =>
    (await analyze(attachmentId)).affectedFiles.map((file) => file.fileName);

  beforeAll(async () => {
    database = await createMigratedDatabase();
  });

  afterAll(async () => {
    await database.close();
  });

  beforeEach(async () => {
    await database.db.delete(users);
    storage = createMemoryStorage();

    const [owner] = await database.db
      .insert(users)
      .values({ email: 'owner@example.test' })
      .returning({ id: users.id });
    ownerId = owner?.id ?? '';
    scope = OwnerScope.forAuthenticatedUser(ownerId);

    const [project] = await database.db
      .insert(projects)
      .values({ ownerId, name: 'Late attachments' })
      .returning({ id: projects.id });
    projectId = project?.id ?? '';

    const [session] = await database.db
      .insert(sessions)
      .values({ projectId, initialPrompt: 'A tool for specs.' })
      .returning({ id: sessions.id });
    sessionId = session?.id ?? '';
  });

  it('names exactly the files approved before the document arrived (AC-9)', async () => {
    await approveFile('constitution', []);
    await approveFile('requirements', []);

    const attachmentId = await attach('brief.txt');

    expect(await names(attachmentId)).toEqual(['constitution.md', 'requirements.md']);
  });

  it('names nothing when nothing has been approved yet', async () => {
    const attachmentId = await attach('brief.txt');

    expect(await names(attachmentId)).toEqual([]);
  });

  it('does not name a file that was generated with the document as context', async () => {
    const attachmentId = await attach('brief.txt');

    await approveFile('constitution', [attachmentId]);
    await approveFile('requirements', []);

    expect(await names(attachmentId)).toEqual(['requirements.md']);
  });

  it('does not name an unapproved draft', async () => {
    const [file] = await database.db
      .insert(specFiles)
      .values({
        projectId,
        specType: 'constitution',
        fileName: 'constitution.md',
        currentRevision: 1,
      })
      .returning({ id: specFiles.id });

    await database.db.insert(specRevisions).values({
      specFileId: file?.id ?? '',
      revisionNumber: 1,
      content: '# Constitution\n\n## Purpose\n\nDraft.',
      approved: false,
    });

    const attachmentId = await attach('brief.txt');

    expect(await names(attachmentId)).toEqual([]);
  });

  /**
   * Only the newest approved revision is consulted. An earlier one that predates the document has
   * already been superseded, and reporting it would ask the user to fix something that is not there.
   */
  it('consults only the newest approved revision of each file', async () => {
    await approveFile('constitution', []);
    const attachmentId = await attach('brief.txt');

    expect(await names(attachmentId)).toEqual(['constitution.md']);

    await approveFile('constitution', [attachmentId], 2);

    expect(await names(attachmentId)).toEqual([]);
  });

  it('carries the file id alongside the name, so the refine action can act on that file', async () => {
    const specFileId = await approveFile('constitution', []);
    const attachmentId = await attach('brief.txt');

    expect((await analyze(attachmentId)).affectedFiles).toEqual([
      { specFileId, fileName: 'constitution.md' },
    ]);
  });

  describe('AC-10 — nothing changes as a side effect', () => {
    it('leaves every approved revision byte-identical', async () => {
      const specFileId = await approveFile('constitution', []);

      const before = await database.db.select().from(specRevisions);
      const filesBefore = await database.db.select().from(specFiles);

      const attachmentId = await attach('brief.txt');
      await analyze(attachmentId);

      expect(await database.db.select().from(specRevisions)).toEqual(before);
      expect(await database.db.select().from(specFiles)).toEqual(filesBefore);
      expect(before.filter((row) => row.specFileId === specFileId)).toHaveLength(1);
    });
  });

  describe('ownership', () => {
    it('names nothing for a stranger, whatever session id they present', async () => {
      await approveFile('constitution', []);
      const attachmentId = await attach('brief.txt');

      const [stranger] = await database.db
        .insert(users)
        .values({ email: 'stranger@example.test' })
        .returning({ id: users.id });

      const impact = await createLateAttachmentAnalyzer(database.db).analyze(
        OwnerScope.forAuthenticatedUser(stranger?.id ?? ''),
        sessionId,
        attachmentId,
      );

      expect(impact.affectedFiles).toEqual([]);
    });

    it('names nothing for identifiers that are not uuids', async () => {
      const analyzer = createLateAttachmentAnalyzer(database.db);

      expect((await analyzer.analyze(scope, 'nope', 'nope')).affectedFiles).toEqual([]);
    });
  });
});
