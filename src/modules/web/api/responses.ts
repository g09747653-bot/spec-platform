/**
 * The HTTP vocabulary of the API, in one place (solution.md — Error Codes).
 *
 * Every handler answers with one of these codes, so the client can branch on a code rather than parse
 * prose. Codes arrive as the milestones that need them do; the mapping to status is the table from the
 * solution document, not a per-handler choice.
 *
 * Kept out of the `web` barrel on purpose: the barrel is imported by client components, and nothing
 * server-side belongs in a client bundle.
 */
export const ERROR_STATUS = {
  /** No valid session. The client redirects to sign-in. */
  UNAUTHENTICATED: 401,
  /** Missing **or** not owned — deliberately indistinguishable (AR-2; NFR-005 AC-2). */
  NOT_FOUND: 404,
  /** A Zod rejection of the request body. */
  VALIDATION_FAILED: 422,
  /** A decision is already pending for this file (FR-009). */
  PENDING_DECISION: 409,
  /** A transition or action a workflow gate refused; details carry the `ReasonCode` (NFR-012 AC-4). */
  GATE_REJECTED: 409,
  /** The stage's question-round budget is exhausted (FR-005 AC-10). */
  ROUND_LIMIT_REACHED: 409,
  /** The Quality module is not installed; the client hides Quality affordances (A6). */
  CAPABILITY_NOT_REGISTERED: 409,
  /** Optimistic version mismatch — another request moved first; refetch and retry (FR-007 AC-6). */
  CONFLICT: 409,
  /** A question-set draft failed validation twice; nothing was persisted (FR-005; D-2). */
  DRAFT_INVALID: 422,
  /**
   * An upload refused on size or type, before any bytes were stored (FR-004 AC-4; NFR-008 AC-3).
   *
   * The solution's table gives this code **two** statuses — 413 for size, 415 for type — so this
   * entry is the size case and `uploadRejectedResponse` below is the only way to produce either. A
   * handler still does not choose a status; the rejection reason does.
   */
  UPLOAD_REJECTED: 413,
  /**
   * A quality-mode export whose enriched artifacts are stale (constitution A6; FR-014 AC-6).
   *
   * The export boundary refuses rather than quietly handing back the parity bundle: a traceability
   * matrix referencing requirements that no longer exist is a correctness defect, and downgrading the
   * mode without saying so is the "silent reuse" A6 forbids. The offer to re-run enrichment is task 87.
   */
  EXPORT_STALE: 409,
  /** Providers exhausted, or output that failed the section schema (FR-018 AC-2; FR-008 AC-7). */
  GENERATION_FAILED: 502,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

export interface ApiError {
  error: { code: ErrorCode; message: string; details?: unknown };
}

/**
 * The English a handler answers with, and deliberately the only language on the wire (task 143).
 *
 * **These are not the sentences the browser prints.** The client matches `error.code` against
 * `API_EXPLANATION` in `web/session/gate-copy.ts` and renders the phrase it finds, in whichever
 * language the reader chose; these defaults answer the case it has no phrase for. That is one seam
 * with three properties worth having:
 *
 * - **the wire stays machine-readable.** A response is a code plus a message, in one language, and a
 *   suite or an integration reading it does not have to know what the caller's cookie said. Localising
 *   here would mean a handler reaching for `cookies()` to write an error, and an error path that
 *   depends on request state is an error path that can fail while failing;
 * - **an unknown code degrades to a sentence rather than to nothing.** A milestone that adds a code
 *   ships an English message immediately and a translated one when it is worded — which is a working
 *   product in between, not a blank notice;
 * - **the specific message still wins.** `uploadRejectedResponse` names the limit or the supported
 *   types because FR-004 AC-4 requires it, and `API_EXPLANATION` answers `null` for that code
 *   precisely so the guard's own words survive the trip.
 */
const DEFAULT_MESSAGE: Record<ErrorCode, string> = {
  UNAUTHENTICATED: 'Sign in to continue.',
  NOT_FOUND: 'Not found.',
  VALIDATION_FAILED: 'The request was not valid.',
  PENDING_DECISION: 'A decision is already pending for this file.',
  /*
   * Round 5, Р-3 item 4. Both of these are read by a person, and both used to say only that
   * something was refused. A rejection carries its `ReasonCode` in `details`, so the client can say
   * more than this default — but the default itself must still point at where the answer is, rather
   * than leave "not available yet" as the whole account.
   */
  GATE_REJECTED: 'That step is not available yet — the page lists what is still needed for it.',
  ROUND_LIMIT_REACHED:
    'Every question round for this stage has been used, so nothing further will be asked here. ' +
    'Anything still open can be answered directly on the page; otherwise move on to the next step.',
  CAPABILITY_NOT_REGISTERED: 'That option is not available.',
  CONFLICT: 'The session moved on; refresh and try again.',
  DRAFT_INVALID: 'The drafted questions were not usable. Try asking again.',
  EXPORT_STALE:
    'The enriched files are out of date with the specs they were built from. Re-run the Quality pass, or export the default bundle.',
  // Deliberately says nothing about which provider, or why beyond "not complete" (FR-018 AC-7).
  GENERATION_FAILED: 'Generation did not complete. Your answers and approved specs are safe.',
  // Replaced in every real rejection by a message naming the limit or the supported types.
  UPLOAD_REJECTED: 'That file could not be accepted.',
};

export function errorResponse(code: ErrorCode, details?: unknown): Response {
  const body: ApiError = { error: { code, message: DEFAULT_MESSAGE[code] } };
  if (details !== undefined) body.error.details = details;

  return Response.json(body, { status: ERROR_STATUS[code] });
}

export function jsonResponse(payload: unknown, status = 200): Response {
  return Response.json(payload, { status });
}

/**
 * The one code in the table with two statuses (task 64; FR-004 AC-4).
 *
 * 413 for a size violation, 415 for a type the platform does not handle — as the solution's error
 * table specifies. The mapping lives here, beside the table, rather than in the upload handler: a
 * handler that picked its own status would be the second place the table exists.
 *
 * The message is always the guard's, because AC-4 requires it to name the limit or the supported
 * types, and only the guard knows which limit was exceeded.
 */
export function uploadRejectedResponse(
  reason: 'size' | 'empty' | 'type',
  message: string,
): Response {
  const body: ApiError = { error: { code: 'UPLOAD_REJECTED', message } };

  return Response.json(body, { status: reason === 'type' ? 415 : 413 });
}
