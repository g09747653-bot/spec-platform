import { notFound } from 'next/navigation';

import { getDatabase } from '@/db/client';
import { requireOwnerScope } from '@/modules/projects/auth/scope';
import { createProjectRepository } from '@/modules/projects/repositories/projects';
import { CORE_SPEC_FILE_NAMES } from '@/modules/specs/model/spec-files';
import { createRevisionRepository } from '@/modules/specs/repositories/revisions';
import { createSpecFileRepository } from '@/modules/specs/repositories/spec-files';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/modules/web';
import { ExportPanel } from '@/modules/web/session/export-panel';
import { SpecCard } from '@/modules/web/session/spec-card';
import { StageRail } from '@/modules/web/session/stage-rail';

/**
 * The session surface for one project.
 *
 * **Not found and not owned are the same answer** (AR-2; NFR-005 AC-2): the repository query carries the
 * owner predicate, so a project belonging to someone else returns `null` exactly as a project that never
 * existed, and both render `notFound()`. There is no branch here that could distinguish them, which is
 * what makes 404-not-403 a property of the code rather than a promise.
 *
 * Everything on the page is rendered from persisted state, so a reload restores the same position and the
 * same pending decision (FR-017 AC-1/AC-4). The interview, the review board and the remaining stages fill
 * this frame in later milestones.
 */
export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scope = await requireOwnerScope();
  const db = getDatabase();

  const project = await createProjectRepository(db).findById(scope, id);
  if (project === null) notFound();

  const specFileRepository = createSpecFileRepository(db);
  const exportable = await specFileRepository.approvedForExport(scope, project.id);
  const includedFiles = exportable.map((file) => file.fileName);
  const omittedFiles = CORE_SPEC_FILE_NAMES.filter((name) => !includedFiles.includes(name));

  // The card shows the newest revision of the file this session has generated, if any.
  const revisions = createRevisionRepository(db);
  const currentFile = await specFileRepository.currentFile(scope, project.id);
  const latest = currentFile === null ? null : await revisions.latest(currentFile.id);

  return (
    <section className="flex flex-col gap-6" data-testid="session">
      <div className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold tracking-tight" data-testid="session-project-name">
          {project.name}
        </h1>
        <StageRail
          currentStage={project.stage}
          currentSubstage={project.substage}
          qualityEnabled={project.qualityEnabled}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your prompt</CardTitle>
          <CardDescription>
            The grounding input for every stage of this session (FR-003 AC-3).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm whitespace-pre-wrap" data-testid="session-prompt">
            {project.initialPrompt}
          </p>
        </CardContent>
      </Card>

      <SpecCard
        sessionId={project.sessionId}
        revision={
          latest === null || currentFile === null
            ? null
            : {
                specFileId: currentFile.id,
                fileName: currentFile.fileName,
                revisionNumber: latest.revisionNumber,
                approved: latest.approved,
                content: latest.content,
              }
        }
      />

      <ExportPanel
        projectId={project.id}
        includedFiles={includedFiles}
        omittedFiles={omittedFiles}
      />
    </section>
  );
}
