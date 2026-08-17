import type { Feed, FeedBlock, MessageBlock } from './model';

/**
 * Free-chat turns, woven into the feed tail (tasks 104, 109; persisted in task 132).
 *
 * Chat used to be the one thing in the conversation that was **not** persisted: the messages
 * endpoint answered a question, stored no transcript, and the turns lived in the client's own store
 * for the length of the visit. Task 104 kept it that way deliberately — a durable transcript was a
 * new write path, and the feed existed to prove none was needed.
 *
 * А-12 overturned that, and correctly: the reference product's saved session contains its chat
 * verbatim, so a reload that drops half the conversation is a parity gap rather than a tint. The
 * endpoint now appends to `session_messages` and the projection reads it like any other source.
 *
 * What is left here is the **optimistic half**, and it is still worth having: a turn appears the
 * moment it is sent and the reply grows a piece at a time, rather than the conversation waiting for
 * a round trip and a re-render to show that anything happened. Once the server has persisted a turn
 * it hands back the row's id, and a turn whose id already appears in the feed is dropped — so the
 * moment `router.refresh()` brings the persisted blocks, the local copies stop being rendered
 * without a flicker in between and without a second copy of the sentence.
 */
export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
  /** True while the assistant's reply is still arriving (task 109). */
  streaming?: boolean | undefined;
  /**
   * The `session_messages` row this turn became, once the server said so (task 132).
   *
   * Absent while the request is in flight — there is no row yet — which is exactly when the turn
   * must be drawn from the local copy.
   */
  messageId?: string | undefined;
}

export function appendChatTurns(feed: Feed, turns: readonly ChatTurn[]): Feed {
  if (turns.length === 0) return feed;

  const persisted = new Set(feed.blocks.map((block) => block.id));
  const pending = turns.filter(
    (turn) => turn.messageId === undefined || !persisted.has(`message:${turn.messageId}`),
  );

  if (pending.length === 0) return feed;

  const last = feed.blocks[feed.blocks.length - 1];
  const at = last?.at ?? new Date(0).toISOString();

  const appended: MessageBlock[] = pending.map((turn, index) => ({
    kind: 'message',
    id: turn.messageId === undefined ? `chat:${String(index)}` : `message:${turn.messageId}`,
    role: turn.role,
    /*
     * The position the session is in **now**, which is where this turn is being written — the same
     * position the server stamped on the row it just stored. The two agree because they describe
     * the same instant; the persisted block is the one that keeps agreeing tomorrow.
     */
    stage: feed.position.stage,
    substage: feed.position.substage,
    at,
    origin: 'chat',
    text: turn.text,
    streaming: turn.streaming ?? false,
  }));

  const blocks: FeedBlock[] = [...feed.blocks, ...appended];

  return { ...feed, blocks };
}
