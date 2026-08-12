import { isSpecStage, type Stage } from '@/modules/workflow/model/stages';
import { CORE_SPEC_TYPES, type SpecType } from '@/modules/specs/model/spec-files';

/**
 * Which file a generation writes, given where the session is (task 20).
 *
 * A pure function over persisted stage — never a model decision (constitution P1). For a spec stage the
 * answer is the stage itself; `interview` maps to the first core file, because the walking skeleton
 * generates before the interview gate and the transition table exist.
 *
 * **This is a placeholder with a known replacement.** Task 24 introduces the transition table, after
 * which the target follows from the stage the engine has moved the session into, and `interview` will no
 * longer be a generating position at all. It is a function rather than an inline branch precisely so
 * that replacement is one edit with a test attached (D-24).
 */
export function targetSpecType(stage: Stage): SpecType {
  if (isSpecStage(stage)) return stage;

  const [firstCore] = CORE_SPEC_TYPES;

  return firstCore;
}
