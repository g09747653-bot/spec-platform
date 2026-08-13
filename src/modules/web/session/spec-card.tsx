'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Label, Textarea } from '../ui/field';

import { useResumableStream } from './useResumableStream';

/**
 * The spec card: generate, then decide (tasks 21, 45, 46, 49; FR-008, FR-009, FR-018).
 *
 * The card is rendered from persisted state, so a reload shows the same pending decision rather than
 * losing it (FR-017 AC-4). Nothing advances on its own — approve and request-changes are the only two
 * ways forward, which is P2 made visible.
 *
 * Generation **streams**: the document appears as it is written rather than after it is finished
 * (FR-008 AC-2; A5), a mid-stream provider failover clears what was rendered and starts again (D-9),
 * and a dropped connection reconnects on its own. A failure that exhausts every provider is not a
 * dead end: it says so plainly, without naming a vendor, and offers the same button again — which
 * resumes from the same workflow position with the same context (FR-018 AC-2/AC-3/AC-7).
 */
export interface SpecCardState {
  specFileId: string;
  fileName: string;
  revisionNumber: number;
  approved: boolean;
  content: string;
}

interface SpecCardProps {
  sessionId: string;
  /** The current revision, or `null` when nothing has been generated yet. */
  revision: SpecCardState | null;
  /**
   * True while a question card awaits submission: generation is blocked in that interaction
   * (task 34; FR-005 AC-4). Presentation of a rule the server owns — not the enforcement.
   */
  generationBlocked?: boolean;
}

function isSpecCardState(value: unknown): value is SpecCardState {
  return (
    typeof value === 'object' &&
    value !== null &&
    'specFileId' in value &&
    'revisionNumber' in value &&
    typeof value.specFileId === 'string' &&
    typeof value.revisionNumber === 'number'
  );
}

export function SpecCard({ sessionId, revision, generationBlocked = false }: SpecCardProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<'approve' | 'changes' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [instruction, setInstruction] = useState('');
  const [showInstruction, setShowInstruction] = useState(false);
  const { state: stream, start } = useResumableStream();

  const generating = stream.status === 'streaming' || stream.status === 'reconnecting';

  async function generate() {
    setError(null);
    const outcome = await start(sessionId);

    // The revision is persisted before `complete` is sent, so refreshing here shows the card the
    // server would render on a reload — the same state, arrived at two ways (FR-017 AC-4).
    if (outcome.status === 'complete') router.refresh();
  }

  async function send(action: 'approve' | 'changes', url: string, body?: Record<string, unknown>) {
    setBusy(action);
    setError(null);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok || !isSpecCardState(payload)) {
        setError('That did not work. Please try again.');
        return;
      }

      setInstruction('');
      setShowInstruction(false);
      router.refresh();
    } catch {
      setError('That did not work. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  if (revision === null) {
    return (
      <Card data-testid="spec-card-empty">
        <CardHeader>
          <CardTitle>Generate the first specification file</CardTitle>
          <CardDescription>
            The document is written straight into the page as the model produces it.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {error !== null && (
            <p role="alert" data-testid="spec-error" className="text-sm text-red-700">
              {error}
            </p>
          )}

          {stream.error !== null && (
            <p role="alert" data-testid="generation-error" className="text-sm text-red-700">
              {stream.error.message}
            </p>
          )}

          {stream.text !== '' && (
            <pre
              data-testid="spec-stream"
              className="bg-canvas border-border-subtle max-h-72 overflow-auto rounded-md border p-3 text-xs whitespace-pre-wrap"
            >
              {stream.text}
            </pre>
          )}

          {stream.status === 'reconnecting' && (
            <p className="text-ink-muted text-sm" data-testid="stream-reconnecting">
              The connection dropped. Reconnecting — nothing written so far is lost.
            </p>
          )}

          {generationBlocked ? (
            <p className="text-ink-muted text-sm" data-testid="generation-blocked">
              A question card is waiting for your answers above — nothing generates until it is
              submitted.
            </p>
          ) : (
            <Button
              data-testid="generate-spec"
              disabled={generating}
              onClick={() => {
                void generate();
              }}
              className="self-start"
            >
              {generating ? 'Generating…' : stream.error !== null ? 'Try again' : 'Generate'}
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="spec-card">
      <CardHeader>
        <CardTitle>
          <span data-testid="spec-file-name">{revision.fileName}</span>
          <span className="text-ink-muted ml-2 text-xs font-normal">
            revision <span data-testid="spec-revision-number">{revision.revisionNumber}</span>
            {revision.approved ? ' · approved' : ' · awaiting your decision'}
          </span>
        </CardTitle>
        <CardDescription>
          {revision.approved
            ? 'Approved. It is included in the export.'
            : 'Nothing advances until you approve or ask for changes.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <pre
          data-testid="spec-content"
          className="bg-canvas border-border-subtle max-h-72 overflow-auto rounded-md border p-3 text-xs whitespace-pre-wrap"
        >
          {revision.content}
        </pre>

        {error !== null && (
          <p role="alert" data-testid="spec-error" className="text-sm text-red-700">
            {error}
          </p>
        )}

        {!revision.approved && (
          <div className="flex flex-col gap-3">
            <div className="flex gap-2">
              <Button
                data-testid="approve-spec"
                disabled={busy !== null}
                onClick={() => {
                  void send('approve', `/api/specs/${revision.specFileId}/decision`, {
                    decision: 'approve',
                    revisionNumber: revision.revisionNumber,
                  });
                }}
              >
                {busy === 'approve' ? 'Approving…' : 'Approve'}
              </Button>
              <Button
                variant="secondary"
                data-testid="request-changes"
                disabled={busy !== null}
                onClick={() => {
                  setShowInstruction(true);
                }}
              >
                Request changes
              </Button>
            </div>

            {showInstruction && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="instruction">What should change?</Label>
                <Textarea
                  id="instruction"
                  data-testid="change-instruction"
                  value={instruction}
                  onChange={(event) => {
                    setInstruction(event.target.value);
                  }}
                  placeholder="Tighten the scope section and add a non-goal."
                />
                <Button
                  data-testid="submit-changes"
                  disabled={busy !== null || instruction.trim() === ''}
                  onClick={() => {
                    void send('changes', `/api/specs/${revision.specFileId}/decision`, {
                      decision: 'request_changes',
                      instruction,
                    });
                  }}
                  className="self-start"
                >
                  {busy === 'changes' ? 'Revising…' : 'Send instruction'}
                </Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
