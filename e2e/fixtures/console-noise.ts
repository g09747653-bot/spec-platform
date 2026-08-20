/**
 * **One aborted request, three vocabularies** (task 173; D-276).
 *
 * Every pattern below is the same event: a browser cancelling a request that was still in flight
 * when the page navigated, reloaded, or the server under it went away. None of them is the
 * application's doing, and all of them arrive on the console, so a suite that requires a clean
 * console has to forgive exactly these and nothing else.
 *
 * **Why one module.** The list was written against Chromium's wording and then copied into five
 * files. On Firefox and WebKit the same abort is worded differently, so `bug-hunt-M12.spec.ts` —
 * which reloads five times — failed on those two engines while passing on Chromium, intermittently,
 * since the engine matrix landed (А-15), including on `main`. A check whose verdict depends on which
 * browser's dictionary an abort was translated into is not checking the application. D-276 fixed the
 * dictionary; this file is the other half — the fix cannot rot back into four stale copies, because
 * there is one copy.
 *
 * **Kept deliberately short.** An allow-list that grows is a console check that has stopped working.
 * Adding a line here is a decision about every suite at once, which is the point: it should be
 * visible, and it should be argued for.
 */
export const EXPECTED_CONSOLE_NOISE: readonly RegExp[] = [
  // Playwright aborts in-flight requests when a test navigates or reloads — Chromium's wording.
  /Failed to load resource/i,
  /net::ERR_ABORTED/i,
  /The user aborted a request/i,
  /Failed to fetch/i,
  // The same abort, as Firefox words it.
  /Error in input stream/i,
  /NS_BINDING_ABORTED/i,
  // The same abort, as WebKit words it. Anchored: only the bare message, never a longer sentence
  // that happens to contain it.
  /^pageerror: Load failed$/i,
  /^console\.error: Load failed$/i,
  /cancelled due to load failure/i,
  // Next's own dev overlay fetching a stack frame for an error it is about to display. Not the
  // application's code, and present only because the E2E run uses a dev server.
  /__nextjs_original-stack-frames/i,
];

/**
 * The extra shapes a walk sees when the **whole stack is taken down and brought back** mid-journey
 * (gate M14а, task 149).
 *
 * Separate from the list above rather than folded into it, because they are honest only where a
 * restart is part of the claim: every in-flight fetch of a server that has just died fails, and the
 * dev server's hot-reload socket dies with it. A suite that does not restart anything has no reason
 * to forgive a refused connection, and would be quieter about a real one if it did.
 */
export const EXPECTED_RESTART_NOISE: readonly RegExp[] = [
  /net::ERR_CONNECTION_REFUSED/i,
  /net::ERR_CONNECTION_RESET/i,
  /ERR_NETWORK_CHANGED/i,
  /WebSocket is already in CLOSING or CLOSED state/i,
];

/** Whatever a run collected that this dictionary does not forgive — the lines worth reading. */
export function unexpectedConsole(
  lines: readonly string[],
  extra: readonly RegExp[] = [],
): string[] {
  const forgiven = [...EXPECTED_CONSOLE_NOISE, ...extra];

  return lines.filter((line) => !forgiven.some((pattern) => pattern.test(line)));
}
