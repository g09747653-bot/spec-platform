import type { SpecType } from '@/modules/specs/model/spec-files';

import type { StageDocument } from '../model/config';
import { templateSections } from '../templates/sections';
import type { VendoredTemplateId } from '../templates/vendored';

/**
 * A document whose structure comes from its template (task 116).
 *
 * The one constructor every non-parity document goes through, so the rule "structure is the
 * template's, and the template is the vendored bytes" holds by construction rather than by each
 * config remembering to apply it.
 */
export function vendoredDocument(
  specType: SpecType,
  fileName: string,
  templateId: VendoredTemplateId,
): StageDocument {
  const sections = templateSections(templateId);

  return {
    specType,
    fileName,
    structure: sections === null ? { kind: 'free' } : { kind: 'declared', sections },
    templateId,
  };
}
