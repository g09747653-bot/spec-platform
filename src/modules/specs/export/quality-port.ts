/**
 * The optional Quality capability, as the **export boundary** sees it (constitution A6; solution.md
 * — `QualityPort`).
 *
 * solution.md publishes `type QualityPort = QualityCapability | null`, and `QualityCapability` is
 * declared where the Quality module can implement it. `specs` may not import `workflow` (where
 * `StageCapability` lives) and may not import `quality` at all, so what is declared here is the slice
 * `specs` actually consumes: one question, asked at one place.
 *
 * That narrowness is the point rather than a workaround. The export boundary needs to know whether
 * enriched artifacts are still valid; it has no business being able to *run* enrichment. A port that
 * exposed `runEnrichment` would let a download trigger a generation, and A6's "stale artifacts are
 * never exported" would become a rule the export path could route around. The concrete
 * `QualityCapability` of Milestone 7 satisfies this interface structurally, with no adapter.
 *
 * **`null` is the whole parity path.** With no Quality module installed the port is null, mode is
 * forced to `default`, and no staleness question is asked — not answered as "false", not asked. That
 * is what makes the parity export identical whether or not the module was ever written.
 */
export interface QualityExportCapability {
  /**
   * Whether the enriched artifacts of this project are stale — a parity revision exists that is newer
   * than the enrichment derived from it (constitution A6; DR-9). Computed, never stored; the
   * computation itself belongs to the Quality module (task 87).
   */
  isStale(projectId: string): Promise<boolean>;
}

/** The published nullable type: a registered capability, or nothing at all. */
export type QualityPort = QualityExportCapability | null;
