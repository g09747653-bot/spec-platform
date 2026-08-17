'use client';

import { useState } from 'react';

import { Button } from '../ui/button';
import { EyeIcon } from '../ui/icons';
import { Label, Textarea } from '../ui/field';
import { WaitingOn } from '../session/waiting-on';
import { useSessionRequest } from '../session/useSessionRequest';
import { useViewerControl } from '../viewer/viewer-control';

import { BlockCaption } from './bubbles';
import { FeedItem } from './feed-item';
import type { DocumentBlock as DocumentBlockModel } from './model';

/**
 * A document card in the conversation (tasks 105, 107; Эталон §1.1, block type 4).
 *
 * Stage name, the bundle path in mono, `Rev N`, an Approved badge, and — on the card the session is
 * actually waiting on — the two decisions that move it. Nothing advances on its own: approve and
 * request-changes are the only ways forward, which is P2 made visible.
 *
 * **Content is shown where a decision depends on it.** The card awaiting approval renders its text
 * inline, because approving a document you cannot read is not a decision. Older cards fold it away
 * behind Preview, which fetches the file's exportable content from the endpoint the clipboard uses —
 * and is therefore offered only where that endpoint can answer: an unapproved draft has no
 * exportable content at all, and a card that offered a preview yielding 404 would be worse than one
 * that offered none.
 */
interface DocumentBlockProps {
  block: DocumentBlockModel;
  /** Whether this is the card the session is waiting a decision on (feed tail). */
  pending: boolean;
  /**
   * Whether this is the newest revision of the file the session is working on — the one the suites
   * mean by "the spec card", and the only one whose content the page has already loaded.
   */
  primary: boolean;
  /** The revision's text, when the server sent it down (the primary card only). */
  content: string | null;
  deadlineMs: number;
}

const WAITING_FOR: Record<string, string> = {
  approve: 'the approval to be recorded',
  changes: 'the revision to be written',
};

function isSpecCardState(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    'specFileId' in value &&
    'revisionNumber' in value &&
    typeof value.specFileId === 'string' &&
    typeof value.revisionNumber === 'number'
  );
}

