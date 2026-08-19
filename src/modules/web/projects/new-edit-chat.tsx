'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { z } from 'zod';

import { type PhraseKey } from '../i18n/dictionary';
import { useT } from '../i18n/locale-context';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';

/**
 * The Reference step, as a control on the project page (task 118; Эталон §1.4 «Edit»).
 *
 * It offers **only documents with an approved revision**, and that is not a courtesy: an edit is a
 * change to text somebody accepted, so a draft nobody approved is not something there is a change
 * *to* yet. The server refuses one anyway — this list is what makes the refusal unnecessary rather
 * than what enforces it.
 *
 * When the bundle has nothing approved the card says so and offers nothing. An empty picker with a
 * live button would be a control whose only outcome is a refusal.
 */
const CreatedChat = z.object({ sessionId: z.string().min(1) });

export interface ReferenceableFile {
  specFileId: string;
  fileName: string;
  revisionNumber: number;
}

export function NewEditChat({
  projectId,
  files,
}: {
  projectId: string;
  files: readonly ReferenceableFile[];
}) {
  const router = useRouter();
  const t = useT();
  const [picked, setPicked] = useState<string[]>(files.map((file) => file.specFileId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<PhraseKey | null>(null);

  async function start() {
    setBusy(true);
    setError(null);

    try {
      const response = await fetch(`/api/projects/${projectId}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ specFileIds: picked }),
      });
      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        setError('projects.edit-chat.failed');
        return;
      }

      const parsed = CreatedChat.safeParse(payload);
      if (!parsed.success) {
        setError('projects.edit-chat.failed');
        return;
      }

      router.push(`/sessions/${parsed.data.sessionId}`);
    } catch {
      setError('projects.edit-chat.failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card data-testid="new-edit-chat">
      <CardHeader>
        <CardTitle>{t('projects.edit-chat.title')}</CardTitle>
        <CardDescription>
          {files.length === 0
            ? t('projects.edit-chat.nothing-approved')
            : t('projects.edit-chat.pick')}
        </CardDescription>
      </CardHeader>

      {files.length > 0 && (
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            {files.map((file) => (
              <label
                key={file.specFileId}
                className="flex cursor-pointer items-center gap-2 text-sm"
              >
                <input
                  type="checkbox"
                  data-testid={`reference-${file.fileName}`}
                  checked={picked.includes(file.specFileId)}
                  onChange={(event) => {
                    setPicked((current) =>
                      event.target.checked
                        ? [...current, file.specFileId]
                        : current.filter((id) => id !== file.specFileId),
                    );
                  }}
                />
                <span>
                  {file.fileName}
                  <span className="text-foreground-muted ml-2 text-xs">
                    {t('common.revision-badge', { revision: file.revisionNumber })}
                  </span>
                </span>
              </label>
            ))}
          </div>

          {error !== null && (
            <p role="alert" className="text-sm text-danger-ink" data-testid="edit-chat-error">
              {t(error)}
            </p>
          )}

          <Button
            className="self-start"
            data-testid="start-edit-chat"
            disabled={busy || picked.length === 0}
            onClick={() => {
              void start();
            }}
          >
            {busy ? t('projects.edit-chat.starting') : t('projects.edit-chat.start')}
          </Button>
        </CardContent>
      )}
    </Card>
  );
}
