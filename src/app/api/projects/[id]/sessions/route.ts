import { getDatabase } from '@/db/client';
import {
  bundleFileNames,
  configEntryPosition,
  methodologyConfig,
  EDIT_METHODOLOGY_ID,
} from '@/modules/methodologies';
import { currentOwnerScope } from '@/modules/projects/auth/scope';
import {
  CreateChatRequest,
  editChatTitle,
  editPrefill,
  editReferenceSummary,
  referenceOptionId,
  referenceQuestionSet,
  REFERENCE_QUESTION_ID,
} from '@/modules/projects/create-chat';
import { createInterviewRepository } from '@/modules/projects/repositories/interview';
import { createProjectRepository } from '@/modules/projects/repositories/projects';
import { createSessionRepository } from '@/modules/projects/repositories/sessions';
import { createSpecFileRepository } from '@/modules/specs/repositories/spec-files';
import { errorResponse, jsonResponse } from '@/modules/web/api/responses';

/**
 * `POST /api/projects/:id/sessions` — start an Edit chat on this project's bundle (task 118).
 *
 * This is the **Reference** step, and the whole step: it resolves which documents the edit may
 * touch, refuses any that nobody has approved, and creates the chat with that pick already recorded
 * as its first answered round.
 *
 * Recording the pick here rather than after the page loads is what lets the Edit chat leave
 * `interview` through the ordinary gate (constitution A2): grounding input is the prefill sentence,
 * the answered round is the reference pick, and the summary names the files. No gate was widened and
 * no condition was special-cased — the step simply *is* those three facts.
 *
 * A second chat is created rather than a second project, because an edit has to write revisions into
 * the same `spec_files` the bundle already lives in, and only a chat on the same project can (А-6).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const scope = await currentOwnerScope();
  if (scope === null) return errorResponse('UNAUTHENTICATED');

  const { id: projectId } = await params;
  const db = getDatabase();

  // The join in this lookup is the authorisation: another owner's project is not found (AR-2).
  const project = await createProjectRepository(db).findById(scope, projectId);
  if (project === null) return errorResponse('NOT_FOUND');

  const body: unknown = await request.json().catch(() => null);
  const parsed = CreateChatRequest.safeParse(body);

  if (!parsed.success) {
    return errorResponse('VALIDATION_FAILED', {
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    });
  }

  /*
   * Only files with an approved revision may be referenced, and the check is here rather than only
   * in the picker: a request naming an unapproved file is refused whoever sent it. An edit based on
   * a draft nobody accepted would rewrite text that was never agreed to in the first place.
   */
  const approved = await createSpecFileRepository(db).approvedFiles(scope, project.id);
  const approvedById = new Map(approved.map((file) => [file.specFileId, file]));

  const picked = parsed.data.specFileIds.map((id) => approvedById.get(id));
  if (picked.some((file) => file === undefined)) {
    return errorResponse('VALIDATION_FAILED', {
      issues: [
        {
          path: 'specFileIds',
          message: 'an edit can only reference documents that have an approved revision',
        },
      ],
    });
  }

  /*
   * The names the user sees. They come from the bundle plan of the chat that produced the bundle,
   * not from the storage slot: SpecKit's Plan lives in the `solution` row and is `plan.md`
   * everywhere a person can read it (task 117).
   */
  const sourceConfig = methodologyConfig(project.methodologyId);
  const exportedName = (specType: string): string =>
    sourceConfig.stages.find((stage) => stage.document?.specType === specType)?.document
      ?.fileName ?? `${specType}.md`;

  const referenced = approved
    .filter((file) => parsed.data.specFileIds.includes(file.specFileId))
    .map((file) => exportedName(file.specType));

  const editConfig = methodologyConfig(EDIT_METHODOLOGY_ID);
  const entry = configEntryPosition(editConfig);

  const created = await createSessionRepository(db).createChat(scope, {
    projectId: project.id,
    title: editChatTitle(referenced),
    prompt: editPrefill(referenced),
    methodologyId: editConfig.id,
    entryStage: entry.stage,
    entrySubstage: entry.substage,
    /*
     * The chat inherits how the project speaks: audience register (У-5), interview style (task 144)
     * and language (У-1) — all three read from the chat that produced the bundle.
     *
     * The register used to be the literal `'non-technical'` under this same comment, so a project
     * interviewed in engineering terms switched to plain words the moment its owner edited it —
     * two interviewers on one project, which is the defect У-5 was written to remove. The language
     * was inherited correctly all along; the other two now are as well.
     */
    audience: project.audienceProfile,
    style: project.interviewStyle,
    contentLanguage: project.contentLanguage,
  });

  if (created === null) return errorResponse('NOT_FOUND');

  const interview = createInterviewRepository(db);

  const round = await interview.createRound({
    sessionId: created.sessionId,
    stage: 'interview',
    roundNumber: 1,
    questions: referenceQuestionSet(bundleFileNames(sourceConfig), referenced),
    declaredNeeds: ['referenced-documents'],
  });

  await interview.submitCardAnswers(round.id, [
    {
      questionId: REFERENCE_QUESTION_ID,
      selectedOptionIds: referenced.map(referenceOptionId),
    },
  ]);
  await interview.markNeedsSatisfied(
    created.sessionId,
    'interview',
    ['referenced-documents'],
    round.id,
  );
  await createSessionRepository(db).updateSummary(
    scope,
    created.sessionId,
    editReferenceSummary(referenced),
  );
  await createProjectRepository(db).touch(scope, project.id);

  return jsonResponse({ sessionId: created.sessionId, projectId: project.id, referenced }, 201);
}
