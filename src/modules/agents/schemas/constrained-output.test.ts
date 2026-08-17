import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { constrainedOutput } from './constrained-output';
import { QuestionSetSchema } from './question-set';
import { ReviewArtifact } from './review-artifact';

/**
 * The schema a grammar is compiled from is the schema that validates (task 131; амендмент А-10).
 *
 * The tests below are drift guards, not restatements. A JSON Schema written by hand beside a Zod
 * object would pass a "does it look right" review on the day it is written and be wrong the first
 * time a field is added — and wrong in the worst direction, because a grammar that forbids a field
 * the validator requires produces a draft that cannot be repaired and cannot be explained. So the
 * required-key sets are compared **against Zod's own answer** rather than against a literal.
 */

/**
 * The keys Zod itself insists on: what an empty object is told it is missing.
 *
 * Every top-level issue is counted, whatever its code. Filtering to `invalid_type` looks tidier and
 * is wrong: a missing enum is reported as `invalid_value`, so `stage` and `verdict` — the two fields
 * that name what the artifact *is* — would have been silently absent from the comparison, and the
 * guard would have passed while guarding nothing.
 */
function requiredByZod(schema: z.ZodType): string[] {
  const result = schema.safeParse({});
  if (result.success) return [];

  const keys = result.error.issues
    .filter((issue) => issue.path.length === 1)
    .map((issue) => String(issue.path[0]));

  return [...new Set(keys)].sort();
}

const requiredByJsonSchema = (schema: Record<string, unknown>): string[] =>
  [...((schema.required as string[] | undefined) ?? [])].sort();

describe('constrainedOutput (task 131)', () => {
  it('names the artifact and drops the dialect key', () => {
    const output = constrainedOutput('review_board', ReviewArtifact);

    expect(output.name).toBe('review_board');
    expect(output.schema).not.toHaveProperty('$schema');
    expect(output.schema.type).toBe('object');
  });

  it.each([
    ['review_board', ReviewArtifact],
    ['question_set', QuestionSetSchema],
  ])('requires exactly what %s requires', (name, schema) => {
    const output = constrainedOutput(name, schema);

    expect(requiredByJsonSchema(output.schema)).toEqual(requiredByZod(schema));
    expect(requiredByZod(schema).length).toBeGreaterThan(0);
  });

  it('carries the nested shape a round is made of, not just its outline', () => {
    const { schema } = constrainedOutput('question_set', QuestionSetSchema);
    const at = (node: unknown, ...path: string[]): Record<string, unknown> => {
      let current: unknown = node;

      for (const key of path) {
        const record = current as Record<string, unknown> | undefined;
        current = record?.[key];
      }

      if (typeof current !== 'object' || current === null) {
        throw new Error(`the derived schema has no ${path.join('.')}`);
      }

      return current as Record<string, unknown>;
    };

    const questions = at(schema, 'properties', 'questions');
    const question = at(questions, 'items');

    // The free-text escape is a literal in the contract (FR-005 AC-3), so the grammar states it too.
    expect(at(question, 'properties', 'allowOther').const).toBe(true);
    expect(question.required).toContain('informationNeeds');
    expect(questions.minItems).toBe(1);
  });

  /**
   * `io: 'input'` is what makes this true, and it is the one option with teeth: a defaulted field is
   * optional on the way in and guaranteed on the way out. Requiring `rationale` of the model would be
   * a grammar stricter than the contract Zod enforces — and the model would be held to a field the
   * validator was prepared to fill in itself.
   */
  it('does not require what the validator fills in itself', () => {
    const Defaulted = z.object({
      content: z.string().min(1),
      rationale: z.string().default(''),
    });

    const { schema } = constrainedOutput('edit_proposal', Defaulted);

    expect(schema.required).toEqual(['content']);
  });
});
