import { notFound } from 'next/navigation';

import { getDatabase } from '@/db/client';
import { methodologyConfig } from '@/modules/methodologies';
import { requireOwnerScope } from '@/modules/projects/auth/scope';
import { createProjectRepository } from '@/modules/projects/repositories/projects';
import { diffLines, formatUnifiedDiff } from '@/modules/specs/diff';
import { createReviewRepository } from '@/modules/specs/repositories/reviews';
import { createRevisionRepository } from '@/modules/specs/repositories/revisions';
import { createSpecFileRepository } from '@/modules/specs/repositories/spec-files';
import {
  DocumentViewer,
  isViewerView,
  type ViewerRevision,
} from '@/modules/web/viewer/document-viewer';

/**
 * `/specs/:specFileId` — the document viewer (task 122).
 *
 * Addressed by **file**, not by revision, with the revision in a query parameter — because the thing
 * a person opens is a document, and which version of it they are reading is a choice they make once
 * they are there. A reload restores both (AC-4).
 *
 * Ownership resolves in SQL, as everywhere: another owner's file is `notFound()`, indistinguishable
 * from one that never existed (AR-2).
 */
export default async function SpecViewerPage({
  params,
  searchParams,
}: {
  params: Promise<{ specFileId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { specFileId } = await params;
  const query = await searchParams;
  const scope = await requireOwnerScope();
  const db = getDatabase();

  const file = await createSpecFileRepository(db).findById(scope, specFileId);
  if (file === null) notFound();

  const revisions = await createRevisionRepository(db).history(file.id);
  if (revisions.length === 0) notFound();

  const first = (value: string | string[] | undefined): string | undefined =>
    Array.isArray(value) ? value[0] : value;

  const view = isViewerView(first(query.view)) ? (first(query.view) as 'outline') : 'preview';

  /*
   * The requested revision, or the newest. An out-of-range `?rev=` falls back rather than erroring:
   * a link to a revision that a project duplication or a stale tab no longer has should still open
   * the document, at the version that does exist.
   */
  const requested = Number(first(query.rev) ?? '');
  const current =
    revisions.find((revision) => revision.revisionNumber === requested) ??
    revisions[revisions.length - 1];

  if (current === undefined) notFound();

  const previousIndex = revisions.findIndex(
    (revision) => revision.revisionNumber === current.revisionNumber,
  );
  const previous = previousIndex > 0 ? (revisions[previousIndex - 1] ?? null) : null;

  const project = await createProjectRepository(db).findById(scope, file.projectId);
  const boards = await createReviewRepository(db).projectHistory(scope, file.projectId);

  /*
   * The exported name, not the storage slot (task 117): SpecKit's Plan lives in the `solution` row
   * and is `plan.md` everywhere a person can read it — the card, the sidebar, the archive, and here.
   */
  const config = methodologyConfig(project?.methodologyId);
  const fileName =
    config.stages.find((stage) => stage.document?.specType === file.specType)?.document?.fileName ??
    file.fileName;

  const verdicts = new Map(
    boards
      .filter((board) => board.specFileId === file.id)
      .map((board) => [board.revisionNumber, board.decision]),
  );

  const rows: ViewerRevision[] = revisions.map((revision) => ({
    revisionNumber: revision.revisionNumber,
    approved: revision.approved,
    verdict: verdicts.get(revision.revisionNumber) ?? null,
    createdAt: revision.createdAt,
  }));

  const diff = previous === null ? null : diffLines(previous.content, current.content);

  return (
    <DocumentViewer
      specFileId={file.id}
      fileName={fileName}
      sessionHref={`/sessions/${project?.sessionId ?? ''}`}
      view={view}
      revisions={rows}
      current={{ revisionNumber: current.revisionNumber, content: current.content }}
      previous={
        previous === null
          ? null
          : { revisionNumber: previous.revisionNumber, content: previous.content }
      }
      unifiedDiff={diff === null ? null : formatUnifiedDiff(diff, fileName)}
    />
  );
}
