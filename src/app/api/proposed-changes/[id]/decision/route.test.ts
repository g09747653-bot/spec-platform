import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { OwnerScope } from '@/db/owner-scope';
import {
  attachments,
  projects,
  proposedChanges,
  sessions,
  specFiles,
  specRevisions,
  users,
  workflowState,
} from '@/db/schema';
import { createMigratedDatabase, type TestDatabase } from '@/db/testing/migrated-database';
import { validateStructure } from '@/modules/specs/validate-structure';

/**
 * Task 60 — accept and reject, and the asymmetry between them.
 *
 * Every acceptance criterion here is a claim about *state after the fact*, so every test reads the
 * database back: the file's bytes after a rejection, the number of revisions after an acceptance,
 * and the untouched contents of the revisions that were already there. A handler returning the right
 * JSON while appending a stray revision would pass a shallower test and fail the requirement.
 */
vi.mock('@/modules/projects/auth/scope', () => ({
  currentOwnerScope: vi.fn(),
  requireOwnerScope: vi.fn(),
}));

vi.mock('@/db/client', () => ({ getDatabase: vi.fn() }));

vi.mock('@/modules/adapters/llm/default-adapter', () => ({ createDefaultAdapter: vi.fn() }));

import { getDatabase } from '@/db/client';
import { stubRefinementDocument } from '@/modules/adapters/llm';
import { createDefaultAdapter } from '@/modules/adapters/llm/default-adapter';
import { currentOwnerScope } from '@/modules/projects/auth/scope';

import { POST as propose } from '../../../specs/[specFileId]/proposed-changes/route';

import { POST } from './route';

const asJson = async (response: Response): Promise<Record<string, unknown>> =>
  (await response.json()) as Record<string, unknown>;

function decide(proposalId: string, body: unknown): Promise<Response> {
  return POST(
    new Request('http://test.local/api/proposed-changes/decision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: proposalId }) },
  );
}

function submit(specFileId: string, instruction: string): Promise<Response> {
  return propose(
    new Request('http://test.local/api/specs/proposed-changes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instruction }),
    }),
    { params: Promise.resolve({ specFileId }) },
  );
}

