import type { SchemaDatabase } from '@/db';
import type { OwnerScope } from '@/db/owner-scope';
import { createGenerationStore } from '@/modules/adapters/llm/generation-store';
import { QuestionSetSchema } from '@/modules/agents/schemas/question-set';
import {
  createInterviewRepository,
  FALLBACK_QUESTION_ID_PREFIX,
  type AnsweredRound,
} from '@/modules/projects/repositories/interview';
import type { ProjectDetail } from '@/modules/projects/repositories/projects';
import { createProposedChangeService } from '@/modules/specs/proposed-changes/proposed-change-service';
import { createReviewRepository } from '@/modules/specs/repositories/reviews';
import { createRevisionRepository } from '@/modules/specs/repositories/revisions';
import type { FeedQuestion } from '@/modules/web/feed/model';
import type { FeedSource, FeedSourceAnswer, FeedSourceRound } from '@/modules/web/feed/source';
import { isStage, isSubstage, type StagePosition } from '@/modules/workflow/model/stages';

/**
 * The composition root of the conversation feed (task 104).
 *
 * `web` may import neither repositories nor `agents` (constitution A1), and that is precisely the
 * boundary this file exists to stand on: the projection in `web/feed` is pure and knows nothing
 * about persistence, and everything that *is* about persistence — which tables, how a stored
 * `questions` payload is validated, how an option id becomes a label — lives here, in the one place
 * allowed to know all of it.
 *
 * Six reads, all of them owner-scoped by the same rule as the rest of the page: the project is
 * resolved through the scoped repository first, and every later query is keyed by the ids that
 * lookup yielded (AR-2).
 */

/** ISO-8601, always. The feed crosses to the client as props, where a `Date` would not survive. */
const iso = (value: Date): string => value.toISOString();

/**
 * The stored question payload, projected into the shape the feed renders.
 *
 * An unparsable payload yields no questions rather than throwing: it cannot be persisted through
 * the write path (`validateQuestionSetDraft` gates that), so reaching this branch would mean the row
 * predates the schema — and a conversation that refuses to render because one old round is
 * unreadable is a worse answer than one round rendering empty.
 */
function toQuestions(payload: unknown): FeedQuestion[] {
  const parsed = QuestionSetSchema.safeParse(payload);
  if (!parsed.success) return [];

  return parsed.data.questions.map((question) => ({
    id: question.id,
    text: question.text,
    type: question.type,
    options: question.options.map((option) => ({
      id: option.id,
      label: option.label,
      ...(option.description === undefined ? {} : { description: option.description }),
    })),
    allowOther: question.allowOther,
    /*
     * Every question in a validated set is required: the set carries no optionality, and the
     * mandatory free-text escape (FR-005 AC-3) means there is always an answer a user can give.
     * The marker is therefore honest rather than decorative.
     */
    required: true,
  }));
}

/**
 * Names what each recorded answer answered.
 *
 * Option **ids** are what the answer rows hold, so the question set is re-parsed to name them: a
 * history that showed `q-audience-solo-devs` would restore the answer without restoring the answer.
 * A direct fallback answer (FR-005 AC-10) carries no question id at all — its `need:<name>` key is
 * the question — so it is labelled from the need rather than dropped.
 */
function toAnswers(round: AnsweredRound, questions: readonly FeedQuestion[]): FeedSourceAnswer[] {
  return round.answers.map((answer): FeedSourceAnswer => {
    const asked = questions.find((question) => question.id === answer.questionId);

    const label =
      asked?.text ??
      (answer.questionId?.startsWith(FALLBACK_QUESTION_ID_PREFIX) === true
        ? answer.questionId.slice(FALLBACK_QUESTION_ID_PREFIX.length)
        : 'Your reply');

    return {
      questionId: answer.questionId,
      label,
      selectedOptionIds: answer.selectedOptionIds,
      freeText: answer.freeText,
    };
  });
}

function toRound(round: AnsweredRound): FeedSourceRound {
  const questions = toQuestions(round.questions);

  return {
    roundId: round.id,
    stage: round.stage,
    roundNumber: round.roundNumber,
    presentedAt: iso(round.presentedAt),
    questions,
    answers: toAnswers(round, questions),
    answeredAt: round.answeredAt === null ? null : iso(round.answeredAt),
  };
}

/**
 * The stored position, narrowed.
 *
 * `projects` may not import `workflow`, so the repository hands the stage back as a string (see the
 * note on `ProjectSummary`). The CHECK constraints keep the column inside the vocabulary; narrowing
 * is done here, at the boundary where it is rendered, exactly as `stageLabel` does for the rail.
 */
export function toPosition(stage: string, substage: string | null): StagePosition {
  if (!isStage(stage)) return { stage: 'interview', substage: null };

  if (substage === null || !isSubstage(substage)) {
    return stage === 'interview' || stage === 'complete'
      ? { stage, substage: null }
      : { stage, substage: 'collect' };
  }

  return stage === 'interview' || stage === 'complete'
    ? { stage, substage: null }
    : { stage, substage };
}

export async function assembleFeedSource(
  db: SchemaDatabase,
  scope: OwnerScope,
  project: ProjectDetail,
): Promise<FeedSource> {
  const [rounds, runs, revisions, reviews, proposals] = await Promise.all([
    createInterviewRepository(db).roundHistory(project.sessionId),
    createGenerationStore(db).runsForSession(project.sessionId),
    createRevisionRepository(db).projectHistory(scope, project.id),
    createReviewRepository(db).projectHistory(scope, project.id),
    createProposedChangeService(db).historyForProject(scope, project.id),
  ]);

  return {
    session: {
      sessionId: project.sessionId,
      projectId: project.id,
      projectName: project.name,
      initialPrompt: project.initialPrompt,
      summary: project.summary,
      createdAt: iso(project.createdAt),
      position: toPosition(project.stage, project.substage),
      completionCount: project.completionCount,
    },
    rounds: rounds.map(toRound),
    runs: runs.map((run) => ({
      runId: run.runId,
      stage: run.stage,
      status: run.status,
      attempt: run.attempt,
      createdAt: iso(run.createdAt),
    })),
    revisions: revisions.map((revision) => ({
      revisionId: revision.id,
      specFileId: revision.specFileId,
      specType: revision.specType,
      fileName: revision.fileName,
      revisionNumber: revision.revisionNumber,
      approved: revision.approved,
      createdAt: iso(revision.createdAt),
    })),
    reviews: reviews.map((review) => ({
      reviewId: review.id,
      specFileId: review.specFileId,
      specType: review.specType,
      revisionNumber: review.revisionNumber,
      outcome: review.outcome,
      items: review.items,
      decision: review.decision,
      selectedItemIds: review.selectedItemIds,
      createdAt: iso(review.createdAt),
      decidedAt: review.decidedAt === null ? null : iso(review.decidedAt),
    })),
    proposals: proposals.map((proposal) => ({
      proposedChangeId: proposal.id,
      specFileId: proposal.specFileId,
      fileName: proposal.fileName,
      instruction: proposal.instruction,
      status: proposal.status,
      createdAt: iso(proposal.createdAt),
    })),
  };
}
