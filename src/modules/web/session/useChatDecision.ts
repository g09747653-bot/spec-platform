'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { decodeChatEvents, type ChatResultEvent } from '../api/chat-protocol';

/**
 * Sending a chat message that might be a decision (task 62; FR-009 AC-6/AC-7; streamed in task 109).
 *
 * The hook knows nothing about decisions. It posts the text, and the server tells it whether
 * anything was applied — which is the whole point: the client must not be able to *cause* a
 * decision by deciding locally what a message meant. `resolveDecisionIntent` runs server-side, so a
 * crafted request body cannot approve anything a typed sentence could not.
 *
 * On an applied decision it refreshes, because persisted state moved. On an unresolved message it
 * appends the assistant's reply and leaves the card alone — there is deliberately no local update
 * of the pending card at all, so "unchanged" is the default rather than something to maintain.
 *
 * **The reply arrives in pieces** (task 109). The assistant's turn is appended the moment the first
 * delta lands and grown in place, so a slow model is a sentence being written rather than a spinner
 * — and the composer beside it stays enabled throughout, which is the liveness invariant applied to
 * the one control that is live at every position.
 */
export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
  /** True while this turn is still being written into the feed. */
  streaming?: boolean;
  /** The persisted row this turn became (task 132) — set once the server reports it. */
  messageId?: string;
}

export interface ChatDecisionState {
  turns: readonly ChatTurn[];
  busy: boolean;
  error: string | null;
}

const FAILURE = 'That message did not go through. Please try again.';

export function useChatDecision(sessionId: string) {
  const router = useRouter();
  const [turns, setTurns] = useState<readonly ChatTurn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Appends to the assistant turn in flight, starting one if the first delta has just landed. */
  function grow(piece: string): void {
    setTurns((previous) => {
      const last = previous[previous.length - 1];

      if (last?.role === 'assistant' && last.streaming === true) {
        return [...previous.slice(0, -1), { ...last, text: last.text + piece }];
      }

      return [...previous, { role: 'assistant', text: piece, streaming: true }];
    });
  }

  /**
   * Replaces the streamed turn with the server's own complete text, and settles it.
   *
   * `messageIds` are the rows the server persisted, in order — the user's turn, then the reply
   * (task 132). They are stamped onto the local turns here so that the next render, which arrives
   * with those same rows projected into the feed, can recognise the local copies and drop them.
   * Without the ids the two would be indistinguishable and every exchange would show twice.
   */
  function settle(reply: string | undefined, messageIds: readonly string[] | undefined): void {
    const [userId, assistantId] = messageIds ?? [];

    setTurns((previous) => {
      const last = previous[previous.length - 1];
      const streaming = last?.role === 'assistant' && last.streaming === true;
      const settled = streaming ? previous.slice(0, -1) : previous;

      // The user's turn is the last one that is not the streaming reply; it is the message the
      // server stored first, so it takes the first id.
      const stamped = settled.map((turn, index) =>
        index === settled.length - 1 && turn.role === 'user' && userId !== undefined
          ? { ...turn, messageId: userId }
          : turn,
      );

      if (reply === undefined) return stamped;

      return [
        ...stamped,
        {
          role: 'assistant' as const,
          text: reply,
          streaming: false,
          ...(assistantId === undefined ? {} : { messageId: assistantId }),
        },
      ];
    });
  }

  /**
   * @param referenceIds Documents the message named with `@` (task 121).
   *
   * Ids rather than names, and resolved by the composer against what the session actually has, so
   * the server receives something it can check ownership on. It reads the referenced file's current
   * content into the same context the chat already assembles — an existing read path, no new write.
   */
  async function send(text: string, referenceIds: readonly string[] = []): Promise<void> {
    const trimmed = text.trim();
    if (trimmed === '' || busy) return;

    setBusy(true);
    setError(null);
    setTurns((previous) => [...previous, { role: 'user', text: trimmed }]);

    try {
      const response = await fetch(`/api/sessions/${sessionId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: trimmed, referenceIds: [...referenceIds] }),
      });

      if (!response.ok || response.body === null) {
        setError(FAILURE);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let outcome: ChatResultEvent | null = null;

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const { events, rest } = decodeChatEvents(buffer);
        buffer = rest;

        for (const event of events) {
          if (event.type === 'delta') grow(event.text);
          else outcome = event;
        }
      }

      // No result event means the stream ended before the server had an answer — a dropped
      // connection, not a decision. The card is untouched either way; say so and stop.
      if (outcome === null) {
        settle(undefined, undefined);
        setError(FAILURE);
        return;
      }

      settle(outcome.reply, outcome.messageIds);

      /*
       * **Always refresh** (task 132). It used to be "only an applied decision changed persisted
       * state"; an answer now does too — both halves of the exchange are rows of `session_messages`
       * — so the page re-reads and the persisted blocks replace the local turns. The turns stay on
       * screen until they do, because they carry the ids of the very rows that are arriving.
       */
      router.refresh();
    } catch {
      settle(undefined, undefined);
      setError(FAILURE);
    } finally {
      setBusy(false);
    }
  }

  return { state: { turns, busy, error } satisfies ChatDecisionState, send };
}
