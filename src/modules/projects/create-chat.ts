import { z } from 'zod';

import { deriveProjectName } from './create-project';

/**
 * Starting an Edit chat on a finished bundle (task 118; Эталон §1.4 «Edit», §5.1).
 *
 * The request is the **Reference** step: which of the project's documents this edit may touch. It
 * carries no prose, because the describing happens in the next step — a chat that had to be
 * described before it existed could not show the user which files they were describing changes to.
 */
export const CreateChatRequest = z.object({
  specFileIds: z.array(z.uuid()).min(1, 'Pick at least one document to edit.').max(5),
});

export type CreateChatInput = z.infer<typeof CreateChatRequest>;

/**
 * The sentence the composer opens with (Эталон §5.1, verbatim shape).
 *
 * It is also the session's `initial_prompt`, which is not a convenience: `initial_prompt` is the
 * grounding input the interview exit gate checks for (constitution A2), and for an Edit chat the
 * grounding input *is* "these documents, and an intention to change them". Stored once, shown once,
 * and the same string in both places — a prefill that differed from the stored prompt would be a
 * second version of what the session is about.
 */
export function editPrefill(fileNames: readonly string[]): string {
  return `I want to update spec ${formatBundleNames(fileNames)} to `;
}

/** The chat's name in the project's list: what it edits, not what it will say. */
export function editChatTitle(fileNames: readonly string[]): string {
  return deriveProjectName(`Edit ${formatBundleNames(fileNames)}`);
}

/** The reference summary, which is the third condition of the interview gate, stated as fact. */
export function editReferenceSummary(fileNames: readonly string[]): string {
  return `This edit session references ${formatBundleNames(fileNames)}. Nothing else in the bundle is in scope until the reference is changed.`;
}

/**
 * The Reference step, recorded as the interview round it is (task 118).
 *
 * The Edit chat leaves `interview` through the same gate as every other session — grounding input,
 * one answered round, a persisted summary (constitution A2) — and this is what makes the second
 * condition true **honestly** rather than by a special case in the gate. Picking the documents an
 * edit may touch *is* the round: it is a question, the user answered it, and the answer is the
 * grounding the next step works from.
 *
 * The options are the whole promised bundle, not only the approved part of it, and the two halves of
 * that decision are deliberate. What is **offered** is filtered by the caller to files with an
 * approved revision, and what is **accepted** is checked again on the server — that is the
 * acceptance criterion. What is **stored** is the full bundle with the picked subset selected,
 * because a round is a record of a question, and a record that listed only the answerable options
 * would not show that anything was unavailable.
 */
export function referenceQuestionSet(
  bundleFileNames: readonly string[],
  selected: readonly string[],
): {
  stage: 'interview';
  questions: [
    {
      id: string;
      text: string;
      type: 'multiple';
      options: { id: string; label: string }[];
      allowOther: true;
      informationNeeds: string[];
    },
  ];
} {
  return {
    stage: 'interview',
    questions: [
      {
        id: REFERENCE_QUESTION_ID,
        text: 'Which documents should this edit cover?',
        type: 'multiple',
        options: bundleFileNames.map((fileName) => ({
          id: referenceOptionId(fileName),
          label: selected.includes(fileName) ? fileName : `${fileName} (not referenced)`,
        })),
        allowOther: true,
        informationNeeds: ['referenced-documents'],
      },
    ],
  };
}

export const REFERENCE_QUESTION_ID = 'q-edit-reference';

export const DESCRIBE_QUESTION_ID = 'q-edit-describe';

/**
 * The Describe step's card (task 118).
 *
 * The answer that matters is written in the user's own words, so `allowOther` is not an escape hatch
 * here but the whole mechanism, and the two options name the two shapes an edit takes rather than
 * standing in for the description. The prefill is **not** part of the stored payload: it is the
 * session's own `initial_prompt`, put into the free-text box by the surface that renders the card,
 * so there is one stored sentence rather than one stored twice.
 */
export function describeQuestionSet(
  stage: 'interview' | 'constitution' | 'requirements' | 'solution' | 'tasks' | 'quality',
): {
  stage: typeof stage;
  questions: [
    {
      id: string;
      text: string;
      type: 'single';
      options: { id: string; label: string; description: string }[];
      allowOther: true;
      informationNeeds: string[];
    },
  ];
} {
  return {
    stage,
    questions: [
      {
        id: DESCRIBE_QUESTION_ID,
        text: 'What should change in the referenced documents?',
        type: 'single',
        options: [
          {
            id: 'describe-add',
            label: 'Add something that is missing',
            description: 'New requirements, a new section, an option nobody wrote down.',
          },
          {
            id: 'describe-change',
            label: 'Change something that is already there',
            description: 'A decision that moved, a constraint that turned out to be wrong.',
          },
        ],
        allowOther: true,
        informationNeeds: ['requested-change'],
      },
    ],
  };
}

/** Option ids are derived from the file name, so the answer rows name the files they selected. */
export function referenceOptionId(fileName: string): string {
  return `ref-${fileName.replace(/[^a-zA-Z0-9]+/g, '-')}`;
}

/** `a.md`, `a.md and b.md`, `a.md, b.md and c.md` — an English list, not a joined array. */
export function formatBundleNames(fileNames: readonly string[]): string {
  if (fileNames.length === 0) return 'the bundle';
  if (fileNames.length === 1) return fileNames[0] ?? 'the bundle';

  const head = fileNames.slice(0, -1).join(', ');

  return `${head} and ${fileNames[fileNames.length - 1] ?? ''}`;
}
