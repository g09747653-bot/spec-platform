import type { Feed, FeedBlock, MessageBlock } from './model';

/**
 * Free-chat turns, woven into the feed tail (tasks 104, 109).
 *
 * Chat is the one thing in the conversation that is **not** persisted: the messages endpoint answers
 * a question or dispatches a decision and stores no transcript, so the turns live in the client's own
 * store for the length of the visit. Task 104 keeps it that way deliberately — a durable transcript
 * is a new write path, and the feed exists to prove that none was needed.
 *
 * The consequence is visible and should be: a reload keeps every persisted block and drops the chat
 * turns, exactly as the reference product's own reload does not resurrect an unsent draft. What a
 * reload never drops is a decision, because a decision is a row.
 *
 * Appending is a separate pure function rather than a branch inside `buildFeed` so that the server
 * can build the durable feed once and the client can layer its own turns on top without re-deriving
 * anything — and so that both halves stay testable without a renderer.
 */
export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
  /** True while the assistant's reply is still arriving (task 109). */
  streaming?: boolean | undefined;
}

export function appendChatTurns(feed: Feed, turns: readonly ChatTurn[]): Feed {
  if (turns.length === 0) return feed;

  const last = feed.blocks[feed.blocks.length - 1];
  const at = last?.at ?? new Date(0).toISOString();

  const appended: MessageBlock[] = turns.map((turn, index) => ({
    kind: 'message',
    id: `chat:${String(index)}`,
    role: turn.role,
    // The position the session is in *now* — what a message asked mid-review is stamped with.
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
