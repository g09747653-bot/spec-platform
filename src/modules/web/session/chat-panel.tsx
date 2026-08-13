'use client';

import { useState } from 'react';

import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Label, Textarea } from '../ui/field';

import { useChatDecision } from './useChatDecision';

/**
 * The chat surface (task 62; FR-009 AC-6/AC-7).
 *
 * Deliberately plain. It is not a second way to drive the workflow — it is the same decisions,
 * typed, plus somewhere to ask a question without losing the card you are looking at. Whether a
 * message was a decision is decided on the server; nothing here inspects the text.
 */
interface ChatPanelProps {
  sessionId: string;
  /** Whether a card is currently awaiting a decision — presentation only. */
  hasPendingDecision: boolean;
}

export function ChatPanel({ sessionId, hasPendingDecision }: ChatPanelProps) {
  const { state, send } = useChatDecision(sessionId);
  const [text, setText] = useState('');

  return (
    <Card data-testid="chat-panel">
      <CardHeader>
        <CardTitle>Chat</CardTitle>
        <CardDescription>
          {hasPendingDecision
            ? 'Ask a question, or type your decision — "approve it" works as well as the button.'
            : 'Ask anything about this session.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {state.turns.length > 0 && (
          <ol className="flex flex-col gap-2" data-testid="chat-turns">
            {state.turns.map((turn, index) => (
              <li
                key={`${String(index)}-${turn.role}`}
                data-testid={`chat-turn-${turn.role}`}
                className={
                  turn.role === 'user'
                    ? 'text-sm'
                    : 'bg-canvas border-border-subtle rounded-md border p-2 text-sm'
                }
              >
                {turn.text}
              </li>
            ))}
          </ol>
        )}

        {state.error !== null && (
          <p role="alert" data-testid="chat-error" className="text-sm text-red-700">
            {state.error}
          </p>
        )}

        <Label htmlFor="chat-message">Your message</Label>
        <Textarea
          id="chat-message"
          data-testid="chat-message"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
          }}
          placeholder="Ask a question, or say what you want done."
        />

        <Button
          data-testid="chat-send"
          disabled={state.busy || text.trim() === ''}
          onClick={() => {
            const outgoing = text;
            setText('');
            void send(outgoing);
          }}
          className="self-start"
        >
          {state.busy ? 'Sending…' : 'Send'}
        </Button>
      </CardContent>
    </Card>
  );
}
