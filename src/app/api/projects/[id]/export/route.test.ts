import { unzipSync } from 'fflate';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { OwnerScope } from '@/db/owner-scope';
import { exportRecords, projects, sessions, users, workflowState } from '@/db/schema';
import { createMigratedDatabase, type TestDatabase } from '@/db/testing/migrated-database';

/**
 * Task 72 — the export endpoint, where a declared mode meets a request.
 *
 * The service is exercised directly by `export-service.test.ts`; what is asserted here is the part
 * only the route owns: how a query string becomes a mode, what the response says about the mode that
 * was used, and that no path through the handler produces an archive without a record.
 *
 * Two seams are mocked — the Auth.js session and the process-wide database handle. Everything else is
 * the shipping code path against a real PostgreSQL instance.
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

describe('GET /api/projects/:id/export (task 72)', () => {
  let database: TestDatabase;
  let scope: OwnerScope;
  let projectId: string;

  const download = (query = ''): Promise<Response> =>
    GET(new Request(`http://test.local/api/projects/x/export${query}`), {
      params: Promise.resolve({ id: projectId }),
    });

  async function approve(specType: 'constitution' | 'tasks' | 'quality', content: string) {
    const revisions = createRevisionRepository(database.db);
    const file = await revisions.ensureSpecFile(projectId, specType);
    const revision = await revisions.append({ specFileId: file.id, content });
    await revisions.approve(revision.id);
  }

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

    scope = OwnerScope.forAuthenticatedUser(owner?.id ?? '');
    vi.mocked(currentOwnerScope).mockResolvedValue(scope);

    const [project] = await database.db
      .insert(projects)
      .values({ ownerId: owner?.id ?? '', name: 'Export route' })
      .returning({ id: projects.id });

    projectId = project?.id ?? '';

    // The route resolves the project through the repository, which joins its session and position.
    const [session] = await database.db
      .insert(sessions)
      .values({ projectId, initialPrompt: 'An export to download' })
      .returning({ id: sessions.id });

    await database.db
      .insert(workflowState)
      .values({ sessionId: session?.id ?? '', stage: 'interview', substage: null });
  });

  it('states the mode it used, and the files it included and omitted (FR-015 AC-4/AC-7)', async () => {
    await approve('constitution', '# Constitution\nparity');

    const response = await download();

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/zip');
    expect(response.headers.get('X-Spec-Export-Mode')).toBe('default');
    expect(response.headers.get('X-Spec-Export-Included')).toBe('constitution.md');
    expect(response.headers.get('X-Spec-Export-Omitted')).toBe(
      'requirements.md,solution.md,tasks.md',
    );
  });

  /*
   * The mode arrives from the client, so it is parsed rather than trusted. An unknown value reads as
   * `default` because the parity bundle is the safe answer to an unclear question (constitution P3) —
   * a 422 here would turn a mistyped link into a dead end for a download the user is entitled to.
   */
  it('reads an unknown or absent mode as default rather than refusing', async () => {
    await approve('constitution', '# Constitution\nparity');

    for (const query of ['', '?mode=', '?mode=parity', '?mode=DEFAULT']) {
      const response = await download(query);
      expect(response.headers.get('X-Spec-Export-Mode')).toBe('default');
    }
  });

  it('forces default mode when no Quality capability is registered (AC-3)', async () => {
    await approve('constitution', '# Constitution\nparity');
    await approve('quality', '# Quality\ntraceability');

    const response = await download('?mode=quality');

    expect(response.headers.get('X-Spec-Export-Mode')).toBe('default');
    expect(Object.keys(unzipSync(new Uint8Array(await response.arrayBuffer())))).toEqual([
      'constitution.md',
    ]);
  });

  /*
   * The registry holds the general `StageCapability`, which has no `isStale`. A registration that
   * cannot answer the export boundary's question is treated as absent rather than called — otherwise
   * a half-built capability would turn every download into a `TypeError`.
   */
  it('treats a registered capability that cannot answer staleness as no capability at all', async () => {
    await approve('constitution', '# Constitution\nparity');
    registerStageCapability({ id: 'quality', isEnabled: () => true });

    const response = await download('?mode=quality');

    expect(response.status).toBe(200);
    expect(response.headers.get('X-Spec-Export-Mode')).toBe('default');
  });

  it('refuses a quality-mode export whose enrichment is stale, and writes no record (A6)', async () => {
    await approve('constitution', '# Constitution\nparity');

    /*
     * What the Quality module registers in task 82: a `StageCapability` that also answers the export
     * boundary's question. The registry's declared type is the narrower one, so the extra method is
     * attached the way the real capability will present it — structurally.
     */
    const capability: StageCapability & { isStale: () => Promise<boolean> } = {
      id: 'quality',
      isEnabled: () => true,
      isStale: () => Promise.resolve(true),
    };

    registerStageCapability(capability);

    const response = await download('?mode=quality');

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: 'EXPORT_STALE' } });
    expect(await database.db.select().from(exportRecords)).toHaveLength(0);
  });

  it('records every download that happened, and only those', async () => {
    await approve('constitution', '# Constitution\nparity');

    await download();
    await download('?mode=quality');

    const records = await database.db.select().from(exportRecords);
    expect(records).toHaveLength(2);
    expect(records.every((record) => record.mode === 'default')).toBe(true);
  });

  it('is 404 for a project the caller does not own, with no record written (AR-2)', async () => {
    await approve('constitution', '# Constitution\nparity');

    vi.mocked(currentOwnerScope).mockResolvedValue(
      OwnerScope.forAuthenticatedUser('11111111-1111-4111-8111-111111111111'),
    );

    const response = await download();

    expect(response.status).toBe(404);
    expect(await database.db.select().from(exportRecords)).toHaveLength(0);
  });

  it('is 401 with no session at all', async () => {
    vi.mocked(currentOwnerScope).mockResolvedValue(null);

    expect((await download()).status).toBe(401);
  });
});
