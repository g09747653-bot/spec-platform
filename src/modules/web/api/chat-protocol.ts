import { z } from 'zod';

import { decodeNdjson } from './stream-protocol';

/**
 * The chat stream's wire format (task 109).
 *
 * Same shape as the generation stream — newline-delimited JSON, one self-describing event per line,
 * schema-parsed on arrival — because a chat reply is a model writing prose and there is no reason
 * for the user to watch a spinner while it does (constitution A5; NFR-002: nothing over 500 ms
 * without visible feedback).
 *
 * **The last line is the contract solution.md documents.** `POST /api/sessions/:id/messages` still
 * answers `200` and still reports `applied`, `reply` and `pendingAction` — those three fields are
 * the `result` event, and everything before it is the same reply arriving early. A client that read
 * only the final line would behave exactly as the one this replaced did, which is what makes the
 * change additive rather than a new contract.
 */
export const CHAT_STREAM_CONTENT_TYPE = 'application/x-ndjson';

const ChatDelta = z.object({
  type: z.literal('delta'),
  text: z.string(),
});

const ChatResult = z.object({
  type: z.literal('result'),
  /** Which decision the message resolved to, or `null` when it resolved to none (FR-009 AC-7). */
  applied: z.union([z.object({ kind: z.string(), action: z.string() }), z.null()]),
  /** The decision endpoint's own body, when one was dispatched. */
  result: z.unknown().optional(),
  /** The assistant's answer, complete — the deltas above are the same text arriving in pieces. */
  reply: z.string().optional(),
  /**
   * The `session_messages` rows this exchange became, in order (task 132).
   *
   * The user's message, then the assistant's answer where there was one. The client draws both
   * optimistically while the request is in flight and needs their ids to recognise its own turns in
   * the persisted feed on the next render — otherwise every reply would appear twice for as long as
   * the visit lasted. Absent on a client that does not ask, and ignorable by one that does not care.
   */
  messageIds: z.array(z.string()).optional(),
  /** What is pending *now*, so the client re-renders the card the server sees (FR-017 AC-4). */
  pendingAction: z.union([z.record(z.string(), z.unknown()), z.null()]),
});

export const chatEventSchema = z.discriminatedUnion('type', [ChatDelta, ChatResult]);

export type ChatEvent = z.infer<typeof chatEventSchema>;
export type ChatResultEvent = z.infer<typeof ChatResult>;

export function encodeChatEvent(event: ChatEvent): string {
  return `${JSON.stringify(event)}\n`;
}

export function decodeChatEvents(buffer: string): { events: ChatEvent[]; rest: string } {
  return decodeNdjson(buffer, chatEventSchema);
}
