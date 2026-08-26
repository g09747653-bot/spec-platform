import { readFileSync } from 'node:fs';

import Ajv from 'ajv';
import { unzipSync, strFromU8 } from 'fflate';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { OwnerScope } from '@/db/owner-scope';
import { exportRecords, projects, sessions, users, workflowState } from '@/db/schema';
import { createMigratedDatabase, type TestDatabase } from '@/db/testing/migrated-database';

/**
 * Task 150 — the machine export endpoint: the loop's bundle over HTTP.
 *
 * The derivation itself is pinned by `machine-bundle.test.ts` (golden + AJV); what is asserted here
 * is what only the route owns — ownership resolution, the manifest headers, the `bundle/` layout of
 * the archive, the export record with its own `mode`, and byte-determinism across two downloads of
 * the same revisions. Same two seams mocked as every route test: the session and the database handle.
 */
vi.mock('@/modules/projects/auth/scope', () => ({
  currentOwnerScope: vi.fn(),
  requireOwnerScope: vi.fn(),
}));

vi.mock('@/db/client', () => ({ getDatabase: vi.fn() }));

import { getDatabase } from '@/db/client';
import { currentOwnerScope } from '@/modules/projects/auth/scope';
import { createRevisionRepository } from '@/modules/specs/repositories/revisions';

import { GET } from './route';

const read = (path: string) => readFileSync(path, 'utf8');

const ajv = new Ajv({ allErrors: true });
const validRequirements = ajv.compile(
  JSON.parse(read('fixtures/spec-bundle/requirements_schema.json')) as object,
);
const validTasks = ajv.compile(
  JSON.parse(read('fixtures/spec-bundle/tasks_schema.json')) as object,
);

describe('GET /api/projects/:id/export/machine (task 150)', () => {
  let database: TestDatabase;
  let scope: OwnerScope;
  let projectId: string;

  const download = (): Promise<Response> =>
    GET(new Request('http://test.local/api/projects/x/export/machine'), {
      params: Promise.resolve({ id: projectId }),
    });

  async function approve(
    specType: 'constitution' | 'requirements' | 'solution' | 'tasks',
    content: string,
  ) {
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
    await database.db.delete(users);

    const [owner] = await database.db
      .insert(users)
      .values({ email: 'owner@example.test' })
      .returning({ id: users.id });

    scope = OwnerScope.forAuthenticatedUser(owner?.id ?? '');
    vi.mocked(currentOwnerScope).mockResolvedValue(scope);

    const [project] = await database.db
      .insert(projects)
      .values({ ownerId: owner?.id ?? '', name: 'Machine export' })
      .returning({ id: projects.id });

    projectId = project?.id ?? '';

    const [session] = await database.db
      .insert(sessions)
      .values({ projectId, initialPrompt: 'A machine bundle to hand to the loop' })
      .returning({ id: sessions.id });

    await database.db
      .insert(workflowState)
      .values({ sessionId: session?.id ?? '', stage: 'interview', substage: null });
  });

  it('answers the loop’s bundle: four entries under bundle/, JSON valid against the shared fixtures', async () => {
    await approve('constitution', '# Constitution\n\nrules\n');
    await approve('solution', '# Solution\n\nmodules\n');
    await approve('requirements', read('.specs/research/programma-a/requirements.md'));
    await approve('tasks', read('.specs/research/programma-a/tasks.md'));

    const response = await download();

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('application/zip');
    expect(response.headers.get('X-Spec-Export-Mode')).toBe('machine');
    expect(response.headers.get('X-Spec-Export-Included')).toBe(
      'bundle/constitution.md,bundle/architecture.md,bundle/requirements.json,bundle/tasks.json',
    );
    expect(response.headers.get('X-Spec-Export-Omitted')).toBe('');
    // The A0 plan states no dependencies across twenty tasks: the extract's warning, by name (А-52).
    expect(response.headers.get('X-Spec-Export-Warnings')).toBe('flat-plan');

    const entries = unzipSync(new Uint8Array(await response.arrayBuffer()));
    expect(Object.keys(entries).sort()).toEqual([
      'bundle/architecture.md',
      'bundle/constitution.md',
      'bundle/requirements.json',
      'bundle/tasks.json',
    ]);

    // The markdown travels verbatim; the JSON validates against the contract's own schemas.
    expect(strFromU8(entries['bundle/architecture.md'] ?? new Uint8Array())).toBe(
      '# Solution\n\nmodules\n',
    );

    const requirements: unknown = JSON.parse(
      strFromU8(entries['bundle/requirements.json'] ?? new Uint8Array()),
    );
    const tasks: unknown = JSON.parse(strFromU8(entries['bundle/tasks.json'] ?? new Uint8Array()));

    expect(validRequirements(requirements), ajv.errorsText(validRequirements.errors)).toBe(true);
    expect(validTasks(tasks), ajv.errorsText(validTasks.errors)).toBe(true);

    // Ids are the project's: stable across re-export because they name the same project every time.
    expect((requirements as { bundleId: string }).bundleId).toBe(projectId);
    expect((tasks as { projectId: string }).projectId).toBe(projectId);
  });

  it('writes exactly one export record per download, in the machine shape’s own mode', async () => {
    await approve('constitution', '# Constitution\n');

    await download();
    const records = await database.db.select().from(exportRecords);

    expect(records).toHaveLength(1);
    expect(records[0]?.mode).toBe('machine');
    expect(records[0]?.includedFiles).toEqual(['bundle/constitution.md']);
    expect(records[0]?.omittedFiles).toEqual([
      'bundle/architecture.md',
      'bundle/requirements.json',
      'bundle/tasks.json',
    ]);
  });

  it('answers a plan with stated dependencies without the flat-plan warning (А-52)', async () => {
    await approve('constitution', '# Constitution\n');
    await approve('tasks', read('fixtures/spec-bundle/golden/m14a-canonical.tasks.md'));

    const response = await download();

    expect(response.status).toBe(200);
    expect(response.headers.get('X-Spec-Export-Warnings')).toBe('');
  });

  it('is byte-deterministic: two downloads of the same revisions are one archive', async () => {
    await approve('constitution', '# Constitution\n');
    await approve('tasks', read('.specs/research/programma-a/tasks.md'));

    const first = Buffer.from(await (await download()).arrayBuffer());
    const second = Buffer.from(await (await download()).arrayBuffer());

    expect(second.equals(first)).toBe(true);
  });

  it('answers a foreign or unknown project as one that does not exist (AR-2)', async () => {
    vi.mocked(currentOwnerScope).mockResolvedValue(
      OwnerScope.forAuthenticatedUser('11111111-2222-3333-4444-555555555555'),
    );

    const response = await download();

    expect(response.status).toBe(404);
  });

  it('refuses an anonymous request', async () => {
    vi.mocked(currentOwnerScope).mockResolvedValue(null);

    const response = await download();

    expect(response.status).toBe(401);
  });
});
