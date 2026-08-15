'use client';

import { Button } from '../ui/button';
import { Textarea } from '../ui/field';

/**
 * The composer at the foot of the conversation (tasks 105, 109).
 *
 * **Always live.** It is not a second way to drive the workflow — it is the same decisions, typed,
 * plus somewhere to ask a question without losing the card you are looking at. Whether a message was
 * a decision is settled on the server; nothing here inspects the text, which is what stops a crafted
 * request body from approving something a typed sentence could not (FR-009 AC-6/AC-7).
 *
 * It is also the floor of the liveness invariant: at every position, in flight or not, the box is
 * enabled. The send control is disabled while its own request runs — one message at a time — and the
 * box beside it never is.
 */
export function Composer({
  value,
  onChange,
  onSend,
  busy,
  error,
  hasPendingDecision,
}: {
  value: string;
  onChange: (text: string) => void;
  onSend: () => void;
  busy: boolean;
  error: string | null;
  hasPendingDecision: boolean;
}) {
  return (
    <div
      className="border-border-subtle bg-surface sticky bottom-0 flex flex-col gap-2 border-t px-4 py-3"
      data-testid="composer"
    >
      {error !== null && (
        <p role="alert" data-testid="chat-error" className="text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="mx-auto flex w-full max-w-[46rem] items-end gap-2">
        <Textarea
          id="chat-message"
          aria-label="Message"
          data-testid="chat-message"
          value={value}
          rows={2}
          onChange={(event) => {
            onChange(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              onSend();
            }
          }}
          placeholder={
            hasPendingDecision
              ? 'Ask a question, or type your decision — “approve it” works as well as the button.'
              : 'Ask anything about this session.'
          }
        />
        <Button data-testid="chat-send" disabled={busy || value.trim() === ''} onClick={onSend}>
          {busy ? 'Sending…' : 'Send'}
        </Button>
      </div>
    </div>
  );
}
