'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';

/**
 * The attachments panel (task 68; FR-004 AC-1/AC-2/AC-6/AC-7).
 *
 * Available at every position in the session, not only at the start: a document that arrives at the
 * solution stage is as legitimate as one attached before the first question, and the list says which
 * stage each arrived at so the difference is visible rather than inferred (AC-6).
 *
 * **A parse failure is reported, never fatal.** The row stays in the list with its reason next to it;
 * the session continues without that document's text (AC-5). The same applies to an upload that was
 * refused: the message names the limit or the supported types and nothing else changes.
 *
 * Every value shown here originates in a user's file name or a parser's message — untrusted content
 * (S3). It is rendered as text through JSX, never as markup, so nothing in a crafted file name can
 * execute (NFR-009 AC-3).
 */

export interface AttachmentModel {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  parseStatus: 'pending' | 'ok' | 'failed' | 'passthrough';
  parseReason: string | null;
  attachedAtStage: string;
}

interface AttachmentsProps {
  sessionId: string;
  attachments: readonly AttachmentModel[];
}

const TYPE_LABELS: Readonly<Record<string, string>> = {
  'application/pdf': 'PDF',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
  'text/plain': 'text',
  'text/markdown': 'Markdown',
  'image/png': 'PNG',
  'image/jpeg': 'JPEG',
};

function statusLine(attachment: AttachmentModel): string {
  switch (attachment.parseStatus) {
    case 'ok':
      return 'Read — its text grounds every later stage.';
    case 'passthrough':
      return 'Image — offered to vision-capable models as it is.';
    case 'pending':
      return 'Stored; still being read.';
    case 'failed':
      return `Could not be read: ${attachment.parseReason ?? 'unknown reason'}. The session continues without it.`;
  }
}

const sizeLabel = (bytes: number): string =>
  bytes < 1_024
    ? `${String(bytes)} B`
    : bytes < 1_048_576
      ? `${(bytes / 1_024).toFixed(0)} KB`
      : `${(bytes / 1_048_576).toFixed(1)} MB`;

export function Attachments({ sessionId, attachments }: AttachmentsProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File): Promise<void> {
    setBusy(true);
    setError(null);

    try {
      const body = new FormData();
      body.append('file', file);

      const response = await fetch(`/api/sessions/${sessionId}/attachments`, {
        method: 'POST',
        body,
      });

      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => null);
        const message =
          typeof payload === 'object' &&
          payload !== null &&
          'error' in payload &&
          typeof payload.error === 'object' &&
          payload.error !== null &&
          'message' in payload.error &&
          typeof payload.error.message === 'string'
            ? payload.error.message
            : 'The upload did not complete.';

        setError(message);
        return;
      }

      // The server is the source of the list, including the parse outcome it has just recorded.
      router.refresh();
    } catch {
      setError('The upload did not complete.');
    } finally {
      setBusy(false);
      if (inputRef.current !== null) inputRef.current.value = '';
    }
  }

  async function remove(id: string): Promise<void> {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(`/api/attachments/${id}`, { method: 'DELETE' });

      if (!response.ok && response.status !== 404) {
        setError('The document could not be removed.');
        return;
      }

      router.refresh();
    } catch {
      setError('The document could not be removed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card data-testid="attachments-panel">
      <CardHeader>
        <CardTitle>Documents</CardTitle>
        <CardDescription>
          Attach anything the agents should read as grounding context — now or at any later stage.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {attachments.length === 0 ? (
          <p className="text-ink-muted text-sm" data-testid="attachments-empty">
            No documents attached.
          </p>
        ) : (
          <ul className="flex flex-col gap-2" data-testid="attachments-list">
            {attachments.map((attachment) => (
              <li
                key={attachment.id}
                data-testid="attachment-item"
                className="border-border-subtle flex items-start justify-between gap-3 rounded-md border p-2"
              >
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium" data-testid="attachment-name">
                    {attachment.fileName}
                  </span>
                  <span className="text-ink-muted text-xs" data-testid="attachment-meta">
                    {TYPE_LABELS[attachment.mimeType] ?? attachment.mimeType} ·{' '}
                    {sizeLabel(attachment.sizeBytes)} · attached at {attachment.attachedAtStage}
                  </span>
                  <span
                    className={
                      attachment.parseStatus === 'failed'
                        ? 'text-xs text-red-700'
                        : 'text-ink-muted text-xs'
                    }
                    data-testid={`attachment-status-${attachment.parseStatus}`}
                  >
                    {statusLine(attachment)}
                  </span>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  data-testid="attachment-remove"
                  onClick={() => {
                    void remove(attachment.id);
                  }}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}

        {error !== null && (
          <p role="alert" data-testid="attachment-error" className="text-sm text-red-700">
            {error}
          </p>
        )}

        <input
          ref={inputRef}
          type="file"
          data-testid="attachment-input"
          disabled={busy}
          className="text-sm"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file !== undefined) void upload(file);
          }}
        />
      </CardContent>
    </Card>
  );
}
