'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { z } from 'zod';

import { isStage, type Stage } from '@/modules/workflow/model/stages';

import type { PhraseKey } from '../i18n/dictionary';
import { useLocale, useT } from '../i18n/locale-context';
import type { Locale } from '../i18n/phrase';
import type { Translate } from '../i18n/translate';
import { Button } from '../ui/button';

import { SidePanel } from './side-panel';

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

/**
 * What kind of document this is, in words (task 143).
 *
 * The map used to end in `?? attachment.mimeType`, which printed `application/x-brochure` into a
 * sentence as though it were the name of a thing — a machine token shown as a word, which the voice
 * standard §3 calls a defect of presentation rather than a string to translate. The unrecognised
 * case now says what it is; the type itself stays in `data-mime`, where it was always the half a
 * test should be reading.
 */
const TYPE_PHRASE: Readonly<Record<string, PhraseKey>> = {
  'application/pdf': 'session.attachments.type-pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'session.attachments.type-docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
    'session.attachments.type-xlsx',
  'text/plain': 'session.attachments.type-text',
  'text/markdown': 'session.attachments.type-markdown',
  'image/png': 'session.attachments.type-png',
  'image/jpeg': 'session.attachments.type-jpeg',
};

/**
 * The stage a document was attached at, as its name rather than as its identifier (task 143).
 *
 * The row said «attached at solution» — the value the database stores, printed to a person. The
 * canonical names are shared with everything else that has to name a position when a methodology
 * does not (`session.stage.canonical.*`), so the sidebar and the rail cannot end up calling the
 * same stage two things; `data-stage` still carries the identifier for anything reading the row by
 * machine.
 */
const STAGE_PHRASE: Readonly<Record<Stage, PhraseKey>> = {
  interview: 'session.stage.canonical.interview',
  constitution: 'session.stage.canonical.constitution',
  requirements: 'session.stage.canonical.requirements',
  solution: 'session.stage.canonical.solution',
  tasks: 'session.stage.canonical.tasks',
  quality: 'session.stage.canonical.quality',
  complete: 'session.stage.canonical.complete',
};

const stagePhrase = (stage: string): PhraseKey =>
  isStage(stage) ? STAGE_PHRASE[stage] : 'session.stage.canonical.unknown';

/**
 * What happened to the document's text, as a phrase (FR-004 AC-5).
 *
 * The exhaustive switch is the point of the function and it survives translation intact: a parse
 * status added to the model without a sentence is still a compile error, and now it is one in both
 * languages at once. `parseReason` is the parser's own words about a user's file and is passed
 * through untranslated — it is data, not copy (S3).
 */
function statusLine(attachment: AttachmentModel, t: Translate): string {
  switch (attachment.parseStatus) {
    case 'ok':
      return t('session.attachments.parse-ok');
    case 'passthrough':
      return t('session.attachments.parse-passthrough');
    case 'pending':
      return t('session.attachments.parse-pending');
    case 'failed':
      return t('session.attachments.parse-failed', {
        reason: attachment.parseReason ?? t('session.attachments.parse-reason-unknown'),
      });
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

/**
 * How big the document is, in the reader's units and the reader's numbers (task 143).
 *
 * Both halves of «4,2 МБ» are language and neither could be built here: Russian writes the unit in
 * Cyrillic and separates the fraction with a comma, so the unit comes from the dictionary and the
 * number from `Intl.NumberFormat`. Grouping is off because it would turn the English reading this
 * panel has always printed — `1023 KB` — into `1,023 KB`, and a translation is not a licence to
 * change the language it came from.
 */
function sizeLabel(bytes: number, t: Translate, locale: Locale): string {
  const [phrase, value, digits]: [PhraseKey, number, number] =
    bytes < 1_024
      ? ['session.attachments.size-bytes', bytes, 0]
      : bytes < 1_048_576
        ? ['session.attachments.size-kilobytes', bytes / 1_024, 0]
        : ['session.attachments.size-megabytes', bytes / 1_048_576, 1];

  const size = new Intl.NumberFormat(locale, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    useGrouping: false,
  }).format(value);

  return t(phrase, { size });
}

export function Attachments({ sessionId, attachments }: AttachmentsProps) {
  const t = useT();
  const locale = useLocale();
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
            : t('session.attachments.upload-failed');

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
      setError(t('session.attachments.upload-failed'));
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
          t(
            response.status === 409
              ? 'session.attachments.refine-conflict'
              : 'session.attachments.refine-failed',
          ),
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
      setError(t('session.attachments.refine-failed'));
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
        setError(t('session.attachments.remove-failed'));
        return;
      }

      router.refresh();
    } catch {
      setError(t('session.attachments.remove-failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SidePanel
      title={t('session.attachments.title')}
      testId="attachments-panel"
      action={
        /*
          The native file input is the one upload path (task 133), so it stays — out of sight rather
          than out of the document, because the composer's paperclip and the slash command both
          press *this* control. What the eye gets instead is a button in the panel's own idiom; a
          bare «Choose File / No file chosen» was the one piece of unstyled browser chrome left on
          the surface.
        */
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          data-testid="attachment-add"
          className="text-foreground-muted h-6 px-2 text-xs"
          onClick={() => {
            inputRef.current?.click();
          }}
        >
          {busy ? t('session.attachments.adding') : t('session.attachments.add')}
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        {attachments.length === 0 ? (
          <p className="text-foreground-muted text-xs" data-testid="attachments-empty">
            {t('session.attachments.empty')}
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
                  <span
                    className="text-foreground-muted text-xs"
                    data-testid="attachment-meta"
                    data-stage={attachment.attachedAtStage}
                    data-mime={attachment.mimeType}
                  >
                    {t('session.attachments.meta', {
                      type: t(TYPE_PHRASE[attachment.mimeType] ?? 'session.attachments.type-other'),
                      size: sizeLabel(attachment.sizeBytes, t, locale),
                      stage: t(stagePhrase(attachment.attachedAtStage)),
                    })}
                  </span>
                  <span
                    className={
                      attachment.parseStatus === 'failed'
                        ? 'text-xs text-danger-ink'
                        : 'text-foreground-muted text-xs'
                    }
                    data-testid={`attachment-status-${attachment.parseStatus}`}
                  >
                    {statusLine(attachment, t)}
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
                  {t('session.attachments.remove')}
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
            {/*
              One phrase, and the file name inside it rather than in a `<strong>` of its own (task
              143). The emphasis was the price of the sentence: Russian puts the name in a different
              position and joins it with a comma the English does not have, so a sentence built from
              three JSX pieces around a bold middle cannot be translated without being rewritten in
              markup. The name is a file name in a sentence about file names, and the list directly
              below repeats it in medium weight.
            */}
            <p className="text-sm">
              {t('session.attachments.late-notice', {
                count: late.affected.length,
                fileName: late.fileName,
              })}
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
                    {t('session.attachments.late-refine', { fileName: file.fileName })}
                  </Button>
                </li>
              ))}
            </ul>
            <p className="text-foreground-muted text-xs">{t('session.attachments.late-note')}</p>
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
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file !== undefined) void upload(file);
          }}
        />
      </div>
    </SidePanel>
  );
}