describe('conversational refinement endpoints (tasks 59, 60)', () => {
  let database: TestDatabase;
  let ownerId: string;
  let sessionId: string;
  let specFileId: string;
  let originalContent: string;

  beforeAll(async () => {
    database = await createMigratedDatabase();
    vi.mocked(getDatabase).mockReturnValue(
      database.db as unknown as ReturnType<typeof getDatabase>,
    );

    /*
     * The one seam that keeps a vendor out of the suite (D-23). The double answers refinement
     * prompts the way the configured stub provider does, so the route's own prompt assembly and
     * response parsing are exercised rather than stubbed over.
     */
    vi.mocked(createDefaultAdapter).mockReturnValue({
      generateStreaming: (options) =>
        Promise.resolve({
          text: stubRefinementDocument(options.messages.map((m) => m.content).join('\n')),
          providerUsed: 'stub',
          attempts: 1,
        }),
    });
  });

  afterAll(async () => {
    await database.close();
  });

  /** The required headings, asked of the validator — the schema has only two sanctioned importers. */
  const requiredHeadings = () =>
    validateStructure('constitution', '# Constitution')
      .violations.filter((violation) => violation.code === 'MISSING_HEADING')
      .map((violation) => ({ heading: violation.heading, level: violation.expectedLevel }));

  const validDocument = (): string =>
    [
      '# Constitution',
      ...requiredHeadings().flatMap((section) => [
        '',
        `${'#'.repeat(section.level)} ${section.heading}`,
        '',
        `Content for ${section.heading}.`,
      ]),
    ].join('\n');

  beforeEach(async () => {
    await database.db.delete(users);

    const [owner] = await database.db
      .insert(users)
      .values({ email: 'owner@example.test' })
      .returning({ id: users.id });
    ownerId = owner?.id ?? '';

    const [project] = await database.db
      .insert(projects)
      .values({ ownerId, name: 'Refinement API' })
      .returning({ id: projects.id });
    const projectId = project?.id ?? '';

    const [session] = await database.db
      .insert(sessions)
      .values({ projectId, initialPrompt: 'Build it', summary: 'Summarised.' })
      .returning({ id: sessions.id });
    sessionId = session?.id ?? '';
    await database.db
      .insert(workflowState)
      .values({ sessionId, stage: 'constitution', substage: 'generate' });

    const [file] = await database.db
      .insert(specFiles)
      .values({ projectId, specType: 'constitution', fileName: 'constitution.md' })
      .returning({ id: specFiles.id });
    specFileId = file?.id ?? '';

    originalContent = validDocument();
    await database.db.insert(specRevisions).values({
      specFileId,
      revisionNumber: 1,
      content: originalContent,
      approved: true,
    });

    vi.mocked(currentOwnerScope).mockResolvedValue(OwnerScope.forAuthenticatedUser(ownerId));
  });

  const contentOf = async (revisionNumber: number) => {
    const [row] = await database.db
      .select({ content: specRevisions.content })
      .from(specRevisions)
      .where(eq(specRevisions.revisionNumber, revisionNumber));
    return row?.content;
  };

  const revisionCount = async () => (await database.db.select().from(specRevisions)).length;

  /** Submits an instruction and returns the pending proposal's id. */
  async function pendingProposal(instruction = 'Add a note about non-goals.'): Promise<string> {
    const response = await submit(specFileId, instruction);
    expect(response.status).toBe(201);

    return String((await asJson(response)).proposedChangeId);
  }

  describe('submitting an instruction (task 59; FR-011 AC-1/AC-2)', () => {
    it('creates a pending proposal, a diff, and no revision', async () => {
      const before = await revisionCount();

      const response = await submit(specFileId, 'Add a note about non-goals.');

      expect(response.status).toBe(201);
      const body = await asJson(response);
      expect(body.status).toBe('proposed');
      expect(body.unifiedDiff).toEqual(expect.stringContaining('--- a/constitution.md'));
      expect(await revisionCount()).toBe(before);
    });

    it('answers an ambiguous instruction with a question, not a change (AC-9)', async () => {
      const response = await submit(specFileId, 'Make it better.');

      expect(response.status).toBe(200);
      const body = await asJson(response);
      expect(body.status).toBe('clarification');
      expect(body.question).toEqual(expect.any(String));

      expect(await database.db.select().from(proposedChanges)).toHaveLength(0);
      expect(await revisionCount()).toBe(1);
    });

    it('refuses an instruction that would remove a required section, naming it (AC-8)', async () => {
      const target = requiredHeadings()[0]?.heading ?? '';

      const response = await submit(specFileId, `Remove the ${target} section.`);

      expect(response.status).toBe(422);
      expect(JSON.stringify(await asJson(response))).toContain(target);
      expect(await database.db.select().from(proposedChanges)).toHaveLength(0);
      expect(await contentOf(1)).toBe(originalContent);
    });

    it('refuses a second instruction while one is pending, with PENDING_DECISION (AC-6)', async () => {
      await pendingProposal();

      const second = await submit(specFileId, 'And another change entirely.');

      expect(second.status).toBe(409);
      const body = await asJson(second);
      expect(JSON.stringify(body)).toContain('PENDING_DECISION');
      expect(await database.db.select().from(proposedChanges)).toHaveLength(1);
    });

    it('answers 401 unauthenticated and 404 for another owner (AR-2)', async () => {
      vi.mocked(currentOwnerScope).mockResolvedValue(null);
      expect((await submit(specFileId, 'Change it.')).status).toBe(401);

      const [stranger] = await database.db
        .insert(users)
        .values({ email: 'stranger@example.test' })
        .returning({ id: users.id });
      vi.mocked(currentOwnerScope).mockResolvedValue(
        OwnerScope.forAuthenticatedUser(stranger?.id ?? ''),
      );
      expect((await submit(specFileId, 'Change it.')).status).toBe(404);
    });

    it('rejects a blank instruction before anything is computed', async () => {
      expect((await submit(specFileId, '   ')).status).toBe(422);
      expect(await database.db.select().from(proposedChanges)).toHaveLength(0);
    });
  });

  describe('AC-1 — rejecting creates no revision and leaves content byte-for-byte unchanged', () => {
    it('writes no revision at all', async () => {
      const proposalId = await pendingProposal();
      const before = await revisionCount();

      const response = await decide(proposalId, { decision: 'reject' });

      expect(response.status).toBe(200);
      expect(await asJson(response)).toMatchObject({ decision: 'reject', revisionNumber: null });
      expect(await revisionCount()).toBe(before);
    });

    it('leaves the current content byte-for-byte identical', async () => {
      const proposalId = await pendingProposal();

      await decide(proposalId, { decision: 'reject' });

      expect(await contentOf(1)).toBe(originalContent);
    });

    it('does not move the file pointer', async () => {
      const proposalId = await pendingProposal();
      const [before] = await database.db
        .select({ currentRevision: specFiles.currentRevision })
        .from(specFiles)
        .where(eq(specFiles.id, specFileId));

      await decide(proposalId, { decision: 'reject' });

      const [after] = await database.db
        .select({ currentRevision: specFiles.currentRevision })
        .from(specFiles)
        .where(eq(specFiles.id, specFileId));
      expect(after?.currentRevision).toBe(before?.currentRevision);
    });

    it('keeps the rejected proposal as the record that the user said no', async () => {
      const proposalId = await pendingProposal();

      await decide(proposalId, { decision: 'reject' });

      const [row] = await database.db
        .select()
        .from(proposedChanges)
        .where(eq(proposedChanges.id, proposalId));
      expect(row?.status).toBe('rejected');
      expect(row?.decidedAt).not.toBeNull();
    });

    it('frees the file for a new instruction', async () => {
      await decide(await pendingProposal(), { decision: 'reject' });

      expect((await submit(specFileId, 'A different change.')).status).toBe(201);
    });
  });

  describe('AC-2 — accepting creates exactly one revision, prior revisions unmodified', () => {
    it('appends exactly one revision carrying the proposed content', async () => {
      const proposalId = await pendingProposal();

      const response = await decide(proposalId, { decision: 'accept' });

      expect(response.status).toBe(200);
      const body = await asJson(response);
      expect(body.revisionNumber).toBe(2);
      expect(await revisionCount()).toBe(2);
      expect(await contentOf(2)).toContain('Add a note about non-goals.');
    });

    it('leaves the prior revision byte-for-byte as it was', async () => {
      await decide(await pendingProposal(), { decision: 'accept' });

      expect(await contentOf(1)).toBe(originalContent);
    });

    it('creates the revision unapproved — accepting a diff is not approving a spec', async () => {
      const response = await decide(await pendingProposal(), { decision: 'accept' });

      expect((await asJson(response)).approved).toBe(false);
    });

    /**
     * Task 69 / DR-12. The set recorded is the one that existed **when the text was produced**, not
     * when it was accepted: a document attached in between was never in front of the agent, and
     * recording it would make the file look as though it had already taken it into account — hiding
     * exactly the situation FR-004 AC-9 exists to report.
     */
    it('records the attachment set as it was when the proposal was made', async () => {
      const [before] = await database.db
        .insert(attachments)
        .values({
          sessionId,
          fileName: 'early.md',
          mimeType: 'text/markdown',
          sizeBytes: 10,
          blobKey: `attachments/${ownerId}/${sessionId}/early.md`,
          parseStatus: 'ok',
          extractedText: 'Early.',
          attachedAtStage: 'constitution',
        })
        .returning({ id: attachments.id });

      const proposalId = await pendingProposal();

      // Attached after the text was produced, so it belongs to no revision this proposal writes.
      await database.db.insert(attachments).values({
        sessionId,
        fileName: 'later.md',
        mimeType: 'text/markdown',
        sizeBytes: 10,
        blobKey: `attachments/${ownerId}/${sessionId}/later.md`,
        parseStatus: 'ok',
        extractedText: 'Later.',
        attachedAtStage: 'constitution',
        uploadedAt: new Date(Date.now() + 60_000),
      });

      await decide(proposalId, { decision: 'accept' });

      const [revision] = await database.db
        .select()
        .from(specRevisions)
        .where(eq(specRevisions.revisionNumber, 2));

      expect(revision?.contextAttachmentIds).toEqual([before?.id]);
    });

    it('marks the proposal accepted, and frees the file', async () => {
      const proposalId = await pendingProposal();
      await decide(proposalId, { decision: 'accept' });

      const [row] = await database.db
        .select()
        .from(proposedChanges)
        .where(eq(proposedChanges.id, proposalId));
      expect(row?.status).toBe('accepted');

      expect((await submit(specFileId, 'One more change.')).status).toBe(201);
    });
  });

  describe('AC-3 — a decision is taken once', () => {
    it('refuses a second decision and appends nothing more', async () => {
      const proposalId = await pendingProposal();
      await decide(proposalId, { decision: 'accept' });

      const second = await decide(proposalId, { decision: 'reject' });

      expect(second.status).toBe(409);
      expect(await revisionCount()).toBe(2);
    });

    it('does not let a reject-after-accept undo the revision', async () => {
      const proposalId = await pendingProposal();
      await decide(proposalId, { decision: 'accept' });
      await decide(proposalId, { decision: 'reject' });

      const [row] = await database.db
        .select()
        .from(proposedChanges)
        .where(eq(proposedChanges.id, proposalId));
      expect(row?.status).toBe('accepted');
      expect(await revisionCount()).toBe(2);
    });

    it('creates only one revision when two accepts race', async () => {
      const proposalId = await pendingProposal();

      const [a, b] = await Promise.all([
        decide(proposalId, { decision: 'accept' }),
        decide(proposalId, { decision: 'accept' }),
      ]);

      expect([a.status, b.status].sort()).toEqual([200, 409]);
      expect(await revisionCount()).toBe(2);
    });
  });

  describe('ownership and validation', () => {
    it('answers 401 when unauthenticated', async () => {
      const proposalId = await pendingProposal();
      vi.mocked(currentOwnerScope).mockResolvedValue(null);

      expect((await decide(proposalId, { decision: 'accept' })).status).toBe(401);
    });

    it("answers 404 for another owner's proposal, indistinguishably from a missing one", async () => {
      const proposalId = await pendingProposal();

      const [stranger] = await database.db
        .insert(users)
        .values({ email: 'stranger@example.test' })
        .returning({ id: users.id });
      vi.mocked(currentOwnerScope).mockResolvedValue(
        OwnerScope.forAuthenticatedUser(stranger?.id ?? ''),
      );

      const owned = await decide(proposalId, { decision: 'accept' });
      const missing = await decide('11111111-2222-3333-4444-555555555555', {
        decision: 'accept',
      });

      expect(owned.status).toBe(404);
      expect(await asJson(owned)).toEqual(await asJson(missing));
      expect(await revisionCount()).toBe(1);
    });

    it('rejects a decision the card does not offer', async () => {
      const proposalId = await pendingProposal();

      expect((await decide(proposalId, { decision: 'approve' })).status).toBe(422);
      expect((await decide(proposalId, {})).status).toBe(422);
      expect(await revisionCount()).toBe(1);
    });
  });
});
