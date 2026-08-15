import { isCoreSpecType } from '@/modules/specs/model/spec-files';
import { requiredSections } from '@/modules/specs/section-schema';

import { contentLanguageInstruction } from './content-language';
import {
  promptRegistry,
  type AssembledPrompt,
  type PromptId,
  type PromptVariables,
} from './registry';

/**
 * `assemblePrompt` — typed interpolation, and one of the section schema's two sanctioned consumers
 * (task 41; constitution P3; D-16).
 *
 * The required section list is not written in any prompt file. It is derived here, from the schema,
 * and injected as `{{requiredSections}}`. That is what makes P3's promise mechanical: rename a
 * section in `section-schema.ts` and both halves of the contract — what the model is asked to write
 * and what its output is checked against — move together, with nothing to keep in sync by hand.
 */

/** Thrown when interpolation cannot produce a complete prompt. Unreachable from a typed call path. */
export class PromptAssemblyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PromptAssemblyError';
  }
}

/**
 * Fills the placeholders the registry marks as derived.
 *
 * The `specType` is re-checked at runtime rather than asserted: an unchecked cast is what the
 * constitution's coding standards forbid, and the check costs one comparison on a path that runs once
 * per generation.
 */
function derivedValues(id: PromptId, variables: PromptVariables[PromptId]): Record<string, string> {
  const derived = promptRegistry[id].derived ?? [];
  if (!derived.includes('requiredSections')) return {};

  const specType = 'specType' in variables ? variables.specType : undefined;

  if (typeof specType !== 'string' || !isCoreSpecType(specType)) {
    throw new PromptAssemblyError(
      `${id}: deriving the required section list needs a core spec type, received "${String(specType)}"`,
    );
  }

  return {
    requiredSections: requiredSections(specType)
      .map(
        (section, index) => `${String(index + 1)}. ${'#'.repeat(section.level)} ${section.heading}`,
      )
      .join('\n'),
  };
}

/**
 * Substitutes `{{name}}` placeholders, or throws.
 *
 * **One pass, deliberately.** Substituted values are never re-scanned: a session prompt or an
 * attachment quoting `{{something}}` is user data, and interpolating it a second time would let
 * untrusted text reach for a variable it was never given. Every placeholder in the *template* is
 * either supplied or an exception, so a request carrying a literal `{{name}}` to a provider is not a
 * state this function can produce.
 *
 * Exported for its own test: the typed call path makes an unfilled variable impossible to express,
 * so this is the only way to show the runtime half of "fails at build **or** boot" actually fires.
 */
export function interpolateTemplate(
  template: string,
  values: Record<string, string>,
  id: string,
): string {
  const rendered = template.replace(/\{\{([a-zA-Z][a-zA-Z0-9]*)\}\}/g, (_match, name: string) => {
    const value = values[name];
    if (value === undefined) {
      throw new PromptAssemblyError(`${id}: no value supplied for {{${name}}}`);
    }
    return value;
  });

  // Optional blocks render as empty strings; collapsing the runs they leave behind keeps the prompt
  // readable, which matters because a model reads whitespace as structure.
  return rendered.replace(/\n{3,}/g, '\n\n').trim();
}

function suppliedValues(variables: PromptVariables[PromptId]): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [name, value] of Object.entries(variables)) values[name] = value;
  return values;
}

/**
 * What every prompt is told regardless of which prompt it is (task 108).
 *
 * One field today, and the shape is the point: anything that must hold for *all* model calls belongs
 * here rather than in each asset, and this is the single assembly point У-1 requires the language
 * instruction to flow from.
 */
export interface PromptContext {
  /**
   * The session's content language as an ISO 639-1 code, or `null` when detection could not tell.
   *
   * Optional so a caller that has no session — there are none today, and the type would be a lie if
   * there were — still produces a complete prompt: `null` renders the mirror instruction, which is
   * the correct answer for an unknown language rather than a degraded one.
   */
  contentLanguage?: string | null | undefined;
}

export function assemblePrompt<Id extends PromptId>(
  id: Id,
  variables: PromptVariables[Id],
  context: PromptContext = {},
): AssembledPrompt {
  const asset = promptRegistry[id];
  const values: Record<string, string> = {
    ...suppliedValues(variables),
    ...derivedValues(id, variables),
  };

  const system = interpolateTemplate(asset.system, values, asset.id);

  return {
    id,
    /*
     * Appended, never interpolated: the instruction is not a variable of any asset, so no asset can
     * omit it, reword it, or place it somewhere the model reads it as part of the task. It goes last
     * because the last line of a system prompt is the one a model weighs most.
     */
    system: `${system}\n\n${contentLanguageInstruction(context.contentLanguage)}`,
    user: interpolateTemplate(asset.user, values, asset.id),
  };
}
