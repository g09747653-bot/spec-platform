import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { OwnerScope } from '@/db/owner-scope';
import { projects, proposedChanges, specFiles, specRevisions, users } from '@/db/schema';
import { createMigratedDatabase, type TestDatabase } from '@/db/testing/migrated-database';

import { validateStructure } from '../validate-structure';

import { createProposedChangeService } from './proposed-change-service';

/**
 * Task 59 — the ProposedChangeService.
 *
 * The acceptance criteria are all about what does **not** happen: no revision is written, a
 * destructive edit is refused, and a second instruction does not produce a second proposal. So the
 * assertions look at `spec_revisions` as often as at the return value — a service that returned the
 * right shape while quietly appending a revision would satisfy a shallower test.
 *
 * The model is absent by construction: this service is handed candidate content, because `specs` may
 * not import `agents` or `adapters` (A1). The ambiguity branch of FR-011 AC-9 therefore lives with
 * the refinement agent and is tested there.
 */
describe('ProposedChangeService (task 59)', () => {
  let database: TestDatabase;
  let ownerId: string;
  let projectId: string;
  let specFileId: string;
  let service: ReturnType<typeof createProposedChangeService>;

  /**
   * The required headings — asked of `validateStructure`, not read from the section schema.
   *
   * The schema has exactly two sanctioned importers (D-16, D-43) and a lint rule that enforces it;
   * a test is not one of them, and it does not need to be. Validating an all-but-empty document
   * makes the validator itself report every missing heading with the level it expects, which is the
   * same information arrived at through the one door that is allowed to open it. A section rename
   * therefore still moves this fixture and the assertions together.
   */
  const requiredHeadings = (): { heading: string; level: number }[] =>
    validateStructure('constitution', '# Constitution')
      .violations.filter((violation) => violation.code === 'MISSING_HEADING')
      .map((violation) => ({ heading: violation.heading, level: violation.expectedLevel }));

  /** A constitution that satisfies the section schema. */
  const validDocument = (extra = ''): string =>
    [
      '# Constitution',
      ...requiredHeadings().flatMap((section) => [
        '',
        `${'#'.repeat(section.level)} ${section.heading}`,
        '',
        `Content for ${section.heading}.`,
      ]),
      extra,
    ].join('\n');

  beforeAll(async () => {
    database = await createMigratedDatabase();
    service = createProposedChangeService(database.db);
  });

  afterAll(async () => {
    await database.close();
  });

  const scope = () => OwnerScope.forAuthenticatedUser(ownerId);

  beforeEach(async () => {
    await database.db.delete(users);

    const [owner] = await database.db
      .insert(users)
      .values({ email: 'owner@example.test' })
      .returning({ id: users.id });
    ownerId = owner?.id ?? '';

    const [project] = await database.db
      .insert(projects)
      .values({ ownerId, name: 'Refinement' })
      .returning({ id: projects.id });
    projectId = project?.id ?? '';

    const [file] = await database.db
      .insert(specFiles)
      .values({ projectId, specType: 'constitution', fileName: 'constitution.md' })
      .returning({ id: specFiles.id });
    specFileId = file?.id ?? '';

    await database.db
      .insert(specRevisions)
      .values({ specFileId, revisionNumber: 1, content: validDocument(), approved: true });
  });

  const revisionCount = async () => (await database.db.select().from(specRevisions)).length;

  describe('AC-1 — an instruction creates a pending proposal and no revision', () => {
    it('stores the proposal and leaves the revision chain untouched', async () => {
      const before = await revisionCount();

      const outcome = await service.propose(scope(), {
        specFileId,
        instruction: 'Add a non-goals note.',
        proposedContent: validDocument('\n- A non-goal.\n'),
      });

      expect(outcome.status).toBe('proposed');
      if (outcome.status !== 'proposed') return;
      expect(outcome.proposal.status).toBe('pending');
      expect(outcome.proposal.baseRevision).toBe(1);
      expect(await revisionCount()).toBe(before);
    });

    it('does not move the file pointer', async () => {
      await service.propose(scope(), {
        specFileId,
        instruction: 'Add a note.',
        proposedContent: validDocument('\n- A note.\n'),
      });

      const [file] = await database.db
        .select({ currentRevision: specFiles.currentRevision })
        .from(specFiles)
        .where(eq(specFiles.id, specFileId));

      expect(file?.currentRevision).toBe(0);
    });

    it('returns a diff of the change, and a unified rendering of it', async () => {
      const outcome = await service.propose(scope(), {
        specFileId,
        instruction: 'Add a non-goals note.',
        proposedContent: validDocument('\n- A non-goal.\n'),
      });

      expect(outcome.status).toBe('proposed');
      if (outcome.status !== 'proposed') return;
      expect(outcome.diff.identical).toBe(false);
      expect(outcome.diff.added).toBeGreaterThan(0);
      expect(outcome.unifiedDiff).toContain('--- a/constitution.md');
      expect(outcome.unifiedDiff).toContain('+- A non-goal.');
    });

    it('refuses an instruction that changes nothing, rather than offering an empty decision', async () => {
      const outcome = await service.propose(scope(), {
        specFileId,
        instruction: 'Leave it exactly as it is.',
        proposedContent: validDocument(),
      });

      expect(outcome.status).toBe('no-change');
      expect(await database.db.select().from(proposedChanges)).toHaveLength(0);
    });

    it("answers not-found for a file that is not the caller's (AR-2)", async () => {
      const [stranger] = await database.db
        .insert(users)
        .values({ email: 'stranger@example.test' })
        .returning({ id: users.id });

      const outcome = await service.propose(OwnerScope.forAuthenticatedUser(stranger?.id ?? ''), {
        specFileId,
        instruction: 'Change it.',
        proposedContent: validDocument('\n- x\n'),
      });

      expect(outcome.status).toBe('not-found');
      expect(await database.db.select().from(proposedChanges)).toHaveLength(0);
    });
  });

  describe('AC-2 — an instruction removing a required heading is refused, naming the section', () => {
    const withoutSection = (heading: string): string =>
      validDocument()
        .split('\n')
        .filter((line) => !line.toLowerCase().includes(heading.toLowerCase()))
        .join('\n');

    it('refuses the change and names the section it would remove', async () => {
      const target = requiredHeadings()[0]?.heading ?? '';

      const outcome = await service.propose(scope(), {
        specFileId,
        instruction: `Delete the ${target} section.`,
        proposedContent: withoutSection(target),
      });

      expect(outcome.status).toBe('removes-required-section');
      if (outcome.status !== 'removes-required-section') return;
      expect(outcome.sections).toContain(target);
    });

    it('stores nothing when it refuses', async () => {
      const target = requiredHeadings()[1]?.heading ?? '';

      await service.propose(scope(), {
        specFileId,
        instruction: `Drop ${target}.`,
        proposedContent: withoutSection(target),
      });

      expect(await database.db.select().from(proposedChanges)).toHaveLength(0);
      expect(await revisionCount()).toBe(1);
    });

    it('allows a change that keeps every required section', async () => {
      const outcome = await service.propose(scope(), {
        specFileId,
        instruction: 'Rewrite the body text.',
        proposedContent: validDocument().replace(/Content for/g, 'Rewritten content for'),
      });

      expect(outcome.status).toBe('proposed');
    });

    it('allows an edit to a document that was already missing a heading before the change', async () => {
      // A pre-existing structural defect must not make every later edit unrefusable-by-blame: the
      // user did not remove that section, and refusing their unrelated edit would be a dead end.
      const target = requiredHeadings()[0]?.heading ?? '';
      const alreadyBroken = withoutSection(target);

      await database.db
        .insert(specRevisions)
        .values({ specFileId, revisionNumber: 2, content: alreadyBroken });

      const outcome = await service.propose(scope(), {
        specFileId,
        instruction: 'Add a line.',
        proposedContent: `${alreadyBroken}\n\n- An added line.\n`,
      });

      expect(outcome.status).toBe('proposed');
    });

    it('still refuses removing a *second* section from an already-broken document', async () => {
      const [first, second] = requiredHeadings();
      const alreadyBroken = withoutSection(first?.heading ?? '');

      await database.db
        .insert(specRevisions)
        .values({ specFileId, revisionNumber: 2, content: alreadyBroken });

      const outcome = await service.propose(scope(), {
        specFileId,
        instruction: 'And drop the next one too.',
        proposedContent: alreadyBroken
          .split('\n')
          .filter((line) => !line.includes(second?.heading ?? ''))
          .join('\n'),
      });

      expect(outcome.status).toBe('removes-required-section');
      if (outcome.status !== 'removes-required-section') return;
      expect(outcome.sections).toEqual([second?.heading]);
    });
  });

  describe('one pending proposal per file (FR-011 AC-6; DR-11)', () => {
    const proposeOnce = (instruction: string, marker: string) =>
      service.propose(scope(), {
        specFileId,
        instruction,
        proposedContent: validDocument(`\n- ${marker}\n`),
      });

    it('refuses a second instruction while one is pending, and returns the pending one', async () => {
      const first = await proposeOnce('First change.', 'one');
      expect(first.status).toBe('proposed');

      const second = await proposeOnce('Second change.', 'two');

      expect(second.status).toBe('pending-decision');
      if (second.status !== 'pending-decision') return;
      expect(second.existing.instruction).toBe('First change.');
    });

    it('stores only the first of two racing instructions', async () => {
      const [a, b] = await Promise.all([
        proposeOnce('Racing A.', 'a'),
        proposeOnce('Racing B.', 'b'),
      ]);

      const outcomes = [a.status, b.status].sort();
      expect(outcomes).toEqual(['pending-decision', 'proposed']);
      expect(await database.db.select().from(proposedChanges)).toHaveLength(1);
    });

    it('accepts a new instruction once the pending one is decided', async () => {
      const first = await proposeOnce('First change.', 'one');
      if (first.status !== 'proposed') throw new Error('setup failed');

      expect(await service.markDecided(first.proposal.id, 'rejected')).toBe(true);

      expect((await proposeOnce('Second change.', 'two')).status).toBe('proposed');
    });

    it('decides a proposal only once', async () => {
      const first = await proposeOnce('First change.', 'one');
      if (first.status !== 'proposed') throw new Error('setup failed');

      expect(await service.markDecided(first.proposal.id, 'accepted')).toBe(true);
      expect(await service.markDecided(first.proposal.id, 'rejected')).toBe(false);

      const [row] = await database.db
        .select()
        .from(proposedChanges)
        .where(eq(proposedChanges.id, first.proposal.id));
      expect(row?.status).toBe('accepted');
    });
  });

  describe('lookups', () => {
    it('finds a proposal by id for its owner and nobody else', async () => {
      const outcome = await service.propose(scope(), {
        specFileId,
        instruction: 'Add a line.',
        proposedContent: validDocument('\n- x\n'),
      });
      if (outcome.status !== 'proposed') throw new Error('setup failed');

      const [stranger] = await database.db
        .insert(users)
        .values({ email: 'stranger@example.test' })
        .returning({ id: users.id });

      expect(await service.findOwned(scope(), outcome.proposal.id)).not.toBeNull();
      expect(
        await service.findOwned(
          OwnerScope.forAuthenticatedUser(stranger?.id ?? ''),
          outcome.proposal.id,
        ),
      ).toBeNull();
    });

    it('recomputes the diff against the revision the proposal was based on', async () => {
      const outcome = await service.propose(scope(), {
        specFileId,
        instruction: 'Add a line.',
        proposedContent: validDocument('\n- a later marker\n'),
      });
      if (outcome.status !== 'proposed') throw new Error('setup failed');

      // The file moves on underneath. The diff must still describe what the user was shown.
      await database.db
        .insert(specRevisions)
        .values({ specFileId, revisionNumber: 2, content: validDocument('\n- unrelated\n') });

      const recomputed = await service.diffFor(scope(), outcome.proposal);

      expect(recomputed?.baseContent).toBe(validDocument());
      expect(recomputed?.unifiedDiff).toContain('+- a later marker');
      expect(recomputed?.unifiedDiff).not.toContain('unrelated');
    });

    it('returns the pending proposal for a file, or null once decided', async () => {
      const outcome = await service.propose(scope(), {
        specFileId,
        instruction: 'Add a line.',
        proposedContent: validDocument('\n- x\n'),
      });
      if (outcome.status !== 'proposed') throw new Error('setup failed');

      expect(await service.pendingForFile(scope(), specFileId)).not.toBeNull();

      await service.markDecided(outcome.proposal.id, 'rejected');

      expect(await service.pendingForFile(scope(), specFileId)).toBeNull();
    });
  });
});
