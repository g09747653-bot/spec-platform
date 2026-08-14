import { unzipSync } from 'fflate';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { OwnerScope } from '@/db/owner-scope';
import { exportRecords, projects, specRevisions, users } from '@/db/schema';
import { createMigratedDatabase, type TestDatabase } from '@/db/testing/migrated-database';

import { createRevisionRepository } from '../repositories/revisions';
import type { SpecType } from '../model/spec-files';

import { createExportService, type ExportService } from './export-service';
import type { QualityPort } from './quality-port';

/**
 * Task 72 — the export boundary, against a real PostgreSQL instance.
 *
 * The acceptance criteria here are all about what a *stored* revision set resolves to, so a mocked
 * repository would assert the test's own fiction. Every case below builds real revisions — parity and
 * enrichment, approved and not — and asks the service what leaves the system.
 */
describe('ExportService (task 72)', () => {
  let database: TestDatabase;
  let service: ExportService;
  let scope: OwnerScope;
  let projectId: string;

  const revisionsOf = () => createRevisionRepository(database.db);

  /** Appends a revision of `specType` and approves it, returning its id. */
  async function approvedRevision(
    specType: SpecType,
    content: string,
    options: { origin?: 'parity' | 'enrichment'; derivedFrom?: string } = {},
  ): Promise<string> {
    const revisions = revisionsOf();
    const file = await revisions.ensureSpecFile(projectId, specType);

    const revision = await revisions.append({
      specFileId: file.id,
      content,
      ...(options.origin === undefined ? {} : { origin: options.origin }),
      ...(options.derivedFrom === undefined ? {} : { derivedFrom: options.derivedFrom }),
    });

    await revisions.approve(revision.id);

    return revision.id;
  }

  /** The four parity files, each approved once. The starting point of a complete bundle. */
  async function completeParityBundle(): Promise<Record<string, string>> {
    return {
      constitution: await approvedRevision('constitution', '# Constitution\nparity'),
      requirements: await approvedRevision('requirements', '# Requirements\nparity'),
      solution: await approvedRevision('solution', '# Solution\nparity'),
      tasks: await approvedRevision('tasks', '# Tasks\nparity'),
    };
  }

  const namesIn = (zip: Uint8Array): string[] => Object.keys(unzipSync(zip));

  beforeAll(async () => {
    database = await createMigratedDatabase();
    service = createExportService(database.db);
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

    scope = OwnerScope.forAuthenticatedUser(owner?.id ?? '');

    const [project] = await database.db
      .insert(projects)
      .values({ ownerId: owner?.id ?? '', name: 'Export' })
      .returning({ id: projects.id });

    projectId = project?.id ?? '';
  });

  describe('default mode resolves to the last pre-enrichment revision (AC-1)', () => {
    it('ignores enriched revisions entirely, however new they are', async () => {
      const parity = await completeParityBundle();

      // Enrichment rewrites every core file, so each has a *newer* approved revision.
      for (const [specType, derivedFrom] of Object.entries(parity)) {
        await approvedRevision(specType as SpecType, `# ${specType}\nenriched`, {
          origin: 'enrichment',
          derivedFrom,
        });
      }

      const outcome = await service.resolveExport(scope, projectId, 'default', null);
      if (!outcome.ok) throw new Error('a default-mode export must not be refused');

      const archive = unzipSync(outcome.result.zip);

      for (const specType of Object.keys(parity)) {
        expect(new TextDecoder().decode(archive[`${specType}.md`])).toContain('parity');
      }
    });

    /*
     * The negative half, and the one worth having: a resolution that filtered on "no enrichment has
     * run for this project" would pass the test above and fail here — the file that was enriched
     * would come back enriched because the *project* also has a file that was not.
     */
    it('resolves per file, not per project', async () => {
      const parity = await completeParityBundle();

      await approvedRevision('solution', '# Solution\nenriched', {
        origin: 'enrichment',
        derivedFrom: parity.solution ?? '',
      });

      const outcome = await service.resolveExport(scope, projectId, 'default', null);
      if (!outcome.ok) throw new Error('a default-mode export must not be refused');

      const archive = unzipSync(outcome.result.zip);
      expect(new TextDecoder().decode(archive['solution.md'])).toContain('parity');
      expect(new TextDecoder().decode(archive['tasks.md'])).toContain('parity');
    });

    it('takes the newest pre-enrichment revision when there are several', async () => {
      await approvedRevision('constitution', '# Constitution\nfirst draft');
      await approvedRevision('constitution', '# Constitution\nsecond draft');

      const outcome = await service.resolveExport(scope, projectId, 'default', null);
      if (!outcome.ok) throw new Error('a default-mode export must not be refused');

      const archive = unzipSync(outcome.result.zip);
      expect(new TextDecoder().decode(archive['constitution.md'])).toContain('second draft');
    });
  });

  describe('the archive holds nothing beyond the mode (AC-2)', () => {
    it('omits quality.md from a default-mode export even when it exists and is approved', async () => {
      await completeParityBundle();
      await approvedRevision('quality', '# Quality\ntraceability');

      const outcome = await service.resolveExport(scope, projectId, 'default', null);
      if (!outcome.ok) throw new Error('a default-mode export must not be refused');

      expect(namesIn(outcome.result.zip)).toEqual([
        'constitution.md',
        'requirements.md',
        'solution.md',
        'tasks.md',
      ]);
      expect(outcome.result.omitted).toEqual([]);
    });

    it('includes quality.md in a quality-mode export, and the enriched core files', async () => {
      const parity = await completeParityBundle();

      for (const [specType, derivedFrom] of Object.entries(parity)) {
        await approvedRevision(specType as SpecType, `# ${specType}\nenriched`, {
          origin: 'enrichment',
          derivedFrom,
        });
      }

      await approvedRevision('quality', '# Quality\ntraceability');

      const port: QualityPort = { isStale: () => Promise.resolve(false) };
      const outcome = await service.resolveExport(scope, projectId, 'quality', port);
      if (!outcome.ok) throw new Error('a current quality-mode export must not be refused');

      expect(namesIn(outcome.result.zip)).toEqual([
        'constitution.md',
        'requirements.md',
        'solution.md',
        'tasks.md',
        'quality.md',
      ]);

      const archive = unzipSync(outcome.result.zip);
      expect(new TextDecoder().decode(archive['constitution.md'])).toContain('enriched');
    });

    it('omits a file with no approved revision rather than emitting it empty (FR-015 AC-9)', async () => {
      await approvedRevision('constitution', '# Constitution\nparity');

      const revisions = revisionsOf();
      const unapproved = await revisions.ensureSpecFile(projectId, 'requirements');
      await revisions.append({ specFileId: unapproved.id, content: '# Requirements\nnot yet' });

      const outcome = await service.resolveExport(scope, projectId, 'default', null);
      if (!outcome.ok) throw new Error('an incomplete bundle must still export');

      expect(namesIn(outcome.result.zip)).toEqual(['constitution.md']);
      expect(outcome.result.omitted).toEqual(['requirements.md', 'solution.md', 'tasks.md']);
    });
  });

  describe('with no Quality capability registered (AC-3)', () => {
    it('forces default mode, so a quality request yields the parity bundle', async () => {
      const parity = await completeParityBundle();
      await approvedRevision('constitution', '# Constitution\nenriched', {
        origin: 'enrichment',
        derivedFrom: parity.constitution ?? '',
      });
      await approvedRevision('quality', '# Quality\ntraceability');

      const outcome = await service.resolveExport(scope, projectId, 'quality', null);
      if (!outcome.ok) throw new Error('a forced default export must not be refused');

      expect(outcome.result.mode).toBe('default');
      expect(namesIn(outcome.result.zip)).not.toContain('quality.md');

      const archive = unzipSync(outcome.result.zip);
      expect(new TextDecoder().decode(archive['constitution.md'])).toContain('parity');
    });
  });

  describe('every export writes one ExportRecord (AC-4)', () => {
    it('captures the resolved mode and both file lists', async () => {
      await approvedRevision('constitution', '# Constitution\nparity');
      await approvedRevision('requirements', '# Requirements\nparity');

      await service.resolveExport(scope, projectId, 'default', null);

      const records = await database.db.select().from(exportRecords);

      expect(records).toHaveLength(1);
      expect(records[0]?.mode).toBe('default');
      expect(records[0]?.includedFiles).toEqual(['constitution.md', 'requirements.md']);
      expect(records[0]?.omittedFiles).toEqual(['solution.md', 'tasks.md']);
    });

    /*
     * The mode that is recorded is the one that *happened*. A record of the requested mode would say
     * "quality" about an archive holding the parity four — which is exactly the ambiguity A6 asks the
     * download to remove, reintroduced in the only place that outlives the download.
     */
    it('records the resolved mode, not the requested one', async () => {
      await completeParityBundle();

      await service.resolveExport(scope, projectId, 'quality', null);

      const records = await database.db.select().from(exportRecords);
      expect(records[0]?.mode).toBe('default');
    });

    it('writes one row per export, not one per project', async () => {
      await approvedRevision('constitution', '# Constitution\nparity');

      await service.resolveExport(scope, projectId, 'default', null);
      await service.resolveExport(scope, projectId, 'default', null);
      await service.resolveExport(scope, projectId, 'default', null);

      expect(await database.db.select().from(exportRecords)).toHaveLength(3);
    });

    it('records the empty omission list rather than leaving it out', async () => {
      await completeParityBundle();

      await service.resolveExport(scope, projectId, 'default', null);

      const records = await database.db.select().from(exportRecords);
      expect(records[0]?.omittedFiles).toEqual([]);
    });
  });

  describe('a refused export', () => {
    it('produces no archive and no record when enrichment is stale (A6)', async () => {
      await completeParityBundle();

      const isStale = vi.fn(() => Promise.resolve(true));
      const outcome = await service.resolveExport(scope, projectId, 'quality', { isStale });

      expect(outcome).toEqual({ ok: false, reason: 'EXPORT_STALE' });
      expect(await database.db.select().from(exportRecords)).toHaveLength(0);
    });
  });

  describe('owner scoping (AR-2)', () => {
    it('resolves nothing for a stranger, so their export is empty', async () => {
      await completeParityBundle();

      const stranger = OwnerScope.forAuthenticatedUser('11111111-1111-4111-8111-111111111111');
      const outcome = await service.resolveExport(stranger, projectId, 'default', null);
      if (!outcome.ok) throw new Error('the resolution itself does not refuse a stranger');

      expect(outcome.result.included).toEqual([]);
      expect(namesIn(outcome.result.zip)).toEqual([]);
    });
  });

  describe('the record is owned by its project', () => {
    it('goes away with the project it belongs to (DR-6)', async () => {
      await approvedRevision('constitution', '# Constitution\nparity');
      await service.resolveExport(scope, projectId, 'default', null);

      await database.db.delete(users);

      expect(await database.db.select().from(exportRecords)).toHaveLength(0);
      expect(await database.db.select().from(specRevisions)).toHaveLength(0);
    });
  });
});
