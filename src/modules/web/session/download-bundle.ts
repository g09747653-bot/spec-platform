'use client';

import { z } from 'zod';

import type { PhraseKey } from '../i18n/dictionary';
import type { Translate } from '../i18n/translate';

/**
 * Downloading the bundle — one implementation, two buttons (task 126).
 *
 * The completion panel's Download and the export panel's Download must produce the same archive
 * byte for byte, and the way to make that true is for there to be one of them. Extracted from
 * `export-panel.tsx`, where it had been since task 22, the moment a second caller appeared: two
 * copies of "which endpoint, which mode, which manifest header" is two answers to what is in the ZIP,
 * and they would differ the first time export mode mattered.
 *
 * **The translator is a parameter** (task 143). This module is not a component, so it cannot ask for
 * one: `useT` is a hook and `serverT` reads a cookie, and a plain function called from a click
 * handler can have neither. Both callers already hold a translator, and passing it keeps the one
 * property that matters here — that the two buttons say the same words about the same failure —
 * without inventing a third way to reach the dictionary. What the server itself says about a refusal
 * is passed through as the server said it; only the two sentences this module owns are translated.
 */

/** The manifest, as the export endpoint reports it. Parsed, because headers are a boundary. */
const FileList = z
  .string()
  .nullable()
  .transform((raw) =>
    (raw ?? '')
      .split(',')
      .map((name) => name.trim())
      .filter((name) => name !== ''),
  );

const ErrorBody = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});

export interface ExportManifest {
  mode: string;
  included: string[];
  omitted: string[];
}

export type DownloadOutcome =
  { ok: true; manifest: ExportManifest } | { ok: false; message: string };

/**
 * The export mode as a word (task 143; voice standard §2.1, §3).
 *
 * `default` and `quality` are what the API asks for, what the database stores and what `data-mode`
 * reports; both panels used to print one of them at a reader inside a sentence, which is the
 * machine-token-as-word defect §3 names. The words differ per language and the token does not, so
 * the two part company here — and every sentence that mentions a mode puts the word after a colon,
 * because Russian would otherwise have to inflect it and a placeholder cannot be inflected.
 *
 * **Here rather than in either panel**, for the reason this module exists at all: the completion
 * panel's Download and the export panel's Download produce the same archive, so they have to
 * describe it in the same words. Two copies of this table is two answers to «what mode was that»,
 * and they had already diverged into two different Russian sentences by the time they were found.
 *
 * An unrecognised mode reads as the default one: the endpoint validates the value and
 * `readManifest` already answers `default` for a header that is missing, so this fallback describes
 * an archive that could only have been a default-mode archive anyway.
 */
const MODE_PHRASE: Readonly<Record<string, PhraseKey>> = {
  default: 'session.export.mode-default',
  quality: 'session.export.mode-quality',
};

export const modePhrase = (mode: string): PhraseKey =>
  MODE_PHRASE[mode] ?? 'session.export.mode-default';

export function readManifest(response: Response): ExportManifest {
  return {
    mode: response.headers.get('X-Spec-Export-Mode') ?? 'default',
    included: FileList.parse(response.headers.get('X-Spec-Export-Included')),
    omitted: FileList.parse(response.headers.get('X-Spec-Export-Omitted')),
  };
}

/**
 * Hands the archive to the browser.
 *
 * An object URL rather than a navigation, because the bytes are already in hand: the response had to
 * be read to learn what is in it, and downloading it a second time would be a second export — a
 * second `ExportRecord`, and a second chance for the two answers to differ.
 */
export function saveArchive(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();

  // Freed on the next tick: revoking synchronously races the browser's read of the URL.
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}

export async function downloadBundle(
  projectId: string,
  mode: string,
  t: Translate,
): Promise<DownloadOutcome> {
  try {
    const response = await fetch(`/api/projects/${projectId}/export?mode=${mode}`, {
      cache: 'no-store',
    });

    if (!response.ok) {
      const parsed = ErrorBody.safeParse(await response.json());

      return {
        ok: false,
        message: parsed.success ? parsed.data.error.message : t('session.export.download-failed'),
      };
    }

    const manifest = readManifest(response);
    saveArchive(await response.blob(), `${projectId}-specs.zip`);

    return { ok: true, manifest };
  } catch {
    return { ok: false, message: t('session.export.download-unreachable') };
  }
}
