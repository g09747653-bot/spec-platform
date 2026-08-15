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

  /** Replaces the streamed turn with the server's own complete text, and settles it. */
  function settle(reply: string | undefined): void {
    setTurns((previous) => {
      const last = previous[previous.length - 1];
      const streaming = last?.role === 'assistant' && last.streaming === true;

      if (reply === undefined) {
        // A decision was applied: there is no answer, so an unfinished streamed turn is dropped.
        return streaming ? previous.slice(0, -1) : previous;
      }

      const settled: ChatTurn = { role: 'assistant', text: reply, streaming: false };

      return streaming ? [...previous.slice(0, -1), settled] : [...previous, settled];
    });
  }

  async function send(text: string): Promise<void> {
    const trimmed = text.trim();
    if (trimmed === '' || busy) return;

    setBusy(true);
    setError(null);
    setTurns((previous) => [...previous, { role: 'user', text: trimmed }]);

    try {
      const response = await fetch(`/api/sessions/${sessionId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: trimmed }),
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
        settle(undefined);
        setError(FAILURE);
        return;
      }

      settle(outcome.reply);

      // Only an applied decision changed persisted state; an answer changed nothing to refresh.
      if (outcome.applied !== null) router.refresh();
    } catch {
      settle(undefined);
      setError(FAILURE);
    } finally {
      setBusy(false);
    }
  }

  return { state: { turns, busy, error } satisfies ChatDecisionState, send };
}
