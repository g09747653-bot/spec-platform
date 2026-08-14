import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { OwnerScope } from '@/db/owner-scope';
import { projects, sessions, users, workflowState } from '@/db/schema';
import { createMigratedDatabase, type TestDatabase } from '@/db/testing/migrated-database';

/**
 * Task 74 — the raw-markdown endpoint behind copy-to-clipboard (FR-016).
 *
 * The criterion that needs a test rather than a reading is AC-5: the copied content is the revision
 * the *current export mode* resolves to. That is only interesting once a file has both a parity and
 * an enriched revision, so the cases below build exactly that and ask for each mode.
 */
vi.mock('@/modules/projects/auth/scope', () => ({
  currentOwnerScope: vi.fn(),
  requireOwnerScope: vi.fn(),
}));

vi.mock('@/db/client', () => ({ getDatabase: vi.fn() }));

import { getDatabase } from '@/db/client';
import { currentOwnerScope } from '@/modules/projects/auth/scope';
import { createRevisionRepository } from '@/modules/specs/repositories/revisions';
import {
  clearStageCapabilities,
  registerStageCapability,
  type StageCapability,
} from '@/modules/workflow/capabilities';

import { GET } from './route';

describe('GET /api/specs/:specFileId/content (task 74)', () => {
  let database: TestDatabase;
  let projectId: string;
  let specFileId: string;

  const fetchContent = (query = ''): Promise<Response> =>
    GET(new Request(`http://test.local/api/specs/x/content${query}`), {
      params: Promise.resolve({ specFileId }),
    });

  beforeAll(async () => {
    database = await createMigratedDatabase();
    vi.mocked(getDatabase).mockReturnValue(
      database.db as unknown as ReturnType<typeof getDatabase>,
    );
  });

  afterAll(async () => {
    await database.close();
    vi.restoreAllMocks();
  });

  beforeEach(async () => {
    clearStageCapabilities();
    await database.db.delete(users);

    const [owner] = await database.db
      .insert(users)
      .values({ email: 'owner@example.test' })
      .returning({ id: users.id });

    vi.mocked(currentOwnerScope).mockResolvedValue(
      OwnerScope.forAuthenticatedUser(owner?.id ?? ''),
    );

    const [project] = await database.db
      .insert(projects)
      .values({ ownerId: owner?.id ?? '', name: 'Clipboard' })
      .returning({ id: projects.id });

    projectId = project?.id ?? '';

    const [session] = await database.db
      .insert(sessions)
      .values({ projectId, initialPrompt: 'A file to copy' })
      .returning({ id: sessions.id });

    await database.db
      .insert(workflowState)
      .values({ sessionId: session?.id ?? '', stage: 'interview', substage: null });

    const file = await createRevisionRepository(database.db).ensureSpecFile(
      projectId,
      'constitution',
    );
    specFileId = file.id;
  });

  /** Appends and approves a revision, returning its id. */
  async function approve(
    content: string,
    options: { origin?: 'parity' | 'enrichment'; derivedFrom?: string } = {},
  ): Promise<string> {
    const revisions = createRevisionRepository(database.db);
    const revision = await revisions.append({
      specFileId,
      content,
      ...(options.origin === undefined ? {} : { origin: options.origin }),
      ...(options.derivedFrom === undefined ? {} : { derivedFrom: options.derivedFrom }),
    });

    await revisions.approve(revision.id);
    return revision.id;
  }

  it('returns the markdown exactly as stored — no envelope, no fences, no truncation (AC-2)', async () => {
    const markdown = [
      '# Constitution',
      '',
      '## Core Principles',
      '',
      '```ts',
      "const fenced = 'this is content, not decoration';",
      '```',
      '',
      'Trailing line with a unicode em dash — kept.',
    ].join('\n');

    await approve(markdown);

    const response = await fetchContent();

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/markdown; charset=utf-8');
    // Byte-for-byte, including the fences the document itself contains.
    expect(await response.text()).toBe(markdown);
  });

  describe('the revision the current export mode resolves to (AC-5)', () => {
    it('gives the pre-enrichment revision in default mode, even when a newer enriched one exists', async () => {
      const parity = await approve('# Constitution\nparity');
      await approve('# Constitution\nenriched', { origin: 'enrichment', derivedFrom: parity });

      const response = await fetchContent();

      expect(await response.text()).toContain('parity');
      expect(response.headers.get('X-Spec-Export-Mode')).toBe('default');
    });

    it('gives the enriched revision in quality mode, when a capability is registered', async () => {
      const parity = await approve('# Constitution\nparity');
      await approve('# Constitution\nenriched', { origin: 'enrichment', derivedFrom: parity });

      const capability: StageCapability & { isStale: () => Promise<boolean> } = {
        id: 'quality',
        isEnabled: () => true,
        isStale: () => Promise.resolve(false),
      };
      registerStageCapability(capability);

      const response = await fetchContent('?mode=quality');

      expect(await response.text()).toContain('enriched');
      expect(response.headers.get('X-Spec-Export-Mode')).toBe('quality');
    });

    /*
     * The same forcing the archive does. A client asking for quality mode with no module installed
     * must not receive enriched bytes — the archive would not contain them, and the two are supposed
     * to be the same file.
     */
    it('forces default mode with no capability registered, whatever the query says', async () => {
      const parity = await approve('# Constitution\nparity');
      await approve('# Constitution\nenriched', { origin: 'enrichment', derivedFrom: parity });

      const response = await fetchContent('?mode=quality');

      expect(await response.text()).toContain('parity');
      expect(response.headers.get('X-Spec-Export-Mode')).toBe('default');
    });
  });

  it('ignores an unapproved newer revision', async () => {
    await approve('# Constitution\napproved');
    await createRevisionRepository(database.db).append({
      specFileId,
      content: '# Constitution\nawaiting a decision',
    });

    expect(await (await fetchContent()).text()).toContain('approved');
  });

  it('is NOT_FOUND when the file has nothing approved to copy', async () => {
    await createRevisionRepository(database.db).append({
      specFileId,
      content: '# Constitution\nawaiting a decision',
    });

    expect((await fetchContent()).status).toBe(404);
  });

  it('is NOT_FOUND for another user’s file, indistinguishably from one that never existed (AR-2)', async () => {
    await approve('# Constitution\nparity');

    vi.mocked(currentOwnerScope).mockResolvedValue(
      OwnerScope.forAuthenticatedUser('11111111-1111-4111-8111-111111111111'),
    );

    expect((await fetchContent()).status).toBe(404);

    specFileId = '22222222-2222-4222-8222-222222222222';
    expect((await fetchContent()).status).toBe(404);
  });

  it('is 401 with no session at all', async () => {
    vi.mocked(currentOwnerScope).mockResolvedValue(null);

    expect((await fetchContent()).status).toBe(401);
  });
});
