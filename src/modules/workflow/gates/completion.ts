import { CORE_SPEC_TYPES } from '@/modules/specs/model/spec-files';

import { allowed, rejected, type TransitionResult } from '../reason-codes';
import type { WorkflowSnapshot } from '../snapshot';

/**
 * The completion gate (FR-020 AC-2).
 *
 * `complete` may not be entered while any required spec file lacks an approved revision. The
 * required set is the four parity files: they are what every export mode resolves from. The
 * existence check is deliberately not "latest revision approved" — a file whose newest revision
 * awaits a decision still has approved content to export, and completion is about the bundle
 * existing, not about a redraft being settled.
 *
 * `quality.md` is not in this list even on the Quality ordering: the `quality.review → complete`
 * edge can only be reached after `quality`'s own approval gate has held its latest revision
 * approved, so a separate existence check here would assert something already guaranteed.
 */
export function completionGate(snapshot: WorkflowSnapshot): TransitionResult {
  const missing = CORE_SPEC_TYPES.some((specType) => !snapshot.approvedRevisionExists[specType]);

  return missing ? rejected('SPEC_MISSING') : allowed();
}
