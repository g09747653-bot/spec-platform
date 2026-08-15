import { z } from 'zod';

import {
  REVIEW_OUTCOMES,
  type FeedbackSeverity,
  type FeedbackSource,
  type ReviewOutcome,
} from '@/modules/specs/model/review';

/**
 * The review contract (task 54, rewritten to **review.v2** by task 111; FR-010 AC-1..AC-3;
 * Эталон §1.3).
 *
 * Model output is untrusted input, so nothing reaches `review_feedback` without passing through
 * here first. Three of the original task's acceptance criteria are the schema itself:
 *
 * - **Zod-validated before persistence** — `validateReviewDraft` is the only way in;
 * - **every item classifies as blocking or advisory and names a section** — the classification is
 *   which array the item is in, and `sectionPath` is a required non-empty string;
 * - **the verdict is exactly `pass` or `needs_revision`** — `z.enum(REVIEW_OUTCOMES)`, which is the
 *   same list the database constraint is built from.
 *
 * **What v2 changed, and why.** The reference product's card (Эталон §1.3) is a verdict badge, a
 * summary paragraph, and items that read «Section — subsection» in bold with the problem beneath
 * and an italic *Suggestion:* under that. v1 had no summary at all and folded the heading and the
 * problem into one `description`, so the card had nothing to put in bold and nothing to open with.
 * Hence `summary`, and hence `sectionPath` / `title` / `body` as three fields rather than two: the
 * split is what the card renders, so it belongs in the artifact rather than in a component guessing
 * where a heading ends. `line` is gone — the reference names a section, not a line, and a line
 * number produced by a model that cannot count lines was decoration with a plausible shape.
 * `confidence` widened from 5..10 to **1..10** (Эталон's «Confidence score X/10»): a reviewer that
 * cannot say "I am not sure" about a finding it still thinks worth raising has no way to be honest.
 *
 * `severity` is deliberately *not* a field of the artifact: the agent classifies by choosing an
 * array, so there is one way to say it and no way for the two to disagree. `source` is not a field
 * either, and for a stronger reason — a model that could write `"source": "linter"` could dress a
 * guess up as a measurement. Both become explicit only on the way to storage
 * (`flattenReviewItems`), where a single flat list is what lets `selected_item_ids` reference one
 * namespace instead of two.
 */
export const FeedbackItem = z.object({
  /** Stable, and referenced by `selectedItemIds` (FR-010 AC-7). */
  id: z.string().min(1),
  /** Where the finding is: «Section — subsection», the item's heading in Эталон §1.3. */
  sectionPath: z.string().min(1),
  /** What is wrong, in a few words — the bold line of the card. */
  title: z.string().min(1),
  /** The problem stated in full (FR-010 AC-2). */
  body: z.string().min(1),
  /** A concrete suggested change, not a restatement of the problem (FR-010 AC-2). */
  suggestion: z.string().min(1),
  /** How sure the reviewer is, 1..10 — rendered as «Confidence score X/10» with its tooltip. */
  confidence: z.number().int().min(1).max(10),
});

export type ReviewFeedbackItem = z.infer<typeof FeedbackItem>;

export const ReviewArtifact = z
  .object({
    verdict: z.enum(REVIEW_OUTCOMES),
    /** The paragraph that opens the card: what the reviewer made of the document as a whole. */
    summary: z.string().min(1),
    mustFix: z.array(FeedbackItem),
    recommendations: z.array(FeedbackItem),
  })
  .superRefine((artifact, ctx) => {
    /*
     * Ids are unique across **both** arrays, not within each. `selected_item_ids` is one list, so a
     * blocking item and an advisory item sharing an id would make a selection ambiguous — and the
     * filter of FR-010 AC-7 would then apply the wrong one, silently.
     */
    const ids = [...artifact.mustFix, ...artifact.recommendations].map((item) => item.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'feedback item ids must be unique across the review',
      });
    }

    /*
     * A blocking finding and a passing verdict cannot both be true. The verdict drives no transition
     * — the user's decision does (FR-010 AC-5) — so this is not a gate; it is the board refusing to
     * render a contradiction. The repair below fixes it deterministically rather than discarding an
     * otherwise usable review.
     */
    if (artifact.verdict === 'pass' && artifact.mustFix.length > 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'verdict "pass" contradicts the presence of blocking items',
      });
    }
  });

export type ReviewArtifactValue = z.infer<typeof ReviewArtifact>;

/** An item as it is persisted: the artifact's fields plus the two facts the model may not state. */
export interface PersistedFeedbackItem extends ReviewFeedbackItem {
  severity: FeedbackSeverity;
  source: FeedbackSource;
}

/**
 * Flattens the artifact into the one list `review_feedback.items` stores.
 *
 * Blocking items first, so the stored order is the order the board renders and a selection read back
 * from storage lines up with what the user saw. Everything that comes through here is `model` by
 * construction — this function's argument is a model artifact, and a linter finding never is one.
 */
export function flattenReviewItems(artifact: ReviewArtifactValue): PersistedFeedbackItem[] {
  return [
    ...artifact.mustFix.map((item) => ({
      ...item,
      severity: 'blocking' as const,
      source: 'model' as const,
    })),
    ...artifact.recommendations.map((item) => ({
      ...item,
      severity: 'advisory' as const,
      source: 'model' as const,
    })),
  ];
}

