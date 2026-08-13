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
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

export interface ApiError {
  error: { code: ErrorCode; message: string; details?: unknown };
}

const DEFAULT_MESSAGE: Record<ErrorCode, string> = {
  UNAUTHENTICATED: 'Sign in to continue.',
  NOT_FOUND: 'Not found.',
  VALIDATION_FAILED: 'The request was not valid.',
  PENDING_DECISION: 'A decision is already pending for this file.',
  GATE_REJECTED: 'That step is not available yet.',
  ROUND_LIMIT_REACHED: 'The question budget for this stage is used up.',
  CAPABILITY_NOT_REGISTERED: 'That option is not available.',
  CONFLICT: 'The session moved on; refresh and try again.',
};

export function errorResponse(code: ErrorCode, details?: unknown): Response {
  const body: ApiError = { error: { code, message: DEFAULT_MESSAGE[code] } };
  if (details !== undefined) body.error.details = details;

  return Response.json(body, { status: ERROR_STATUS[code] });
}

export function jsonResponse(payload: unknown, status = 200): Response {
  return Response.json(payload, { status });
}
