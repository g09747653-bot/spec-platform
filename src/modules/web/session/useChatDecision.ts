'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { z } from 'zod';

/**
 * Sending a chat message that might be a decision (task 62; FR-009 AC-6/AC-7).
 *
 * The hook knows nothing about decisions. It posts the text, and the server tells it whether
 * anything was applied — which is the whole point: the client must not be able to *cause* a
 * decision by deciding locally what a message meant. `resolveDecisionIntent` runs server-side, so a
 * crafted request body cannot approve anything a typed sentence could not.
 *
 * On an applied decision it refreshes, because persisted state moved. On an unresolved message it
 * appends the assistant's reply and leaves the card alone — there is deliberately no local update
 * of the pending card at all, so "unchanged" is the default rather than something to maintain.
 */
const ChatResponse = z.object({
  applied: z.union([z.object({ kind: z.string(), action: z.string() }), z.null()]),
  reply: z.string().optional(),
  pendingAction: z.union([z.record(z.string(), z.unknown()), z.null()]),
});

export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface ChatDecisionState {
  turns: readonly ChatTurn[];
  busy: boolean;
  error: string | null;
}

export function useChatDecision(sessionId: string) {
  const router = useRouter();
  const [turns, setTurns] = useState<readonly ChatTurn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

      const parsed = ChatResponse.safeParse(await response.json().catch(() => null));

      if (!response.ok || !parsed.success) {
        setError('That message did not go through. Please try again.');
        return;
      }

      if (parsed.data.reply !== undefined) {
        setTurns((previous) => [...previous, { role: 'assistant', text: parsed.data.reply ?? '' }]);
      }

      // Only an applied decision changed persisted state; an answer changed nothing to refresh.
      if (parsed.data.applied !== null) router.refresh();
    } catch {
      setError('That message did not go through. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return { state: { turns, busy, error } satisfies ChatDecisionState, send };
}
