import type { Stage } from '@/modules/workflow/model/stages';
import {
  CORE_SPEC_TYPES,
  isCoreSpecType,
  type CoreSpecType,
} from '@/modules/specs/model/spec-files';

/**
 * Which file a generation writes, given where the session is (task 20).
 *
 * A pure function over persisted stage — never a model decision (constitution P1). For a spec stage the
 * answer is the stage itself; `interview` maps to the first core file, because the walking skeleton
 * generates before the interview gate and the transition table exist.
 *
 * **The parity path writes core files only.** `quality.md` is produced by the optional `quality`
 * module, which owns Quality-stage behaviour outright (constitution A6) — the spec agent never writes
 * it, so the return type is narrowed to the four parity types (task 41). `interview` retains its
 * skeleton mapping to the first core file; once the gate of task 45 is wired it is no longer a
 * generating position, and the branch becomes unreachable rather than wrong (D-24).
 */
export function targetSpecType(stage: Stage): CoreSpecType {
  if (isCoreSpecType(stage)) return stage;

  const [firstCore] = CORE_SPEC_TYPES;

  return firstCore;
}
