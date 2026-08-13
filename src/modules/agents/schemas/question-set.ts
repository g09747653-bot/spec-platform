import { z } from 'zod';

import { ASKING_STAGES } from '@/modules/workflow/model/stages';

/**
 * The question-set contract (task 32; FR-005 AC-2/AC-3; solution.md — Question Set Contract).
 *
 * This schema is the enforcement point for the interview's structural rules: 2–8 predefined
 * options per question, single or multiple select, and the mandatory free-text escape. The
 * `allowOther: true` literal is deliberate — a draft cannot opt out of the escape hatch, and the
 * client renders the free-text entry from this flag, so exactly one such entry exists per
 * question and an agent cannot author a competing option that duplicates it.
 *
 * Everything an agent drafts passes through here **before** persistence or rendering; an invalid
 * set is repaired at most once and then discarded with `DRAFT_INVALID` (never persisted, never
 * shown — NFR-009 AC-2).
 */
export const QuestionOption = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
});

export const Question = z
  .object({
    id: z.string().min(1),
    text: z.string().min(1),
    type: z.enum(['single', 'multiple']),
    options: z.array(QuestionOption).min(2).max(8),
    /** FR-005 AC-3: the free-text escape is mandatory, not a preference. */
    allowOther: z.literal(true),
    /** The named needs this question exists to satisfy (FR-005 AC-7; DR-13). */
    informationNeeds: z.array(z.string().min(1)).min(1),
  })
  .superRefine((question, ctx) => {
    // Duplicate option ids would make an answer ambiguous — the answer rows reference options by
    // id (DR-5), so ambiguity here is a data defect, not a style problem.
    const ids = new Set(question.options.map((option) => option.id));
    if (ids.size !== question.options.length) {
      ctx.addIssue({ code: 'custom', message: `question ${question.id} repeats an option id` });
    }
  });

export const QuestionSetSchema = z
  .object({
    stage: z.enum(ASKING_STAGES),
    questions: z.array(Question).min(1).max(5),
  })
  .superRefine((set, ctx) => {
    const ids = new Set(set.questions.map((question) => question.id));
    if (ids.size !== set.questions.length) {
      ctx.addIssue({ code: 'custom', message: 'question ids must be unique within a set' });
    }
  });

export type QuestionSet = z.infer<typeof QuestionSetSchema>;
export type QuestionSetQuestion = z.infer<typeof Question>;

/** A repair pass: given the rejected draft and its issues, produce one corrected draft. */
export type QuestionSetRepair = (draft: unknown, issues: readonly z.core.$ZodIssue[]) => unknown;

export type QuestionSetValidation =
  | { ok: true; set: QuestionSet; repaired: boolean }
  | { ok: false; code: 'DRAFT_INVALID'; issues: readonly string[] };

const describeIssues = (issues: readonly z.core.$ZodIssue[]): string[] =>
  issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`);

/**
 * Validate-repair-validate, then stop (solution.md: "repaired once and, if it still fails, is
 * discarded"). The repair is injected: the caller decides whether repairing means a deterministic
 * normalisation or, later, a corrective model round-trip. No repair function means no repair
 * attempt — one strike and the draft is out.
 */
export function validateQuestionSetDraft(
  draft: unknown,
  repair?: QuestionSetRepair,
): QuestionSetValidation {
  const first = QuestionSetSchema.safeParse(draft);
  if (first.success) return { ok: true, set: first.data, repaired: false };

  if (repair === undefined) {
    return { ok: false, code: 'DRAFT_INVALID', issues: describeIssues(first.error.issues) };
  }

  const second = QuestionSetSchema.safeParse(repair(draft, first.error.issues));
  if (second.success) return { ok: true, set: second.data, repaired: true };

  return { ok: false, code: 'DRAFT_INVALID', issues: describeIssues(second.error.issues) };
}
