/**
 * The research contract (solution.md — `adapters/research`; IR-003; task 70).
 *
 * Two operations, and neither of them can fail as far as a caller is concerned. A search that times
 * out returns no hits; a fetch that 500s returns empty text. That is not laziness about errors — it is
 * the requirement: research is an enhancement, and FR-019 AC-4 says a research failure must never fail
 * the stage. An adapter that threw would put that promise in every call site instead of here.
 */

export interface SearchHit {
  title: string;
  url: string;
  /** The engine's own summary. Untrusted, like everything else that comes back (NFR-009). */
  snippet: string;
}

export interface FetchedPage {
  text: string;
  /** Whether the byte cap cut it short — reported so the model can be told (IR-003-AC-3). */
  truncated: boolean;
}

export interface ResearchAdapter {
  search(query: string): Promise<SearchHit[]>;
  fetch(url: string): Promise<FetchedPage>;
}

/**
 * The log line of solution.md's error-handling note.
 *
 * Internal only — `RESEARCH_UNAVAILABLE` never reaches a user (solution.md — Error Codes: "Internal
 * only; never surfaced"), because a user who asked for a specification did not ask for a search and
 * has nothing to do about its absence.
 */
export const RESEARCH_UNAVAILABLE = 'RESEARCH_UNAVAILABLE';

export function logResearchUnavailable(operation: string, detail: unknown): void {
  const reason = detail instanceof Error ? detail.message : String(detail);

  // The observability surface until Sentry arrives (task 95); never a user-facing message.
  console.warn(`${RESEARCH_UNAVAILABLE}: ${operation} — ${reason.slice(0, 200)}`);
}
