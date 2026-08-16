import type { StageDocument } from '@/modules/methodologies';
import { isCoreSpecType, type CoreSpecType } from '@/modules/specs/model/spec-files';
import {
  validateAgainstSections,
  validateStructure,
  type StructureResult,
} from '@/modules/specs/validate-structure';

/**
 * The verdict on a generated document's structure (tasks 116, 117).
 *
 * One function for both callers — the streaming run and the plain agent — because the two would
 * otherwise be two answers to the same question, and the one that drifted would be the one that
 * decides whether a revision is written (FR-008 AC-4/AC-7).
 *
 * Three answers, one per `DocumentStructure`:
 *
 * - `parity` goes through `validateStructure`, the single entry point to the baseline (D-16), and is
 *   also what an absent document means — the path every caller took before methodologies existed;
 * - `declared` goes through `validateAgainstSections` with the vendored template's own headings;
 * - `free` is **valid by definition**: a template that prescribes no headings offers nothing to
 *   assert, and reporting a violation against a list that does not exist would reject a document
 *   that is perfectly well-formed.
 */
export function documentStructureVerdict(
  document: StageDocument | null | undefined,
  specType: CoreSpecType,
  content: string,
): StructureResult {
  if (document === null || document === undefined || document.structure.kind === 'parity') {
    return isCoreSpecType(specType)
      ? validateStructure(specType, content)
      : { valid: true, violations: [] };
  }

  if (document.structure.kind === 'free') return { valid: true, violations: [] };

  /*
   * A methodology's list is *parsed from the template we vendor*, and that template writes
   * `*(mandatory)*` into its own headings. The writer is shown the template, so a faithful document
   * carries the annotation; the extractor removed it from the list. `ignoreTemplateAnnotations`
   * closes that gap — and it is set here and nowhere else, because the parity baseline has no
   * annotations to forgive and D-40 keeps its comparison exact.
   */
  return validateAgainstSections(content, document.structure.sections, {
    ignoreTemplateAnnotations: true,
  });
}
