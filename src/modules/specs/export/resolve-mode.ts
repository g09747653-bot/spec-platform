import { type ExportMode } from '../model/export';
import type { RevisionOrigin } from '../model/spec-files';

import type { QualityPort } from './quality-port';

/**
 * Export mode resolution (task 72; constitution A6; FR-015 AC-2/AC-3).
 *
 * A6 is binding and unusually specific: "Export always resolves against a declared mode, never
 * against whatever the latest revisions happen to be." Everything in this file exists to make that
 * sentence mechanical.
 *
 * The two decisions are separated because they answer to different things. *Which mode applies* is a
 * pure function of what was asked for and what is installed — no database, no session, no clock — so
 * it is decided here and unit-tested from literals. *Which revisions that mode resolves to* is a
 * query, and it lives in the repository, keyed by the two values this module produces.
 */

/**
 * The mode that will actually be used, given the mode requested and the capability installed.
 *
 * With no Quality capability registered there is no such thing as a quality-mode export: there are no
 * enriched revisions to resolve and no `quality.md` to include, so a request for one is answered with
 * the parity bundle rather than with an error. That is deliberate — A6 makes the Quality stage
 * removable, and a removable stage cannot leave a 409 behind in the parity path when it goes.
 *
 * Note what this does *not* consult: the session's `quality_enabled` selection. The selection decides
 * which mode the interface offers and pre-selects; the export resolves the mode it was handed. Were
 * this function to read the selection, disabling Quality on a completed session would silently change
 * the contents of a link the user had already been shown (FR-020 AC-8).
 */
export function resolveExportMode(requested: ExportMode, quality: QualityPort): ExportMode {
  return quality === null ? 'default' : requested;
}

/**
 * Which revisions a mode resolves each file to.
 *
 * - `default` → **the last pre-enrichment revision**: the newest approved revision whose `origin` is
 *   `parity`. Not "the newest approved revision as long as enrichment has not run" — the filter is
 *   unconditional, which is precisely why a default-mode export taken from an enriched session still
 *   satisfies the P3 baseline (A6, first bullet). The marking of A4 is what makes this a query rather
 *   than an inference about timestamps.
 * - `quality` → **the newest approved revision of any origin**, which is the enriched one wherever
 *   enrichment has run and the parity one where it has not.
 */
export function revisionOriginForMode(mode: ExportMode): RevisionOrigin | 'any' {
  return mode === 'default' ? 'parity' : 'any';
}

/** Why a resolution refused. The only refusal at this boundary (solution.md — Error Codes). */
export type ExportRefusal = 'EXPORT_STALE';

/**
 * Whether the declared mode can be satisfied right now.
 *
 * The staleness question is asked **only** when a capability is registered and the resolved mode is
 * `quality` — so the parity path issues no query, per task 72's acceptance criterion, and the tests
 * assert that against a spy rather than against the returned mode.
 *
 * Refusing here rather than falling back to the parity bundle is A6's rule, not a preference: "Stale
 * enriched artifacts are never exported and never silently reused." Downgrading the mode would be the
 * silent part. The offer to re-run enrichment, and the staleness computation itself, belong to the
 * Quality module (task 87); this boundary only refuses.
 */
export async function refuseIfStale(
  mode: ExportMode,
  projectId: string,
  quality: QualityPort,
): Promise<ExportRefusal | null> {
  if (quality === null || mode !== 'quality') return null;

  return (await quality.isStale(projectId)) ? 'EXPORT_STALE' : null;
}
