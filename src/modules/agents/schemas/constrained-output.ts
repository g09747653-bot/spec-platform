import { z } from 'zod';

import type { StructuredOutput } from '@/modules/adapters/llm';

/**
 * The JSON Schema a constrained call is decoded against, derived from the schema that validates it
 * (амендмент А-10; task 131).
 *
 * **Derived, never written twice.** The contract of a question round, a review board or an edit
 * proposal already exists as a Zod object, and that object is what accepts or rejects the answer. A
 * hand-written JSON Schema beside it would be a second statement of the same structure — the kind of
 * duplication the constitution names as a violation for spec headings, for exactly the reason it
 * would be one here: the copy drifts, and the drift is invisible until a grammar starts forbidding
 * what the validator requires.
 *
 * **`io: 'input'` is the load-bearing option.** A schema with a default (`rationale` on an edit
 * proposal) makes the field optional on the way *in* and guaranteed on the way *out*; the model is
 * writing the input, so requiring a field that Zod would have filled in itself would be a grammar
 * stricter than the contract.
 *
 * `$schema` is dropped: it is a metadata key that constrains nothing, and a runtime compiling a
 * grammar has no use for a dialect URL.
 *
 * What this does *not* do is replace validation. A grammar guarantees a **parseable** answer of the
 * right shape; it cannot guarantee a **usable** one — ids can still repeat, a verdict can still
 * contradict its own findings, a recommendation can still be the fourth of four. Those are refinements
 * the schema layer checks and the repair pass fixes, and they stay exactly where they are (Р-1).
 */
export function constrainedOutput(name: string, schema: z.ZodType): StructuredOutput {
  const { $schema: _dialect, ...rest } = z.toJSONSchema(schema, { io: 'input' }) as Record<
    string,
    unknown
  >;

  return { name, schema: rest };
}