/** Splits stored items back into the two lists the board renders (FR-010 AC-2). */
export function splitPersistedItems(items: readonly PersistedFeedbackItem[]): {
  mustFix: PersistedFeedbackItem[];
  recommendations: PersistedFeedbackItem[];
} {
  return {
    mustFix: items.filter((item) => item.severity === 'blocking'),
    recommendations: items.filter((item) => item.severity === 'advisory'),
  };
}

export type ReviewDraftRepair = (draft: unknown, issues: readonly z.core.$ZodIssue[]) => unknown;

export type ReviewValidation =
  | { ok: true; artifact: ReviewArtifactValue; repaired: boolean }
  | { ok: false; code: 'DRAFT_INVALID'; issues: readonly string[] };

const describeIssues = (issues: readonly z.core.$ZodIssue[]): string[] =>
  issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const clampConfidence = (value: unknown): number => {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : 5;
  return Math.min(10, Math.max(1, numeric));
};

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/**
 * The deterministic repair pass, in the shape task 32 established for question sets.
 *
 * It repairs *handles and bookkeeping*, never content. Concretely: it assigns positional ids where
 * the model left one missing, blank, non-string or duplicated; it clamps a confidence score into the
 * declared band; it accepts the v1 field names (`section`, `description`) as aliases, because a
 * model that has seen a thousand review schemas will sometimes write the obvious one. It drops an
 * item missing a section path, a body or a suggestion, because those are the finding itself and
 * inventing them would be inventing a review. A missing `title` is taken from the section path — a
 * heading is a handle, not a claim.
 *
 * Assigning an id is not invention — it is naming something the model already said, and the name is
 * positional, so it is stable for the artifact's whole life (which is one insert; the row is never
 * re-ordered). That is what "stable ids from birth" means in practice.
 *
 * The verdict and the summary are derived last, from the repaired arrays, so a "pass" carrying
 * blocking items becomes `needs_revision` rather than being thrown away, and a review whose findings
 * are all present but whose summary line is missing still reaches the user. The derived summary
 * states a **count and nothing else**: it adds no claim the model did not make, which is the line
 * between repairing bookkeeping and writing the review ourselves.
 */
export function repairReviewDraft(): ReviewDraftRepair {
  return (draft) => {
    if (!isRecord(draft)) return draft;

    const seen = new Set<string>();

    const repairArray = (value: unknown, prefix: string): Record<string, unknown>[] =>
      (Array.isArray(value) ? value : [])
        .filter(isRecord)
        .map((item, index): Record<string, unknown> => {
          const proposed = typeof item.id === 'string' ? item.id.trim() : '';
          const id =
            proposed !== '' && !seen.has(proposed) ? proposed : `${prefix}-${String(index + 1)}`;
          seen.add(id);

          const sectionPath = text(item.sectionPath) || text(item.section);
          const body = text(item.body) || text(item.description);

          return {
            ...item,
            id,
            sectionPath,
            title: text(item.title) || sectionPath,
            body,
            confidence: clampConfidence(item.confidence ?? item.confidenceScore),
          };
        })
        .filter(
          (item) =>
            text(item.sectionPath) !== '' && text(item.body) !== '' && text(item.suggestion) !== '',
        );

    const mustFix = repairArray(draft.mustFix ?? draft.mustfix, 'mustfix');
    const recommendations = repairArray(draft.recommendations, 'recommendation');

    return {
      ...draft,
      verdict:
        mustFix.length > 0 ? 'needs_revision' : normaliseOutcome(draft.verdict ?? draft.outcome),
      summary: text(draft.summary) || derivedSummary(mustFix.length, recommendations.length),
      mustFix,
      recommendations,
    };
  };
}

/** A count of what the model found, in words. Deliberately says nothing the model did not. */
function derivedSummary(mustFix: number, recommendations: number): string {
  const parts = [
    `${String(mustFix)} blocking ${mustFix === 1 ? 'point' : 'points'}`,
    `${String(recommendations)} ${recommendations === 1 ? 'recommendation' : 'recommendations'}`,
  ];

  return `The reviewer raised ${parts.join(' and ')} and left no summary of its own.`;
}

/** Maps a near-miss verdict onto the two the contract allows; anything unrecognised needs revision. */
function normaliseOutcome(value: unknown): ReviewOutcome {
  if (typeof value !== 'string') return 'needs_revision';

  const normalised = value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

  return normalised === 'pass' ? 'pass' : 'needs_revision';
}

/** Validate → repair once → validate, then stop. An invalid review is never persisted, never shown. */
export function validateReviewDraft(draft: unknown, repair?: ReviewDraftRepair): ReviewValidation {
  const first = ReviewArtifact.safeParse(draft);
  if (first.success) return { ok: true, artifact: first.data, repaired: false };

  if (repair === undefined) {
    return { ok: false, code: 'DRAFT_INVALID', issues: describeIssues(first.error.issues) };
  }

  const second = ReviewArtifact.safeParse(repair(draft, first.error.issues));
  if (second.success) return { ok: true, artifact: second.data, repaired: true };

  return { ok: false, code: 'DRAFT_INVALID', issues: describeIssues(second.error.issues) };
}
