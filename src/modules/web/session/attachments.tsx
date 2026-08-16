'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { z } from 'zod';

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

/** An approved file that predates a just-attached document (task 69; FR-004 AC-9). */
export interface AffectedFileModel {
  specFileId: string;
  fileName: string;
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

/**
 * Reads the affected-file list out of an upload response.
 *
 * Parsed rather than cast: this is a boundary, and the constitution says boundaries are validated.
 * Anything unexpected yields an empty list — a malformed field must not stop the upload from being
 * reported as the success it was.
 */
const UploadResponse = z.object({
  affectedFiles: z
    .array(z.object({ specFileId: z.string().min(1), fileName: z.string().min(1) }))
    .optional(),
});

function affectedFilesOf(payload: unknown): AffectedFileModel[] {
  const parsed = UploadResponse.safeParse(payload);

  return parsed.success ? (parsed.data.affectedFiles ?? []) : [];
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
  const [late, setLate] = useState<{
    fileName: string;
    affected: readonly AffectedFileModel[];
  } | null>(null);

  async function upload(file: File): Promise<void> {
    setBusy(true);
    setError(null);
    setLate(null);

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

      /*
       * Which approved files predate this document (FR-004 AC-9). The server computed it from the
       * context set each revision recorded; nothing was changed by the computation, and nothing is
       * changed by showing it (AC-10).
       */
      const payload: unknown = await response.json().catch(() => null);
      const affected = affectedFilesOf(payload);

      if (affected.length > 0) setLate({ fileName: file.name, affected });

      // The server is the source of the list, including the parse outcome it has just recorded.
      router.refresh();
    } catch {
      setError('The upload did not complete.');
    } finally {
      setBusy(false);
      if (inputRef.current !== null) inputRef.current.value = '';
    }
  }

  /**
   * The direct refine action of FR-004 AC-10.
   *
   * It proposes a change to the named file — a *proposal*, which the user still has to accept, so no
   * approved file moves without a decision. It names the document rather than describing the edit,
   * because what to change is the agent's judgement given the document, not this panel's.
   */
  async function refine(file: AffectedFileModel, documentName: string): Promise<void> {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(`/api/specs/${file.specFileId}/proposed-changes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          instruction: `Take the newly attached document "${documentName}" into account.`,
        }),
      });

      if (!response.ok) {
        setError(
          response.status === 409
            ? 'That file already has a change awaiting your decision.'
            : 'The refinement could not be started.',
        );
        return;
      }

      setLate((current) =>
        current === null
          ? null
          : {
              ...current,
              affected: current.affected.filter((entry) => entry.specFileId !== file.specFileId),
            },
      );
      router.refresh();
    } catch {
      setError('The refinement could not be started.');
    } finally {
      setBusy(false);
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
          <p className="text-foreground-muted text-sm" data-testid="attachments-empty">
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
                  <span className="text-foreground-muted text-xs" data-testid="attachment-meta">
                    {TYPE_LABELS[attachment.mimeType] ?? attachment.mimeType} ·{' '}
                    {sizeLabel(attachment.sizeBytes)} · attached at {attachment.attachedAtStage}
                  </span>
                  <span
                    className={
                      attachment.parseStatus === 'failed'
                        ? 'text-xs text-danger-ink'
                        : 'text-foreground-muted text-xs'
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

        {late !== null && late.affected.length > 0 && (
          <div
            data-testid="late-attachment-notice"
            className="border-border-subtle bg-background flex flex-col gap-2 rounded-md border p-3"
          >
            <p className="text-sm">
              These approved files were written before <strong>{late.fileName}</strong> was
              attached, so they were generated without it:
            </p>
            <ul className="flex flex-col gap-2">
              {late.affected.map((file) => (
                <li key={file.specFileId} className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium" data-testid="late-attachment-file">
                    {file.fileName}
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={busy}
                    data-testid="late-attachment-refine"
                    onClick={() => {
                      void refine(file, late.fileName);
                    }}
                  >
                    Refine {file.fileName}
                  </Button>
                </li>
              ))}
            </ul>
            <p className="text-foreground-muted text-xs">
              Nothing has been changed. Refining proposes an update you can review and accept.
            </p>
          </div>
        )}

        {error !== null && (
          <p role="alert" data-testid="attachment-error" className="text-sm text-danger-ink">
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
