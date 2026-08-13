import { z } from 'zod';

import {
  REVIEW_OUTCOMES,
  type FeedbackSeverity,
  type ReviewOutcome,
} from '@/modules/specs/model/review';

/**
 * The review contract (task 54; FR-010 AC-1..AC-3; solution.md — API Contracts).
 *
 * Model output is untrusted input, so nothing reaches `review_feedback` without passing through
 * here first. Three of the task's acceptance criteria are the schema itself:
 *
 * - **Zod-validated before persistence** — `validateReviewDraft` is the only way in;
 * - **every item classifies as blocking or advisory and names a section** — the classification is
 *   which array the item is in, and `section` is a required non-empty string;
 * - **the outcome is exactly `pass` or `needs_revision`** — `z.enum(REVIEW_OUTCOMES)`, which is the
 *   same list the database constraint is built from.
 *
 * The shape follows solution.md exactly. `severity` is deliberately *not* a field of the artifact:
 * the agent classifies by choosing an array, so there is one way to say it and no way for the two to
 * disagree. It becomes an explicit field only on the way to storage (`flattenReviewItems`), where a
 * single flat list is what lets `selected_item_ids` reference one namespace instead of two.
 */
export const FeedbackItem = z.object({
  /** Stable, and referenced by `selectedItemIds` (FR-010 AC-7). */
  id: z.string().min(1),
  /** Which part of the spec the finding is about (FR-010 AC-2). */
  section: z.string().min(1),
  line: z.number().int().positive(),
  confidenceScore: z.number().int().min(5).max(10),
  description: z.string().min(1),
  /** A concrete suggested change, not a restatement of the problem (FR-010 AC-2). */
  suggestion: z.string().min(1),
});

export type ReviewFeedbackItem = z.infer<typeof FeedbackItem>;

export const ReviewArtifact = z
  .object({
    outcome: z.enum(REVIEW_OUTCOMES),
    mustfix: z.array(FeedbackItem),
    recommendations: z.array(FeedbackItem),
  })
  .superRefine((artifact, ctx) => {
    /*
     * Ids are unique across **both** arrays, not within each. `selected_item_ids` is one list, so a
     * blocking item and an advisory item sharing an id would make a selection ambiguous — and the
     * filter of FR-010 AC-7 would then apply the wrong one, silently.
     */
    const ids = [...artifact.mustfix, ...artifact.recommendations].map((item) => item.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: 'custom',
        message: 'feedback item ids must be unique across the review',
      });
    }

    /*
     * A blocking finding and a passing verdict cannot both be true. The outcome drives no transition
     * — the user's decision does (FR-010 AC-5) — so this is not a gate; it is the board refusing to
     * render a contradiction. The repair below fixes it deterministically rather than discarding an
     * otherwise usable review.
     */
    if (artifact.outcome === 'pass' && artifact.mustfix.length > 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'outcome "pass" contradicts the presence of blocking items',
      });
    }
  });

export type ReviewArtifactValue = z.infer<typeof ReviewArtifact>;

/** An item as it is persisted: the artifact's fields plus the classification, made explicit. */
export interface PersistedFeedbackItem extends ReviewFeedbackItem {
  severity: FeedbackSeverity;
}

/**
 * Flattens the artifact into the one list `review_feedback.items` stores.
 *
 * Blocking items first, so the stored order is the order the board renders and a selection read back
 * from storage lines up with what the user saw.
 */
export function flattenReviewItems(artifact: ReviewArtifactValue): PersistedFeedbackItem[] {
  return [
    ...artifact.mustfix.map((item) => ({ ...item, severity: 'blocking' as const })),
    ...artifact.recommendations.map((item) => ({ ...item, severity: 'advisory' as const })),
  ];
}

/** Splits stored items back into the two lists the board renders (FR-010 AC-2). */
export function splitPersistedItems(items: readonly PersistedFeedbackItem[]): {
  mustfix: PersistedFeedbackItem[];
  recommendations: PersistedFeedbackItem[];
} {
  return {
    mustfix: items.filter((item) => item.severity === 'blocking'),
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
  return Math.min(10, Math.max(5, numeric));
};

const positiveLine = (value: unknown): number => {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : 1;
  return numeric >= 1 ? numeric : 1;
};

/**
 * The deterministic repair pass, in the shape task 32 established for question sets.
 *
 * It repairs *handles and bookkeeping*, never content. Concretely: it assigns positional ids where
 * the model left one missing, blank, non-string or duplicated; it clamps a confidence score into the
 * declared band; it floors a line number to 1. It drops an item missing a section, description or
 * suggestion, because those are the finding itself and inventing them would be inventing a review.
 *
 * Assigning an id is not invention — it is naming something the model already said, and the name is
 * positional, so it is stable for the artifact's whole life (which is one insert; the row is never
 * re-ordered). That is what "stable ids from birth" means in practice.
 *
 * The outcome is derived last, from the repaired arrays, so a "pass" carrying blocking items becomes
 * `needs_revision` rather than being thrown away.
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

          return {
            ...item,
            id,
            confidenceScore: clampConfidence(item.confidenceScore),
            line: positiveLine(item.line),
          };
        })
        .filter(
          (item) =>
            typeof item.section === 'string' &&
            item.section.trim() !== '' &&
            typeof item.description === 'string' &&
            item.description.trim() !== '' &&
            typeof item.suggestion === 'string' &&
            item.suggestion.trim() !== '',
        );

    const mustfix = repairArray(draft.mustfix, 'mustfix');
    const recommendations = repairArray(draft.recommendations, 'recommendation');

    return {
      ...draft,
      outcome: mustfix.length > 0 ? 'needs_revision' : normaliseOutcome(draft.outcome),
      mustfix,
      recommendations,
    };
  };
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
