'use client';

import { useState } from 'react';

import { Button } from '../ui/button';
import { PaperclipIcon } from '../ui/icons';

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
 * The composer at the foot of the conversation (tasks 105, 109, 121), rebuilt as a **docked panel**
 * (tasks 136, 137).
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
 * **Why the box has a row to itself.** This is the customer's second defect, and its cause is a rule
 * of flexbox rather than a stray class: a `<textarea>` scrolls its own content, so its *automatic
 * minimum size is zero*, while a `<select>` will not shrink below its widest option and a button will
 * not shrink below its label. Put all four on one line and every pixel the line is short comes out of
 * the text box alone — which is how it reached 46 pixels wide, one letter per line, on a session
 * whose sidebar had been dragged out. The box now owns its row and the controls sit on a rail
 * underneath, so there is nothing left that can take width from it at any viewport.
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
  onAttach,
  inputRef,
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
  /** Opens the attachment picker — the sidebar's input, pressed (task 133; row `1.5-2`). */
  onAttach: () => void;
  /** So a keyboard shortcut can put the caret here (task 141). */
  inputRef?: React.RefObject<HTMLTextAreaElement | null>;
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
      className="border-border-subtle bg-surface shrink-0 border-t px-4 py-3"
      data-testid="composer"
    >
      <div className="feed-measure flex flex-col gap-2">
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
            className="border-border-subtle bg-surface flex w-full flex-col overflow-hidden rounded-lg border"
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
            className="border-border-subtle bg-surface flex w-full flex-col overflow-hidden rounded-lg border"
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

        {/*
          One panel, two rows: the message, then the rail of controls. The border belongs to the
          panel rather than to the box, so the whole thing reads as a single object to type into —
          and so the row underneath cannot be mistaken for a separate toolbar floating below it.
        */}
        {/*
          The focus ring is on the panel, not on the box inside it (task 141 — «honest focus»). The
          textarea has no border of its own, so a ring around the textarea would draw a rectangle
          inside a rectangle; the panel *is* the control as far as a person is concerned, and it is
          the panel that should light up. Both halves come from tokens, so it is visible in either
          theme rather than in the one it was designed in.
        */}
        <div className="border-border-subtle bg-background focus-within:border-primary/60 focus-within:ring-primary/25 flex w-full min-w-0 flex-col rounded-xl border transition-colors focus-within:ring-2">
          <textarea
            ref={inputRef}
            id="chat-message"
            aria-label="Message"
            data-testid="chat-message"
            value={value}
            rows={2}
            className="placeholder:text-foreground-muted min-h-[4.5rem] w-full resize-y bg-transparent px-3.5 pt-3 pb-2 text-sm outline-none"
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

          <div className="border-border-subtle flex items-center justify-between gap-2 border-t px-2 py-1.5">
            <div className="flex min-w-0 items-center gap-1.5">
              {/*
                Attach, in the composer where the reference puts it (task 133; row `1.5-2`).

                It presses the sidebar's own file input rather than owning a second one — the same
                move a slash command makes, and for the same reason: one upload path, one set of
                size and type rules, one place a failure is reported.
              */}
              <Button
                variant="ghost"
                size="sm"
                aria-label="Attach a document"
                title="Attach a document"
                data-testid="composer-attach"
                disabled={busy}
                className="text-foreground-muted h-8 w-8 px-0"
                onClick={onAttach}
              >
                <PaperclipIcon />
              </Button>

              <label className="sr-only" htmlFor="model-picker">
                Model
              </label>
              <select
                id="model-picker"
                data-testid="model-picker"
                value={selectedModel}
                className="text-foreground-muted hover:text-foreground min-w-0 max-w-[14rem] truncate rounded-md bg-transparent px-1.5 py-1 text-xs"
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
            </div>

            {/*
              Task 143: in-flight as a flag, not as «Sending…». A wait for the request to finish is
              the commonest thing a walk does here, and reading the label to know is the one thing a
              translated build would break.
            */}
            <Button
              variant="brand"
              size="sm"
              data-testid="chat-send"
              data-busy={String(busy)}
              disabled={busy || value.trim() === ''}
              onClick={send}
            >
              {busy ? 'Sending…' : 'Send'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
