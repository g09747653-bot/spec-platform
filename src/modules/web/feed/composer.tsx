'use client';

import { useState } from 'react';

import { Button } from '../ui/button';
import { Textarea } from '../ui/field';

import {
  applyReference,
  matchingCommands,
  matchingReferences,
  referenceQuery,
  referencedIds,
  slashQuery,
  type ReferenceTarget,
  type SlashCommand,
} from './composer-menus';

/**
 * The composer at the foot of the conversation (tasks 105, 109, 121).
 *
 * **Always live.** It is not a second way to drive the workflow — it is the same decisions, typed,
 * plus somewhere to ask a question without losing the card you are looking at. Whether a message was
 * a decision is settled on the server; nothing here inspects the text for that, which is what stops a
 * crafted request body from approving something a typed sentence could not (FR-009 AC-6/AC-7).
 *
 * It is also the floor of the liveness invariant: at every position, in flight or not, the box is
 * enabled. The send control is disabled while its own request runs — one message at a time — and the
 * box beside it never is.
 *
 * **Two menus and a picker (task 121; Эталон §1.5).** `/` lists the actions the page already offers
 * and dispatches to the *same control* rather than to a parallel path — a command whose gate refuses
 * gets the gate's own words, because it is the same button. `@` lists the bundle's files and the
 * session's attachments, and the chosen one travels with the message as an id. The picker chooses
 * which model answers, and persists on the session.
 */
export function Composer({
  value,
  onChange,
  onSend,
  busy,
  error,
  hasPendingDecision,
  references,
  models,
  selectedModel,
  onSelectModel,
  onCommand,
}: {
  value: string;
  onChange: (text: string) => void;
  onSend: (referenceIds: readonly string[]) => void;
  busy: boolean;
  error: string | null;
  hasPendingDecision: boolean;
  /** Bundle files and attachments an `@` may name (task 121). */
  references: readonly ReferenceTarget[];
  /** Auto plus each configured model — never one whose key is absent. */
  models: readonly { id: string; label: string }[];
  selectedModel: string;
  onSelectModel: (modelId: string) => void;
  /** Presses the control a slash command names. Returns false when the control is not on the page. */
  onCommand: (command: SlashCommand) => boolean;
}) {
  const [notice, setNotice] = useState<string | null>(null);

  const slash = slashQuery(value);
  const commands = slash === null ? [] : matchingCommands(slash);

  const reference = referenceQuery(value);
  const suggestions = reference === null ? [] : matchingReferences(references, reference.query);

  function send() {
    const { ids, unknown } = referencedIds(value, references);

    /*
     * A dangling reference degrades visibly (AC-2). The message still goes — refusing to send it
     * would lose what the user wrote over a name they mistyped — but they are told which name
     * matched nothing, rather than the reference being dropped in silence.
     */
    setNotice(
      unknown.length === 0
        ? null
        : `No document called ${unknown.map((name) => `@${name}`).join(', ')} — that reference was not attached.`,
    );

    onSend(ids);
  }

  return (
    <div
      className="border-border-subtle bg-surface sticky bottom-0 flex flex-col gap-2 border-t px-4 py-3"
      data-testid="composer"
    >
      {error !== null && (
        <p role="alert" data-testid="chat-error" className="text-sm text-danger-ink">
          {error}
        </p>
      )}

      {notice !== null && (
        <p role="status" data-testid="reference-notice" className="text-foreground-muted text-sm">
          {notice}
        </p>
      )}

      {commands.length > 0 && (
        <ul
          className="border-border-subtle bg-surface mx-auto flex w-full max-w-[46rem] flex-col rounded-md border"
          data-testid="slash-menu"
        >
          {commands.map((command) => (
            <li key={command.id}>
              <button
                type="button"
                data-testid={`slash-${command.id}`}
                className="hover:bg-background flex w-full flex-col items-start px-3 py-1.5 text-left text-sm"
                onClick={() => {
                  const dispatched = onCommand(command);
                  onChange('');
                  setNotice(
                    dispatched
                      ? null
                      : `${command.label} is not available at this point in the session.`,
                  );
                }}
              >
                <span className="font-medium">{command.label}</span>
                <span className="text-foreground-muted text-xs">{command.description}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {suggestions.length > 0 && reference !== null && (
        <ul
          className="border-border-subtle bg-surface mx-auto flex w-full max-w-[46rem] flex-col rounded-md border"
          data-testid="reference-menu"
        >
          {suggestions.map((target) => (
            <li key={target.id}>
              <button
                type="button"
                data-testid={`reference-option-${target.name}`}
                className="hover:bg-background flex w-full items-center justify-between px-3 py-1.5 text-left text-sm"
                onClick={() => {
                  onChange(applyReference(value, reference.start, target.name));
                }}
              >
                <span>{target.name}</span>
                <span className="text-foreground-muted text-xs">
                  {target.empty === true ? 'not written yet' : target.kind}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mx-auto flex w-full max-w-[46rem] items-end gap-2">
        <label className="sr-only" htmlFor="model-picker">
          Model
        </label>
        <select
          id="model-picker"
          data-testid="model-picker"
          value={selectedModel}
          className="border-border-subtle bg-surface rounded-md border px-2 py-2 text-sm"
          onChange={(event) => {
            onSelectModel(event.target.value);
          }}
        >
          {models.map((model) => (
            <option key={model.id} value={model.id}>
              {model.label}
            </option>
          ))}
        </select>

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
              send();
            }
          }}
          placeholder={
            hasPendingDecision
              ? 'Ask a question, or type your decision — “approve it” works as well as the button. / for commands, @ for a document.'
              : 'Ask anything about this session. / for commands, @ for a document.'
          }
        />
        <Button data-testid="chat-send" disabled={busy || value.trim() === ''} onClick={send}>
          {busy ? 'Sending…' : 'Send'}
        </Button>
      </div>
    </div>
  );
}
