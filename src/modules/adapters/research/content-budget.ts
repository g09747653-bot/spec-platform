/**
 * `ContentBudget` — what may reach a model (solution.md — `adapters/research`; IR-003-AC-3; task 70).
 *
 * A fetched page is arbitrary bytes from the internet, and the cap is applied **here**, at the
 * adapter boundary, rather than by the context assembler's own budget. The two are different
 * promises: the assembler's budget keeps a *prompt* proportionate, and this one keeps a single
 * hostile response from ever being held in a prompt string at all.
 *
 * Measured in bytes rather than characters because the limit exists to bound a payload, and a
 * character limit on multi-byte text bounds nothing predictable.
 */

/** A UTF-8 aware truncation: never splits a character, never emits a replacement byte. */
export function truncateToBytes(
  text: string,
  maxBytes: number,
): { text: string; truncated: boolean } {
  const encoder = new TextEncoder();
  const encoded = encoder.encode(text);

  if (encoded.length <= maxBytes) return { text, truncated: false };

  /*
   * `fatal: false` plus a trailing-partial trim: decoding a byte slice that ends mid-character would
   * otherwise leave U+FFFD at the end. The loop drops at most three bytes — the longest UTF-8
   * sequence minus one — so it terminates immediately.
   */
  const decoder = new TextDecoder('utf-8', { fatal: false });
  let end = Math.max(maxBytes, 0);

  while (end > 0 && (encoded[end] ?? 0) >= 0x80 && (encoded[end] ?? 0) < 0xc0) end -= 1;

  return { text: decoder.decode(encoded.subarray(0, end)), truncated: true };
}
