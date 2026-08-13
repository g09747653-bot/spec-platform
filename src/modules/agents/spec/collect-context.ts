import type { SchemaDatabase } from '@/db';
import type { OwnerScope } from '@/db/owner-scope';
import { createInterviewRepository } from '@/modules/projects/repositories/interview';
import { createSpecFileRepository } from '@/modules/specs/repositories/spec-files';

import type { ContextAnswer, ContextSources } from '../context-assembler';

/**
 * Reads the four context sources out of persisted state (task 50; FR-008 AC-6).
 *
 * The assembler is pure and this is the part that is not: it does the loading, so a context can be
 * assembled in a test from literals and in production from the database, and both produce the same
 * string from the same values.
 *
 * **Attachments are empty here, and that is not an oversight.** Uploads arrive in Milestone 5
 * (tasks 63–67); the section exists in the assembled context from today so that when they do, the
 * shape of the prompt does not change — only its contents.
 */
export async function collectContextSources(
  db: SchemaDatabase,
  scope: OwnerScope,
  input: { sessionId: string; projectId: string; initialPrompt: string },
): Promise<ContextSources> {
  const interview = createInterviewRepository(db);

  // Bounded fan-out: at most one round budget per asking stage, so this is a handful of queries on a
  // path that runs once per generation. It is not worth a join that would need its own row schema.
  const rounds = await interview.roundsForSession(input.sessionId);
  const answers: ContextAnswer[] = [];

  for (const round of rounds) {
    for (const answer of await interview.answersForRound(round.id)) {
      answers.push({
        stage: round.stage,
        roundNumber: round.roundNumber,
        questionId: answer.questionId,
        selectedOptions: Array.isArray(answer.selectedOptionIds)
          ? answer.selectedOptionIds.filter(
              (option): option is string => typeof option === 'string',
            )
          : [],
        freeText: answer.freeText,
      });
    }
  }

  const approved = await createSpecFileRepository(db).approvedForExport(scope, input.projectId);

  return {
    initialPrompt: input.initialPrompt,
    answers,
    attachments: [],
    approvedSpecs: approved.map((file) => ({ specType: file.specType, content: file.content })),
  };
}
