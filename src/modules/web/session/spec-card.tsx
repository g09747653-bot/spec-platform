'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Label, Textarea } from '../ui/field';

/**
 * The spec card: generate, then decide (task 21; FR-009).
 *
 * The card is rendered from persisted state, so a reload shows the same pending decision rather than
 * losing it (FR-017 AC-4). Nothing advances on its own — approve and request-changes are the only two
 * ways forward, which is P2 made visible.
 *
 * Both actions keep a visible in-flight state, so no interaction sits silent (NFR-002).
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

export function SpecCard({ sessionId, revision }: SpecCardProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<'generate' | 'approve' | 'changes' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [instruction, setInstruction] = useState('');
  const [showInstruction, setShowInstruction] = useState(false);

  async function send(
    action: 'generate' | 'approve' | 'changes',
    url: string,
    body?: Record<string, unknown>,
  ) {
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
            The walking skeleton generates against a deterministic stub provider — no model is
            called.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {error !== null && (
            <p role="alert" data-testid="spec-error" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <Button
            data-testid="generate-spec"
            disabled={busy !== null}
            onClick={() => {
              void send('generate', `/api/sessions/${sessionId}/generate`);
            }}
            className="self-start"
          >
            {busy === 'generate' ? 'Generating…' : 'Generate'}
          </Button>
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