export function DocumentBlock({
  block,
  pending,
  primary,
  content,
  deadlineMs,
}: DocumentBlockProps) {
  const [instruction, setInstruction] = useState('');
  const [showInstruction, setShowInstruction] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const { state: request, elapsedSeconds, send, abandon } = useSessionRequest(deadlineMs);
  const viewerControl = useViewerControl();

  const busy = request.running;
  const error = localError ?? request.notice;

  /* Inline on the card the session is working on; behind Preview otherwise (see the note above). */
  const inline = primary && content !== null;
  const canPreview = !inline && block.approved;

  const openInViewer = () => {
    viewerControl?.open({
      kind: 'revision',
      specFileId: block.specFileId,
      fileName: block.fileName,
      stage: block.specType,
      revisionNumber: block.revisionNumber,
      approved: block.approved,
    });
  };

  const openTarget = viewerControl?.openTarget ?? null;
  const isOpen =
    openTarget?.kind === 'revision' &&
    openTarget.specFileId === block.specFileId &&
    openTarget.revisionNumber === block.revisionNumber;

  async function togglePreview() {
    setPreviewOpen((open) => !open);
    if (preview !== null || previewOpen) return;

    const response = await fetch(`/api/specs/${block.specFileId}/content`);
    setPreview(response.ok ? await response.text() : 'That file could not be read just now.');
  }

  async function decide(action: 'approve' | 'changes', body: Record<string, unknown>) {
    setLocalError(null);
    const outcome = await send(action, `/api/specs/${block.specFileId}/decision`, body);

    // A 200 that is not a spec-card state is a contract breach, not a refusal: the request layer
    // reports transport and refusals, and this is neither.
    if (outcome.ok && !isSpecCardState(outcome.payload)) {
      setLocalError('That did not work. Please try again.');
      return;
    }

    if (!outcome.ok) return;

    setInstruction('');
    setShowInstruction(false);
  }

  const shown = inline ? content : previewOpen ? preview : null;

  return (
    <FeedItem block={block}>
      <div
        className="border-border-subtle bg-surface flex w-full flex-col gap-3 rounded-xl border p-4"
        {...(primary ? { 'data-testid': 'spec-card' } : { 'data-testid': 'document-card' })}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex flex-col gap-0.5">
            {/* The card's one colour accent, where the reference puts it (task 134; `1.1-11`). */}
            <BlockCaption stage={block.specType} tone="primary" />
            <span className="text-foreground-muted font-mono text-xs" data-testid="document-path">
              {block.path}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/*
              **The door** (task 138). Present on every card, in every state — drafted, approved, and
              (on the drafting surface) while the words are still arriving — because the customer's
              complaint was precisely that a generated file had nowhere to be *read*. The excerpt
              below stays an excerpt; this is the way to the whole document.
            */}
            {viewerControl !== null && (
              <button
                type="button"
                data-testid="open-viewer"
                data-state={isOpen ? 'open' : 'closed'}
                aria-label={`Open ${block.fileName} in the viewer`}
                title="Open in the viewer (V)"
                className={
                  isOpen
                    ? 'border-primary text-primary-ink inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs'
                    : 'border-border-subtle text-foreground-muted hover:text-foreground inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs'
                }
                onClick={openInViewer}
              >
                <EyeIcon />
                Open
              </button>
            )}

            {block.approved && (
              <span
                className="rounded-full border border-success-ink/40 px-2 py-0.5 text-xs text-success-ink"
                data-testid="document-approved"
              >
                Approved
              </span>
            )}
            {/*
              `Rev N` is on every card, but the `spec-revision-number` id is on the primary one
              alone: the conversation holds every revision of every file, so an id meaning "the
              revision" has to name a single card or it names four.
            */}
            <span
              className="border-border-subtle text-foreground-muted rounded-full border px-2 py-0.5 text-xs"
              data-testid="document-revision"
            >
              Rev{' '}
              {primary ? (
                <span data-testid="spec-revision-number">{block.revisionNumber}</span>
              ) : (
                block.revisionNumber
              )}
            </span>
          </div>
        </div>

        <p className="text-foreground-muted text-xs">
          {primary ? <span data-testid="spec-file-name">{block.fileName}</span> : block.fileName}
          {block.approved
            ? ' · approved — included in the export.'
            : ' · awaiting your decision — nothing advances until you approve or ask for changes.'}
        </p>

        {canPreview && (
          <button
            type="button"
            data-testid="document-preview-toggle"
            className="text-foreground-muted inline-flex items-center gap-1.5 self-start text-xs underline underline-offset-2"
            onClick={() => {
              void togglePreview();
            }}
          >
            {/* The eye the reference draws on this control (task 134; row `1.1-11`). */}
            <EyeIcon open={previewOpen} />
            {previewOpen ? 'Hide preview' : 'Preview'}
          </button>
        )}

        {shown !== null && (
          <pre
            data-testid={primary ? 'spec-content' : 'document-content'}
            className="bg-background border-border-subtle max-h-72 overflow-auto rounded-md border p-3 text-xs whitespace-pre-wrap"
          >
            {shown}
          </pre>
        )}

        {error !== null && (
          <p role="alert" data-testid="spec-error" className="text-sm text-danger-ink">
            {error}
          </p>
        )}

        {pending && !block.approved && (
          <div className="flex flex-col gap-3">
            <div className="flex gap-2">
              <Button
                data-testid="approve-spec"
                disabled={busy === 'approve'}
                onClick={() => {
                  void decide('approve', {
                    decision: 'approve',
                    revisionNumber: block.revisionNumber,
                  });
                }}
              >
                {busy === 'approve' ? 'Approving…' : 'Approve'}
              </Button>
              <Button
                variant="secondary"
                data-testid="request-changes"
                disabled={busy === 'changes'}
                onClick={() => {
                  setShowInstruction(true);
                }}
              >
                Request changes
              </Button>
            </div>

            {showInstruction && (
              <div className="flex flex-col gap-2">
                <Label htmlFor={`instruction-${block.revisionId}`}>What should change?</Label>
                <Textarea
                  id={`instruction-${block.revisionId}`}
                  data-testid="change-instruction"
                  value={instruction}
                  onChange={(event) => {
                    setInstruction(event.target.value);
                  }}
                  placeholder="Tighten the scope section and add a non-goal."
                />
                <Button
                  data-testid="submit-changes"
                  disabled={busy === 'changes' || instruction.trim() === ''}
                  onClick={() => {
                    void decide('changes', { decision: 'request_changes', instruction });
                  }}
                  className="self-start"
                >
                  {busy === 'changes' ? 'Revising…' : 'Send instruction'}
                </Button>
              </div>
            )}
          </div>
        )}

        {busy !== null && (
          <WaitingOn
            what={WAITING_FOR[busy] ?? 'the server'}
            elapsedSeconds={elapsedSeconds}
            onStop={abandon}
          />
        )}
      </div>
    </FeedItem>
  );
}
