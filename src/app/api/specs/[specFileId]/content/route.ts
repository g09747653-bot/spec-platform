import { getDatabase } from '@/db/client';
import { currentOwnerScope } from '@/modules/projects/auth/scope';
import { resolveExportMode } from '@/modules/specs/export/resolve-mode';
import { isExportMode } from '@/modules/specs/model/export';
import { createRevisionRepository } from '@/modules/specs/repositories/revisions';
import { createSpecFileRepository } from '@/modules/specs/repositories/spec-files';
import { errorResponse } from '@/modules/web/api/responses';
import { qualityExportPort } from '@/modules/workflow/quality-port';

/**
 * `GET /api/specs/:specFileId/content?mode=` — one file's markdown, for the clipboard (task 74;
 * FR-016).
 *
 * **Raw, and raw all the way down.** The body is the stored bytes and nothing else: no JSON envelope
 * to unwrap, no fences to strip, no truncation (AC-2). A JSON response would be the natural shape for
 * this API and it would be wrong — every wrapper is one more thing between the stored revision and
 * what lands on the clipboard, and each is a place a stray character can be introduced. `Content-Type`
 * says `text/markdown`, and `response.text()` is the whole client-side transformation.
 *
 * **The mode decides which revision** (AC-5), through the same function the archive uses — so a copied
 * file and the same file inside the ZIP are the same bytes by construction rather than by coincidence.
 *
 * A file with no approved revision is `NOT_FOUND` rather than an empty body: there is nothing to copy,
 * and an empty clipboard that reported success is worse than an error (FR-015 AC-9 is the same
 * instinct applied to the archive).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ specFileId: string }> },
): Promise<Response> {
  const scope = await currentOwnerScope();
  if (scope === null) return errorResponse('UNAUTHENTICATED');

  const { specFileId } = await params;
  const db = getDatabase();

  // Ownership first, in SQL: another user's file is indistinguishable from one that never existed.
  const file = await createSpecFileRepository(db).findById(scope, specFileId);
  if (file === null) return errorResponse('NOT_FOUND');

  const query = new URL(request.url).searchParams;
  const requested = query.get('mode') ?? '';
  const mode = resolveExportMode(
    isExportMode(requested) ? requested : 'default',
    qualityExportPort(),
  );

  const revisions = createRevisionRepository(db);

  /*
   * **`?rev=N` names one revision by number** (task 138).
   *
   * The viewer pane opens a document at whichever revision the card it was opened from is about,
   * and that card is very often a draft — the whole point of «the card is a door» is that a document
   * can be read *before* it is approved. Resolving by export mode cannot answer that question: it
   * answers «which bytes would be exported», which for an unapproved file is «none».
   *
   * Without the parameter nothing changes, and that is deliberate: the clipboard path (FR-016 AC-5)
   * and the archive still agree by construction, because they still go through the same mode
   * resolution. This adds a second question to the endpoint, not a second answer to the first one —
   * and every revision it can name belongs to a file the owner predicate has already admitted.
   */
  const asked = query.get('rev');
  const numbered = asked === null ? Number.NaN : Number(asked);
  const revision =
    Number.isInteger(numbered) && numbered > 0
      ? await revisions.findByNumber(file.id, numbered)
      : await revisions.latestApprovedForMode(file.id, mode);

  if (revision === null) return errorResponse('NOT_FOUND');

  return new Response(revision.content, {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `inline; filename="${file.fileName}"`,
      'X-Spec-Export-Mode': mode,
      'X-Spec-Revision-Number': String(revision.revisionNumber),
      'Cache-Control': 'no-store',
    },
  });
}
